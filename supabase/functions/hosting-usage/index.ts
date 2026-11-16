import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const ALLOWED_ORIGIN = "https://zenof519-ops.github.io";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
  const publishableKey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ??
    (() => { try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default; } catch { return ""; } })();
  if (authorization?.startsWith("Bearer ") && publishableKey) {
    const userClient = createClient(SUPABASE_URL, publishableKey, {
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
    const candidate = typeof body?.error === "string" ? body.error : (body?.error?.message || body?.error?.messages?.join?.(", ") || body?.message || body);
    const detail = typeof candidate === "string" ? candidate : JSON.stringify(candidate);
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
  for (const provider of ["cloudinary", "vioo", "dropbox", "onedrive", "deepstorage", "mux", "bunny"]) {
    const rows = videos.filter(v => v.provider === provider);
    result[provider] = {
      videos: rows.length,
      published: rows.filter(v => v.is_published).length,
      plays: rows.reduce((sum, v) => sum + Number(v.views || 0), 0),
      downloads: rows.reduce((sum, v) => sum + Number(v.downloads || 0), 0)
    };
  }
  result.imagekit = {
    covers: videos.filter(v => v.thumbnail_provider === "imagekit" && v.thumbnail_url).length
  };
  return result;
}

function sizeFromHeaders(response: Response) {
  const range = response.headers.get("content-range");
  const rangeMatch = range?.match(/\/(\d+)$/);
  if (rangeMatch) {
    const total = Number(rangeMatch[1]);
    if (Number.isFinite(total) && total > 0) return total;
  }

  for (const header of ["x-ms-file-size", "x-ms-meta-file-size", "x-file-size", "x-goog-stored-content-length"]) {
    const value = asNumber(response.headers.get(header));
    if (value !== null && value > 0) return value;
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const contentLength = asNumber(response.headers.get("content-length"));
  if (response.ok && contentLength !== null && contentLength > 0 &&
      !contentType.includes("text/html") && !contentType.includes("application/json")) {
    return contentLength;
  }
  return null;
}

async function remoteFileSize(url: string | null) {
  if (!url) return null;
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(12000)
    });
    let size = sizeFromHeaders(response);
    if (size !== null) return size;

    response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000)
    });
    size = sizeFromHeaders(response);
    await response.body?.cancel();
    return size;
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
  const end = Math.floor((now.getTime() / 1000 - 12 * 60 * 60) / 3600) * 3600;
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
    periodStart: new Date(start * 1000).toISOString(),
    periodEnd: new Date(end * 1000).toISOString(),
    note: "La livraison Mux est agrégée avec un délai d’environ 12 heures."
  };
}


