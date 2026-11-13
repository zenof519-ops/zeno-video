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

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
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

  const privateKey = Deno.env.get("IMAGEKIT_PRIVATE_KEY");
  const publicKey = Deno.env.get("IMAGEKIT_PUBLIC_KEY");
  if (!privateKey || !publicKey) {
    return json({
      error: "ImageKit n'est pas encore configuré. Ajoute IMAGEKIT_PRIVATE_KEY et IMAGEKIT_PUBLIC_KEY dans les secrets Supabase."
    }, 503, origin);
  }

  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 600;
  const signingKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(privateKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    new TextEncoder().encode(token + expire)
  );

  return json({ token, expire, signature: toHex(signatureBuffer), publicKey }, 200, origin);
});
