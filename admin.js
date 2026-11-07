
const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";

const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const CLOUD_NAME = "wnonuvx4";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginSection = document.getElementById("login-section");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const videoForm = document.getElementById("video-form");
const videoMessage = document.getElementById("video-message");
const videoList = document.getElementById("admin-video-list");
const adminCount = document.getElementById("admin-count");

let editingId = null;

function showMessage(element, message) {
  element.textContent = message;
}

function resetVideoForm() {
  videoForm.reset();
  editingId = null;
  document.getElementById("form-title").textContent = "Ajouter une vidéo";
  document.getElementById("save-button").textContent = "Ajouter la vidéo";
  document.getElementById("cancel-edit").classList.add("admin-hidden");
}

async function openDashboard(user) {
  if (!user || user.id !== ADMIN_ID) {
    await db.auth.signOut();
    loginSection.classList.remove("admin-hidden");
    dashboard.classList.add("admin-hidden");
    showMessage(loginMessage, "Accès réservé à l'administrateur.");
    return;
  }

  loginSection.classList.add("admin-hidden");
  dashboard.classList.remove("admin-hidden");

  await loadAdminVideos();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  showMessage(loginMessage, "Connexion en cours...");

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage(loginMessage, "Erreur : " + error.message);
    return;
  }

  await openDashboard(data.user);
});

document.getElementById("logout-button").addEventListener("click", async () => {
  await db.auth.signOut();
  dashboard.classList.add("admin-hidden");
  loginSection.classList.remove("admin-hidden");
  loginForm.reset();
  showMessage(loginMessage, "Déconnexion réussie.");
});

async function loadAdminVideos() {
  showMessage(videoMessage, "Chargement des vidéos...");
  videoList.innerHTML = "";

  const { data: videos, error } = await db
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
    return;
  }

  showMessage(videoMessage, "");
  adminCount.textContent = videos.length + " vidéo(s)";

  if (videos.length === 0) {
    videoList.textContent = "Aucune vidéo enregistrée.";
    return;
  }

  for (const video of videos) {
    const card = document.createElement("article");
    card.className = "admin-video";

    const title = document.createElement("h3");
    title.textContent = video.title;

    const description = document.createElement("p");
    description.textContent = video.description || "Sans description";

    const status = document.createElement("p");
    status.textContent = video.is_published
      ? "Statut : Publiée"
      : "Statut : Non publiée";

    const actions = document.createElement("div");
    actions.className = "admin-actions";

    const editButton = document.createElement("button");
    editButton.textContent = "Modifier";
    editButton.addEventListener("click", () => editVideo(video));

    const publishButton = document.createElement("button");
    publishButton.className = "alt";
    publishButton.textContent = video.is_published
      ? "Dépublier"
      : "Publier";

    publishButton.addEventListener("click", () => {
      togglePublication(video);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "alt";
    deleteButton.textContent = "Supprimer";
    deleteButton.addEventListener("click", () => {
      deleteVideo(video);
    });

    actions.append(editButton, publishButton, deleteButton);
    card.append(title, description, status, actions);
    videoList.append(card);
  }
}

function editVideo(video) {
  editingId = video.id;

  document.getElementById("video-name").value = video.title;
  document.getElementById("video-description").value =
    video.description || "";
  document.getElementById("cloudinary-id").value =
    video.cloudinary_public_id;
  document.getElementById("thumbnail-url").value =
    video.thumbnail_url || "";

  document.getElementById("form-title").textContent = "Modifier la vidéo";
  document.getElementById("save-button").textContent = "Enregistrer";
  document.getElementById("cancel-edit").classList.remove("admin-hidden");

  videoForm.scrollIntoView({ behavior: "smooth" });
}

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  showMessage(videoMessage, "Enregistrement en cours...");

  const title = document.getElementById("video-name").value.trim();
  const description = document.getElementById("video-description").value.trim();
  const publicId = document.getElementById("cloudinary-id").value.trim();
  const thumbnail = document.getElementById("thumbnail-url").value.trim();

  const playerUrl = new URL("https://player.cloudinary.com/embed/");
  playerUrl.searchParams.set("cloud_name", CLOUD_NAME);
  playerUrl.searchParams.set("public_id", publicId);

  const videoData = {
    title,
    description,
    cloudinary_public_id: publicId,
    playback_url: playerUrl.toString(),
    thumbnail_url: thumbnail || null
  };

  let result;

  if (editingId) {
    result = await db
      .from("videos")
      .update(videoData)
      .eq("id", editingId);
  } else {
    result = await db
      .from("videos")
      .insert({
        ...videoData,
        is_published: true
      });
  }

  if (result.error) {
    showMessage(videoMessage, "Erreur : " + result.error.message);
    return;
  }

  showMessage(
    videoMessage,
    editingId ? "Vidéo modifiée avec succès !" : "Vidéo ajoutée avec succès !"
  );

  resetVideoForm();
  await loadAdminVideos();
});

document.getElementById("cancel-edit").addEventListener("click", () => {
  resetVideoForm();
  showMessage(videoMessage, "");
});

async function togglePublication(video) {
  const { error } = await db
    .from("videos")
    .update({ is_published: !video.is_published })
    .eq("id", video.id);

  if (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
    return;
  }

  await loadAdminVideos();
}

async function deleteVideo(video) {
  if (!confirm("Supprimer définitivement cette vidéo ?")) return;

  const { error } = await db
    .from("videos")
    .delete()
    .eq("id", video.id);

  if (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
    return;
  }

  showMessage(videoMessage, "Vidéo supprimée.");
  await loadAdminVideos();
}

async function initializeAdmin() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    showMessage(loginMessage, error.message);
    return;
  }

  if (data.session) {
    await openDashboard(data.session.user);
  }
}

initializeAdmin();
      
