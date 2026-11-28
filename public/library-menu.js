(() => {
  const toggle = document.getElementById("library-menu-toggle");
  const submenu = document.getElementById("library-menu-submenu");
  const list = document.getElementById("library-menu-categories");
  const search = document.getElementById("library-menu-search");
  const homeLink = document.querySelector(".site-menu-home");
  if (!toggle || !submenu || !list || !search || !homeLink) return;

  function renderCategories(categories) {
    list.replaceChildren();
    if (!categories.length) {
      const empty = document.createElement("p");
      empty.className = "site-menu-empty";
      empty.textContent = "Aucune catégorie disponible pour le moment.";
      list.append(empty);
      search.disabled = true;
      return;
    }
    search.disabled = false;
    for (const category of categories) {
      const link = document.createElement("a");
      link.className = "site-menu-category";
      link.textContent = category.name;
      const destination = new URL(homeLink.href, location.href);
      destination.searchParams.set("category", category.id);
      destination.hash = "videos";
      link.href = destination.toString();
      link.dataset.categoryName = category.name.toLocaleLowerCase("fr");
      list.append(link);
    }
    applySearch();
  }

  function applySearch() {
    const query = search.value.trim().toLocaleLowerCase("fr");
    let visible = 0;
    for (const link of list.querySelectorAll(".site-menu-category")) {
      const match = link.dataset.categoryName.includes(query);
      link.hidden = !match;
      if (match) visible += 1;
    }
    let noMatch = list.querySelector(".site-menu-no-match");
    if (query && visible === 0) {
      if (!noMatch) {
        noMatch = document.createElement("p");
        noMatch.className = "site-menu-empty site-menu-no-match";
        noMatch.textContent = "Aucune catégorie ne correspond à cette recherche.";
        list.append(noMatch);
      }
    } else if (noMatch) noMatch.remove();
  }

  toggle.addEventListener("click", () => {
    const opening = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(opening));
    submenu.hidden = !opening;
    if (opening) search.focus();
  });
  search.addEventListener("input", applySearch);

  window.ZenoLibraryMenu = { setCategories: renderCategories };

  // Sur Contact, la galerie n'est pas chargée : récupérer les catégories publiques
  // avec la même règle de visibilité que la bibliothèque principale.
  if (!document.getElementById("video-grid")) {
    const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
    const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/videos?select=id,category_id,announcement_id&is_published=eq.true`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/video_announcements?select=id&is_visible=eq.true`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/video_categories?select=id,name,sort_order,is_published,is_hidden&order=sort_order.asc,name.asc`, { headers })
    ]).then(async ([videoResponse, announcementResponse, categoryResponse]) => {
      if (!videoResponse.ok || !announcementResponse.ok || !categoryResponse.ok) throw new Error("Chargement des catégories impossible.");
      const [videos, announcements, categories] = await Promise.all([
        videoResponse.json(), announcementResponse.json(), categoryResponse.json()
      ]);
      const announcementIds = new Set(announcements.map(item => item.id));
      const categoryVideos = videos.filter(video => !video.announcement_id || !announcementIds.has(video.announcement_id));
      const publicCategories = categories.filter(category => category.is_published || categoryVideos.some(video => video.category_id === category.id));
      renderCategories(publicCategories);
    }).catch(error => {
      console.error("Menu des catégories :", error);
      list.replaceChildren();
      const message = document.createElement("p");
      message.className = "site-menu-empty";
      message.textContent = "Les catégories sont momentanément indisponibles.";
      list.append(message);
    });
  }
})();
