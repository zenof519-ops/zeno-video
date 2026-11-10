const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
const CLOUD_NAME = "wnonuvx4";

const id = new URLSearchParams(location.search).get("id");
const wrap = document.getElementById("player-wrap");
const downloadButton = document.getElementById("download-video");

let viewRegistered = false;

async function registerViewOnce() {
  if (viewRegistered) return;

  viewRegistered = true;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/register_video_view`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_video_id: id })
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

  wrap.replaceChildren(launchButton, note);
}

async function loadVideo() {
  try {
    if (!id) {
      throw new Error("Vidéo introuvable");
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/videos?select=id,title,description,playback_url,cloudinary_public_id,format,provider&id=eq.${encodeURIComponent(id)}&is_published=eq.true`,
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

    document.title = video.title + " — Zeno Video";
    document.getElementById("video-title").textContent =
      video.title;

    document.getElementById("video-description").textContent =
      video.description || "";

    const provider = video.provider || (video.cloudinary_public_id ? "cloudinary" : "vioo");

    if (provider === "cloudinary" && video.cloudinary_public_id) {
      const publicId = video.cloudinary_public_id
        .split("/")
        .map(encodeURIComponent)
        .join("/");

      const media = document.createElement("video");

      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
      media.style.width = "100%";
      media.style.maxWidth = "100%";
      media.style.height = "auto";
      media.style.display = "block";
      media.style.background = "#000";

      const format = (video.format || "mp4").toLowerCase();

      media.src =
        `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${publicId}.${format}`;

      media.addEventListener("playing", registerViewOnce);

      media.addEventListener("error", () => {
        console.error(
          "Erreur de lecture vidéo :",
          media.error
        );
      });

      wrap.replaceChildren(media);

      downloadButton.href =
        `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/fl_attachment/${publicId}`;

      downloadButton.hidden = false;

    } else if (provider === "vioo" && video.playback_url) {
      showViooPlayer(video);
      // Aucun lien de téléchargement direct Vioo n'étant disponible,
      // retirer complètement le bouton de la page de lecture.
      downloadButton.remove();
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

downloadButton.addEventListener("click", async (event) => {
  if (downloadButton.hidden || !id) return;
  event.preventDefault();
  const destination = downloadButton.href;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/register_video_download`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_video_id: id })
      }
    );
    if (!response.ok) {
      console.error("Comptage du téléchargement impossible :", await response.text());
    }
  } catch (error) {
    console.error("Comptage du téléchargement impossible :", error);
  }
  window.location.assign(destination);
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
