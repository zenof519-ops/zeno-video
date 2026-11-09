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
const coverFileInput = document.getElementById("cover-file");
const coverPreview = document.getElementById("cover-preview");
const coverPreviewImage = document.getElementById("cover-preview-image");
const coverPreviewCaption = document.getElementById("cover-preview-caption");
const removeCoverButton = document.getElementById("remove-cover");
const cloudinaryIdInput = document.getElementById("cloudinary-id");
const saveButton = document.getElementById("save-button");
const cancelEditButton = document.getElementById("cancel-edit");

let editingId = null;
let videoFormat = "mp4";
let currentThumbnailUrl = null;
let previewObjectUrl = null;

function showMessage(element, message) {
  element.textContent = message;
}

function clearCoverPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  coverPreviewImage.removeAttribute("src");
  coverPreview.classList.add("admin-hidden");
}

function displayCoverPreview(source, caption) {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  coverPreviewImage.src = source;
  coverPreviewCaption.textContent = caption;
  coverPreview.classList.remove("admin-hidden");
}

coverFileInput.addEventListener("change", () => {
  const file = coverFileInput.files[0];
  if (!file) {
    if (currentThumbnailUrl) {
      displayCoverPreview(currentThumbnailUrl, "Couverture actuellement enregistrée");
    } else {
      clearCoverPreview();
    }
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    coverFileInput.value = "";
    showMessage(videoMessage, "Format d'image non accepté. Choisis un fichier PNG, JPG ou WebP.");
    return;
  }

  previewObjectUrl = URL.createObjectURL(file);
  coverPreviewImage.src = previewObjectUrl;
  coverPreviewCaption.textContent = "Nouvelle couverture sélectionnée : " + file.name;
  coverPreview.classList.remove("admin-hidden");
  showMessage(videoMessage, "");
});

removeCoverButton.addEventListener("click", () => {
  coverFileInput.value = "";
  currentThumbnailUrl = null;
  clearCoverPreview();
});

function resetVideoForm() {
  videoForm.reset();
  editingId = null;
  videoFormat = "mp4";
  currentThumbnailUrl = null;
  clearCoverPreview();

  document.getElementById("form-title").textContent = "Ajouter une vidéo";
  saveButton.textContent = "Envoyer et ajouter la vidéo";
  cancelEditButton.classList.add("admin-hidden");
  videoFileInput.disabled = false;
  coverFileInput.disabled = false;
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
  await checkPermanentDeleteConfig();
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

  const totalViews = videos.reduce((sum, video) => sum + Number(video.views || 0), 0);
  const totalDownloads = videos.reduce((sum, video) => sum + Number(video.downloads || 0), 0);
  document.getElementById("stat-total").textContent = videos.length.toLocaleString("fr-FR");
  document.getElementById("stat-published").textContent = videos.filter(video => video.is_published).length.toLocaleString("fr-FR");
  document.getElementById("stat-views").textContent = totalViews.toLocaleString("fr-FR");
  document.getElementById("stat-downloads").textContent = totalDownloads.toLocaleString("fr-FR");

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
    views.textContent = "Lectures démarrées : " + Number(video.views || 0).toLocaleString("fr-FR");

    const downloads = document.createElement("p");
    downloads.textContent = "Téléchargements lancés : " + Number(video.downloads || 0).toLocaleString("fr-FR");

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
    deleteButton.textContent = "Supprimer de Supabase";
    deleteButton.addEventListener("click", () => deleteVideo(video));

    const permanentDeleteButton = document.createElement("button");
    permanentDeleteButton.className = "danger";
    permanentDeleteButton.textContent = "Supprimer définitivement";
    permanentDeleteButton.addEventListener("click", () => permanentlyDeleteVideo(video));

    actions.append(editButton, publishButton, deleteButton, permanentDeleteButton);
    card.append(title, description, views, downloads, status, actions);
    videoList.append(card);
  }
}

function editVideo(video) {
  editingId = video.id;
  videoFormat = video.format || "mp4";
  currentThumbnailUrl = video.thumbnail_url || null;

  document.getElementById("video-name").value = video.title;
  document.getElementById("video-description").value = video.description || "";
  cloudinaryIdInput.value = video.cloudinary_public_id;

  if (currentThumbnailUrl) {
    displayCoverPreview(currentThumbnailUrl, "Couverture actuellement enregistrée");
  } else {
    clearCoverPreview();
  }

  document.getElementById("form-title").textContent = "Modifier la vidéo";
  saveButton.textContent = "Enregistrer les modifications";
  cancelEditButton.classList.remove("admin-hidden");

  videoFileInput.value = "";
  videoFileInput.disabled = true;
  coverFileInput.value = "";
  coverFileInput.disabled = false;
  videoForm.scrollIntoView({ behavior: "smooth" });
}

