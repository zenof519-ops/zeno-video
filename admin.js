const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";

const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const CLOUD_NAME = "wnonuvx4";
const CLOUDINARY_VIDEO_UPLOAD_PRESET = "zeno_video_upload";
const CLOUDINARY_IMAGE_UPLOAD_PRESET = "zeno_cover_upload";

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
  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier choisi n'est pas reconnu comme une image.");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Impossible de lire cette couverture. Essaie une image PNG ou WebP.");
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
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("La conversion de la couverture en PNG a échoué.")), "image/png");
  });

  if (pngBlob.type !== "image/png") {
    throw new Error("Le navigateur n'a pas pu produire une image PNG.");
  }

  return pngBlob;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function waitForOnlineConnection() {
  if (navigator.onLine) return Promise.resolve();
  showMessage(videoMessage, "Connexion coupée : le transfert attend le retour du réseau…");
  return new Promise(resolve => {
    window.addEventListener("online", resolve, { once: true });
  });
}

function uploadChunkToCloudinary(file, start, end, uploadId, chunkNumber, chunkCount) {
  const chunk = file.slice(start, end + 1);
  const uploadData = new FormData();
  uploadData.append("file", chunk, file.name);
  uploadData.append("upload_preset", CLOUDINARY_VIDEO_UPLOAD_PRESET);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);
    xhr.timeout = 900000;
    xhr.setRequestHeader("X-Unique-Upload-Id", uploadId);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);

    xhr.upload.addEventListener("progress", event => {
      if (event.lengthComputable) {
        const totalSent = start + event.loaded;
        const percent = Math.min(100, Math.round((totalSent / file.size) * 100));
        showMessage(videoMessage, `Envoi Cloudinary par morceaux : ${percent}% · morceau ${chunkNumber}/${chunkCount}`);
      }
    });

    xhr.addEventListener("load", () => {
      let result;
      try {
        result = JSON.parse(xhr.responseText || "{}");
      } catch {
        reject(new Error("Réponse illisible de Cloudinary (HTTP " + xhr.status + ")."));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const error = new Error(result.error?.message || "Cloudinary a refusé le morceau (HTTP " + xhr.status + ").");
        error.status = xhr.status;
        reject(error);
        return;
      }
      resolve(result);
    });

    xhr.addEventListener("error", () => reject(new Error("Connexion interrompue pendant le transfert du morceau.")));
    xhr.addEventListener("timeout", () => reject(new Error("Le transfert de ce morceau a dépassé 15 minutes.")));
    xhr.addEventListener("abort", () => reject(new Error("Envoi du morceau annulé.")));
    xhr.send(uploadData);
  });
}

async function uploadVideoInChunks(file) {
  const chunkSize = 6 * 1024 * 1024;
  const chunkCount = Math.ceil(file.size / chunkSize);
  const uploadId = crypto.randomUUID
    ? crypto.randomUUID()
    : "zeno-" + Date.now() + "-" + Math.random().toString(16).slice(2);

  let finalResponse = null;

  for (let index = 0; index < chunkCount; index++) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size) - 1;
    let lastError = null;
    let uploadedChunk = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        showMessage(
          videoMessage,
          `Envoi Cloudinary : morceau ${index + 1}/${chunkCount} · tentative ${attempt}/5`
        );
        uploadedChunk = await uploadChunkToCloudinary(
          file, start, end, uploadId, index + 1, chunkCount
        );
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const retryable = !error.status || error.status === 420 || error.status >= 500;
        if (!retryable || attempt === 5) break;
        showMessage(
          videoMessage,
          `Connexion instable : nouvelle tentative du morceau ${index + 1}/${chunkCount}…`
        );
        if (!navigator.onLine) {
          await waitForOnlineConnection();
        } else {
          await wait(Math.min(1500 * (2 ** (attempt - 1)), 15000));
        }
      }
    }

    if (lastError) {
      throw new Error(
        `Le morceau ${index + 1}/${chunkCount} n'a pas pu être envoyé après 5 tentatives. ` +
        `Vérifie ta connexion puis relance l'envoi. Détail : ${lastError.message}`
      );
    }

    if (index === chunkCount - 1) {
      finalResponse = uploadedChunk;
    }
  }

  if (!finalResponse?.secure_url || !finalResponse?.public_id) {
    throw new Error("Cloudinary n'a pas confirmé la fin de l'envoi complet. Aucune vidéo ne sera enregistrée dans Supabase.");
  }

  return finalResponse;
}