async function bunnyMetrics(zeno: Record<string, any>) {
  const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID") || "811150";
  const key = Deno.env.get("BUNNY_API_KEY");
  if (!key) {
    return {
      account: "Bunny Stream", libraryId, apiAvailable: false,
      zenoVideoCount: Number(zeno.videos || 0),
      note: "Les vidéos, lectures et téléchargements Zeno sont suivis. Les chiffres globaux Bunny (stockage et trafic du compte) nécessitent la clé API Bunny dans les secrets Supabase ; aucune clé n’est exposée dans le navigateur."
    };
  }
  try {
    const data = await fetchJson("https://api.bunny.net/videolibrary/" + encodeURIComponent(libraryId), {
      headers: { AccessKey: key }
    });
    return {
      account: "Bunny Stream", libraryId, libraryName: data.Name ?? "Bunny Stream",
      apiAvailable: true, videoCount: asNumber(data.VideoCount),
      storageUsageBytes: asNumber(data.StorageUsage), trafficUsageBytes: asNumber(data.TrafficUsage),
      dateModified: data.DateModified ?? null, zenoVideoCount: Number(zeno.videos || 0),
      note: "Stockage et trafic proviennent de l’API Bunny. Les compteurs de lectures et téléchargements proviennent de Zeno Video."
    };
  } catch (error) {
    return {
      account: "Bunny Stream", libraryId, apiAvailable: false,
      zenoVideoCount: Number(zeno.videos || 0),
      apiError: error instanceof Error ? error.message : "Erreur API inconnue.",
      note: "Les compteurs Zeno restent disponibles, mais la lecture des statistiques globales Bunny a échoué. Vérifie la clé API et ses autorisations dans les secrets Supabase."
    };
  }
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

async function deepStorageMetrics(videos: any[]) {
  const rows = videos.filter(v => v.provider === "deepstorage");
  const sizes = await Promise.all(rows.map(v => remoteFileSize(v.playback_url)));
  const known = sizes.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const key = Deno.env.get("DEEPSTORAGE_API_KEY");
  let account: any = null;
  let apiError: string | null = null;

  if (key) {
    try {
      account = await fetchJson("https://deepstorage.dev/api/v1/me", {
        headers: { Authorization: "Bearer " + key }
      });
    } catch (error) {
      apiError = error instanceof Error ? error.message : "Erreur API inconnue.";
    }
  }

  const scopes = Array.isArray(account?.key?.scopes) ? account.key.scopes : [];
  const apiAvailable = Boolean(account);
  let note = "Les tailles des fichiers Zeno sont mesurées à partir des liens publics lorsque le fournisseur expose leur taille.";
  if (!key) {
    note += " Le quota global et l’offre ne peuvent pas être lus automatiquement sans clé API. DeepStorage indique que l’accès API est réservé aux offres payantes.";
  } else if (!apiAvailable) {
    note += " L’API n’a pas répondu : " + (apiError || "accès indisponible") + ". Le quota global reste inconnu.";
  } else {
    note += " L’API /me confirme l’offre et les limites de la clé, mais ne donne pas à elle seule l’espace total déjà occupé du compte.";
  }

  return {
    account: "DeepStorage",
    linkedVideos: rows.length,
    measuredFiles: known.length,
    unknownFiles: rows.length - known.length,
    zenoFilesSizeBytes: known.reduce((sum, size) => sum + size, 0),
    plan: account?.plan ?? null,
    scopes,
    apiAvailable,
    readScopeAvailable: scopes.includes("read"),
    accountLimits: account ? pickUsageFields(account) : {},
    apiError,
    note
  };
}

async function externalStorageMetrics(provider: "dropbox" | "onedrive", videos: any[]) {
  const rows = videos.filter(v => v.provider === provider);
  const sizes = await Promise.all(rows.map(async video => {
    if (provider === "dropbox") return await remoteFileSize(video.playback_url);
    // OneDrive embed URLs and ordinary share/download URLs can expose different response headers.
    // Try both independently; never infer a size from an HTML player page.
    const candidates = [video.download_url, video.playback_url].filter((url, index, all) =>
      typeof url === "string" && url.length > 0 && all.indexOf(url) === index
    );
    for (const candidate of candidates) {
      const size = await remoteFileSize(candidate);
      if (size !== null && size > 0) return size;
    }
    return null;
  }));
  const known = sizes.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  const isOneDrive = provider === "onedrive";
  return {
    account: isOneDrive ? "OneDrive" : "Dropbox",
    linkedVideos: rows.length,
    measuredFiles: known.length,
    unknownFiles: rows.length - known.length,
    zenoFilesSizeBytes: known.reduce((sum, size) => sum + size, 0),
    accountQuotaAvailable: false,
    measurementMethod: isOneDrive ? "Liens publics OneDrive : en-têtes HTTP HEAD et Range, lien de téléchargement puis lien du lecteur" : "Lien public Dropbox",
    note: rows.length === 0
      ? "Aucun fichier Zeno n’est actuellement enregistré chez ce fournisseur."
      : "Taille mesurée pour " + known.length + " fichier(s) sur " + rows.length + " ; " + (rows.length - known.length) + " fichier(s) restent inconnus car OneDrive ne fournit pas de taille exploitable sur leurs liens publics. Le quota global du compte n’est pas accessible sans autorisation Microsoft."
  };
}


async function dropboxMetrics(videos: any[]) {
  const rows = videos.filter(v => v.provider === "dropbox");
  const sizes = await Promise.all(rows.map(v => remoteFileSize(v.playback_url)));
  const known = sizes.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const { data: credentials, error: credentialError } = await service
    .from("dropbox_oauth_credentials")
    .select("refresh_token,account_id,connected_at")
    .eq("id", 1)
    .maybeSingle();
  if (credentialError) throw new Error("Impossible de lire la connexion Dropbox enregistrée.");
  if (!credentials?.refresh_token) {
    return {
      account: "Dropbox",
      linkedVideos: rows.length,
      measuredFiles: known.length,
      unknownFiles: rows.length - known.length,
      zenoFilesSizeBytes: known.reduce((sum, size) => sum + size, 0),
      accountQuotaAvailable: false,
      note: "La connexion OAuth Dropbox n’est pas encore établie. Le quota global sera disponible après autorisation."
    };
  }

  const appKey = Deno.env.get("DROPBOX_APP_KEY");
  const appSecret = Deno.env.get("DROPBOX_APP_SECRET");
  if (!appKey || !appSecret) throw new Error("Identifiants de l’application Dropbox absents des secrets Supabase.");
  const tokenForm = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credentials.refresh_token,
    client_id: appKey,
    client_secret: appSecret
  });
  const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenForm,
    signal: AbortSignal.timeout(15000)
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error("Le renouvellement automatique du jeton Dropbox a échoué.");
  }

  const usage = await fetchJson("https://api.dropboxapi.com/2/users/get_space_usage", {
    method: "POST",
    headers: { Authorization: "Bearer " + tokenData.access_token }
  });
  const allocation = usage.allocation || {};
  const usedBytes = asNumber(usage.used);
  const allocatedBytes = asNumber(allocation.allocated ?? allocation.team?.allocated ?? allocation.user?.allocated);
  return {
    account: "Dropbox",
    linkedVideos: rows.length,
    measuredFiles: known.length,
    unknownFiles: rows.length - known.length,
    zenoFilesSizeBytes: known.reduce((sum, size) => sum + size, 0),
    accountUsedBytes: usedBytes,
    accountAllocatedBytes: allocatedBytes,
    accountRemainingBytes: usedBytes === null || allocatedBytes === null ? null : Math.max(0, allocatedBytes - usedBytes),
    allocationType: allocation[".tag"] || null,
    accountQuotaAvailable: usedBytes !== null && allocatedBytes !== null,
    connectedAt: credentials.connected_at,
    note: "L’espace global utilisé et l’allocation proviennent de l’API officielle Dropbox. Les tailles des fichiers Zeno sont mesurées séparément lorsque le lien public expose leur taille."
  };
}

