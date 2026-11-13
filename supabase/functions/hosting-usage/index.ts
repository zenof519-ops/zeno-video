import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const ALLOWED_ORIGIN = "https://zenof519-ops.github.io";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
  (() => { try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default; } catch { return ""; } })();

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-zeno-monitor-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

async function authorized(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) return false;

  const authorization = req.headers.get("Authorization");
  if (authorization?.startsWith("Bearer ") && PUBLISHABLE_KEY) {
    const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await userClient.auth.getUser();
    if (!error && data.user?.id === ADMIN_ID) return true;
  }

  const cronToken = req.headers.get("x-zeno-monitor-token");
  if (cronToken) {
    const { data, error } = await service.rpc("verify_hosting_usage_cron_token", { p_token: cronToken });
    if (!error && data === true) return true;
  }
  return false;
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.error === "string" ? body.error : (body?.error?.message || body?.error?.messages?.join?.(", ") || body?.message || JSON.stringify(body));
    const error = new Error(detail || ("HTTP " + response.status));
    (error as any).status = response.status;
    throw error;
  }
  return body;
}

function basicAuth(username: string, password = "") {
  return "Basic " + btoa(username + ":" + password);
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarizeZeno(videos: any[]) {
  const result: Record<string, any> = {};
  for (const provider of ["cloudinary", "vioo", "dropbox", "onedrive", "deepstorage", "mux"]) {
    const rows = videos.filter(v => v.provider === provider);
    result[provider] = {
      videos: rows.length,
      published: rows.filter(v => v.is_published).length,
      plays: rows.reduce((sum, v) => sum + Number(v.views || 0), 0),
      downloads: rows.reduce((sum, v) => sum + Number(v.downloads || 0), 0)
    };
  }
  return result;
}

async function remoteFileSize(url: string | null) {
  if (!url) return null;
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(12000) });
    let size = asNumber(response.headers.get("content-length"));
    if (response.ok && size && size > 0) return size;
    response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000)
    });
    const range = response.headers.get("content-range");
    const match = range?.match(/\/(\d+)$/);
    if (match) return Number(match[1]);
    await response.body?.cancel();
    return null;
  } catch {
    return null;
  }
}

async function cloudinaryMetrics() {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "wnonuvx4";
  const key = Deno.env.get("CLOUDINARY_API_KEY");
  const secret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!key || !secret) throw new Error("Clés API Cloudinary absentes des secrets Supabase.");
  const data = await fetchJson("https://api.cloudinary.com/v1_1/" + encodeURIComponent(cloud) + "/usage", {
    headers: { Authorization: basicAuth(key, secret) }
  });
  return {
    account: "Cloudinary",
    credits: data.credits ?? null,
    storage: data.storage ?? null,
    bandwidth: data.bandwidth ?? null,
    transformations: data.transformations ?? null,
    requests: data.requests ?? null,
    updatedAt: data.last_updated ?? null
  };
}

async function muxMetrics() {
  const id = Deno.env.get("MUX_TOKEN_ID");
  const secret = Deno.env.get("MUX_TOKEN_SECRET");
  if (!id || !secret) throw new Error("Clés API Mux absentes des secrets Supabase.");
  const headers = { Authorization: basicAuth(id, secret), "Content-Type": "application/json" };

  let assets: any[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const url = new URL("https://api.mux.com/video/v1/assets");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const data = await fetchJson(url.toString(), { headers });
    assets = assets.concat(Array.isArray(data.data) ? data.data : []);
    cursor = data.next_cursor || "";
    if (!cursor) break;
  }

  const now = new Date();
  const start = Math.floor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime() / 1000);
  const end = Math.floor(now.getTime() / 1000);
  const usageUrl = new URL("https://api.mux.com/video/v1/delivery-usage");
  usageUrl.searchParams.append("timeframe[]", String(start));
  usageUrl.searchParams.append("timeframe[]", String(end));
  usageUrl.searchParams.set("limit", "100");

  let deliveredSeconds = 0;
  let page = 1;
  while (page <= 20) {
    usageUrl.searchParams.set("page", String(page));
    const data = await fetchJson(usageUrl.toString(), { headers });
    const rows = Array.isArray(data.data) ? data.data : [];
    deliveredSeconds += rows.reduce((sum: number, row: any) => sum + Number(row.delivered_seconds || 0), 0);
    if (rows.length < 100 || rows.length === 0) break;
    page++;
  }

  return {
    account: "Mux",
    assets: assets.length,
    freeAssetLimit: 10,
    assetsRemainingOnFree: Math.max(0, 10 - assets.length),
    storedDurationMinutes: assets.reduce((sum, asset) => sum + Number(asset.duration || 0), 0) / 60,
    deliveredMinutesThisMonth: deliveredSeconds / 60,
    freeDeliveryMinutes: 100000,
    freeDeliveryMinutesRemaining: Math.max(0, 100000 - deliveredSeconds / 60),
    periodStart: new Date(start * 1000).toISOString()
  };
}

