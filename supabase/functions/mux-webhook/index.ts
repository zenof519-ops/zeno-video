import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map(value => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyMuxSignature(rawBody: string, signatureHeader: string, secret: string) {
  const values = new Map<string, string>();
  for (const item of signatureHeader.split(",")) {
    const [key, value] = item.trim().split("=", 2);
    if (key && value) values.set(key, value);
  }
  const timestamp = values.get("t");
  const signature = values.get("v1");
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = timestamp + "." + rawBody;
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload)));
  return constantTimeEqual(expected, signature.toLowerCase());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("MUX_WEBHOOK_SECRET");
  const muxTokenId = Deno.env.get("MUX_TOKEN_ID");
  const muxTokenSecret = Deno.env.get("MUX_TOKEN_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!secret || !serviceRoleKey || !supabaseUrl) {
    return Response.json({ error: "Webhook configuration missing." }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("mux-signature") || req.headers.get("Mux-Signature") || "";
  if (!await verifyMuxSignature(rawBody, signature, secret)) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const data = event?.data;
  if (!data || typeof data !== "object") return Response.json({ received: true });

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  if (event.type === "video.asset.created") {
    const videoId = String(data.passthrough || "");
    if (videoId) {
      const { error } = await db.from("videos")
        .update({ mux_asset_id: data.id, mux_status: "processing" })
        .eq("id", videoId)
        .neq("mux_status", "ready");
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  } else if (event.type === "video.asset.ready") {
    const videoId = String(data.passthrough || "");
    const playbackId = Array.isArray(data.playback_ids)
      ? data.playback_ids.find((item: any) => item?.policy === "public")?.id
      : null;
    if (!playbackId) return Response.json({ error: "Public playback ID missing." }, { status: 500 });

    let query = db.from("videos").update({
      mux_asset_id: data.id,
      mux_playback_id: playbackId,
      mux_status: "ready",
      playback_url: "https://stream.mux.com/" + playbackId + ".m3u8",
      is_published: true
    });
    query = videoId ? query.eq("id", videoId) : query.eq("mux_asset_id", data.id);
    const { error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (videoId) {
      await db.from("videos")
        .update({ thumbnail_url: "https://image.mux.com/" + playbackId + "/thumbnail.jpg" })
        .eq("id", videoId)
        .is("thumbnail_url", null);
    }
  } else if (event.type === "video.upload.errored" || event.type === "video.upload.cancelled") {
    const uploadId = String(data.id || "");
    if (uploadId) {
      const { error } = await db.from("videos")
        .update({
          mux_status: event.type === "video.upload.cancelled" ? "upload_failed" : "errored",
          is_published: false
        })
        .eq("mux_upload_id", uploadId);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  } else if (event.type === "video.asset.static_rendition.ready") {
    const assetId = String(event.object?.id || data.asset_id || data.asset?.id || "");
    if (assetId && muxTokenId && muxTokenSecret) {
      const assetResponse = await fetch("https://api.mux.com/video/v1/assets/" + encodeURIComponent(assetId), {
        headers: { "Authorization": "Basic " + btoa(muxTokenId + ":" + muxTokenSecret) }
      });
      const assetPayload = await assetResponse.json().catch(() => ({}));
      if (!assetResponse.ok) {
        return Response.json({ error: "Impossible de vérifier le MP4 prêt sur Mux." }, { status: 502 });
      }
      const renditionFiles = Array.isArray(assetPayload?.data?.static_renditions)
        ? assetPayload.data.static_renditions
        : Array.isArray(assetPayload?.data?.static_renditions?.files)
          ? assetPayload.data.static_renditions.files
          : [];
      const mp4 = renditionFiles.find((file: any) =>
        file?.ext === "mp4" && file?.status === "ready" && file?.name
      );
      const playbackId = Array.isArray(assetPayload?.data?.playback_ids)
        ? assetPayload.data.playback_ids.find((item: any) => item?.policy === "public")?.id
        : null;
      if (mp4 && playbackId) {
        const { data: videoRow, error: lookupError } = await db.from("videos")
          .select("id,title")
          .eq("mux_asset_id", assetId)
          .maybeSingle();
        if (lookupError) return Response.json({ error: lookupError.message }, { status: 500 });
        if (videoRow) {
          const safeName = String(videoRow.title || "zeno-video")
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80) || "zeno-video";
          const downloadUrl = "https://stream.mux.com/" + encodeURIComponent(playbackId) +
            "/" + encodeURIComponent(mp4.name) + "?download=" + encodeURIComponent(safeName + ".mp4");
          const { error } = await db.from("videos")
            .update({ download_url: downloadUrl })
            .eq("id", videoRow.id);
          if (error) return Response.json({ error: error.message }, { status: 500 });
        }
      }
    }
  } else if (event.type === "video.asset.errored") {
    const videoId = String(data.passthrough || "");
    if (videoId) {
      const { error } = await db.from("videos")
        .update({ mux_asset_id: data.id, mux_status: "errored", is_published: false })
        .eq("id", videoId);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ received: true });
});
