import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const ALLOWED_ORIGIN = "https://zenof519-ops.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-file-name",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Vary": "Origin"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function errorPayload(data: any, fallback: string) {
  return {
    error: data?.message || data?.error || fallback,
    code: data?.code || "deepstorage_error"
  };
}

async function authenticate(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { error: json({ error: "Connexion administrateur requise.", code: "unauthorized" }, 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = req.headers.get("apikey") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    (() => {
      try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default; }
      catch { return undefined; }
    })();

  if (!supabaseUrl || !publishableKey) {
    return { error: json({ error: "Configuration Supabase manquante.", code: "server_config" }, 500) };
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== ADMIN_ID) {
    return { error: json({ error: "Accès réservé à l'administrateur.", code: "forbidden" }, 403) };
  }
  return { user: data.user };
}

async function deepStorageAccount() {
  const key = Deno.env.get("DEEPSTORAGE_API_KEY");
  if (!key) {
    return { available: false, status: 503, code: "not_configured", message: "La clé API DeepStorage n'est pas encore configurée dans Supabase." };
  }

  let response: Response;
  try {
    response = await fetch("https://deepstorage.dev/api/v1/me", {
      headers: { Authorization: `Bearer ${key}` }
    });
  } catch {
    return { available: false, status: 503, code: "service_unreachable", message: "Impossible de joindre l'API DeepStorage pour le moment." };
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 403 && data?.code === "premium_required") {
    return { available: false, status: 403, code: "premium_required", message: "L'accès API DeepStorage Pro n'est pas actif. Choisis un autre hébergeur pour cette vidéo." };
  }
  if (response.status === 401) {
    return { available: false, status: 403, code: "invalid_api_key", message: "La clé API DeepStorage est invalide, expirée ou révoquée." };
  }
  if (!response.ok) {
    return { available: false, status: 503, code: data?.code || "api_check_failed", message: data?.message || "La disponibilité de l'API DeepStorage n'a pas pu être confirmée." };
  }

  const scopes = Array.isArray(data?.key?.scopes) ? data.key.scopes : [];
  if (!scopes.includes("upload")) {
    return { available: false, status: 403, code: "upload_scope_missing", message: "La clé API DeepStorage doit disposer du droit « upload »." };
  }
  return { available: true, status: 200, data };
}

async function upstreamJson(url: string, init: RequestInit) {
  const key = Deno.env.get("DEEPSTORAGE_API_KEY");
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const parsed = errorPayload(data, `DeepStorage a répondu HTTP ${response.status}.`);
    return { ok: false, status: response.status, data: { ...parsed, next_offset: data?.next_offset, retry_after: response.headers.get("Retry-After") } };
  }
  return { ok: true, status: response.status, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const origin = req.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Origine non autorisée.", code: "forbidden_origin" }, 403);

  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || (req.method === "POST" ? "json" : "");
  let payload: any = {};
  if (req.headers.get("content-type")?.includes("application/json")) {
    payload = await req.json().catch(() => ({}));
  } else if (action === "json") {
    payload = await req.json().catch(() => ({}));
  }
  const operation = payload.action || action;
  const apiKey = Deno.env.get("DEEPSTORAGE_API_KEY");

  if (operation === "status") {
    const account = await deepStorageAccount();
    if (!account.available) {
      return json({ available: false, code: account.code, message: account.message }, account.status);
    }
    return json({
      available: true,
      plan: account.data.plan || "paid",
      username: account.data.username || null,
      keyExpiresAt: account.data.key?.expires_at || null
    });
  }

  if (!apiKey) {
    return json({
      error: "La clé API DeepStorage n'est pas configurée dans Supabase.",
      code: "not_configured"
    }, 503);
  }

  if (operation === "start") {
    const account = await deepStorageAccount();
    if (!account.available) {
      return json({ error: account.message, code: account.code }, account.status);
    }
    const filename = String(payload.filename || "").split(/[\\/]/).pop()?.trim();
    const size = Number(payload.size);
    const contentType = String(payload.content_type || "application/octet-stream");
    if (!filename || filename === "." || filename === ".." || !Number.isSafeInteger(size) || size <= 0) {
      return json({ error: "Nom ou taille de fichier invalide.", code: "invalid_file" }, 400);
    }
    const started = await upstreamJson("https://deepstorage.dev/api/v1/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: filename, size, content_type: contentType, folder: "/Zeno Video/" })
    });
    if (!started.ok) return json(started.data, started.status);
    return json(started.data);
  }

  if (operation === "single") {
    const filename = url.searchParams.get("filename") || "video";
    const safeName = filename.split(/[\\/]/).pop() || "video";
    const bytes = new Uint8Array(await req.arrayBuffer());
    const uploaded = await upstreamJson(
      "https://deepstorage.dev/api/v1/upload?filename=" + encodeURIComponent(safeName) + "&path=%2FZeno%20Video%2F",
      { method: "POST", headers: { "Content-Type": req.headers.get("content-type") || "application/octet-stream" }, body: bytes }
    );
    if (!uploaded.ok) return json(uploaded.data, uploaded.status);
    return json(uploaded.data);
  }

  if (operation === "chunk") {
    const sessionId = url.searchParams.get("session_id");
    const offset = Number(url.searchParams.get("offset"));
    if (!sessionId || !Number.isSafeInteger(offset) || offset < 0) {
      return json({ error: "Session ou position de morceau invalide.", code: "invalid_chunk" }, 400);
    }
    const bytes = new Uint8Array(await req.arrayBuffer());
    const uploaded = await upstreamJson(
      `https://deepstorage.dev/api/v1/uploads/${encodeURIComponent(sessionId)}/chunk?offset=${offset}`,
      { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes }
    );
    if (!uploaded.ok) return json(uploaded.data, uploaded.status);
    return json(uploaded.data);
  }

  if (operation === "resume" || operation === "finish" || operation === "abort") {
    const sessionId = url.searchParams.get("session_id") || payload.session_id;
    if (!sessionId) return json({ error: "Identifiant de session manquant.", code: "invalid_session" }, 400);
    const method = operation === "resume" ? "GET" : operation === "finish" ? "POST" : "DELETE";
    const endpoint = `https://deepstorage.dev/api/v1/uploads/${encodeURIComponent(sessionId)}${operation === "finish" ? "/finish" : ""}`;
    const result = await upstreamJson(endpoint, { method });
    if (!result.ok) return json(result.data, result.status);
    return json(result.data);
  }

  return json({ error: "Action DeepStorage inconnue.", code: "invalid_action" }, 400);
});