async function imageKitMetrics() {
  const key = Deno.env.get("IMAGEKIT_USAGE_PRIVATE_KEY") || Deno.env.get("IMAGEKIT_PRIVATE_KEY");
  if (!key) throw new Error("Clé privée ImageKit absente.");
  const end = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const url = new URL("https://api.imagekit.io/v1/accounts/usage");
  url.searchParams.set("startDate", start);
  url.searchParams.set("endDate", end);
  const data = await fetchJson(url.toString(), { headers: { Authorization: basicAuth(key) } });
  const storage = asNumber(data.mediaLibraryStorageBytes);
  const bandwidth = asNumber(data.bandwidthBytes);
  const storageLimit = 3 * 1024 ** 3;
  const bandwidthLimit = 20 * 1024 ** 3;
  return {
    account: "ImageKit",
    periodStart: start,
    periodEndExclusive: end,
    mediaLibraryStorageBytes: storage,
    storageReferenceBytes: storageLimit,
    storageRemainingReferenceBytes: storage === null ? null : Math.max(0, storageLimit - storage),
    bandwidthBytesLast30Days: bandwidth,
    bandwidthReferenceBytes: bandwidthLimit,
    bandwidthRemainingReferenceBytes: bandwidth === null ? null : Math.max(0, bandwidthLimit - bandwidth),
    videoProcessingUnitsCount: data.videoProcessingUnitsCount ?? null,
    extensionUnitsCount: data.extensionUnitsCount ?? null,
    note: "Les limites affichées sont le repère du plan Forever Free ; la période API est glissante et la réponse peut être mise en cache 6 heures."
  };
}

function pickUsageFields(value: any, depth = 0): any {
  if (depth > 3 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map(item => pickUsageFields(item, depth + 1)).filter(v => v !== undefined);
  if (typeof value !== "object") return value;
  const out: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/storage|quota|limit|used|remaining|transfer|upload|download|plan|scope|rate/i.test(key)) {
      const picked = pickUsageFields(child, depth + 1);
      if (picked !== undefined) out[key] = picked;
    } else if (depth < 2 && typeof child === "object" && child !== null) {
      const picked = pickUsageFields(child, depth + 1);
      if (picked && Object.keys(picked).length) out[key] = picked;
    }
  }
  return out;
}

async function deepStorageMetrics() {
  const key = Deno.env.get("DEEPSTORAGE_API_KEY");
  if (!key) throw new Error("Clé API DeepStorage absente.");
  const data = await fetchJson("https://deepstorage.dev/api/v1/me", {
    headers: { Authorization: "Bearer " + key }
  });
  const scopes = Array.isArray(data?.key?.scopes) ? data.key.scopes : [];
  return {
    account: "DeepStorage",
    plan: data.plan ?? null,
    scopes,
    readScopeAvailable: scopes.includes("read"),
    accountLimits: pickUsageFields(data),
    note: scopes.includes("read")
      ? "La clé dispose du droit de lecture ; les limites et métadonnées exposées par /me sont affichées ci-dessus."
      : "La clé actuelle ne déclare pas le droit read. Le suivi détaillé des fichiers nécessitera une clé avec les droits upload + read."
  };
}

