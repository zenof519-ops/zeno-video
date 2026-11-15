const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const CLOUD_NAME = "wnonuvx4";
const IMAGE_PRESET = "zeno_cover_upload";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginSection = document.getElementById("login-section");
const dashboard = document.getElementById("dashboard");
const form = document.getElementById("announcement-form");
const message = document.getElementById("form-message");
const list = document.getElementById("announcement-list");
const mediaType = document.getElementById("media-type");
const videoFields = document.getElementById("video-fields");
const coverInput = document.getElementById("cover-file");
const coverPreview = document.getElementById("cover-preview");
let announcements = [];
let editingId = null;
let currentCover = null;

function show(element, text) { element.textContent = text; }
function updateMediaFields() {
  videoFields.classList.toggle("admin-hidden", mediaType.value !== "video");
}
mediaType.addEventListener("change", updateMediaFields);
coverInput.addEventListener("change", () => {
  const file = coverInput.files[0];
  if (!file) {
    if (currentCover) { coverPreview.src = currentCover; coverPreview.classList.remove("admin-hidden"); }
    else coverPreview.classList.add("admin-hidden");
    return;
  }
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
    coverInput.value = "";
    show(message, "Choisis une image PNG, JPG ou WebP.");
    return;
  }
  coverPreview.src = URL.createObjectURL(file);
  coverPreview.classList.remove("admin-hidden");
});

