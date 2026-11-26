export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      "Access-Control-Allow-Origin": "https://zenof519-ops.github.io",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Expose-Headers": "Accept-Ranges,Content-Length,Content-Range,ETag",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health") {
      return new Response("Zeno Video R2 OK", { headers });
    }

    if (!url.pathname.startsWith("/media/") || !["GET", "HEAD"].includes(request.method)) {
      return new Response("Not found", { status: 404, headers });
    }

    const key = decodeURIComponent(url.pathname.slice(7));
    if (!key || key.includes("..")) {
      return new Response("Bad key", { status: 400, headers });
    }

    const object = await env.ZENOVIDEO.get(key);
    if (!object) {
      return new Response("Not found", { status: 404, headers });
    }

    const responseHeaders = new Headers(headers);
    object.writeHttpMetadata(responseHeaders);
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("ETag", object.httpEtag);
    responseHeaders.set("Cache-Control", "public, max-age=3600");
    responseHeaders.set("Content-Length", String(object.size));

    return new Response(request.method === "HEAD" ? null : object.body, {
      headers: responseHeaders
    });
  }
};