async function convertJpegToPng(file) {
  if (file.type !== "image/jpeg" && !/\\.jpe?g$/i.test(file.name)) {
    return file;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Impossible de lire cette image JPG. Essaie de l'enregistrer en PNG ou WebP.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    throw new Error("La conversion de la couverture n'est pas disponible sur ce navigateur.");
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const pngBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("La conversion JPG vers PNG a échoué.")), "image/png");
  });

  const pngName = file.name.replace(/\\.jpe?g$/i, "") + ".png";
  return new File([pngBlob], pngName, { type: "image/png", lastModified: Date.now() });
}

async function uploadToCloudinary(file, resourceType, progressMessage) {
  const uploadFile = resourceType === "image" ? await convertJpegToPng(file) : file;
  const uploadData = new FormData();
  uploadData.append("file", uploadFile);
  uploadData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    { method: "POST", body: uploadData }
  );

  const uploaded = await response.json();
  if (!response.ok) {
    throw new Error(uploaded.error?.message || "Cloudinary n'a pas accepté le fichier.");
  }
  if (!uploaded.secure_url || !uploaded.public_id) {
    throw new Error("Cloudinary n'a pas renvoyé l'URL sécurisée attendue.");
  }
  return uploaded;
}

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = document.getElementById("video-name").value.trim();
  const description = document.getElementById("video-description").value.trim();
  const selectedFile = videoFileInput.files[0];
  const selectedCover = coverFileInput.files[0];
  let publicId = cloudinaryIdInput.value.trim();
  let thumbnail = currentThumbnailUrl;

  if (!title) {
    showMessage(videoMessage, "Indique un titre pour la vidéo.");
    return;
  }

  if (!editingId && !selectedFile && !publicId) {
    showMessage(videoMessage, "Choisis un fichier vidéo ou saisis un identifiant public Cloudinary.");
    return;
  }

  if (selectedFile && !["video/mp4", "video/quicktime", "video/webm"].includes(selectedFile.type)) {
    showMessage(videoMessage, "Format non accepté. Choisis un fichier MP4, MOV ou WebM.");
    return;
  }

  if (selectedCover && !["image/jpeg", "image/png", "image/webp"].includes(selectedCover.type)) {
    showMessage(videoMessage, "Format d'image non accepté. Choisis un fichier PNG, JPG ou WebP.");
    return;
  }

  saveButton.disabled = true;
  videoFileInput.disabled = true;
  coverFileInput.disabled = true;

  try {
    if (selectedFile) {
      showMessage(videoMessage, "Envoi de la vidéo vers Cloudinary en cours...");
      const uploadedVideo = await uploadToCloudinary(selectedFile, "video");
      publicId = uploadedVideo.public_id;
      videoFormat = uploadedVideo.format || selectedFile.name.split(".").pop().toLowerCase();

      if (!selectedCover) {
        thumbnail = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0/${publicId}.jpg`;
      }
      cloudinaryIdInput.value = publicId;
    }

    if (selectedCover) {
      showMessage(videoMessage, "Envoi de la couverture vers Cloudinary en cours...");
      const uploadedCover = await uploadToCloudinary(selectedCover, "image");
      thumbnail = uploadedCover.secure_url;
    }

    if (!thumbnail && publicId) {
      thumbnail = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0/${publicId}.jpg`;
    }

    showMessage(videoMessage, "Enregistrement de la vidéo dans la bibliothèque...");
    const playerUrl = new URL("https://player.cloudinary.com/embed/");
    playerUrl.searchParams.set("cloud_name", CLOUD_NAME);
    playerUrl.searchParams.set("public_id", publicId);

    const videoData = {
      title,
      description,
      cloudinary_public_id: publicId,
      playback_url: playerUrl.toString(),
      thumbnail_url: thumbnail || null,
      format: videoFormat
    };

    let result;
    if (editingId) {
      result = await db.from("videos").update(videoData).eq("id", editingId);
    } else {
      result = await db.from("videos").insert({ ...videoData, is_published: true });
    }

    if (result.error) {
      throw new Error(
        "Fichier envoyé sur Cloudinary, mais Supabase n'a pas pu enregistrer la vidéo : " +
        result.error.message
      );
    }

    showMessage(videoMessage, editingId ? "Vidéo modifiée avec succès !" : "Vidéo ajoutée avec succès !");
    resetVideoForm();
    await loadAdminVideos();
  } catch (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
  } finally {
    saveButton.disabled = false;
    videoFileInput.disabled = Boolean(editingId);
    coverFileInput.disabled = false;
  }
});