async function compressVideoTo480p(file) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream || !AudioContextClass) {
    throw new Error("La compression 480p n'est pas prise en charge par ce navigateur. Choisis « Qualité originale » pour continuer.");
  }

  const video = document.createElement("video");
  const sourceUrl = URL.createObjectURL(file);
  video.preload = "auto";
  video.playsInline = true;
  video.src = sourceUrl;
  video.style.position = "fixed";
  video.style.left = "-10000px";
  video.style.top = "0";
  video.style.width = "2px";
  video.style.height = "2px";
  document.body.appendChild(video);

  let audioContext = null;
  let canvasStream = null;
  let recorder = null;

  try {
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("Impossible de lire cette vidéo pour la compression.")), { once: true });
      video.load();
    });

    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    if (!originalWidth || !originalHeight) {
      throw new Error("Les dimensions de la vidéo n'ont pas pu être lues.");
    }

    const longestSide = Math.max(originalWidth, originalHeight);
    if (longestSide <= 854) {
      showMessage(videoMessage, "Cette vidéo est déjà en 480p ou moins. Envoi du fichier original…");
      return file;
    }

    const ratio = 854 / longestSide;
    const width = Math.max(2, Math.floor((originalWidth * ratio) / 2) * 2);
    const height = Math.max(2, Math.floor((originalHeight * ratio) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Le traitement vidéo n'est pas disponible sur ce téléphone.");

    audioContext = new AudioContextClass();
    const audioSource = audioContext.createMediaElementSource(video);
    const audioDestination = audioContext.createMediaStreamDestination();
    audioSource.connect(audioDestination);
    await audioContext.resume();

    canvasStream = canvas.captureStream(24);
    audioDestination.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));

    const mimeCandidates = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm"
    ];
    const mimeType = mimeCandidates.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Ce navigateur ne propose pas de format vidéo compatible pour la compression 480p.");

    const chunks = [];
    recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: 700000,
      audioBitsPerSecond: 96000
    });

    const recordingFinished = new Promise((resolve, reject) => {
      recorder.addEventListener("dataavailable", event => {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("error", event => reject(event.error || new Error("Erreur pendant la compression vidéo.")), { once: true });
      recorder.addEventListener("stop", resolve, { once: true });
    });

    let animationFrame = 0;
    const drawFrame = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        context.drawImage(video, 0, 0, width, height);
      }
      if (!video.ended && !video.paused) {
        animationFrame = requestAnimationFrame(drawFrame);
      }
    };

    video.addEventListener("timeupdate", () => {
      if (video.duration) {
        const percent = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
        showMessage(videoMessage, `Compression locale en 480p : ${percent}% · ${width}×${height}`);
      }
    });

    video.addEventListener("ended", () => {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    }, { once: true });

    await video.play();
    recorder.start(1000);
    drawFrame();
    await recordingFinished;
    cancelAnimationFrame(animationFrame);

    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
    if (!blob.size) throw new Error("La compression n'a produit aucun fichier.");
    const outputName = file.name.replace(/\.[^.]+$/, "") + "-480p.webm";
    const compressedFile = new File([blob], outputName, { type: blob.type || "video/webm", lastModified: Date.now() });

    showMessage(
      videoMessage,
      `Compression terminée : ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)}. Préparation de l'envoi…`
    );
    return compressedFile;
  } catch (error) {
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch {}
    }
    throw error;
  } finally {
    if (canvasStream) canvasStream.getTracks().forEach(track => track.stop());
    if (audioContext) {
      try { await audioContext.close(); } catch {}
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(sourceUrl);
  }
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "taille inconnue";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " Ko";
  return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
}