async function collectProvider(provider: string, videos: any[], zeno: Record<string, any>) {
  try {
    let metrics: any;
    if (provider === "cloudinary") metrics = await cloudinaryMetrics();
    else if (provider === "mux") metrics = await muxMetrics();
    else if (provider === "imagekit") metrics = await imageKitMetrics();
    else if (provider === "deepstorage") metrics = await deepStorageMetrics(videos);
    else if (provider === "bunny") metrics = await bunnyMetrics(zeno);
    else if (provider === "dropbox") metrics = await dropboxMetrics(videos);
    else if (provider === "onedrive") metrics = await externalStorageMetrics(provider, videos);
    else metrics = {
      account: "Vioo",
      note: "Zeno suit les lectures et téléchargements initiés depuis son site. Aucun accès API officiel de quota n'est configuré pour Vioo."
    };

    const status = provider === "dropbox" || provider === "onedrive" || provider === "vioo" ||
      (provider === "deepstorage" && !metrics.apiAvailable) ||
      (provider === "bunny" && !metrics.apiAvailable) ? "partial" : "ok";
    return { provider, status, metrics: { ...metrics, zeno } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    const status = (provider === "imagekit" && /403|forbidden|permission|unauthorized/i.test(message)) ||
      (provider === "deepstorage" && /clé API.*absente/i.test(message)) ? "needs_permission" : "error";
    return { provider, status, metrics: { zeno }, error: message };
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
    .select("id,title,provider,playback_url,download_url,views,downloads,is_published,thumbnail_provider,thumbnail_url");
  if (error) throw error;

  const zeno = summarizeZeno(videos || []);
  const providers = ["cloudinary", "mux", "imagekit", "deepstorage", "dropbox", "onedrive", "vioo", "bunny"];
  const snapshots = await Promise.all(providers.map(provider => collectProvider(provider, videos || [], zeno[provider] || {})));
  const collectedAt = new Date().toISOString();

  // Compare OneDrive's measured Zeno files with the immediately preceding snapshot.
  // A zero caused by unknown file sizes is never treated as a real storage measurement.
  const onedriveSnapshot = snapshots.find(item => item.provider === "onedrive");
  if (onedriveSnapshot) {
    const { data: previousRows, error: previousError } = await service
      .from("hosting_usage_snapshots")
      .select("metrics,collected_at")
      .eq("provider", "onedrive")
      .order("collected_at", { ascending: false })
      .limit(1);
    if (previousError) throw previousError;

    const currentMetrics = onedriveSnapshot.metrics || {};
    const previous = previousRows?.[0] || null;
    const previousMetrics = previous?.metrics || {};
    const currentIsMeasured = Number(currentMetrics.measuredFiles || 0) > 0;
    const previousIsMeasured = Number(previousMetrics.measuredFiles || 0) > 0;
    const comparable = currentIsMeasured && previousIsMeasured;
    onedriveSnapshot.metrics = {
      ...currentMetrics,
      previousMeasuredFilesSizeBytes: comparable ? Number(previousMetrics.zenoFilesSizeBytes || 0) : null,
      measuredFilesSizeDeltaBytes: comparable
        ? Number(currentMetrics.zenoFilesSizeBytes || 0) - Number(previousMetrics.zenoFilesSizeBytes || 0)
        : null,
      previousMeasuredAt: comparable ? previous.collected_at : null,
      trendAvailable: comparable
    };
  }

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
