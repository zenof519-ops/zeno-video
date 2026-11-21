import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const SITE_ORIGIN = "https://zenof519-ops.github.io";
const ALLOWED_ORIGINS = new Set([
  SITE_ORIGIN,
  "http://localhost:4321",
  "http://127.0.0.1:4321"
]);
const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
function cleanText(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}
async function hashIp(ip: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}
async function authenticateAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const publicKey = req.headers.get("apikey") || "";
  if (!publicKey.startsWith("sb_publishable_") && !publicKey.startsWith("eyJ")) return false;
  const client = createClient(SUPABASE_URL, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.getUser();
  return !error && data.user?.id === ADMIN_ID;
}
async function rateLimit(req: Request, action: "identify" | "list" | "create" | "edit") {
  const ip = req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (!ip || ip.length > 128) return false;
  const ipHash = await hashIp(ip);
  const settings = {
    identify: [12, 3600],
    list: [60, 60],
    create: [5, 600],
    edit: [10, 600]
  } as const;
  const [limit, windowSeconds] = settings[action];
  const { data, error } = await service.rpc("consume_video_comment_rate_limit", {
    p_ip_hash: ipHash,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });
  if (error) {
    console.error("video-comments rate limiter:", error.message);
    return false;
  }
  return data === true;
}
async function publishedVideo(videoId: string) {
  const { data, error } = await service.from("videos")
    .select("id").eq("id", videoId).eq("is_published", true).maybeSingle();
  return !error && Boolean(data);
}
async function requireAdmin(req: Request, origin: string) {
  if (await authenticateAdmin(req)) return null;
  return json({ error: "Accès réservé à l'administration Zeno Video." }, 403, origin);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, origin);

  const apiKey = req.headers.get("apikey") || "";
  if (!apiKey.startsWith("sb_publishable_") && !apiKey.startsWith("eyJ")) {
    return json({ error: "Clé publique Supabase requise." }, 401, origin);
  }

  let payload: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 8192) return json({ error: "Requête trop volumineuse." }, 413, origin);
    payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid");
  } catch {
    return json({ error: "Requête JSON invalide." }, 400, origin);
  }

  const action = cleanText(payload.action, 30);
  try {
    if (action === "identify") {
      if (!await rateLimit(req, "identify")) return json({ error: "Trop de demandes. Réessaie plus tard." }, 429, origin);
      const visitorId = cleanText(payload.visitorId, 36);
      if (!UUID_RE.test(visitorId)) return json({ error: "Identifiant visiteur invalide." }, 400, origin);
      const { data, error } = await service.rpc("get_or_create_video_comment_visitor", { p_visitor_id: visitorId });
      if (error || !data) throw new Error("Impossible de créer l'identité visiteur.");
      return json({ visitorId, authorName: data }, 200, origin);
    }

    if (action === "list") {
      if (!await rateLimit(req, "list")) return json({ error: "Trop de demandes. Réessaie dans une minute." }, 429, origin);
      const videoId = cleanText(payload.videoId, 36);
      if (!UUID_RE.test(videoId) || !await publishedVideo(videoId)) {
        return json({ error: "Vidéo indisponible." }, 404, origin);
      }
      const { data, error } = await service.from("video_comments")
        .select("id,video_id,parent_id,author_type,author_name,content,is_hidden,created_at,updated_at")
        .eq("video_id", videoId).eq("is_hidden", false)
        .order("created_at", { ascending: true }).limit(250);
      if (error) throw error;
      return json({ comments: data || [] }, 200, origin);
    }

    if (action === "create") {
      if (!await rateLimit(req, "create")) return json({ error: "Tu as envoyé trop de commentaires. Réessaie dans quelques minutes." }, 429, origin);
      const videoId = cleanText(payload.videoId, 36);
      const visitorId = cleanText(payload.visitorId, 36);
      const content = cleanText(payload.content, 2000);
      const editToken = cleanText(payload.editToken, 100);
      if (!UUID_RE.test(videoId) || !UUID_RE.test(visitorId) || !UUID_RE.test(editToken)
          || !content || content.length > 2000) {
        return json({ error: "Vérifie ton commentaire : il doit contenir entre 1 et 2 000 caractères." }, 400, origin);
      }
      if (!await publishedVideo(videoId)) return json({ error: "Cette vidéo n'est plus disponible." }, 404, origin);
      const { data: authorName, error: identityError } = await service.rpc(
        "get_or_create_video_comment_visitor", { p_visitor_id: visitorId }
      );
      if (identityError || !authorName) throw new Error("Identité visiteur indisponible.");
      const { data, error } = await service.from("video_comments").insert({
        video_id: videoId,
        visitor_id: visitorId,
        author_type: "visitor",
        author_name: authorName,
        content,
        edit_token_hash: await sha256(editToken)
      }).select("id,video_id,parent_id,author_type,author_name,content,is_hidden,created_at,updated_at").single();
      if (error) throw error;
      return json({ comment: data, editToken }, 201, origin);
    }

    if (action === "edit") {
      if (!await rateLimit(req, "edit")) return json({ error: "Trop de modifications. Réessaie dans quelques minutes." }, 429, origin);
      const commentId = cleanText(payload.commentId, 36);
      const editToken = cleanText(payload.editToken, 100);
      const content = cleanText(payload.content, 2000);
      if (!UUID_RE.test(commentId) || !UUID_RE.test(editToken) || !content) {
        return json({ error: "Informations de modification invalides." }, 400, origin);
      }
      const { data: existing, error: readError } = await service.from("video_comments")
        .select("id,author_type,edit_token_hash").eq("id", commentId).maybeSingle();
      if (readError) throw readError;
      if (!existing || existing.author_type !== "visitor" || existing.edit_token_hash !== await sha256(editToken)) {
        return json({ error: "Tu ne peux modifier que tes propres commentaires depuis cet appareil." }, 403, origin);
      }
      const { data, error } = await service.from("video_comments").update({
        content, updated_at: new Date().toISOString()
      }).eq("id", commentId).select("id,video_id,parent_id,author_type,author_name,content,is_hidden,created_at,updated_at").single();
      if (error) throw error;
      return json({ comment: data }, 200, origin);
    }

    if (action.startsWith("admin_")) {
      const denied = await requireAdmin(req, origin);
      if (denied) return denied;

      if (action === "admin_list") {
        const videoId = cleanText(payload.videoId, 36);
        let query = service.from("video_comments")
          .select("id,video_id,parent_id,visitor_id,author_type,author_name,content,edit_token_hash,is_hidden,created_at,updated_at")
          .order("created_at", { ascending: true }).limit(1000);
        if (videoId) {
          if (!UUID_RE.test(videoId)) return json({ error: "Filtre vidéo invalide." }, 400, origin);
          query = query.eq("video_id", videoId);
        }
        const { data, error } = await query;
        if (error) throw error;
        return json({ comments: data || [] }, 200, origin);
      }

      if (action === "admin_reply") {
        const parentId = cleanText(payload.commentId, 36);
        const content = cleanText(payload.content, 2000);
        if (!UUID_RE.test(parentId) || !content) return json({ error: "Réponse invalide." }, 400, origin);
        const { data: parent, error: parentError } = await service.from("video_comments")
          .select("id,video_id,parent_id,author_type").eq("id", parentId).maybeSingle();
        if (parentError) throw parentError;
        if (!parent || parent.parent_id || parent.author_type !== "visitor") {
          return json({ error: "Commentaire d'origine introuvable." }, 404, origin);
        }
        const { data, error } = await service.from("video_comments").insert({
          video_id: parent.video_id,
          parent_id: parent.id,
          author_type: "admin",
          author_name: "Administration Zeno Video",
          content
        }).select("id,video_id,parent_id,author_type,author_name,content,is_hidden,created_at,updated_at").single();
        if (error) throw error;
        return json({ reply: data }, 201, origin);
      }

      if (action === "admin_hide") {
        const commentId = cleanText(payload.commentId, 36);
        const hidden = payload.hidden === true;
        if (!UUID_RE.test(commentId)) return json({ error: "Commentaire invalide." }, 400, origin);
        const { data, error } = await service.from("video_comments").update({ is_hidden: hidden })
          .eq("id", commentId).select("id,is_hidden").single();
        if (error) throw error;
        return json({ comment: data }, 200, origin);
      }

      if (action === "admin_delete") {
        const commentId = cleanText(payload.commentId, 36);
        if (!UUID_RE.test(commentId)) return json({ error: "Commentaire invalide." }, 400, origin);
        const { error } = await service.from("video_comments").delete().eq("id", commentId);
        if (error) throw error;
        return json({ success: true }, 200, origin);
      }
    }

    return json({ error: "Action inconnue." }, 400, origin);
  } catch (error) {
    console.error("video-comments error:", error);
    return json({ error: "Le service de commentaires est momentanément indisponible." }, 500, origin);
  }
});