async function externalStorageMetrics(provider: "dropbox" | "onedrive", videos: any[]) {
  const rows = videos.filter(v => v.provider === provider);
  const sizes = await Promise.all(rows.map(v => remoteFileSize(provider === "dropbox" ? v.playback_url : (v.download_url || v.playback_url))));
  const known = sizes.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return {
    account: provider === "dropbox" ? "Dropbox" : "OneDrive",
    linkedVideos: rows.length,
    measuredFiles: known.length,
    unknownFiles: rows.length - known.length,
    zenoFilesSizeBytes: known.reduce((sum, size) => sum + size, 0),
    accountQuotaAvailable: false,
    note: "La taille des fichiers accessibles par leurs liens est mesurée. Le quota global restant du compte nécessite une autorisation OAuth de lecture du compte."
  };
}

async function collectProvider(provider: string, videos: any[], zeno: Record<string, any>) {
  try {
    let metrics: any;
    if (provider === "cloudinary") metrics = await cloudinaryMetrics();
    else if (provider === "mux") metrics = await muxMetrics();
    else if (provider === "imagekit") metrics = await imageKitMetrics();
    else if (provider === "deepstorage") metrics = await deepStorageMetrics();
    else if (provider === "dropbox" || provider === "onedrive") metrics = await externalStorageMetrics(provider, videos);
    else metrics = {
      account: "Vioo",
      note: "Zeno suit les lectures et téléchargements initiés depuis son site. Aucun accès API officiel de quota n'est configuré pour Vioo."
    };

    const status = provider === "dropbox" || provider === "onedrive" || provider === "vioo" ? "partial" : "ok";
    return { provider, status, metrics: { ...metrics, zeno: zeno[provider] } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    const status = provider === "imagekit" && /403|forbidden|permission|unauthorized/i.test(message) ? "needs_permission" : "error";
    return { provider, status, metrics: { zeno: zeno[provider] }, error: message };
  }
}

async function getLatest() {
  const { data, error } = await service
    .from("hosting_usage_snapshots")
    .select("provider,status,metrics,error,collected_at")
    .order("collected_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const latest: Record<string, any> = {};
  for (const row of data || []) {
    if (!latest[row.provider]) latest[row.provider] = row;
  }
  return Object.values(latest).sort((a: any, b: any) => a.provider.localeCompare(b.provider));
}

async function refresh() {
  const { data: videos, error } = await service
    .from("videos")
    .select("id,title,provider,playback_url,download_url,views,downloads,is_published");
  if (error) throw error;

  const zeno = summarizeZeno(videos || []);
  const providers = ["cloudinary", "mux", "imagekit", "deepstorage", "dropbox", "onedrive", "vioo"];
  const snapshots = await Promise.all(providers.map(provider => collectProvider(provider, videos || [], zeno[provider] || {})));
  const collectedAt = new Date().toISOString();

  const { error: insertError } = await service.from("hosting_usage_snapshots").insert(
    snapshots.map(item => ({
      provider: item.provider,
      status: item.status,
      metrics: item.metrics,
      error: item.error || null,
      collected_at: collectedAt
    }))
  );
  if (insertError) throw insertError;

  await service.from("hosting_usage_snapshots").delete().lt("collected_at", new Date(Date.now() - 90 * 86400000).toISOString());
  return snapshots.map(item => ({ ...item, collected_at: collectedAt }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  if (!await authorized(req)) return json({ error: "Accès réservé à l'administration ou à la tâche planifiée." }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body?.action === "refresh" ? "refresh" : "latest";
  try {
    if (action === "refresh") {
      const snapshots = await refresh();
      return json({ snapshots, refreshed: true });
    }
    return json({ snapshots: await getLatest(), refreshed: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return json({ error: message }, 500);
  }
});