cancelEditButton.addEventListener("click", () => {
  resetVideoForm();
  showMessage(videoMessage, "");
});

async function togglePublication(video) {
  const { error } = await db.from("videos")
    .update({ is_published: !video.is_published })
    .eq("id", video.id);

  if (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
    return;
  }
  await loadAdminVideos();
}

async function deleteVideo(video) {
  if (!confirm("Retirer cette vidéo de la bibliothèque Supabase ? Le fichier restera stocké sur Cloudinary.")) return;

  const { error } = await db.from("videos").delete().eq("id", video.id);
  if (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
    return;
  }

  showMessage(videoMessage, "Vidéo retirée de Supabase. Le fichier Cloudinary est toujours conservé.");
  await loadAdminVideos();
}

async function checkPermanentDeleteConfig() {
  let status = document.getElementById("permanent-delete-status");

  if (!status) {
    const statsPanel = document.querySelector(".stats-panel");
    if (statsPanel) {
      const panel = document.createElement("section");
      panel.className = "admin-panel delete-status-panel";
      panel.setAttribute("aria-live", "polite");
      panel.innerHTML = '<h2>État de la suppression définitive</h2><p id="permanent-delete-status" class="admin-message status-pending">Vérification de la connexion Cloudinary en attente…</p><p class="status-help">Ce contrôle ne supprime aucune vidéo. Il vérifie uniquement la connexion à Cloudinary.</p>';
      statsPanel.insertAdjacentElement("afterend", panel);
      status = document.getElementById("permanent-delete-status");
    }
  }
  if (!status) {
    console.error("Zeno Video : impossible de trouver le bloc des statistiques pour afficher le statut Cloudinary.");
    return;
  }

  status.textContent = "Vérification de la connexion Cloudinary en cours…";
  status.className = "admin-message status-pending";

  try {
    const { data, error } = await db.functions.invoke("delete-video-permanently", {
      body: { checkOnly: true }
    });

    if (error || !data?.configured) {
      status.textContent = "⚠ Suppression définitive non vérifiée : " +
        (data?.error || error?.message || "La fonction n'a pas confirmé la connexion.") +
        (data?.details ? " (" + data.details + ")" : "");
      status.className = "admin-message error";
      return;
    }

    status.textContent = "✓ Suppression définitive prête : connexion Cloudinary vérifiée. Aucun fichier n'a été supprimé.";
    status.className = "admin-message success";
  } catch (error) {
    status.textContent = "⚠ Vérification impossible : " + (error?.message || "erreur de communication avec Supabase.");
    status.className = "admin-message error";
  }
}

async function permanentlyDeleteVideo(video) {
  const confirmed = confirm(
    "SUPPRESSION DÉFINITIVE\n\nLa vidéo « " + video.title +
    " » sera supprimée de Cloudinary ET de Supabase. Cette action est irréversible.\n\nContinuer ?"
  );
  if (!confirmed) return;

  showMessage(videoMessage, "Suppression définitive de Cloudinary et Supabase en cours...");
  const buttons = videoList.querySelectorAll("button");
  buttons.forEach(button => button.disabled = true);

  try {
    const { data, error } = await db.functions.invoke("delete-video-permanently", {
      body: { videoId: video.id }
    });

    if (error) {
      let details = error.message;
      try {
        if (error.context && typeof error.context.json === "function") {
          const payload = await error.context.json();
          details = payload.error || payload.message || details;
        }
      } catch {}
      throw new Error(details);
    }

    if (!data?.success) throw new Error(data?.error || "La suppression n'a pas été confirmée.");

    showMessage(videoMessage, "Vidéo supprimée définitivement de Cloudinary et Supabase.");
    await loadAdminVideos();
  } catch (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
    buttons.forEach(button => button.disabled = false);
  }
}

async function initializeAdmin() {
  const { data, error } = await db.auth.getSession();
  if (error) {
    showMessage(loginMessage, error.message);
    return;
  }
  if (data.session) await openDashboard(data.session.user);
}

initializeAdmin();
