const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
const CLOUD_NAME = "wnonuvx4";
const id = new URLSearchParams(location.search).get("id");
const media = document.getElementById("announcement-media");

function showError(message) {
  document.getElementById("title").textContent = "Annonce indisponible";
  document.getElementById("error").textContent = message;
  document.getElementById("error").hidden = false;
}
function iframePlayer(url, title) {
  const frame = document.createElement("iframe");
  frame.src = url;
  frame.title = title;
  frame.loading = "eager";
  frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.style.width = "100%";
  frame.style.aspectRatio = "16 / 9";
  frame.style.border = "0";
  return frame;
}
function videoPlayer(url, title, cover) {
  const video = document.createElement("video");
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  if (cover) video.poster = cover;
  video.style.width = "100%";
  video.style.height = "auto";
  video.style.display = "block";
  video.style.background = "#000";
  video.addEventListener("error", () => showError("Le lecteur ne peut pas lire cette vidéo. Vérifie son URL ou son accès chez l’hébergeur."));
  return video;
}
function normalizeDropbox(value) {
  const url = new URL(value);
  url.searchParams.delete("dl");
  url.searchParams.set("raw","1");
  return url.toString();
}
function getViooId(value) {
  const match = value.match(/(?:\/embed\/|\/v\/)([A-Za-z0-9_-]+)/i);
  return match ? match[1] : value;
}
function getMuxId(value) {
  const match = value.match(/(?:stream\.mux\.com\/|player\.mux\.com\/)([A-Za-z0-9_-]+)/i);
  return match ? match[1] : value;
}
async function loadAnnouncement() {
  if (!id) { showError("Identifiant d’annonce manquant."); return; }
  try {
    const url = SUPABASE_URL + "/rest/v1/video_announcements?select=id,title,description,cover_url,scheduled_for,media_type,video_provider,video_url,video_download_url&id=eq." + encodeURIComponent(id) + "&is_visible=eq.true";
    const response = await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}});
    if (!response.ok) throw new Error("Impossible de récupérer cette annonce.");
    const rows = await response.json();
    const item = rows[0];
    if (!item) throw new Error("Cette annonce n’existe pas ou a été masquée.");
    document.title = item.title + " — Zeno Video";
    document.getElementById("title").textContent = item.title;
    document.getElementById("description").textContent = item.description || "";
    document.getElementById("schedule").textContent = item.scheduled_for
      ? "Sortie prévue le " + new Date(item.scheduled_for).toLocaleString("fr-FR") + "."
      : (item.media_type === "video" ? "Aperçu vidéo de cette annonce." : "");
    if (item.media_type !== "video") {
      const image = document.createElement("img");
      image.src = item.cover_url;
      image.alt = "Image de l’annonce " + item.title;
      image.style.display = "block";
      image.style.width = "100%";
      image.style.maxWidth = "900px";
      image.style.maxHeight = "75vh";
      image.style.objectFit = "contain";
      image.style.margin = "0 auto";
      media.replaceChildren(image);
      return;
    }

    const provider = String(item.video_provider || "").toLowerCase();
    const source = String(item.video_url || "").trim();
    if (!source) throw new Error("La source vidéo de cette annonce est manquante.");
    const cover = item.cover_url || "";
    if (provider === "mux" && (source.startsWith("mux-pending:") || source === "mux-error")) {
      const preview = document.createElement("div");
      preview.style.position = "relative";
      preview.style.aspectRatio = "16 / 9";
      preview.style.background = "#000";
      preview.style.borderRadius = "12px";
      preview.style.overflow = "hidden";
      if (cover) {
        const image = document.createElement("img");
        image.src = cover;
        image.alt = "Couverture de " + item.title;
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "contain";
        preview.append(image);
      }
      const status = document.createElement("p");
      status.textContent = source === "mux-error"
        ? "L’envoi ou le traitement Mux a échoué. L’administrateur doit vérifier cette annonce."
        : "Vidéo en cours de traitement chez Mux. Le lecteur apparaîtra automatiquement dès qu’elle sera prête.";
      status.className = "cover-help";
      media.replaceChildren(preview, status);
      return;
    }
    const launch = document.createElement("button");
    launch.type = "button";
    launch.className = "btn";
    launch.textContent = "▶ Lancer la vidéo";
    const preview = document.createElement("div");
    preview.style.position = "relative";
    preview.style.aspectRatio = "16 / 9";
    preview.style.background = "#000";
    preview.style.borderRadius = "12px";
    preview.style.overflow = "hidden";
    if (cover) {
      const image = document.createElement("img");
      image.src = cover;
      image.alt = "Couverture de " + item.title;
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.objectFit = "contain";
      preview.append(image);
    }
    launch.style.position = "absolute";
    launch.style.left = "50%";
    launch.style.top = "50%";
    launch.style.transform = "translate(-50%,-50%)";
    preview.append(launch);
    media.replaceChildren(preview);

    launch.addEventListener("click", () => {
      let player;
      if (provider === "mux") {
        const muxId = getMuxId(source);
        if (!/^[A-Za-z0-9_-]+$/.test(muxId)) throw new Error("Playback ID Mux invalide.");
        player = iframePlayer("https://player.mux.com/" + encodeURIComponent(muxId), item.title);
      } else if (provider === "bunny") {
        if (!/^https:\/\/player\.mediadelivery\.net\/embed\/811150\/[0-9a-f-]{36}$/i.test(source)) throw new Error("Lien du lecteur Bunny invalide.");
        player = iframePlayer(source, item.title);
      } else if (provider === "vioo") {
        const viooId = getViooId(source);
        if (/^https:\/\//i.test(source) && source.includes("/embed/")) player = iframePlayer(source,item.title);
        else player = iframePlayer("https://vioo.cc/embed/" + encodeURIComponent(viooId),item.title);
      } else if (provider === "onedrive") {
        if (!/^https:\/\//i.test(source)) throw new Error("Le lien OneDrive doit être une URL HTTPS Embed.");
        player = iframePlayer(source,item.title);
      } else if (provider === "dropbox") {
        player = videoPlayer(normalizeDropbox(source),item.title,cover);
      } else if (provider === "deepstorage") {
        if (!/^https:\/\//i.test(source)) throw new Error("DeepStorage nécessite une URL HTTPS de lecture.");
        player = videoPlayer(source,item.title,cover);
      } else if (provider === "r2") {
        if (!/^https:\/\//i.test(source) || !source.startsWith("https://zeno-video-media.zenof519.workers.dev/media/")) throw new Error("Lien de lecture Cloudflare R2 invalide.");
        player = videoPlayer(source,item.title,cover);
      } else if (provider === "cloudinary") {
        let playback = source;
        if (!/^https:\/\//i.test(playback)) {
          const publicId = playback.split("/").map(encodeURIComponent).join("/");
          playback = "https://res.cloudinary.com/" + CLOUD_NAME + "/video/upload/" + publicId + ".mp4";
        }
        player = videoPlayer(playback,item.title,cover);
      } else {
        throw new Error("Hébergeur vidéo non pris en charge.");
      }
      media.replaceChildren(player);
      if (item.video_download_url) {
        const download = document.createElement("a");
        download.href = item.video_download_url;
        download.className = "btn alt";
        download.textContent = "Télécharger la vidéo";
        download.target = "_blank";
        download.rel = "noopener noreferrer";
        download.style.display = "inline-block";
        download.style.marginTop = "12px";
        media.append(download);
      }
    });
  } catch (error) {
    showError(error.message || "Une erreur est survenue.");
  }
}
loadAnnouncement();