async function uploadToCloudinary(file, resourceType, progressMessage) {
  if (resourceType === "video" && file.size > 6 * 1024 * 1024) {
    return await uploadVideoInChunks(file);
  }

  const uploadData = new FormData();
  if (resourceType === "image") {
    const pngBlob = await convertJpegToPng(file);
    uploadData.append("file", pngBlob, "zeno-cover.png");
    showMessage(videoMessage, "Couverture convertie en PNG. Envoi vers Cloudinary...");
  } else {
    uploadData.append("file", file, file.name);
  }
  uploadData.append(
    "upload_preset",
    resourceType === "image" ? CLOUDINARY_IMAGE_UPLOAD_PRESET : CLOUDINARY_VIDEO_UPLOAD_PRESET
  );

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const label = resourceType === "video" ? "vidéo" : "couverture PNG";
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`);
    xhr.timeout = 900000;

    xhr.upload.addEventListener("progress", event => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        showMessage(videoMessage, `Envoi de la ${label} vers Cloudinary : ${percent}%`);
      } else {
        showMessage(videoMessage, `Envoi de la ${label} vers Cloudinary en cours…`);
      }
    });

    xhr.addEventListener("load", () => {
      let uploaded;
      try {
        uploaded = JSON.parse(xhr.responseText || "{}");
      } catch {
        reject(new Error("Réponse illisible de Cloudinary (HTTP " + xhr.status + ")."));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(uploaded.error?.message || "Cloudinary a refusé le fichier (HTTP " + xhr.status + ")."));
        return;
      }
      if (!uploaded.secure_url || !uploaded.public_id) {
        reject(new Error("Cloudinary n'a pas renvoyé l'URL sécurisée attendue."));
        return;
      }
      resolve(uploaded);
    });

    xhr.addEventListener("error", () => reject(new Error("Connexion interrompue pendant l'envoi vers Cloudinary.")));
    xhr.addEventListener("timeout", () => reject(new Error("L'envoi vers Cloudinary a dépassé 15 minutes.")));
    xhr.addEventListener("abort", () => reject(new Error("Envoi vers Cloudinary annulé.")));
    xhr.send(uploadData);
  });
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
      let fileToUpload = selectedFile;
      const quality = document.getElementById("upload-quality")?.value || "original";

      if (quality === "480p") {
        showMessage(videoMessage, "Préparation de la compression locale en 480p…");
        fileToUpload = await compressVideoTo480p(selectedFile);
      }

      showMessage(videoMessage, "Envoi de la vidéo vers Cloudinary en cours...");
      const uploadedVideo = await uploadToCloudinary(fileToUpload, "video");
      publicId = uploadedVideo.public_id;
      videoFormat = uploadedVideo.format || fileToUpload.name.split(".").pop().toLowerCase();

      if (!selectedCover) {
        thumbnail = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0/${publicId}.jpg`;
      }
      cloudinaryIdInput.value = publicId;
    }

    let coverWarning = "";
    if (selectedCover) {
      try {
        showMessage(videoMessage, "Conversion de la couverture en PNG...");
        const uploadedCover = await uploadToCloudinary(selectedCover, "image");
        thumbnail = uploadedCover.secure_url;
      } catch (coverError) {
        coverWarning = " La couverture n'a pas pu être envoyée (" + coverError.message + "). Une miniature automatique sera utilisée.";
        console.error("Zeno Video cover upload:", coverError);
      }
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

    showMessage(videoMessage, (editingId ? "Vidéo modifiée avec succès !" : "Vidéo ajoutée avec succès !") + coverWarning);
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
