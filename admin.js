
const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";

const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const CLOUD_NAME = "wnonuvx4";
const CLOUDINARY_UPLOAD_PRESET = "zeno_video_upload";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginSection = document.getElementById("login-section");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const videoForm = document.getElementById("video-form");
const videoMessage = document.getElementById("video-message");
const videoList = document.getElementById("admin-video-list");
const adminCount = document.getElementById("admin-count");
const videoFileInput = document.getElementById("video-file");
const cloudinaryIdInput = document.getElementById("cloudinary-id");
const thumbnailInput = document.getElementById("thumbnail-url");
const saveButton = document.getElementById("save-button");
const cancelEditButton = document.getElementById("cancel-edit");

let editingId = null;

function showMessage(element, message) {
  element.textContent = message;
}

function resetVideoForm() {
  videoForm.reset();
  editingId = null;
  document.getElementById("form-title").textContent = "Ajouter une vidéo";
  saveButton.textContent = "Envoyer et ajouter la vidéo";
  cancelEditButton.classList.add("admin-hidden");
  videoFileInput.disabled = false;
  cloudinaryIdInput.readOnly = false;
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

  const { data, error } = await db.auth.signInWithPassword({ email, password });

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

const views = document.createElement("p");
views.textContent = "Lectures démarrées : " +
  Number(video.views || 0).toLocaleString("fr-FR");

    const status = document.createElement("p");
    status.textContent = video.is_published ? "Statut : Publiée" : "Statut : Non publiée";

    const actions = document.createElement("div");
    actions.className = "admin-actions";

    const editButton = document.createElement("button");
    editButton.textContent = "Modifier";
    editButton.addEventListener("click", () => editVideo(video));

    const publishButton = document.createElement("button");
    publishButton.className = "alt";
    publishButton.textContent = video.is_published ? "Dépublier" : "Publier";
    publishButton.addEventListener("click", () => togglePublication(video));

    const deleteButton = document.createElement("button");
    deleteButton.className = "alt";
    deleteButton.textContent = "Supprimer";
    deleteButton.addEventListener("click", () => deleteVideo(video));

    actions.append(editButton, publishButton, deleteButton);
    card.append(title, description, views, status, actions);
    videoList.append(card);
  }
}

function editVideo(video) {
  editingId = video.id;

  document.getElementById("video-name").value = video.title;
  document.getElementById("video-description").value = video.description || "";
  cloudinaryIdInput.value = video.cloudinary_public_id;
  thumbnailInput.value = video.thumbnail_url || "";

  document.getElementById("form-title").textContent = "Modifier la vidéo";
  saveButton.textContent = "Enregistrer les modifications";
  cancelEditButton.classList.remove("admin-hidden");

  videoFileInput.value = "";
  videoFileInput.disabled = true;
  videoForm.scrollIntoView({ behavior: "smooth" });
}

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = document.getElementById("video-name").value.trim();
  const description = document.getElementById("video-description").value.trim();
  const selectedFile = videoFileInput.files[0];
  let publicId = cloudinaryIdInput.value.trim();
  let thumbnail = thumbnailInput.value.trim();

  if (!title) {
    showMessage(videoMessage, "Indique un titre pour la vidéo.");
    return;
  }

  if (!editingId && !selectedFile && !publicId) {
    showMessage(videoMessage, "Choisis un fichier vidéo ou saisis un identifiant public Cloudinary.");
    return;
  }

  if (selectedFile) {
    const allowedTypes = ["video/mp4", "video/quicktime", "video/webm"];
    if (!allowedTypes.includes(selectedFile.type)) {
      showMessage(videoMessage, "Format non accepté. Choisis un fichier MP4, MOV ou WebM.");
      return;
    }
  }

  saveButton.disabled = true;
  videoFileInput.disabled = true;
  showMessage(videoMessage, selectedFile ? "Envoi de la vidéo vers Cloudinary en cours..." : "Enregistrement en cours...");

  try {
    if (selectedFile) {
      const uploadData = new FormData();
      uploadData.append("file", selectedFile);
      uploadData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
        { method: "POST", body: uploadData }
      );

      const uploaded = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(uploaded.error?.message || "Cloudinary n'a pas accepté le fichier.");
      }

      publicId = uploaded.public_id;
      if (!thumbnail) {
        thumbnail = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0/${publicId}.jpg`;
      }
      cloudinaryIdInput.value = publicId;
      thumbnailInput.value = thumbnail;
      showMessage(videoMessage, "Vidéo envoyée ! Enregistrement dans la bibliothèque...");
    }

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
      result = await db.from("videos").update(videoData).eq("id", editingId);
    } else {
      result = await db.from("videos").insert({ ...videoData, is_published: true });
    }

    if (result.error) {
      throw new Error("Vidéo envoyée sur Cloudinary, mais Supabase n'a pas pu l'enregistrer : " + result.error.message);
    }

    showMessage(videoMessage, editingId ? "Vidéo modifiée avec succès !" : "Vidéo ajoutée avec succès !");
    resetVideoForm();
    await loadAdminVideos();
  } catch (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
  } finally {
    saveButton.disabled = false;
    videoFileInput.disabled = Boolean(editingId);
  }
});

cancelEditButton.addEventListener("click", () => {
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
  if (!confirm("Supprimer définitivement cette vidéo de la bibliothèque ?")) return;

  const { error } = await db.from("videos").delete().eq("id", video.id);

  if (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
    return;
  }

  showMessage(videoMessage, "Vidéo supprimée de la bibliothèque.");
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
