import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const CLOUD_NAME = "wnonuvx4";
const ALLOWED_ORIGINS = new Set([
  "https://zenof519-ops.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321"
]);

function headersFor(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://zenof519-ops.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
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

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizedUrl(value: string) {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function cloudinaryImagePublicId(urlValue: string) {
  const url = new URL(urlValue);
  const marker = "/image/upload/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  const segments = url.pathname.slice(markerIndex + marker.length).split("/").filter(Boolean);
  while (segments.length && (/^v[0-9]+$/.test(segments[0]) || /^(c_|w_|h_|q_|f_|so_|e_|a_|fl_|dpr_|g_|ar_|t_)/.test(segments[0]))) {
    segments.shift();
  }
  if (!segments.length) return null;
  const joined = segments.join("/").replace(/\.[^/.]+$/, "");
  try { return decodeURIComponent(joined); } catch { return joined; }
}

async function deleteCloudinaryAsset(publicId: string, resourceType: "image" | "video", apiKey: string, apiSecret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = toHex(await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(signatureBase + apiSecret)
  ));
  const form = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: apiKey,
    signature,
    invalidate: "true"
  });
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/destroy`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Cloudinary HTTP ${response.status}`);
  }
  if (payload.result !== "ok" && payload.result !== "not found") {
    throw new Error("Cloudinary n'a pas confirmé la suppression : " + String(payload.result || "réponse inconnue"));
  }
  return payload.result as string;
}

async function resolveImageKitFileId(urlValue: string, privateKey: string) {
  const url = new URL(urlValue);
  const filename = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!filename) return null;
  const query = new URLSearchParams({
    path: "/zeno-covers",
    searchQuery: `name = "${filename.replace(/"/g, "\\\"")}"`,
    limit: "1000"
  });
  const response = await fetch("https://api.imagekit.io/v1/files?" + query.toString(), {
    headers: { Authorization: "Basic " + btoa(privateKey + ":") }
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(payload.message || `ImageKit HTTP ${response.status} pendant la recherche de la couverture`);
  }
  if (!Array.isArray(payload)) throw new Error("Réponse de recherche ImageKit invalide.");
  const exact = payload.find((file: any) =>
    file?.fileId && file?.url && normalizedUrl(file.url) === normalizedUrl(urlValue)
  );
  if (exact?.fileId) return String(exact.fileId);
  const sameName = payload.filter((file: any) => file?.fileId && file?.name === filename);
  return sameName.length === 1 ? String(sameName[0].fileId) : null;
}

async function purgeImageKitCache(urlValue: string, privateKey: string) {
  const response = await fetch("https://api.imagekit.io/v1/files/purge", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(privateKey + ":"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url: urlValue })
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 201 || response.ok) {
    return payload.requestId
      ? "purge CDN demandée (" + payload.requestId + ")"
      : "purge CDN demandée";
  }
  return "purge CDN non confirmée (HTTP " + response.status + ")";
}

