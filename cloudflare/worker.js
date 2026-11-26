const ALLOWED_ORIGIN = "https://zenof519-ops.github.io";
const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,HEAD,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, apikey, Content-Type, X-File-Name",
    "Access-Control-Expose-Headers": "Accept-Ranges,Content-Length,Content-Range,ETag",
    "Vary": "Origin"
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function safeFilename(value) {
  const leaf = String(value || "video.mp4").split(/[\\/]/).pop() || "video.mp4";
  const safe = leaf.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 100);
  return safe || "video.mp4";
}

async function adminError(request, env) {
  const authorization = request.headers.get("Authorization");
  const apiKey = request.headers.get("apikey");
  if (!authorization || !authorization.startsWith("Bearer ") || !apiKey) {
    return json({ error: "Connexion administrateur requise.", code: "unauthorized" }, 401);
  }
  if (!env.SUPABASE_URL || !env.ZENO_ADMIN_USER_ID) {
    return json({ error: "Configuration d’authentification R2 incomplète.", code: "server_config" }, 503);
  }

  let response;
  try {
    response = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
      headers: {
        "apikey": apiKey,
        "Authorization": authorization
      }
    });
  } catch {
    return json({ error: "Vérification de la session administrateur impossible.", code: "auth_unavailable" }, 503);
  }

  const user = await response.json().catch(() => ({}));
  if (!response.ok || user.id !== env.ZENO_ADMIN_USER_ID) {
    return json({ error: "Accès réservé à l’administrateur Zeno Video.", code: "forbidden" }, 403);
  }
  return null;
}

function decodeObjectKey(pathname) {
  try {
    const key = decodeURIComponent(pathname.slice("/media/".length));
    if (!key || key.includes("..") || key.startsWith("/") || key.includes("\\\\")) return null;
    return key;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders();

    if (url.origin !== "https://zeno-video-media.zenof519.workers.dev" && url.hostname !== "zeno-video-media.zenof519.workers.dev") {
      return new Response("Not found", { status: 404, headers });
    }

    if (request.headers.get("Origin") && request.headers.get("Origin") !== ALLOWED_ORIGIN) {
      return json({ error: "Origine non autorisée.", code: "forbidden_origin" }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return new Response("Zeno Video R2 OK", {
        headers: { ...headers, "Cache-Control": "no-store" }
      });
    }

    if (url.pathname === "/upload" && request.method === "PUT") {
      const denied = await adminError(request, env);
      if (denied) return denied;

      const filename = safeFilename(url.searchParams.get("filename") || request.headers.get("X-File-Name"));
      const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
      const size = Number(request.headers.get("Content-Length"));

      if (!ALLOWED_VIDEO_TYPES.has(contentType)) {
        return json({ error: "Format non accepté. Utilise MP4, MOV ou WebM.", code: "unsupported_media_type" }, 415);
      }
      if (!Number.isSafeInteger(size) || size <= 0) {
        return json({ error: "Taille du fichier absente ou invalide.", code: "invalid_content_length" }, 411);
      }
      if (size > MAX_UPLOAD_BYTES) {
        return json({ error: "La limite actuelle d’envoi R2 est de 95 Mio par vidéo.", code: "file_too_large", maxBytes: MAX_UPLOAD_BYTES }, 413);
      }
      if (!request.body) {
        return json({ error: "Le fichier envoyé est vide.", code: "empty_body" }, 400);
      }

      const key = "videos/" + crypto.randomUUID() + "-" + filename;
      try {
        const stored = await env.ZENOVIDEO.put(key, request.body, {
          httpMetadata: {
            contentType,
            cacheControl: "public, max-age=3600"
          },
          customMetadata: {
            originalName: filename
          }
        });
        return json({
          key,
          url: url.origin + "/media/" + key.split("/").map(encodeURIComponent).join("/"),
          size: stored?.size ?? size,
          contentType,
          etag: stored?.httpEtag ?? null
        }, 201);
      } catch (error) {
        console.error(JSON.stringify({
          message: "r2_upload_failed",
          error: error instanceof Error ? error.message : String(error),
          size
        }));
        return json({ error: "L’envoi vers Cloudflare R2 a échoué. Réessaie après avoir vérifié la connexion.", code: "r2_upload_failed" }, 502);
      }
    }

    if (url.pathname === "/admin/usage" && request.method === "GET") {
      const denied = await adminError(request, env);
      if (denied) return denied;

      let cursor;
      let objectCount = 0;
      let totalBytes = 0;
      let pages = 0;
      let truncated = false;
      do {
        const page = await env.ZENOVIDEO.list({ prefix: "videos/", limit: 1000, cursor });
        objectCount += page.objects.length;
        totalBytes += page.objects.reduce((sum, object) => sum + object.size, 0);
        pages++;
        truncated = page.truncated;
        cursor = page.truncated ? page.cursor : undefined;
      } while (truncated && cursor && pages < 20);

      return json({
        provider: "r2",
        bucket: "zeno-video-media",
        objectCount,
        totalBytes,
        complete: !truncated,
        pagesScanned: pages,
        note: truncated ? "Mesure partielle : la liste est limitée à 20 000 objets par actualisation." : "Mesure calculée à partir des objets présents dans le bucket."
      });
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/media/")) {
      const key = decodeObjectKey(url.pathname);
      if (!key) return new Response("Bad key", { status: 400, headers });
      if (!key.startsWith("videos/")) return new Response("Not found", { status: 404, headers });

      try {
        const object = await env.ZENOVIDEO.get(key, { range: request.headers });
        if (!object) return new Response("Not found", { status: 404, headers });

        const responseHeaders = new Headers(headers);
        object.writeHttpMetadata(responseHeaders);
        responseHeaders.set("Accept-Ranges", "bytes");
        responseHeaders.set("ETag", object.httpEtag);
        responseHeaders.set("Cache-Control", "public, max-age=3600");
        responseHeaders.set("X-Content-Type-Options", "nosniff");
        if (!responseHeaders.has("Content-Type")) responseHeaders.set("Content-Type", "application/octet-stream");

        let status = 200;
        if (object.range) {
          const start = Number(object.range.offset ?? 0);
          const length = Number(object.range.length ?? 0);
          if (length > 0) {
            responseHeaders.set("Content-Range", "bytes " + start + "-" + (start + length - 1) + "/" + object.size);
            responseHeaders.set("Content-Length", String(length));
            status = 206;
          }
        } else {
          responseHeaders.set("Content-Length", String(object.size));
        }

        return new Response(request.method === "HEAD" ? null : object.body, {
          status,
          headers: responseHeaders
        });
      } catch (error) {
        console.error(JSON.stringify({
          message: "r2_read_failed",
          error: error instanceof Error ? error.message : String(error),
          key
        }));
        return new Response("Unable to read media", { status: 502, headers });
      }
    }

    return new Response("Not found", { status: 404, headers });
  }
};
