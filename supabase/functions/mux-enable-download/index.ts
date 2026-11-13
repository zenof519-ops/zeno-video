import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const ALLOWED_ORIGINS = new Set([
  "https://zenof519-ops.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321"
]);

function headersFor(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://zenof519-ops.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headersFor(origin), "Content-Type": "application/json" }
  });
}

async function authenticateAdmin(req: Request, origin: string | null, supabaseUrl: string, publishableKey: string) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { response: json({ error: "Connexion administrateur requise." }, 401, origin) };
  }
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user || data.user.id !== ADMIN_ID) {
    return { response: json({ error: "Accès réservé à l'administrateur." }, 403, origin) };
  }
  return { user: data.user };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(origin) });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origine non autorisée." }, 403, origin);
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const muxTokenId = Deno.env.get("MUX_TOKEN_ID");
  const muxTokenSecret = Deno.env.get("MUX_TOKEN_SECRET");
  const publishableKey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ??
    (() => {
      try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default; }
      catch { return undefined; }
    })();

  if (!supabaseUrl || !serviceRoleKey || !muxTokenId || !muxTokenSecret || !publishableKey) {
    return json({ error: "Configuration Mux ou Supabase incomplète." }, 503, origin);
  }

  const auth = await authenticateAdmin(req, origin, supabaseUrl, publishableKey);
  if (auth.response) return auth.response;

  const payload = await req.json().catch(() => null);
  const videoId = String(payload?.videoId || "");
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) {
    return json({ error: "Identifiant vidéo invalide." }, 400, origin);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: video, error: lookupError } = await db.from("videos")
    .select("id,title,provider,mux_asset_id,mux_playback_id,download_url,mux_status")
    .eq("id", videoId)
    .maybeSingle();
  if (lookupError) return json({ error: lookupError.message }, 500, origin);
  if (!video || video.provider !== "mux" || !video.mux_asset_id || !video.mux_playback_id) {
    return json({ error: "Cette vidéo Mux n'est pas encore prête pour le téléchargement." }, 409, origin);
  }
  if (video.download_url) return json({ ready: true, downloadUrl: video.download_url }, 200, origin);

  const authHeader = "Basic " + btoa(muxTokenId + ":" + muxTokenSecret);
  const assetUrl = "https://api.mux.com/video/v1/assets/" + encodeURIComponent(video.mux_asset_id);
  const assetResponse = await fetch(assetUrl, { headers: { "Authorization": authHeader } });
  const assetPayload = await assetResponse.json().catch(() => ({}));
  if (!assetResponse.ok) {
    return json({ error: assetPayload?.error?.messages?.[0] || "Mux n'a pas pu vérifier cette vidéo." }, 502, origin);
  }

  const renditions = Array.isArray(assetPayload?.data?.static_renditions)
    ? assetPayload.data.static_renditions
    : Array.isArray(assetPayload?.data?.static_renditions?.files)
      ? assetPayload.data.static_renditions.files
      : [];
  const existing = renditions.find((file: any) => file?.ext === "mp4" && file?.name);
  if (existing?.status === "ready") {
    const safeName = String(video.title || "zeno-video")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "zeno-video";
    const downloadUrl = "https://stream.mux.com/" + encodeURIComponent(video.mux_playback_id) +
      "/" + encodeURIComponent(existing.name) + "?download=" + encodeURIComponent(safeName + ".mp4");
    const { error } = await db.from("videos").update({ download_url: downloadUrl }).eq("id", video.id);
    if (error) return json({ error: error.message }, 500, origin);
    return json({ ready: true, downloadUrl }, 200, origin);
  }

  if (!existing) {
    const createResponse = await fetch(assetUrl + "/static-renditions", {
      method: "POST",
      headers: { "Authorization": authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ resolution: "highest" })
    });
    const createPayload = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      return json({ error: createPayload?.error?.messages?.[0] || createPayload?.error?.message || "Mux n'a pas pu préparer le fichier MP4." }, 502, origin);
    }
  }

  return json({ ready: false, status: "preparing" }, 202, origin);
});
