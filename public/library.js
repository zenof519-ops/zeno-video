const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
const CLOUD_NAME = "wnonuvx4";

const grid = document.getElementById("video-grid");
const count = document.getElementById("video-count");
const empty = document.getElementById("empty-message");

async function registerDownload(videoId) {
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
        body: JSON.stringify({ p_video_id: videoId })
      }
    );
    if (!response.ok) {
      console.error("Comptage du téléchargement impossible :", await response.text());
    }
  } catch (error) {
    console.error("Comptage du téléchargement impossible :", error);
  }
}

async function loadVideos() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/videos?select=id,title,description,playback_url,download_url,thumbnail_url,cloudinary_public_id,provider&is_published=eq.true&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!response.ok) {
      const details = await response.text();
      throw new Error("Supabase (" + response.status + ") : " + details);
    }

    const videos = await response.json();

    count.textContent = videos.length + " vidéo(s)";
    empty.hidden = videos.length !== 0;
    grid.innerHTML = "";

    for (const v of videos) {
      const url = "watch.html?v=9&id=" + encodeURIComponent(v.id);
      const provider = String(v.provider || "cloudinary").toLowerCase();
      const card = document.createElement("article");
      card.className = "card";

      const a = document.createElement("a");
      a.className = "thumb";
      a.href = url;
      a.textContent = "▶";

      if (v.thumbnail_url) {
        a.style.backgroundImage = `url("${v.thumbnail_url}")`;
        a.style.backgroundSize = "cover";
        a.style.backgroundPosition = "center";
      }

      const h = document.createElement("h3");
      h.textContent = v.title;

      const p = document.createElement("p");
      p.textContent = v.description || "";

      const watch = document.createElement("a");
      watch.className = "btn";
      watch.href = url;
      watch.textContent = "Regarder";

      const download = document.createElement("a");
      download.className = "btn alt";
      download.textContent = "Télécharger";
      download.hidden = true;

      if (provider === "cloudinary" && v.cloudinary_public_id) {
        const publicId = v.cloudinary_public_id
          .split("/")
          .map(encodeURIComponent)
          .join("/");

        download.href =
          `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/fl_attachment/${publicId}`;
        download.hidden = false;
      } else if (provider === "onedrive" && v.download_url) {
        try {
          const downloadUrl = new URL(v.download_url);
          downloadUrl.searchParams.set("download", "1");
          download.href = downloadUrl.toString();
          download.hidden = false;
        } catch (error) {
          console.error("Lien de téléchargement OneDrive invalide :", error);
        }
      } else if (provider === "deepstorage" && (v.download_url || v.playback_url)) {
        download.href = v.download_url || v.playback_url;
        download.hidden = false;
      } else if (provider === "dropbox" && v.playback_url) {
        try {
          const downloadUrl = new URL(v.playback_url);
          downloadUrl.searchParams.delete("raw");
          downloadUrl.searchParams.set("dl", "1");
          download.href = downloadUrl.toString();
          download.hidden = false;
        } catch (error) {
          console.error("Lien Dropbox invalide :", error);
        }
      }

      const canDownload = !download.hidden;
      if (canDownload) {
        download.removeAttribute("hidden");
        download.style.display = "inline-flex";
        download.addEventListener("click", async (event) => {
          event.preventDefault();
          const destination = download.href;
          window.open(destination, "_blank", "noopener,noreferrer");
          await registerDownload(v.id);
        });
      }

      const copy = document.createElement("button");
      copy.className = "btn alt";
      copy.textContent = "Copier le lien";

      copy.onclick = async () => {
        const link = new URL(url, location.href).href;
        try {
          await navigator.clipboard.writeText(link);
          copy.textContent = "Lien copié !";
        } catch {
          prompt("Copie ce lien :", link);
        }
      };

      card.append(a, h, p, watch);
      if (canDownload) {
        card.append(download);
      }
      card.append(copy);
      grid.append(card);
    }
  } catch (error) {
    count.textContent = "Erreur de chargement";
    empty.hidden = false;
    empty.textContent = error.message;
  }
}

loadVideos();
