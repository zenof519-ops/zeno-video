
const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";

const grid = document.getElementById("video-grid");
const count = document.getElementById("video-count");
const empty = document.getElementById("empty-message");

async function loadVideos() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/videos?select=id,title,description,playback_url,thumbnail_url&is_published=eq.true&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error("Impossible de charger les vidéos.");
    }

    const videos = await response.json();

    count.textContent = videos.length + " vidéo(s)";
    empty.hidden = videos.length !== 0;

    grid.innerHTML = "";

    for (const v of videos) {
      const url = "watch.html?id=" + encodeURIComponent(v.id);
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

      card.append(a, h, p, watch, copy);
      grid.append(card);
    }
  } catch (error) {
    count.textContent = "Erreur de chargement";
    empty.hidden = false;
    empty.textContent = error.message;
  }
}

loadVideos();