function normalizeSource(provider, raw) {
  const value = String(raw || "").trim();
  if (!value) throw new Error("Ajoute l’URL de lecture ou l’identifiant de la vidéo.");
  if (provider === "mux") {
    if (/^https:\/\//i.test(value)) return value;
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Pour Mux, indique un Playback ID ou une URL HTTPS.");
    return value;
  }
  if (provider === "vioo") {
    if (/^https:\/\//i.test(value)) return value;
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Identifiant Vioo invalide.");
    return value;
  }
  if (!/^https:\/\//i.test(value) && provider !== "cloudinary") {
    throw new Error("Cet hébergeur nécessite une URL HTTPS de lecture.");
  }
  if (provider === "cloudinary" && !/^https:\/\//i.test(value) && !/^[A-Za-z0-9_\-/]+$/.test(value)) {
    throw new Error("Indique un identifiant public Cloudinary ou une URL HTTPS.");
  }
  return value;
}

async function uploadCover(file) {
  const data = new FormData();
  data.append("file", file);
  data.append("upload_preset", IMAGE_PRESET);
  const response = await fetch("https://api.cloudinary.com/v1_1/" + CLOUD_NAME + "/image/upload", { method:"POST", body:data });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url) throw new Error(result.error?.message || "Échec de l’envoi de la couverture sur Cloudinary.");
  return result.secure_url;
}

function resetForm() {
  form.reset();
  editingId = null;
  currentCover = null;
  coverPreview.removeAttribute("src");
  coverPreview.classList.add("admin-hidden");
  document.getElementById("save-button").textContent = "Publier l’annonce";
  document.getElementById("cancel-button").classList.add("admin-hidden");
  updateMediaFields();
}
document.getElementById("cancel-button").addEventListener("click", resetForm);

async function loadAnnouncements() {
  const { data, error } = await db.from("video_announcements").select("*").order("created_at", { ascending:false });
  if (error) { show(message, "Chargement impossible : " + error.message); return; }
  announcements = data || [];
  document.getElementById("count").textContent = announcements.length + " annonce(s)";
  list.replaceChildren();
  if (!announcements.length) { list.textContent = "Aucune annonce pour le moment."; return; }

  const { data: linked, error: linkedError } = await db.from("videos").select("announcement_id").not("announcement_id","is",null);
  if (linkedError) { show(message, "Vérification des vidéos associées impossible : " + linkedError.message); return; }
  const linkedIds = new Set((linked || []).map(row => row.announcement_id));

  for (const item of announcements) {
    const card = document.createElement("article");
    card.className = "admin-video";
    const title = document.createElement("h3"); title.textContent = item.title;
    const detail = document.createElement("p");
    const kind = item.media_type === "video" ? "Courte vidéo · " + (item.video_provider || "Hébergeur inconnu") : "Photo";
    detail.textContent = kind + (item.is_visible ? " · Visible" : " · Masquée");
    const date = document.createElement("p");
    date.textContent = item.scheduled_for ? "Date prévue : " + new Date(item.scheduled_for).toLocaleString("fr-FR") : "Date non définie";
    const actions = document.createElement("div"); actions.className = "admin-actions";
    const edit = document.createElement("button"); edit.textContent = "Modifier";
    edit.addEventListener("click", () => {
      editingId = item.id;
      currentCover = item.cover_url || null;
      document.getElementById("title").value = item.title || "";
      document.getElementById("description").value = item.description || "";
      document.getElementById("scheduled").value = item.scheduled_for ? new Date(item.scheduled_for).toISOString().slice(0,16) : "";
      mediaType.value = item.media_type || "photo";
      document.getElementById("video-provider").value = item.video_provider || "cloudinary";
      document.getElementById("video-url").value = item.video_url || "";
      coverInput.value = "";
      if (currentCover) { coverPreview.src = currentCover; coverPreview.classList.remove("admin-hidden"); }
      else coverPreview.classList.add("admin-hidden");
      updateMediaFields();
      document.getElementById("save-button").textContent = "Enregistrer les modifications";
      document.getElementById("cancel-button").classList.remove("admin-hidden");
      form.scrollIntoView({behavior:"smooth"});
    });
    const visibility = document.createElement("button"); visibility.className = "alt";
    visibility.textContent = item.is_visible ? "Masquer" : "Afficher";
    visibility.addEventListener("click", async () => {
      const { error: e } = await db.from("video_announcements").update({is_visible:!item.is_visible}).eq("id",item.id);
      if (e) show(message, e.message);
      await loadAnnouncements();
    });
    const remove = document.createElement("button"); remove.className = "danger"; remove.textContent = "Supprimer";
    remove.disabled = linkedIds.has(item.id);
    remove.title = remove.disabled ? "Une vidéo de la bibliothèque est associée à cette annonce." : "";
    remove.addEventListener("click", async () => {
      if (linkedIds.has(item.id)) return;
      if (!confirm("Supprimer l’annonce « " + item.title + " » ?")) return;
      const { error: e } = await db.from("video_announcements").delete().eq("id",item.id);
      if (e) show(message, e.message);
      await loadAnnouncements();
    });
    actions.append(edit, visibility, remove);
    card.append(title, detail, date, actions);
    list.append(card);
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const title = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();
  const dateValue = document.getElementById("scheduled").value;
  const type = mediaType.value;
  const provider = document.getElementById("video-provider").value;
  const source = type === "video" ? normalizeSource(provider, document.getElementById("video-url").value) : null;
  const file = coverInput.files[0];
  if (!title) { show(message, "Ajoute un titre."); return; }
  if (!file && !currentCover) { show(message, "Ajoute une couverture à cette annonce."); return; }
  const button = document.getElementById("save-button");
  button.disabled = true;
  try {
    let coverUrl = currentCover;
    if (file) {
      show(message, "Envoi de la couverture sur Cloudinary…");
      coverUrl = await uploadCover(file);
    }
    const payload = {
      title, description, cover_url:coverUrl,
      scheduled_for:dateValue ? new Date(dateValue).toISOString() : null,
      media_type:type,
      video_provider:type === "video" ? provider : null,
      video_url:source,
      updated_at:new Date().toISOString()
    };
    const result = editingId
      ? await db.from("video_announcements").update(payload).eq("id",editingId)
      : await db.from("video_announcements").insert({...payload,is_visible:true});
    if (result.error) throw result.error;
    show(message, "Annonce enregistrée. Tu peux maintenant la vérifier sur le site public.");
    resetForm();
    await loadAnnouncements();
  } catch (error) {
    show(message, "Erreur : " + (error.message || String(error)));
  } finally {
    button.disabled = false;
  }
});

async function openDashboard(user) {
  if (!user || user.id !== ADMIN_ID) {
    await db.auth.signOut();
    loginSection.classList.remove("admin-hidden");
    dashboard.classList.add("admin-hidden");
    show(document.getElementById("login-message"), "Accès réservé à l’administrateur.");
    return;
  }
  loginSection.classList.add("admin-hidden");
  dashboard.classList.remove("admin-hidden");
  await loadAnnouncements();
}
db.auth.getSession().then(({data}) => {
  if (data.session) openDashboard(data.session.user);
});
document.getElementById("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  show(document.getElementById("login-message"), "Connexion en cours…");
  const {data,error} = await db.auth.signInWithPassword({
    email:document.getElementById("email").value,
    password:document.getElementById("password").value
  });
  if (error) { show(document.getElementById("login-message"), "Erreur : " + error.message); return; }
  await openDashboard(data.user);
});
document.getElementById("logout-button").addEventListener("click", async () => {
  await db.auth.signOut();
  dashboard.classList.add("admin-hidden");
  loginSection.classList.remove("admin-hidden");
});
updateMediaFields();