async function deleteImageKitFile(fileId: string, urlValue: string, privateKey: string) {
  const response = await fetch("https://api.imagekit.io/v1/files/" + encodeURIComponent(fileId), {
    method: "DELETE",
    headers: { Authorization: "Basic " + btoa(privateKey + ":") }
  });
  if (response.status !== 204 && response.status !== 200 && response.status !== 404) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `ImageKit HTTP ${response.status}`);
  }
  const deleted = response.status === 404 ? "not found" : "ok";
  const purge = await purgeImageKitCache(urlValue, privateKey);
  return deleted + " · " + purge;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(origin) });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origine non autorisée." }, 403, origin);
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, origin);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Connexion administrateur requise." }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = req.headers.get("apikey") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    (() => {
      try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default; }
      catch { return undefined; }
    })();
  const cloudinaryApiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const cloudinaryApiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  const imageKitPrivateKey = Deno.env.get("IMAGEKIT_PRIVATE_KEY");
  const muxTokenId = Deno.env.get("MUX_TOKEN_ID");
  const muxTokenSecret = Deno.env.get("MUX_TOKEN_SECRET");

  if (!supabaseUrl || !publishableKey) return json({ error: "Configuration Supabase manquante." }, 500, origin);

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user || userData.user.id !== ADMIN_ID) {
    return json({ error: "Accès réservé à l'administrateur." }, 403, origin);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Requête invalide." }, 400, origin);

  if (body.checkOnly === true) {
    let cloudinaryOk = false;
    let imageKitOk = false;
    let muxOk = false;
    const details: string[] = [];

    if (cloudinaryApiKey && cloudinaryApiSecret) {
      try {
        const check = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/video/upload?max_results=1`,
          { headers: { Authorization: "Basic " + btoa(cloudinaryApiKey + ":" + cloudinaryApiSecret) } }
        );
        cloudinaryOk = check.ok;
        if (!check.ok) details.push("Cloudinary : " + ((await check.json().catch(() => ({}))).error?.message || `HTTP ${check.status}`));
      } catch (error) { details.push("Cloudinary : " + (error instanceof Error ? error.message : String(error))); }
    } else {
      details.push("Secrets Cloudinary absents.");
    }

    if (imageKitPrivateKey) {
      try {
        const check = await fetch("https://api.imagekit.io/v1/files?limit=1", {
          headers: { Authorization: "Basic " + btoa(imageKitPrivateKey + ":") }
        });
        imageKitOk = check.ok;
        if (!check.ok) details.push("ImageKit : " + ((await check.json().catch(() => ({}))).message || `HTTP ${check.status}`));
      } catch (error) { details.push("ImageKit : " + (error instanceof Error ? error.message : String(error))); }
    } else {
      details.push("IMAGEKIT_PRIVATE_KEY absent.");
    }

    if (muxTokenId && muxTokenSecret) {
      try {
        const check = await fetch("https://api.mux.com/video/v1/assets?limit=1", {
          headers: { Authorization: "Basic " + btoa(muxTokenId + ":" + muxTokenSecret) }
        });
        muxOk = check.ok;
        if (!check.ok) {
          const payload = await check.json().catch(() => ({}));
          details.push("Mux : " + (payload?.error?.messages?.[0] || payload?.error?.message || `HTTP ${check.status}`));
        }
      } catch (error) { details.push("Mux : " + (error instanceof Error ? error.message : String(error))); }
    } else {
      details.push("Secrets MUX_TOKEN_ID / MUX_TOKEN_SECRET absents.");
    }

    const configured = cloudinaryOk && imageKitOk && muxOk;
    return json({
      configured,
      cloudinary: cloudinaryOk,
      imagekit: imageKitOk,
      mux: muxOk,
      error: configured ? null : "Une ou plusieurs connexions d'hébergement ne sont pas prêtes.",
      details: details.join(" · ")
    }, configured ? 200 : 503, origin);
  }

  const videoId = String(body.videoId ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(videoId)) {
    return json({ error: "Identifiant vidéo invalide." }, 400, origin);
  }
  const deleteVideoAsset = body.deleteVideoAsset === true;

  const { data: video, error: selectError } = await supabase
    .from("videos")
    .select("id,title,provider,cloudinary_public_id,mux_asset_id,thumbnail_url,thumbnail_provider,thumbnail_cloudinary_public_id,thumbnail_imagekit_file_id,announcement_id")
    .eq("id", videoId)
    .maybeSingle();

  if (selectError) return json({ error: "Impossible de lire la vidéo : " + selectError.message }, 500, origin);
  if (!video) return json({ error: "Cette vidéo n'existe plus dans la bibliothèque." }, 404, origin);
  const videoProvider = (video.provider || "cloudinary") as string;
  if (deleteVideoAsset && !["cloudinary", "mux"].includes(videoProvider)) {
    return json({ error: "La suppression définitive du fichier source n'est disponible que pour Cloudinary et Mux." }, 400, origin);
  }
  if (deleteVideoAsset && videoProvider === "cloudinary" && !video.cloudinary_public_id) {
    return json({ error: "Aucun identifiant vidéo Cloudinary n'est associé à cette fiche." }, 400, origin);
  }
  if (deleteVideoAsset && videoProvider === "mux" && !video.mux_asset_id) {
    return json({ error: "Aucun identifiant d'asset Mux n'est associé à cette vidéo. Le fichier n'est peut-être pas encore prêt sur Mux." }, 409, origin);
  }
  if (deleteVideoAsset && videoProvider === "mux" && (!muxTokenId || !muxTokenSecret)) {
    return json({ error: "Secrets Mux absents : vérifie MUX_TOKEN_ID et MUX_TOKEN_SECRET dans les secrets Edge Functions." }, 503, origin);
  }

  let coverResult = "aucune couverture";
  const thumbnailUrl = video.thumbnail_url as string | null;
  let coverProvider = video.thumbnail_provider as string | null;
  if (!coverProvider && thumbnailUrl) {
    if (thumbnailUrl.includes("ik.imagekit.io")) coverProvider = "imagekit";
    else if (thumbnailUrl.includes("res.cloudinary.com") && thumbnailUrl.includes("/image/upload/")) coverProvider = "cloudinary";
    else if (thumbnailUrl.includes("res.cloudinary.com") && thumbnailUrl.includes("/video/upload/")) coverProvider = "cloudinary_video";
    else if (thumbnailUrl.includes("image.mux.com")) coverProvider = "mux";
  }

  let coverIsShared = false;
  if (thumbnailUrl) {
    const [{ data: otherVideos, error: otherVideosError }, { data: announcements, error: announcementsError }] = await Promise.all([
      supabase.from("videos").select("id").eq("thumbnail_url", thumbnailUrl).neq("id", videoId).limit(1),
      supabase.from("video_announcements").select("id").eq("cover_url", thumbnailUrl).limit(1)
    ]);
    if (otherVideosError || announcementsError) {
      return json({ error: "Impossible de vérifier si la couverture est encore utilisée. Aucun fichier de couverture n'a été supprimé.", details: otherVideosError?.message || announcementsError?.message }, 500, origin);
    }
    coverIsShared = Boolean(otherVideos?.length || announcements?.length);
  }

  if (deleteVideoAsset && coverIsShared && (coverProvider === "mux" || coverProvider === "cloudinary_video")) {
    return json({ error: "Suppression interrompue : cette miniature est encore utilisée par une annonce ou une autre vidéo. Modifie d'abord cette référence pour éviter de casser son affichage." }, 409, origin);
  }

  let resolvedImageKitFileId = video.thumbnail_imagekit_file_id as string | null;
  let resolvedCloudinaryCoverPublicId = (video.thumbnail_cloudinary_public_id as string | null) || null;
  if (thumbnailUrl && !coverIsShared && coverProvider === "imagekit") {
    if (!imageKitPrivateKey) return json({ error: "IMAGEKIT_PRIVATE_KEY est absent : la suppression est interrompue avant de toucher à la vidéo.", video: "conservée" }, 503, origin);
    try {
      if (!resolvedImageKitFileId) resolvedImageKitFileId = await resolveImageKitFileId(thumbnailUrl, imageKitPrivateKey);
    } catch (error) {
      return json({ error: "Impossible d'identifier la couverture ImageKit. La vidéo n'a pas été supprimée.", details: error instanceof Error ? error.message : String(error) }, 502, origin);
    }
  }
  if (thumbnailUrl && !coverIsShared && coverProvider === "cloudinary") {
    if (!cloudinaryApiKey || !cloudinaryApiSecret) return json({ error: "Secrets Cloudinary absents : la suppression est interrompue avant de toucher à la vidéo." }, 503, origin);
    try {
      if (!resolvedCloudinaryCoverPublicId) resolvedCloudinaryCoverPublicId = cloudinaryImagePublicId(thumbnailUrl);
    } catch {
      resolvedCloudinaryCoverPublicId = null;
    }
    if (!resolvedCloudinaryCoverPublicId) return json({ error: "Impossible d'identifier précisément la couverture Cloudinary. La vidéo n'a pas été supprimée." }, 422, origin);
  }

  let videoResult = "fichier vidéo conservé chez l'hébergeur";
  if (deleteVideoAsset && videoProvider === "mux") {
    try {
      const response = await fetch("https://api.mux.com/video/v1/assets/" + encodeURIComponent(String(video.mux_asset_id)), {
        method: "DELETE",
        headers: { Authorization: "Basic " + btoa(muxTokenId + ":" + muxTokenSecret) }
      });
      if (response.status !== 204 && response.status !== 404) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.messages?.[0] || payload?.error?.message || `Mux HTTP ${response.status}`);
      }
      videoResult = response.status === 404 ? "asset déjà absent de Mux" : "asset supprimé de Mux";
    } catch (error) {
      return json({ error: "Mux a refusé la suppression de la vidéo. La fiche et sa couverture sont conservées.", details: error instanceof Error ? error.message : String(error) }, 502, origin);
    }
  } else if (deleteVideoAsset && videoProvider === "cloudinary") {
    if (!cloudinaryApiKey || !cloudinaryApiSecret) {
      return json({ error: "Secrets Cloudinary absents : vérifie CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET." }, 503, origin);
    }
    try {
      videoResult = await deleteCloudinaryAsset(video.cloudinary_public_id, "video", cloudinaryApiKey, cloudinaryApiSecret);
    } catch (error) {
      return json({ error: "Cloudinary a refusé la suppression de la vidéo. La fiche et sa couverture sont conservées.", details: error instanceof Error ? error.message : String(error) }, 502, origin);
    }
  }

  if (thumbnailUrl && coverProvider === "mux") {
    coverResult = deleteVideoAsset && videoProvider === "mux"
      ? "miniature Mux supprimée avec l'asset"
      : "miniature Mux conservée avec l'asset vidéo";
  } else if (thumbnailUrl && coverIsShared) {
    coverResult = "couverture conservée car elle est encore utilisée par une autre vidéo ou une annonce";
  } else if (thumbnailUrl && coverProvider === "imagekit") {
    if (!imageKitPrivateKey) return json({ error: "IMAGEKIT_PRIVATE_KEY est absent : la couverture n'a pas été supprimée. La fiche vidéo reste dans Supabase.", video: videoResult }, 503, origin);
    const fileId = resolvedImageKitFileId;
    if (fileId) {
      try { coverResult = await deleteImageKitFile(fileId, thumbnailUrl, imageKitPrivateKey); }
      catch (error) {
        return json({ error: "ImageKit a refusé la suppression de la couverture. La fiche vidéo reste dans Supabase.", details: error instanceof Error ? error.message : String(error), video: videoResult }, 502, origin);
      }
    } else {
      coverResult = "couverture ImageKit déjà absente";
    }
  } else if (thumbnailUrl && coverProvider === "cloudinary") {
    if (!cloudinaryApiKey || !cloudinaryApiSecret) {
      return json({ error: "Secrets Cloudinary absents : la couverture n'a pas été supprimée et la fiche vidéo reste dans Supabase.", video: videoResult }, 503, origin);
    }
    const publicId = resolvedCloudinaryCoverPublicId as string;
    if (!publicId) return json({ error: "Impossible d'identifier précisément la couverture Cloudinary. La fiche vidéo reste dans Supabase.", video: videoResult }, 422, origin);
    try { coverResult = await deleteCloudinaryAsset(publicId, "image", cloudinaryApiKey, cloudinaryApiSecret); }
    catch (error) {
      return json({ error: "Cloudinary a refusé la suppression de la couverture. La fiche vidéo reste dans Supabase.", details: error instanceof Error ? error.message : String(error), video: videoResult }, 502, origin);
    }
  } else if (thumbnailUrl && coverProvider === "cloudinary_video") {
    coverResult = deleteVideoAsset && videoProvider === "cloudinary"
      ? "miniature supprimée avec la vidéo source"
      : "miniature générée par la vidéo source : elle reste chez l'hébergeur tant que la vidéo est conservée";
  } else if (thumbnailUrl) {
    coverResult = "URL externe non gérée : référence retirée de Supabase uniquement";
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("videos")
    .delete()
    .eq("id", videoId)
    .select("id");
  if (deleteError || !deletedRows?.length) {
    return json({
      error: "Les fichiers distants ont été traités, mais la fiche vidéo n'a pas pu être supprimée de Supabase.",
      details: deleteError?.message ?? "Aucune ligne supprimée.",
      cover: coverResult,
      video: videoResult
    }, 500, origin);
  }

  const message = deleteVideoAsset
    ? `Vidéo supprimée de ${videoProvider === "mux" ? "Mux" : "Cloudinary"} et de Supabase. ${coverResult}.`
    : coverResult.startsWith("miniature générée")
      ? "Vidéo retirée de Supabase. La miniature automatique reste liée au fichier vidéo conservé chez son hébergeur."
      : coverResult.startsWith("URL externe")
        ? "Vidéo retirée de Supabase. La référence de couverture externe a été retirée, mais le fichier externe n'a pas été touché."
        : "Vidéo retirée de Supabase ; " + coverResult + ".";
  return json({ success: true, title: video.title, cover: coverResult, video: videoResult, message }, 200, origin);
});
