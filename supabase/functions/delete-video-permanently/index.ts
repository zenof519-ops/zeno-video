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
    searchQuery: `name="${filename.replace(/"/g, "\\\"")}"`,
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

async function deleteImageKitFile(fileId: string, privateKey: string) {
  const response = await fetch("https://api.imagekit.io/v1/files/" + encodeURIComponent(fileId), {
    method: "DELETE",
    headers: { Authorization: "Basic " + btoa(privateKey + ":") }
  });
  if (response.status === 204 || response.status === 200) return "ok";
  if (response.status === 404) return "not found";
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message || `ImageKit HTTP ${response.status}`);
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

  if (!supabaseUrl || !publishableKey) return json({ error: "Configuration Supabase manquante." }, 500, origin);
  if (!cloudinaryApiKey || !cloudinaryApiSecret) {
    return json({ error: "Secrets Cloudinary absents : vérifie CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET." }, 503, origin);
  }

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
    let cloudinaryDetails = "";
    let imageKitDetails = "";
    try {
      const check = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/video/upload?max_results=1`,
        { headers: { Authorization: "Basic " + btoa(cloudinaryApiKey + ":" + cloudinaryApiSecret) } }
      );
      cloudinaryOk = check.ok;
      if (!check.ok) cloudinaryDetails = (await check.json().catch(() => ({}))).error?.message || `HTTP ${check.status}`;
    } catch (error) { cloudinaryDetails = error instanceof Error ? error.message : String(error); }

    if (imageKitPrivateKey) {
      try {
        const check = await fetch("https://api.imagekit.io/v1/files?limit=1", {
          headers: { Authorization: "Basic " + btoa(imageKitPrivateKey + ":") }
        });
        imageKitOk = check.ok;
        if (!check.ok) imageKitDetails = (await check.json().catch(() => ({}))).message || `HTTP ${check.status}`;
      } catch (error) { imageKitDetails = error instanceof Error ? error.message : String(error); }
    } else {
      imageKitDetails = "IMAGEKIT_PRIVATE_KEY absent.";
    }

    const configured = cloudinaryOk && imageKitOk;
    return json({
      configured,
      cloudinary: cloudinaryOk,
      imagekit: imageKitOk,
      error: configured ? null : "La connexion à Cloudinary et/ou ImageKit n'est pas prête.",
      details: [cloudinaryDetails, imageKitDetails].filter(Boolean).join(" · ")
    }, configured ? 200 : 503, origin);
  }

  const videoId = String(body.videoId ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(videoId)) {
    return json({ error: "Identifiant vidéo invalide." }, 400, origin);
  }
  const deleteVideoAsset = body.deleteVideoAsset === true;

  const { data: video, error: selectError } = await supabase
    .from("videos")
    .select("id,title,provider,cloudinary_public_id,thumbnail_url,thumbnail_provider,thumbnail_cloudinary_public_id,thumbnail_imagekit_file_id")
    .eq("id", videoId)
    .maybeSingle();

  if (selectError) return json({ error: "Impossible de lire la vidéo : " + selectError.message }, 500, origin);
  if (!video) return json({ error: "Cette vidéo n'existe plus dans la bibliothèque." }, 404, origin);
  if (deleteVideoAsset && (video.provider || "cloudinary") !== "cloudinary") {
    return json({ error: "La suppression du fichier vidéo lui-même est actuellement réservée aux vidéos Cloudinary." }, 400, origin);
  }
  if (deleteVideoAsset && !video.cloudinary_public_id) {
    return json({ error: "Aucun identifiant vidéo Cloudinary n'est associé à cette fiche." }, 400, origin);
  }

  let coverResult = "aucune couverture";
  const thumbnailUrl = video.thumbnail_url as string | null;
  let coverProvider = video.thumbnail_provider as string | null;
  if (!coverProvider && thumbnailUrl) {
    if (thumbnailUrl.includes("ik.imagekit.io")) coverProvider = "imagekit";
    else if (thumbnailUrl.includes("/image/upload/")) coverProvider = "cloudinary";
    else if (thumbnailUrl.includes("/video/upload/")) coverProvider = "cloudinary_video";
  }

  if (thumbnailUrl && coverProvider === "imagekit") {
    if (!imageKitPrivateKey) return json({ error: "IMAGEKIT_PRIVATE_KEY est absent : la couverture n'a pas été supprimée et la vidéo reste dans Supabase." }, 503, origin);
    let fileId = video.thumbnail_imagekit_file_id as string | null;
    if (!fileId) fileId = await resolveImageKitFileId(thumbnailUrl, imageKitPrivateKey);
    if (fileId) {
      try { coverResult = await deleteImageKitFile(fileId, imageKitPrivateKey); }
      catch (error) {
        return json({ error: "ImageKit a refusé la suppression de la couverture. La vidéo reste dans Supabase.", details: error instanceof Error ? error.message : String(error) }, 502, origin);
      }
    } else {
      coverResult = "not found";
    }
  } else if (thumbnailUrl && coverProvider === "cloudinary") {
    const publicId = (video.thumbnail_cloudinary_public_id as string | null) || cloudinaryImagePublicId(thumbnailUrl);
    if (!publicId) return json({ error: "Impossible d'identifier précisément la couverture Cloudinary. La vidéo reste dans Supabase." }, 422, origin);
    try { coverResult = await deleteCloudinaryAsset(publicId, "image", cloudinaryApiKey, cloudinaryApiSecret); }
    catch (error) {
      return json({ error: "Cloudinary a refusé la suppression de la couverture. La vidéo reste dans Supabase.", details: error instanceof Error ? error.message : String(error) }, 502, origin);
    }
  } else if (thumbnailUrl && coverProvider === "cloudinary_video") {
    coverResult = deleteVideoAsset
      ? "supprimée avec la vidéo source"
      : "miniature générée par la vidéo source : elle reste sur Cloudinary tant que la vidéo est conservée";
  } else if (thumbnailUrl) {
    coverResult = "URL externe non gérée : référence retirée de Supabase uniquement";
  }

  let videoResult = "fichier vidéo conservé chez l'hébergeur";
  if (deleteVideoAsset) {
    try { videoResult = await deleteCloudinaryAsset(video.cloudinary_public_id, "video", cloudinaryApiKey, cloudinaryApiSecret); }
    catch (error) {
      return json({ error: "La couverture a été traitée, mais Cloudinary a refusé la suppression de la vidéo. La fiche reste dans Supabase.", details: error instanceof Error ? error.message : String(error), cover: coverResult }, 502, origin);
    }
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
    ? "Vidéo et couverture supprimées de leurs hébergeurs et de Supabase."
    : coverResult.startsWith("miniature générée")
      ? "Vidéo retirée de Supabase. La miniature automatique reste liée au fichier vidéo conservé sur Cloudinary."
      : coverResult.startsWith("URL externe")
        ? "Vidéo retirée de Supabase. La référence de couverture externe a été retirée, mais le fichier externe n'a pas été touché."
        : "Vidéo retirée de Supabase ; sa couverture hébergée a été supprimée.";
  return json({ success: true, title: video.title, cover: coverResult, video: videoResult, message }, 200, origin);
});
