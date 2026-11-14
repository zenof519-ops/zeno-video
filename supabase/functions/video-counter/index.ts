import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = new Set([
  "https://zenof519-ops.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321"
]);

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function corsHeaders(origin: string) {
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
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

async function hashClientIp(ip: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const apiKey = req.headers.get("apikey") || "";
  if (!apiKey.startsWith("sb_publishable_") && apiKey.length < 40) {
    return json({ error: "Public API key required" }, 401, origin);
  }

  const forwarded = req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (!forwarded || forwarded.length > 128) {
    return json({ error: "Client address unavailable" }, 503, origin);
  }

  let payload: any;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json({ error: "Payload too large" }, 413, origin);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const videoId = String(payload?.videoId || "");
  const eventType = String(payload?.event || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(videoId)
      || !["view", "download"].includes(eventType)) {
    return json({ error: "Invalid counter event" }, 400, origin);
  }

  try {
    const ipHash = await hashClientIp(forwarded);
    const { data, error } = await service.rpc("register_video_event", {
      p_video_id: videoId,
      p_event_type: eventType,
      p_ip_hash: ipHash
    });
    if (error) {
      console.error("video-counter RPC failed:", error.message);
      return json({ error: "Counter service unavailable" }, 503, origin);
    }
    if (data !== true) return json({ accepted: false, reason: "rate_limited_or_unavailable" }, 429, origin);
    return json({ accepted: true }, 200, origin);
  } catch (error) {
    console.error("video-counter failed:", error);
    return json({ error: "Counter service unavailable" }, 503, origin);
  }
});
