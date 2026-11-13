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

async function authenticateAdmin(req: Request, origin: string | null) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { response: json({ error: "Connexion administrateur requise." }, 401, origin) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = req.headers.get("apikey") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    (() => {
      try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default; }
      catch { return undefined; }
    })();

  if (!supabaseUrl || !publishableKey) {
    return { response: json({ error: "Configuration Supabase manquante." }, 500, origin) };
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: headersFor(origin) });
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "Origine non autorisée." }, 403, origin);
  }
  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée." }, 405, origin);
  }

  const auth = await authenticateAdmin(req, origin);
  if (auth.response) return auth.response;

  const muxTokenId = Deno.env.get("MUX_TOKEN_ID");
  const muxTokenSecret = Deno.env.get("MUX_TOKEN_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!muxTokenId || !muxTokenSecret || !serviceRoleKey || !supabaseUrl) {
    return json({ error: "Configuration Mux ou Supabase incomplète dans les secrets Edge Functions." }, 503, origin);
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ error: "Données de vidéo invalides." }, 400, origin);
  }

  const title = String(payload.title ?? "").trim();
  const description = String(payload.description ?? "").trim();
  const filename = String(payload.filename ?? "").split(/[\\/]/).pop()?.trim() ?? "";
  const contentType = String(payload.content_type ?? "");
  const size = Number(payload.size);
  const thumbnailUrl = payload.thumbnail_url ? String(payload.thumbnail_url) : null;
  const thumbnailProvider = payload.thumbnail_provider ? String(payload.thumbnail_provider) : null;
  const thumbnailCloudinaryPublicId = payload.thumbnail_cloudinary_public_id ? String(payload.thumbnail_cloudinary_public_id) : null;
  const thumbnailImageKitFileId = payload.thumbnail_imagekit_file_id ? String(payload.thumbnail_imagekit_file_id) : null;

  if (!title || title.length > 200 || description.length > 5000) {
    return json({ error: "Le titre est obligatoire (200 caractères maximum) et la description ne doit pas dépasser 5 000 caractères." }, 400, origin);
  }
  if (!filename || filename.length > 255 || !Number.isSafeInteger(size) || size <= 0 || size > 1024 * 1024 * 1024) {
    return json({ error: "Fichier invalide ou supérieur à la limite de 1 Go." }, 400, origin);
  }
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(contentType)) {
    return json({ error: "Format refusé. Utilise MP4, MOV ou WebM." }, 400, origin);
  }
  if (thumbnailUrl) {
    try {
      const parsed = new URL(thumbnailUrl);
      if (parsed.protocol !== "https:") throw new Error("invalid");
    } catch {
      return json({ error: "L'URL de miniature doit être une adresse HTTPS valide." }, 400, origin);
    }
  }

  const videoId = crypto.randomUUID();
  const muxResponse = await fetch("https://api.mux.com/video/v1/uploads", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(muxTokenId + ":" + muxTokenSecret),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      cors_origin: origin || "https://zenof519-ops.github.io",
      timeout: 7200,
      new_asset_settings: {
        playback_policies: ["public"],
        video_quality: "basic",
        static_renditions: [{ resolution: "highest" }],
        passthrough: videoId,
        meta: { title }
      }
    })
  });

  const muxPayload = await muxResponse.json().catch(() => ({}));
  if (!muxResponse.ok || !muxPayload?.data?.id || !muxPayload?.data?.url) {
    return json({
      error: muxPayload?.error?.messages?.[0] || muxPayload?.error?.message || "Mux n'a pas pu créer l'URL d'envoi.",
      provider_status: muxResponse.status
    }, 502, origin);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error: insertError } = await adminClient.from("videos").insert({
    id: videoId,
    title,
    description,
    provider: "mux",
    cloudinary_public_id: null,
    playback_url: "",
    download_url: null,
    thumbnail_url: thumbnailUrl,
    thumbnail_provider: thumbnailProvider,
    thumbnail_cloudinary_public_id: thumbnailCloudinaryPublicId,
    thumbnail_imagekit_file_id: thumbnailImageKitFileId,
    format: null,
    is_published: false,
    mux_upload_id: muxPayload.data.id,
    mux_asset_id: null,
    mux_playback_id: null,
    mux_status: "waiting"
  });

  if (insertError) {
    await fetch("https://api.mux.com/video/v1/uploads/" + encodeURIComponent(muxPayload.data.id) + "/cancel", {
      method: "PUT",
      headers: { "Authorization": "Basic " + btoa(muxTokenId + ":" + muxTokenSecret) }
    }).catch(() => {});
    return json({ error: "Impossible de créer la fiche vidéo dans Supabase : " + insertError.message }, 500, origin);
  }

  return json({
    videoId,
    uploadId: muxPayload.data.id,
    uploadUrl: muxPayload.data.url,
    timeout: muxPayload.data.timeout
  }, 201, origin);
});
