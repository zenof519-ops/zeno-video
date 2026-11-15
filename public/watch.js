const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
const CLOUD_NAME = "wnonuvx4";

let id = new URLSearchParams(location.search).get("id");
const announcementId = new URLSearchParams(location.search).get("a");
let linkedAnnouncement = null;
const wrap = document.getElementById("player-wrap");
const downloadButton = document.getElementById("download-video");

let viewRegistered = false;
let activeProvider = "unknown";

function captureAnalytics(eventName, properties = {}) {
  try {
    // Send immediately with sendBeacon so the event is not lost during navigation.
    window.posthog?.capture?.(
      eventName,
      { ...properties, provider: activeProvider },
      { transport: "sendBeacon", send_instantly: true }
    );
  } catch {
    // Analytics must never interrupt video playback or downloads.
  }
}

async function registerViewOnce() {
  if (viewRegistered) return;

  viewRegistered = true;
  captureAnalytics("video_launch_requested");

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/video-counter`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ videoId: id, event: "view" })
      }
    );

    if (!response.ok) {
      viewRegistered = false;
      console.error(
        "Erreur de comptabilisation :",
        await response.text()
      );
    }
  } catch (error) {
    viewRegistered = false;
    console.error(
      "Impossible d'enregistrer le lancement :",
      error
    );
  }
}

function showCoverPreview(video, launchButton, note) {
  if (!video.thumbnail_url) {
    wrap.replaceChildren(launchButton, note);
    return;
  }

  const preview = document.createElement("div");
  preview.style.position = "relative";
  preview.style.width = "100%";
  preview.style.aspectRatio = "16 / 9";
  preview.style.overflow = "hidden";
  preview.style.background = "#000";
  preview.style.borderRadius = "12px";

  const cover = document.createElement("img");
  cover.src = video.thumbnail_url;
  cover.alt = "Couverture de " + (video.title || "la vidéo");
  cover.loading = "eager";
  cover.decoding = "async";
  cover.style.display = "block";
  cover.style.width = "100%";
  cover.style.height = "100%";
  cover.style.objectFit = "contain";
  cover.addEventListener("error", () => {
    preview.remove();
    wrap.replaceChildren(launchButton, note);
  }, { once: true });

  launchButton.style.position = "absolute";
  launchButton.style.left = "50%";
  launchButton.style.top = "50%";
  launchButton.style.transform = "translate(-50%, -50%)";
  launchButton.style.zIndex = "1";
  launchButton.style.margin = "0";
  launchButton.style.whiteSpace = "nowrap";

  preview.append(cover, launchButton);
  wrap.replaceChildren(preview, note);
}

function showViooPlayer(video) {
  const launchButton = document.createElement("button");
  launchButton.type = "button";
  launchButton.className = "btn";
  launchButton.textContent = "▶ Lancer la lecture";

  const note = document.createElement("p");
  note.className = "stats-note";
  note.textContent =
    "Le lancement sera comptabilisé lorsque tu appuieras sur ce bouton.";

  launchButton.addEventListener("click", () => {
    if (launchButton.disabled) return;

    launchButton.disabled = true;
    launchButton.textContent = "Ouverture du lecteur…";

    // Vioo est dans une iframe externe : Zeno compte le clic de lancement,
    // pas le démarrage réel de la lecture dans le lecteur Vioo.
    registerViewOnce();

    const frame = document.createElement("iframe");
    frame.src = video.playback_url;
    frame.loading = "eager";
    frame.allow = "autoplay; fullscreen; picture-in-picture";
    frame.allowFullscreen = true;
    frame.title = video.title;
    frame.referrerPolicy = "strict-origin-when-cross-origin";

    wrap.replaceChildren(frame);
  });

  showCoverPreview(video, launchButton, note);
}

function showMuxPlayer(video) {
  const launchButton = document.createElement("button");
  launchButton.type = "button";
  launchButton.className = "btn";
  launchButton.textContent = "▶ Lancer la lecture";

  const note = document.createElement("p");
  note.className = "stats-note";
  note.textContent = "Le lancement sera comptabilisé lorsque tu appuieras sur ce bouton.";

  launchButton.addEventListener("click", () => {
    if (launchButton.disabled || !video.mux_playback_id) return;
    launchButton.disabled = true;
    launchButton.textContent = "Ouverture du lecteur Mux…";
    registerViewOnce();

    const playerUrl = new URL("https://player.mux.com/" + encodeURIComponent(video.mux_playback_id));
    playerUrl.searchParams.set("accent-color", "#b88cff");
    playerUrl.searchParams.set("metadata-video-id", video.id);
    playerUrl.searchParams.set("metadata-video-title", video.title);

    const frame = document.createElement("iframe");
    frame.src = playerUrl.toString();
    frame.loading = "eager";
    frame.allow = "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;";
    frame.allowFullscreen = true;
    frame.title = video.title;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.style.width = "100%";
    frame.style.aspectRatio = "16 / 9";
    frame.style.border = "0";
    wrap.replaceChildren(frame);
  });

  showCoverPreview(video, launchButton, note);
}

function showCloudinaryPlayer(video, mediaUrl, downloadUrl) {
  const launchButton = document.createElement("button");
  launchButton.type = "button";
  launchButton.className = "btn";
  launchButton.textContent = "▶ Lancer la lecture";
  const note = document.createElement("p");
  note.className = "stats-note";
  note.textContent = "Le lancement sera comptabilisé lorsque la lecture commencera.";
  launchButton.addEventListener("click", async () => {
    if (launchButton.disabled) return;
    launchButton.disabled = true;
    launchButton.textContent = "Ouverture du lecteur…";
    const media = document.createElement("video");
    media.controls = true;
    media.playsInline = true;
    media.preload = "metadata";
    if (video.thumbnail_url) media.poster = video.thumbnail_url;
    media.style.width = "100%";
    media.style.maxWidth = "100%";
    media.style.height = "auto";
    media.style.display = "block";
    media.style.background = "#000";
    media.src = mediaUrl;
    media.addEventListener("playing", registerViewOnce);
    media.addEventListener("error", () => console.error("Erreur de lecture vidéo Cloudinary :", media.error));
    wrap.replaceChildren(media);
    try { await media.play(); } catch { /* Contrôles disponibles si autoplay est refusé. */ }
  });
  downloadButton.href = downloadUrl;
  downloadButton.hidden = false;
  showCoverPreview(video, launchButton, note);
}

function showOneDrivePlayer(video) {
  const launchButton = document.createElement("button");
  launchButton.type = "button";
  launchButton.className = "btn";
  launchButton.textContent = "▶ Lancer la lecture";

  const note = document.createElement("p");
  note.className = "stats-note";
  note.textContent = "Le lancement sera comptabilisé lorsque tu appuieras sur ce bouton.";

  launchButton.addEventListener("click", () => {
    if (launchButton.disabled) return;
    launchButton.disabled = true;
    launchButton.textContent = "Ouverture du lecteur OneDrive…";
    registerViewOnce();

    const frame = document.createElement("iframe");
    frame.src = video.playback_url;
    frame.loading = "eager";
    frame.allow = "autoplay; fullscreen; picture-in-picture";
    frame.allowFullscreen = true;
    frame.title = video.title;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    wrap.replaceChildren(frame);
  });

  showCoverPreview(video, launchButton, note);
}

async function loadVideo() {
  try {
    if (announcementId) {
      const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
      const announcementResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/video_announcements?select=id,title,description,cover_url,scheduled_for&id=eq.${encodeURIComponent(announcementId)}&is_visible=eq.true`,
        { headers }
      );
      if (!announcementResponse.ok) throw new Error("Impossible de récupérer cette annonce.");
      const announcements = await announcementResponse.json();
      const announcement = announcements[0];
      linkedAnnouncement = announcement || null;
      if (!announcement) throw new Error("Annonce introuvable ou masquée.");
      const linkedResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/videos?select=id&announcement_id=eq.${encodeURIComponent(announcementId)}&is_published=eq.true&limit=1`,
        { headers }
      );
      if (!linkedResponse.ok) throw new Error("Impossible de vérifier la disponibilité de cette vidéo.");
      const linked = await linkedResponse.json();
      if (!linked[0]) {
        document.title = announcement.title + " — Bientôt sur Zeno Video";
        document.getElementById("video-title").textContent = announcement.title;
        document.getElementById("video-description").textContent = announcement.description || "";
        const cover = document.createElement("img");
        cover.src = announcement.cover_url;
        cover.alt = "Couverture de " + announcement.title;
        cover.style.display = "block"; cover.style.width = "100%"; cover.style.maxWidth = "900px";
        cover.style.maxHeight = "70vh"; cover.style.objectFit = "contain"; cover.style.margin = "0 auto";
        const label = document.createElement("p"); label.className = "eyebrow"; label.textContent = "À VENIR";
        const message = document.createElement("p"); message.className = "intro";
        message.textContent = announcement.scheduled_for
          ? "Sortie prévue le " + new Date(announcement.scheduled_for).toLocaleString("fr-FR") + "."
          : "Cette vidéo sera bientôt disponible sur Zeno Video.";
        wrap.replaceChildren(cover, label, message);
        downloadButton.hidden = true;
        return;
      }
      id = linked[0].id;
    }
    if (!id) throw new Error("Vidéo introuvable");

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/videos?select=id,title,description,thumbnail_url,playback_url,download_url,cloudinary_public_id,format,provider,mux_playback_id&id=eq.${encodeURIComponent(id)}&is_published=eq.true`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "Impossible de récupérer cette vidéo."
      );
    }

    const videos = await response.json();
    const video = videos[0];

    if (!video) {
      throw new Error("Vidéo introuvable");
    }
    if (linkedAnnouncement) {
      video.title = linkedAnnouncement.title;
      video.description = linkedAnnouncement.description || "";
      video.thumbnail_url = linkedAnnouncement.cover_url || video.thumbnail_url;
    }

    document.title = video.title + " — Zeno Video";
    document.getElementById("video-title").textContent =
      video.title;

    document.getElementById("video-description").textContent =
      video.description || "";

    const provider = video.provider || (video.cloudinary_public_id ? "cloudinary" : "vioo");
    activeProvider = provider;

    if (provider === "cloudinary" && video.cloudinary_public_id) {
      const publicId = video.cloudinary_public_id.split("/").map(encodeURIComponent).join("/");
      const format = (video.format || "mp4").toLowerCase();
      const mediaUrl = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${publicId}.${format}`;
      const downloadUrl = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/fl_attachment/${publicId}`;
      showCloudinaryPlayer(video, mediaUrl, downloadUrl);
    } else if (provider === "mux" && video.mux_playback_id) {
      showMuxPlayer(video);
      if (video.download_url) {
        downloadButton.href = video.download_url;
        downloadButton.hidden = false;
      } else {
        downloadButton.hidden = true;
      }
    } else if (provider === "vioo" && video.playback_url) {
      showViooPlayer(video);
      // Aucun lien de téléchargement direct Vioo n'étant disponible.
      downloadButton.remove();
    } else if (provider === "onedrive" && video.playback_url) {
      showOneDrivePlayer(video);
      if (video.download_url) {
        const downloadUrl = new URL(video.download_url);
        downloadUrl.searchParams.set("download", "1");
        downloadButton.href = downloadUrl.toString();
        downloadButton.hidden = false;
      } else {
        downloadButton.hidden = true;
      }
    } else if (provider === "dropbox" && video.playback_url) {
      const media = document.createElement("video");
      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
      if (video.thumbnail_url) media.poster = video.thumbnail_url;
      media.style.width = "100%";
      media.style.maxWidth = "100%";
      media.style.height = "auto";
      media.style.display = "block";
      media.style.background = "#000";
      media.src = video.playback_url;
      media.addEventListener("playing", registerViewOnce);
      media.addEventListener("error", () => {
        console.error("Erreur de lecture Dropbox :", media.error);
      });
      wrap.replaceChildren(media);

      // Dropbox prend en charge dl=1 pour forcer le téléchargement du fichier partagé.
      const downloadUrl = new URL(video.playback_url);
      downloadUrl.searchParams.delete("raw");
      downloadUrl.searchParams.set("dl", "1");
      downloadButton.href = downloadUrl.toString();
      downloadButton.hidden = false;
    } else if (provider === "deepstorage" && video.playback_url) {
      const media = document.createElement("video");
      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
      if (video.thumbnail_url) media.poster = video.thumbnail_url;
      media.style.width = "100%";
      media.style.maxWidth = "100%";
      media.style.height = "auto";
      media.style.display = "block";
      media.style.background = "#000";
      media.src = video.playback_url;
      media.addEventListener("playing", registerViewOnce);
      media.addEventListener("error", () => {
        console.error("Erreur de lecture DeepStorage :", media.error);
      });
      wrap.replaceChildren(media);
      downloadButton.href = video.download_url || video.playback_url;
      downloadButton.hidden = false;
    } else {
      throw new Error("Le lecteur de cette vidéo n'est pas configuré correctement.");
    }

  } catch (error) {
    document.getElementById("video-title").textContent =
      error.message;

    document.getElementById("error-message").hidden = false;
    wrap.hidden = true;
  }
}

loadVideo();

// Keep the browser's native link behavior: PostHog records the click,
// while Chrome opens the download in a separate tab without a scripted popup.
downloadButton.target = "_blank";
downloadButton.rel = "noopener noreferrer";

downloadButton.addEventListener("click", () => {
  if (downloadButton.hidden || !id) return;

  // PostHog's sendBeacon transport is designed for events sent as navigation begins.
  captureAnalytics("video_download_requested", { video_id: id });

  // Preserve the existing Zeno download counter without delaying the browser download.
  fetch(`${SUPABASE_URL}/functions/v1/video-counter`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ videoId: id, event: "download" }),
    keepalive: true
  }).then((response) => {
    if (!response.ok) {
      console.error("Comptage du téléchargement impossible :", response.status);
    }
  }).catch((error) => {
    console.error("Comptage du téléchargement impossible :", error);
  });
});

document.getElementById("copy-watch-link").onclick =
  async () => {
    try {
      await navigator.clipboard.writeText(location.href);

      document.getElementById("copy-watch-link").textContent =
        "Lien copié !";

    } catch {
      prompt("Copie ce lien :", location.href);
    }
  };
