
const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";

const id = new URLSearchParams(location.search).get("id");
const wrap = document.getElementById("player-wrap");

async function loadVideo() {
  try {
    if (!id) throw new Error("Vidéo introuvable");

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/videos?select=id,title,description,playback_url&id=eq.${encodeURIComponent(id)}&is_published=eq.true`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error("Impossible de récupérer cette vidéo.");
    }

    const videos = await response.json();
    const v = videos[0];

    if (!v) throw new Error("Vidéo introuvable");

    document.title = v.title + " — Zeno Video";
    document.getElementById("video-title").textContent = v.title;
    document.getElementById("video-description").textContent = v.description || "";

    const f = document.createElement("iframe");
    f.src = v.playback_url;
    f.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    f.allowFullscreen = true;
    f.title = v.title;

    wrap.innerHTML = "";
    wrap.append(f);

  } catch (error) {
    document.getElementById("video-title").textContent = error.message;
    document.getElementById("error-message").hidden = false;
    wrap.hidden = true;
  }
}

loadVideo();

document.getElementById("copy-watch-link").onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    document.getElementById("copy-watch-link").textContent = "Lien copié !";
  } catch {
    prompt("Copie ce lien :", location.href);
  }
};
