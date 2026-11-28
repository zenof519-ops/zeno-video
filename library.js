const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
const CLOUD_NAME = "wnonuvx4";

const grid = document.getElementById("video-grid");
const count = document.getElementById("video-count");
const empty = document.getElementById("empty-message");
const categoryFilters = document.getElementById("category-filters");

async function registerDownload(videoId) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/video-counter`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, event: "download" })
    });
    if (!response.ok) console.error("Comptage du téléchargement impossible :", await response.text());
  } catch (error) { console.error("Comptage du téléchargement impossible :", error); }
}

async function loadVideos() {
  try {
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const [videoResponse, announcementResponse, categoryResponse] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/videos?select=id,title,description,playback_url,download_url,thumbnail_url,cloudinary_public_id,provider,announcement_id,category_id&is_published=eq.true&order=sort_order.asc,created_at.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/video_announcements?select=id,title,description,cover_url,scheduled_for,media_type&is_visible=eq.true&order=created_at.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/video_categories?select=id,name,sort_order,cover_url,is_published,is_hidden&order=sort_order.asc,name.asc`, { headers })
    ]);
    if (!videoResponse.ok) throw new Error("Supabase (" + videoResponse.status + ") : " + await videoResponse.text());
    if (!announcementResponse.ok) throw new Error("Chargement des annonces impossible (" + announcementResponse.status + ").");
    if (!categoryResponse.ok) throw new Error("Chargement des catégories impossible (" + categoryResponse.status + ").");
    const videos = await videoResponse.json();
    const announcements = await announcementResponse.json();
    const categories = await categoryResponse.json();
    const announcementIds = new Set(announcements.map(item => item.id));
    const linkedVideos = videos.filter(video => video.announcement_id && announcementIds.has(video.announcement_id));
    const regularVideos = videos.filter(video => !video.announcement_id || !announcementIds.has(video.announcement_id));
    const categoryVideos = regularVideos;
    const publicCategories = categories.filter(category => category.is_published || categoryVideos.some(video => video.category_id === category.id));
    window.ZenoLibraryMenu?.setCategories(publicCategories);
    grid.replaceChildren();

    function makeDownload(video) {
      const download = document.createElement("a");
      download.className = "btn alt";
      download.textContent = "Télécharger";
      const provider = String(video.provider || "cloudinary").toLowerCase();
      if (provider === "cloudinary" && video.cloudinary_public_id) {
        const publicId = video.cloudinary_public_id.split("/").map(encodeURIComponent).join("/");
        download.href = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/fl_attachment/${publicId}`;
      } else if (provider === "onedrive" && video.download_url) {
        const u = new URL(video.download_url); u.searchParams.set("download", "1"); download.href = u.toString();
      } else if (provider === "deepstorage" && (video.download_url || video.playback_url)) {
        download.href = video.download_url || video.playback_url;
      } else if (provider === "dropbox" && video.playback_url) {
        const u = new URL(video.playback_url); u.searchParams.delete("raw"); u.searchParams.set("dl", "1"); download.href = u.toString();
      } else if (provider === "mux" && video.download_url) {
        download.href = new URL(video.download_url).toString();
      } else if (provider === "bunny" && video.download_url) {
        // Bunny MP4 Fallback : ouvrir le lecteur MP4 natif du navigateur dans un nouvel onglet.
        download.href = new URL(video.download_url).toString();
      } else if (provider === "r2" && video.playback_url) {
        const downloadUrl = new URL(video.download_url || video.playback_url);
        downloadUrl.searchParams.set("download", "1");
        download.href = downloadUrl.toString();
      }
      if (download.href) {
        if (provider === "r2") {
          // Let the Worker return Content-Disposition: attachment in this tab.
          download.addEventListener("click", () => { void registerDownload(video.id); });
        } else {
          download.addEventListener("click", async event => {
            event.preventDefault();
            window.open(download.href, "_blank", "noopener,noreferrer");
            await registerDownload(video.id);
          });
        }
        return download;
      }
      return null;
    }

    function makeCard(title, description, imageUrl, url, label, video = null) {
      const card = document.createElement("article"); card.className = "card";
      const thumb = document.createElement("a"); thumb.className = "thumb"; thumb.href = url; thumb.textContent = label === "À VENIR" ? "◷" : "▶";
      if (imageUrl) { thumb.style.backgroundImage = `url("${imageUrl}")`; thumb.style.backgroundSize = "cover"; thumb.style.backgroundPosition = "center"; }
      const badge = document.createElement("p"); badge.className = "eyebrow"; badge.textContent = label;
      const h = document.createElement("h3"); h.textContent = title;
      const p = document.createElement("p"); p.textContent = description || "";
      const action = document.createElement("a"); action.className = "btn"; action.href = url; action.textContent = label === "À VENIR" ? "Voir l'annonce" : "Regarder";
      const copy = document.createElement("button"); copy.className = "btn alt"; copy.textContent = "Copier le lien";
      copy.onclick = async () => {
        const link = new URL(url, location.href).href;
        try { await navigator.clipboard.writeText(link); copy.textContent = "Lien copié !"; }
        catch { prompt("Copie ce lien :", link); }
      };
      card.append(thumb, badge, h, p, action);
      if (video) { const download = makeDownload(video); if (download) card.append(download); }
      card.append(copy); grid.append(card);
    }

    function renderHome() {
      categoryFilters.replaceChildren();
      categoryFilters.hidden = false;
      for (const category of publicCategories) {
        const total = categoryVideos.filter(video => video.category_id === category.id).length;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "category-folder";
        const folder = document.createElement("span");
        folder.className = "category-folder-art";
        if (category.cover_url) {
          try {
            const cover = new URL(category.cover_url);
            if (cover.protocol === "https:") folder.style.setProperty("--folder-cover", "url(" + JSON.stringify(cover.href) + ")");
          } catch {}
        }
        if (!category.cover_url) {
          const zenoHead = document.createElement("span");
          zenoHead.className = "category-folder-zeno-head";
          zenoHead.setAttribute("aria-hidden", "true");
          folder.append(zenoHead);
        }
        const name = document.createElement("strong");
        name.textContent = category.name;
        const amount = document.createElement("span");
        amount.className = "category-folder-count";
        amount.textContent = total + (total > 1 ? " vidéos" : " vidéo");
        button.append(folder, name, amount);
        button.addEventListener("click", () => renderCategory(category));
        categoryFilters.append(button);
      }

      grid.replaceChildren();
      const uncategorizedVideos = categoryVideos.filter(video => !video.category_id);
      const total = announcements.length + uncategorizedVideos.length;
      count.textContent = total + (total > 1 ? " éléments" : " élément");
      empty.hidden = total !== 0;
      empty.textContent = "Aucune annonce ni vidéo sans catégorie pour le moment.";
      const byAnnouncement = new Map(linkedVideos.map(video => [video.announcement_id, video]));
      for (const announcement of announcements) {
        const linked = byAnnouncement.get(announcement.id);
        const url = announcement.media_type === "video"
          ? "announcement.html?id=" + encodeURIComponent(announcement.id)
          : linked
            ? "watch.html?v=10&a=" + encodeURIComponent(announcement.id)
            : "announcement.html?id=" + encodeURIComponent(announcement.id);
        const label = announcement.media_type === "video" ? "APERÇU VIDÉO" : (linked ? "DISPONIBLE" : "À VENIR");
        makeCard(announcement.title, announcement.description, announcement.cover_url, url, label, linked || null);
      }
      for (const video of uncategorizedVideos) {
        const url = video.announcement_id ? "watch.html?v=10&a=" + encodeURIComponent(video.announcement_id) : "watch.html?v=10&id=" + encodeURIComponent(video.id);
        makeCard(video.title, video.description, video.thumbnail_url, url, "DISPONIBLE", video);
      }
    }

    function renderCategory(category) {
      categoryFilters.replaceChildren();
      categoryFilters.hidden = false;
      const navigation = document.createElement("div");
      navigation.className = "category-navigation public-category-navigation";
      const back = document.createElement("button");
      back.type = "button";
      back.className = "btn alt category-back";
      back.textContent = "← Retour à la bibliothèque";
      back.addEventListener("click", renderHome);
      const heading = document.createElement("h2");
      heading.textContent = category.name;
      navigation.append(back, heading);
      categoryFilters.append(navigation);

      grid.replaceChildren();
      const visibleVideos = categoryVideos.filter(video => video.category_id === category.id);
      count.textContent = visibleVideos.length + (visibleVideos.length > 1 ? " vidéos" : " vidéo");
      empty.hidden = visibleVideos.length !== 0;
      empty.textContent = "Aucune vidéo dans cette catégorie pour le moment.";
      for (const video of visibleVideos) {
        const url = "watch.html?v=10&id=" + encodeURIComponent(video.id);
        makeCard(video.title, video.description, video.thumbnail_url, url, "DISPONIBLE", video);
      }
    }

    const requestedCategoryId = new URLSearchParams(location.search).get("category");
    const requestedCategory = publicCategories.find(category => category.id === requestedCategoryId);
    if (requestedCategory) renderCategory(requestedCategory);
    else renderHome();
  } catch (error) {
    count.textContent = "Erreur de chargement";
    empty.hidden = false;
    empty.textContent = error.message;
  }
}
loadVideos();
