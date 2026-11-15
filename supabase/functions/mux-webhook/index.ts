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

  async function syncAnnouncementMuxState(videoId: string, videoUrl: string, ready: boolean) {
    const { data: linkedVideo, error: linkedVideoError } = await db.from("videos")
      .select("announcement_id")
      .eq("id", videoId)
      .maybeSingle();
    if (linkedVideoError) throw new Error(linkedVideoError.message);
    if (!linkedVideo?.announcement_id) return;

    const { data: announcement, error: announcementError } = await db.from("video_announcements")
      .select("id,media_type,is_visible")
      .eq("id", linkedVideo.announcement_id)
      .maybeSingle();
    if (announcementError) throw new Error(announcementError.message);
    if (announcement?.media_type !== "video") return;

    const announcementUpdate: Record<string, unknown> = {
      video_provider: "mux",
      video_url: videoUrl,
      updated_at: new Date().toISOString()
    };
    const { error: updateAnnouncementError } = await db.from("video_announcements")
      .update(announcementUpdate)
      .eq("id", announcement.id);
    if (updateAnnouncementError) throw new Error(updateAnnouncementError.message);

    if (ready) {
      const { error: publishError } = await db.from("videos")
        .update({ is_published: announcement.is_visible === true })
        .eq("id", videoId);
      if (publishError) throw new Error(publishError.message);
    }
  }

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
      playback_url: "https://stream.mux.com/" + playbackId + ".m3u8"
      // The admin must explicitly publish after the asset is ready.
    });
    query = videoId ? query.eq("id", videoId) : query.eq("mux_asset_id", data.id);
    const { error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    let linkedVideoQuery = db.from("videos").select("id").maybeSingle();
    linkedVideoQuery = videoId ? linkedVideoQuery.eq("id", videoId) : linkedVideoQuery.eq("mux_asset_id", data.id);
    const { data: linkedVideo, error: linkedVideoError } = await linkedVideoQuery;
    if (linkedVideoError) return Response.json({ error: linkedVideoError.message }, { status: 500 });
    if (linkedVideo?.id) {
      try {
        await syncAnnouncementMuxState(linkedVideo.id, playbackId, true);
      } catch (syncError) {
        return Response.json({ error: syncError instanceof Error ? syncError.message : "Announcement sync failed." }, { status: 500 });
      }
    }

    // Preserve the existing automatic publication for standalone Mux videos.
    // Announcement-linked videos stay unpublished until the admin clicks Publish.
    let publishQuery = db.from("videos").update({ is_published: true });
    publishQuery = videoId
      ? publishQuery.eq("id", videoId).is("announcement_id", null)
      : publishQuery.eq("mux_asset_id", data.id).is("announcement_id", null);
    const { error: publishError } = await publishQuery;
    if (publishError) return Response.json({ error: publishError.message }, { status: 500 });

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
      const { data: failedVideo, error: failedLookupError } = await db.from("videos")
        .select("id")
        .eq("mux_upload_id", uploadId)
        .maybeSingle();
      if (failedLookupError) return Response.json({ error: failedLookupError.message }, { status: 500 });
      if (failedVideo?.id) {
        try {
          await syncAnnouncementMuxState(failedVideo.id, "mux-error", false);
        } catch (syncError) {
          return Response.json({ error: syncError instanceof Error ? syncError.message : "Announcement error sync failed." }, { status: 500 });
        }
      }
    }
  } else if (event.type === "video.asset.static_rendition.ready") {
    // For this event, data.id identifies the static rendition, not its parent asset.
    // Prefer the explicit parent asset ID or the webhook's asset object ID.
    const assetId = String(
      data.asset_id ||
      data.asset?.id ||
      (event.object?.type === "asset" ? event.object.id : "")
    );
    if (!assetId) {
      console.error("Mux static rendition webhook is missing its parent asset ID", {
        objectType: event.object?.type,
        dataKeys: Object.keys(data)
      });
      return Response.json({ error: "Parent asset ID missing from static rendition webhook." }, { status: 500 });
    }
    if (!muxTokenId || !muxTokenSecret) {
      return Response.json({ error: "Mux API credentials are not configured." }, { status: 503 });
    }
    {
      const assetResponse = await fetch("https://api.mux.com/video/v1/assets/" + encodeURIComponent(assetId), {
        headers: { "Authorization": "Basic " + btoa(muxTokenId + ":" + muxTokenSecret) }
      });
      const assetPayload = await assetResponse.json().catch(() => ({}));
      if (!assetResponse.ok) {
        console.error("Mux static rendition: asset lookup failed", { assetId, status: assetResponse.status, message: assetPayload?.error?.messages?.[0] || assetPayload?.error?.message || "Unknown Mux API error" });
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
      try {
        await syncAnnouncementMuxState(videoId, "mux-error", false);
      } catch (syncError) {
        return Response.json({ error: syncError instanceof Error ? syncError.message : "Announcement error sync failed." }, { status: 500 });
      }
    }
  }

  return Response.json({ received: true });
});
