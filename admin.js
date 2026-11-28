const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
const R2_WORKER_URL = "https://zeno-video-media.zenof519.workers.dev";
const R2_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const R2_MULTIPART_CONCURRENCY = 1;

const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const CLOUD_NAME = "wnonuvx4";
const BUNNY_LIBRARY_ID = "811150";
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
const announcementForm = document.getElementById("announcement-form");
const announcementMessage = document.getElementById("announcement-message");
const announcementList = document.getElementById("admin-announcement-list");
const announcementCount = document.getElementById("announcement-count");
const announcementCoverInput = document.getElementById("announcement-cover-file");
const announcementCoverProvider = document.getElementById("announcement-cover-provider");
const announcementCoverPreview = document.getElementById("announcement-cover-preview");
const announcementSelect = document.getElementById("video-announcement-id");
const categorySelect = document.getElementById("video-category-id");
const categoryForm = document.getElementById("category-form");
const categoryNameInput = document.getElementById("category-name");
const categoryList = document.getElementById("admin-category-list");
const categoryMessage = document.getElementById("category-message");
const categoryCoverFileInput = document.getElementById("category-cover-file");
const categoryCoverProviderSelect = document.getElementById("category-cover-provider");
let announcementsCache = [];
let categoriesCache = [];
let adminVideosCache = [];
let activeAdminCategoryId = null;
let editingAnnouncementId = null;
let currentAnnouncementCover = null;
const videoFileInput = document.getElementById("video-file");
const coverFileInput = document.getElementById("cover-file");
const coverProviderSelect = document.getElementById("cover-provider");
const coverUploadHelp = document.getElementById("cover-upload-help");
const coverPreview = document.getElementById("cover-preview");
const coverPreviewImage = document.getElementById("cover-preview-image");
const coverPreviewCaption = document.getElementById("cover-preview-caption");
const removeCoverButton = document.getElementById("remove-cover");
const cloudinaryIdInput = document.getElementById("cloudinary-id");
const providerSelect = document.getElementById("video-provider");
const cloudinaryFields = document.getElementById("cloudinary-fields");
const viooFields = document.getElementById("vioo-fields");
const viooIdInput = document.getElementById("vioo-id");
const viooThumbnailInput = document.getElementById("vioo-thumbnail-url");
const dropboxFields = document.getElementById("dropbox-fields");
const dropboxUrlInput = document.getElementById("dropbox-url");
const oneDriveFields = document.getElementById("onedrive-fields");
const oneDriveUrlInput = document.getElementById("onedrive-url");
const oneDriveDownloadUrlInput = document.getElementById("onedrive-download-url");
const oneDriveHelper = document.getElementById("onedrive-helper");
const oneDriveHelperMessage = document.getElementById("onedrive-helper-message");
const oneDriveChatGPTButton = document.getElementById("onedrive-chatgpt-button");
const deepStorageFields = document.getElementById("deepstorage-fields");
const deepStorageFileInput = document.getElementById("deepstorage-file");
const deepStorageStatusElement = document.getElementById("deepstorage-status");
const muxFields = document.getElementById("mux-fields");
const muxFileInput = document.getElementById("mux-file");
const muxStatusElement = document.getElementById("mux-status");
const bunnyFields = document.getElementById("bunny-fields");
const bunnyVideoIdInput = document.getElementById("bunny-video-id");
const bunnyDownloadUrlInput = document.getElementById("bunny-download-url");
const r2Fields = document.getElementById("r2-fields");
const r2FileInput = document.getElementById("r2-file");
const r2StatusElement = document.getElementById("r2-status");
const saveButton = document.getElementById("save-button");
const cancelEditButton = document.getElementById("cancel-edit");

let editingId = null;
let editingVideo = null;
let deepStorageStatus = { checked: false, available: false, message: "Vérification de l'accès API DeepStorage…" };
let r2Status = { available: false, message: "Service R2 en attente de configuration." };
let videoFormat = "mp4";
let currentThumbnailUrl = null;
let previewObjectUrl = null;
const muxDownloadsPreparing = new Set();

function showMessage(element, message) {
  element.textContent = message;
}

const weeklyMaintenancePanel = document.getElementById("weekly-maintenance-panel");
const weeklyMaintenanceMessage = document.getElementById("weekly-maintenance-message");
const weeklyMaintenanceStorageKey = "zeno-video-maintenance-last-completed";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function mostRecentSaturdayKey(date = new Date()) {
  const daysSinceSaturday = (date.getDay() + 1) % 7;
  const saturday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceSaturday);
  return localDateKey(saturday);
}

function updateWeeklyMaintenanceReminder() {
  if (!weeklyMaintenancePanel) return;
  let lastCompleted = null;
  try {
    lastCompleted = localStorage.getItem(weeklyMaintenanceStorageKey);
  } catch (error) {
    console.warn("Zeno Video: stockage local du rappel indisponible.", error);
  }
  const today = new Date();
  const dueSaturday = mostRecentSaturdayKey(today);
  const due = lastCompleted ? lastCompleted < dueSaturday : today.getDay() === 6;
  weeklyMaintenancePanel.classList.toggle("admin-hidden", !due);
  if (due && weeklyMaintenanceMessage) {
    weeklyMaintenanceMessage.textContent = "Vérification hebdomadaire à effectuer. Dernier contrôle : " +
      (lastCompleted || "aucun contrôle enregistré sur cet appareil") + ".";
  }
}

document.getElementById("run-weekly-maintenance-checks")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  if (weeklyMaintenanceMessage) weeklyMaintenanceMessage.textContent = "Actualisation des contrôles en cours…";
  try {
    await Promise.allSettled([
      loadAdminVideos(),
      loadHostingUsage(true),
      checkPermanentDeleteConfig(),
      checkDeepStorageAvailability(true)
    ]);
    if (weeklyMaintenanceMessage) {
      weeklyMaintenanceMessage.textContent = "Actualisation terminée. Consulte les statuts des hébergeurs, de la suppression définitive et de DeepStorage avant de valider.";
    }
  } finally {
    button.disabled = false;
  }
});

document.getElementById("complete-weekly-maintenance")?.addEventListener("click", () => {
  try {
    localStorage.setItem(weeklyMaintenanceStorageKey, localDateKey());
    weeklyMaintenancePanel?.classList.add("admin-hidden");
    if (weeklyMaintenanceMessage) weeklyMaintenanceMessage.textContent = "Maintenance validée sur cet appareil. Le prochain rappel apparaîtra samedi prochain.";
  } catch (error) {
    if (weeklyMaintenanceMessage) weeklyMaintenanceMessage.textContent = "Impossible d’enregistrer la validation sur cet appareil. Vérifie les autorisations de stockage du navigateur.";
  }
});

const hostingUsageCards = document.getElementById("hosting-usage-cards");
const hostingUsageUpdated = document.getElementById("hosting-usage-updated");
const refreshHostingUsageButton = document.getElementById("refresh-hosting-usage");
const connectDropboxButton = document.getElementById("connect-dropbox");

const dropboxOAuthJustConnected = new URLSearchParams(window.location.search).get("dropbox") === "connected";

function setDropboxButtonConnected(connected) {
  if (!connectDropboxButton) return;
  connectDropboxButton.textContent = connected ? "Dropbox connecté" : "Connecter Dropbox";
  connectDropboxButton.disabled = Boolean(connected);
  connectDropboxButton.setAttribute("aria-label", connected ? "Dropbox connecté" : "Connecter Dropbox");
}

if (dropboxOAuthJustConnected) {
  setDropboxButtonConnected(true);
  const callbackUrl = new URL(window.location.href);
  callbackUrl.searchParams.delete("dropbox");
  window.history.replaceState(window.history.state, "", callbackUrl);
}

function formatUsageBytes(value) {
  if (value === null || value === undefined || value === "") return "Non disponible";
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Non disponible";
  if (bytes < 1024) return bytes.toLocaleString("fr-FR") + " o";
  const units = ["Ko", "Mo", "Go", "To"];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return size.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " " + units[index];
}

function formatUsageNumber(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "Non disponible";
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("fr-FR", { maximumFractionDigits: digits })
    : "Non disponible";
}

function addHostingMetric(card, label, value) {
  const line = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = label + " : ";
  const span = document.createElement("span");
  span.textContent = String(value ?? "Non disponible");
  line.append(strong, span);
  card.appendChild(line);
}

function formatCloudinaryBucket(bucket) {
  if (!bucket || typeof bucket !== "object") return "Non disponible";
  const used = bucket.usage ?? bucket.used ?? bucket.used_bytes;
  const limit = bucket.limit ?? bucket.quota;
  const percent = bucket.used_percent ?? bucket.percent;
  const parts = [];
  if (used !== undefined) parts.push(String(used) + (bucket.unit ? " " + bucket.unit : ""));
  if (limit !== undefined) parts.push("limite " + String(limit));
  if (percent !== undefined) parts.push(String(percent) + "%");
  return parts.join(" / ") || "Données disponibles dans le compte, format non reconnu";
}

function updateBunnyHostingSettings(snapshot) {
  const element = document.getElementById("bunny-hosting-settings-status");
  if (!element) return;
  if (!snapshot) {
    element.textContent = "En attente de la première mesure Bunny. Les compteurs Zeno seront affichés après actualisation.";
    element.className = "admin-message status-pending";
    return;
  }
  const metrics = snapshot.metrics || {};
  element.textContent = metrics.apiAvailable
    ? "✓ API Bunny connectée · bibliothèque " + (metrics.libraryName || "Zeno Video") + " · dernière vérification : " + (snapshot.collected_at ? new Date(snapshot.collected_at).toLocaleString("fr-FR") : "date inconnue")
    : "Suivi Zeno actif · statistiques globales Bunny non connectées. La clé API doit rester dans les secrets Supabase, jamais dans cette page." + (metrics.apiError ? " Détail : " + metrics.apiError : "");
  element.className = "admin-message " + (metrics.apiAvailable ? "success" : "status-pending");
}


function updateDeepStorageHostingSettings(snapshot) {
  const element = document.getElementById("deepstorage-hosting-settings-status");
  if (!element) return;
  if (!snapshot) {
    element.textContent = "En attente de la première mesure DeepStorage. Actualise les statistiques des hébergeurs pour vérifier l'API.";
    element.className = "admin-message status-pending";
    return;
  }
  const metrics = snapshot.metrics || {};
  const connected = metrics.apiAvailable === true;
  const scopes = Array.isArray(metrics.scopes) ? metrics.scopes : [];
  const plan = metrics.plan ? " · offre " + metrics.plan : "";
  const permissions = scopes.length ? " · droits API : " + scopes.join(", ") : "";
  const checkedAt = snapshot.collected_at ? " · dernière vérification : " + new Date(snapshot.collected_at).toLocaleString("fr-FR") : "";
  element.textContent = connected
    ? "✓ API DeepStorage connectée" + plan + permissions + checkedAt
    : "API DeepStorage non disponible" + (metrics.apiError ? " · " + metrics.apiError : " · vérifie la clé DEEPSTORAGE_API_KEY et son accès API.");
  element.className = "admin-message " + (connected ? "success" : "status-pending");
}

function renderHostingUsage(snapshots) {
  hostingUsageCards.replaceChildren();
  updateBunnyHostingSettings(snapshots.find(item => item.provider === "bunny"));
  updateDeepStorageHostingSettings(snapshots.find(item => item.provider === "deepstorage"));
  const labels = {
    cloudinary: "Cloudinary",
    mux: "Mux",
    imagekit: "ImageKit (miniatures)",
    deepstorage: "DeepStorage",
    dropbox: "Dropbox",
    onedrive: "OneDrive",
    vioo: "Vioo",
    bunny: "Bunny Stream"
  };
  const statusLabels = {
    ok: "Mesure API disponible",
    partial: "Mesure partielle",
    needs_permission: "Autorisation API requise",
    error: "Mesure indisponible"
  };

  if (!snapshots.length) {
    const empty = document.createElement("p");
    empty.className = "admin-message status-pending";
    empty.textContent = "Aucune mesure enregistrée. Lance une première actualisation.";
    hostingUsageCards.appendChild(empty);
    return;
  }

  for (const snapshot of snapshots) {
    const metrics = snapshot.metrics || {};
    const zeno = metrics.zeno || {};
    const card = document.createElement("article");
    card.className = "hosting-usage-card";
    const heading = document.createElement("div");
    heading.className = "hosting-usage-heading";
    const title = document.createElement("h3");
    title.textContent = labels[snapshot.provider] || snapshot.provider;
    const status = document.createElement("span");
    const dropboxQuotaAvailable = snapshot.provider === "dropbox" && metrics.accountQuotaAvailable === true;
    if (snapshot.provider === "dropbox") {
      setDropboxButtonConnected(dropboxOAuthJustConnected || dropboxQuotaAvailable);
    }
    status.className = "hosting-usage-status " + (dropboxQuotaAvailable ? "ok" : (snapshot.status || "error"));
    status.textContent = dropboxQuotaAvailable
      ? "Connecté — quota disponible"
      : (statusLabels[snapshot.status] || "État inconnu");
    heading.append(title, status);
    card.appendChild(heading);

    if (snapshot.provider === "imagekit") {
      addHostingMetric(card, "Couvertures Zeno hébergées", formatUsageNumber(zeno.covers || 0, 0));
    } else {
      addHostingMetric(card, "Vidéos Zeno", formatUsageNumber(zeno.videos || 0, 0) + " (" + formatUsageNumber(zeno.published || 0, 0) + " publiées)");
      addHostingMetric(card, "Lectures lancées", formatUsageNumber(zeno.plays || 0, 0));
      addHostingMetric(card, "Téléchargements lancés", formatUsageNumber(zeno.downloads || 0, 0));
    }

    if (snapshot.provider === "cloudinary") {
      const credits = metrics.credits || {};
      addHostingMetric(card, "Crédits consommés", formatUsageNumber(credits.usage, 2) + " / " + formatUsageNumber(credits.limit, 0) + " (" + formatUsageNumber(credits.used_percent, 0) + "%)");
      addHostingMetric(card, "Crédits restants", formatUsageNumber(Math.max(0, Number(credits.limit || 0) - Number(credits.usage || 0)), 2));
      addHostingMetric(card, "Stockage utilisé", formatUsageBytes(metrics.storage?.usage));
      addHostingMetric(card, "Bande passante utilisée", formatUsageBytes(metrics.bandwidth?.usage));
      addHostingMetric(card, "Transformations", formatUsageNumber(metrics.transformations?.usage, 0));
    } else if (snapshot.provider === "mux") {
      addHostingMetric(card, "Assets stockés", formatUsageNumber(metrics.assets, 0) + " / " + formatUsageNumber(metrics.freeAssetLimit, 0));
      addHostingMetric(card, "Places restantes (offre gratuite)", formatUsageNumber(metrics.assetsRemainingOnFree, 0));
      addHostingMetric(card, "Durée vidéo stockée", formatUsageNumber(metrics.storedDurationMinutes, 1) + " min");
      addHostingMetric(card, "Livraison ce mois", formatUsageNumber(metrics.deliveredMinutesThisMonth, 1) + " / 100 000 min");
      addHostingMetric(card, "Minutes gratuites restantes", formatUsageNumber(metrics.freeDeliveryMinutesRemaining, 1));
    } else if (snapshot.provider === "imagekit") {
      addHostingMetric(card, "Stockage DAM", formatUsageBytes(metrics.mediaLibraryStorageBytes) + " / 3 Go (repère gratuit)");
      addHostingMetric(card, "Stockage restant estimé", formatUsageBytes(metrics.storageRemainingReferenceBytes));
      addHostingMetric(card, "Bande passante sur 30 jours", formatUsageBytes(metrics.bandwidthBytesLast30Days) + " / 20 Go (repère gratuit)");
      addHostingMetric(card, "Bande passante restante estimée", formatUsageBytes(metrics.bandwidthRemainingReferenceBytes));
    } else if (snapshot.provider === "deepstorage") {
      addHostingMetric(card, "Fichiers Zeno mesurés", formatUsageNumber(metrics.measuredFiles, 0) + " / " + formatUsageNumber(metrics.linkedVideos, 0));
      addHostingMetric(card, "Stockage Zeno mesuré", formatUsageBytes(metrics.zenoFilesSizeBytes));
      addHostingMetric(card, "Fichiers dont la taille est inconnue", formatUsageNumber(metrics.unknownFiles, 0));
      addHostingMetric(card, "Offre détectée", metrics.plan || "Non vérifiée");
      addHostingMetric(card, "Droit de lecture API", metrics.apiAvailable ? (metrics.readScopeAvailable ? "Disponible" : "À ajouter à la clé API") : "Non vérifiable");
      addHostingMetric(card, "Limites / quotas retournés", JSON.stringify(metrics.accountLimits || {}).slice(0, 320) || "Aucune donnée de quota reconnue");
    } else if (snapshot.provider === "dropbox") {
      addHostingMetric(card, "Espace Dropbox utilisé", formatUsageBytes(metrics.accountUsedBytes));
      addHostingMetric(card, "Quota Dropbox total", formatUsageBytes(metrics.accountAllocatedBytes));
      addHostingMetric(card, "Espace Dropbox restant", formatUsageBytes(metrics.accountRemainingBytes));
      addHostingMetric(card, "Fichiers Zeno mesurés", formatUsageNumber(metrics.measuredFiles || 0, 0) + " / " + formatUsageNumber(metrics.linkedVideos || 0, 0));
      addHostingMetric(card, "Espace occupé par les fichiers Zeno mesurés", formatUsageBytes(metrics.zenoFilesSizeBytes));
      addHostingMetric(card, "Fichiers dont la taille est inconnue", formatUsageNumber(metrics.unknownFiles, 0));
    } else if (snapshot.provider === "onedrive") {
      const linked = Number(metrics.linkedVideos || 0);
      const measured = Number(metrics.measuredFiles || 0);
      const unknown = Number(metrics.unknownFiles || 0);
      const measuredSizeLabel = linked === 0
        ? "Aucun fichier Zeno"
        : measured === 0
          ? "Taille inconnue — OneDrive ne l'expose pas sur le lien public"
          : formatUsageBytes(metrics.zenoFilesSizeBytes) + " (fichiers mesurés)";
      addHostingMetric(card, "Fichiers Zeno mesurés", formatUsageNumber(measured, 0) + " / " + formatUsageNumber(linked, 0));
      addHostingMetric(card, "Espace occupé par les fichiers Zeno mesurés", measuredSizeLabel);
      addHostingMetric(card, "Fichiers dont la taille est inconnue", formatUsageNumber(unknown, 0));
      if (metrics.trendAvailable && metrics.measuredFilesSizeDeltaBytes !== null) {
        const delta = Number(metrics.measuredFilesSizeDeltaBytes);
        const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
        const previousDate = metrics.previousMeasuredAt ? new Date(metrics.previousMeasuredAt).toLocaleString("fr-FR") : "";
        addHostingMetric(card, "Évolution depuis le relevé précédent", sign + formatUsageBytes(Math.abs(delta)) + (previousDate ? " (relevé du " + previousDate + ")" : ""));
      } else {
        addHostingMetric(card, "Évolution du stockage Zeno", measured > 0 ? "Première mesure exploitable — évolution disponible au prochain relevé" : "En attente d'une première taille vérifiable");
      }
      addHostingMetric(card, "Quota global du compte", "Non disponible sans autorisation Microsoft");
    } else if (snapshot.provider === "vioo") {
      addHostingMetric(card, "Quota et stockage fournisseur", "Non accessibles automatiquement pour le moment");
    } else if (snapshot.provider === "bunny") {
      addHostingMetric(card, "Bibliothèque", metrics.libraryName || "Zeno Video");
      addHostingMetric(card, "Identifiant bibliothèque", metrics.libraryId || "811150");
      addHostingMetric(card, "Vidéos dans Bunny", formatUsageNumber(metrics.videoCount, 0));
      addHostingMetric(card, "Stockage de la bibliothèque", formatUsageBytes(metrics.storageUsageBytes));
      addHostingMetric(card, "Trafic du mois", formatUsageBytes(metrics.trafficUsageBytes));
      addHostingMetric(card, "Connexion API", metrics.apiAvailable ? "Connectée" : "Non configurée ou indisponible");
    }

    if (metrics.note) addHostingMetric(card, "Note", metrics.note);
    if (snapshot.error) addHostingMetric(card, "Détail", snapshot.error);
    hostingUsageCards.appendChild(card);
  }
}

async function loadHostingUsage(refresh = false) {
  if (!hostingUsageCards) return;
  if (refreshHostingUsageButton) refreshHostingUsageButton.disabled = true;
  showMessage(hostingUsageUpdated, refresh ? "Actualisation des hébergeurs en cours…" : "Récupération de la dernière mesure…");

  try {
    let { data, error } = await db.functions.invoke("hosting-usage", {
      body: { action: refresh ? "refresh" : "latest" }
    });
    if (error) throw new Error(error.message || "Impossible de récupérer les statistiques des hébergeurs.");
    let snapshots = Array.isArray(data?.snapshots) ? data.snapshots : [];

    if (!refresh && (snapshots.length === 0 || !snapshots.some(item => item.provider === "bunny"))) {
      ({ data, error } = await db.functions.invoke("hosting-usage", { body: { action: "refresh" } }));
      if (error) throw new Error(error.message || "Impossible de lancer la première mesure.");
      snapshots = Array.isArray(data?.snapshots) ? data.snapshots : [];
    }

    renderHostingUsage(snapshots);
    await loadR2Usage();
    const timestamps = snapshots.map(item => item.collected_at).filter(Boolean).sort();
    const latest = timestamps.length ? new Date(timestamps[timestamps.length - 1]) : null;
    showMessage(hostingUsageUpdated, latest
      ? "Dernière mesure : " + latest.toLocaleString("fr-FR") + (refresh ? " · actualisation terminée." : "")
      : "Aucune mesure disponible pour le moment.");
  } catch (error) {
    showMessage(hostingUsageUpdated, "Erreur de suivi : " + (error.message || "connexion impossible."));
  } finally {
    if (refreshHostingUsageButton) refreshHostingUsageButton.disabled = false;
  }
}

refreshHostingUsageButton?.addEventListener("click", () => loadHostingUsage(true));

connectDropboxButton?.addEventListener("click", async () => {
  connectDropboxButton.disabled = true;
  showMessage(hostingUsageUpdated, "Préparation de la connexion Dropbox…");
  try {
    const { data, error } = await db.functions.invoke("dropbox-oauth", { body: {} });
    if (error) throw error;
    if (!data?.authorization_url) throw new Error(data?.error || "Lien d’autorisation Dropbox indisponible.");
    window.location.assign(data.authorization_url);
  } catch (error) {
    showMessage(hostingUsageUpdated, "Connexion Dropbox impossible : " + (error.message || "erreur inconnue."));
    connectDropboxButton.disabled = false;
  }
});


async function resetVideoStatistics(videoId, videoTitle) {
  const confirmed = confirm(
    "Réinitialiser les statistiques de « " + videoTitle + " » ?\n\nSes lectures et téléchargements passeront à zéro. Cette action ne peut pas être annulée."
  );
  if (!confirmed) return;

  const message = document.getElementById("stats-reset-message");
  const { error } = await db.from("videos")
    .update({ views: 0, downloads: 0 })
    .eq("id", videoId);

  if (error) {
    showMessage(message, "Erreur : " + error.message);
    return;
  }

  showMessage(message, "✓ Compteurs de « " + videoTitle + " » remis à zéro.");
  await loadAdminVideos();
}

async function resetAllVideoStatistics() {
  const confirmed = confirm(
    "Réinitialiser les statistiques de TOUTES les vidéos ?\n\nTous les compteurs de lectures et de téléchargements passeront à zéro. Cette action ne peut pas être annulée."
  );
  if (!confirmed) return;

  const button = document.getElementById("reset-all-stats");
  const message = document.getElementById("stats-reset-message");
  button.disabled = true;
  showMessage(message, "Réinitialisation des statistiques en cours…");

  try {
    const { error } = await db.from("videos")
      .update({ views: 0, downloads: 0 })
      .not("id", "is", null);

    if (error) throw error;

    showMessage(message, "✓ Les statistiques globales et celles de chaque vidéo ont été remises à zéro.");
    await loadAdminVideos();
  } catch (error) {
    showMessage(message, "Erreur : " + (error.message || "réinitialisation impossible."));
  } finally {
    button.disabled = false;
  }
}

document.getElementById("reset-all-stats").addEventListener("click", resetAllVideoStatistics);

function normalizeViooEmbedUrl(value) {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_-]+$/.test(raw)) {
    return "https://vioo.cc/embed/" + raw;
  }

  const iframeSource = raw.match(/src\s*=\s*["']([^"']+)["']/i);
  const candidate = iframeSource ? iframeSource[1] : raw;
  let url;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Indique un identifiant Vioo ou une URL de lecteur Vioo valide.");
  }

  if (url.protocol !== "https:" || !["vioo.cc", "www.vioo.cc"].includes(url.hostname)) {
    throw new Error("Le lecteur doit provenir de https://vioo.cc.");
  }

  const match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)\/?$/);
  if (!match) {
    throw new Error("Utilise le lien du lecteur Vioo au format https://vioo.cc/embed/IDENTIFIANT.");
  }

  return "https://vioo.cc/embed/" + match[1];
}

function normalizeDropboxUrl(value) {
  const raw = String(value || "").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Colle un lien de partage Dropbox valide.");
  }

  if (url.protocol !== "https:" || !["dropbox.com", "www.dropbox.com"].includes(url.hostname)) {
    throw new Error("Le lien doit provenir de https://www.dropbox.com.");
  }
  if (!/^\/(scl\/fi|s)\//.test(url.pathname)) {
    throw new Error("Utilise un lien de partage Dropbox vers un fichier, pas un dossier.");
  }

  url.searchParams.delete("dl");
  url.searchParams.set("raw", "1");
  return url.toString();
}

function normalizeOneDriveEmbedUrl(value) {
  const raw = String(value || "").trim();
  const iframeSource = raw.match(/src\s*=\s*["\']([^"\']+)["\']/i);
  const candidate = iframeSource ? iframeSource[1] : raw;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Colle un lien de lecteur OneDrive valide.");
  }
  const allowedHost = url.hostname === "1drv.ms" || url.hostname === "onedrive.live.com" || url.hostname === "www.onedrive.com";
  if (url.protocol !== "https:" || !allowedHost || !url.pathname.startsWith("/")) {
    throw new Error("Le lien doit provenir de OneDrive (https://1drv.ms ou onedrive.live.com).");
  }
  return url.toString();
}

function normalizeOneDriveDownloadUrl(value) {
  const raw = String(value || "").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Colle le lien de partage OneDrive classique destiné au téléchargement.");
  }
  const allowedHost = ["1drv.ms", "onedrive.live.com", "www.onedrive.com"].includes(url.hostname);
  const classicEmbed = ["onedrive.live.com", "www.onedrive.com"].includes(url.hostname) &&
    (url.pathname.toLowerCase().includes("/embed") || url.searchParams.has("embed"));
  if (url.protocol !== "https:" || !allowedHost || classicEmbed) {
    throw new Error("Le lien de téléchargement doit être un lien de partage OneDrive classique, pas le lien embed du lecteur.");
  }
  return url.toString();
}


function showDeepStorageStatus() {
  if (!deepStorageStatusElement) return;
  deepStorageStatusElement.textContent = deepStorageStatus.message;
  deepStorageStatusElement.className = "admin-message " +
    (deepStorageStatus.available ? "success" : deepStorageStatus.checked ? "error" : "status-pending");
}

async function invokeDeepStorage(payload) {
  const { data, error } = await db.functions.invoke("deepstorage-upload", { body: payload });
  if (error) {
    let details = error.message || "La fonction DeepStorage a échoué.";
    try {
      if (error.context && typeof error.context.json === "function") {
        const response = await error.context.json();
        details = response.error || response.message || details;
        if (response.code === "premium_required" || response.code === "invalid_api_key") {
          deepStorageStatus = { checked: true, available: false, message: details };
          showDeepStorageStatus();
        }
      }
    } catch {}
    throw new Error(details);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function checkDeepStorageAvailability(force = false) {
  if (!force && deepStorageStatus.checked) return deepStorageStatus.available;
  deepStorageStatus = { checked: false, available: false, message: "Vérification de l'accès API DeepStorage…" };
  showDeepStorageStatus();
  try {
    const data = await invokeDeepStorage({ action: "status" });
    if (!data?.available) {
      deepStorageStatus = {
        checked: true,
        available: false,
        message: data?.message || "DeepStorage API indisponible. Choisis un autre hébergeur."
      };
    } else {
      deepStorageStatus = {
        checked: true,
        available: true,
        message: "✓ DeepStorage API disponible (" + (data.plan || "offre payante") + "). Tu peux envoyer une vidéo."
      };
    }
  } catch (error) {
    deepStorageStatus = {
      checked: true,
      available: false,
      message: (error.message || "Vérification impossible.") + " Choisis un autre hébergeur si l'accès API n'est pas actif."
    };
  }
  showDeepStorageStatus();
  if (providerSelect.value === "deepstorage") {
    deepStorageFileInput.disabled = !deepStorageStatus.available;
    saveButton.disabled = !deepStorageStatus.available && !editingId;
  }
  return deepStorageStatus.available;
}

async function sendDeepStorageBinary(action, params, blob) {
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  const session = sessionData?.session;
  if (sessionError || !session?.access_token) {
    throw new Error("Ta session administrateur a expiré. Reconnecte-toi avant de relancer l'envoi.");
  }
  const query = new URLSearchParams({ action, ...params });
  const response = await fetch(SUPABASE_URL + "/functions/v1/deepstorage-upload?" + query.toString(), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      apikey: SUPABASE_KEY,
      "Content-Type": blob.type || "application/octet-stream"
    },
    body: blob
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.code === "premium_required" || data.code === "invalid_api_key") {
      deepStorageStatus = { checked: true, available: false, message: data.error || "Accès API DeepStorage indisponible." };
      showDeepStorageStatus();
      deepStorageFileInput.disabled = true;
    }
    const failure = new Error(data.error || "DeepStorage a refusé le transfert (HTTP " + response.status + ").");
    failure.code = data.code || "deepstorage_error";
    failure.nextOffset = data.next_offset;
    failure.retryAfter = data.retry_after;
    throw failure;
  }
  return data;
}

async function uploadToDeepStorage(file) {
  const started = await invokeDeepStorage({
    action: "start",
    filename: file.name,
    size: file.size,
    content_type: file.type || "application/octet-stream"
  });

  if (started.mode === "one_shot") {
    showMessage(videoMessage, "Envoi de la vidéo vers DeepStorage…");
    return await sendDeepStorageBinary("single", { filename: file.name }, file);
  }

  if (!started.session_id || !started.chunk_size) {
    throw new Error("DeepStorage n'a pas fourni les informations nécessaires pour le transfert reprenable.");
  }

  const sessionId = started.session_id;
  const chunkSize = Number(started.chunk_size);
  let offset = Number(started.next_offset || 0);
  let chunkNumber = 0;

  try {
    while (offset < file.size) {
      await waitForOnlineConnection();
      const end = Math.min(offset + chunkSize, file.size);
      const chunk = file.slice(offset, end);
      let sent = false;
      let lastError = null;

      for (let attempt = 1; attempt <= 5 && !sent; attempt++) {
        try {
          showMessage(videoMessage,
            "Envoi DeepStorage : " + Math.round((offset / file.size) * 100) +
            "% · morceau " + (chunkNumber + 1) + " · tentative " + attempt + "/5"
          );
          const result = await sendDeepStorageBinary("chunk", {
            session_id: sessionId,
            offset: String(offset)
          }, chunk);
          offset = Number(result.next_offset ?? end);
          sent = true;
          chunkNumber++;
        } catch (error) {
          lastError = error;
          if (error.code === "premium_required" || error.code === "invalid_api_key" ||
              error.code === "upload_scope_missing" || /indisponible|Pro|clé API|administrateur/i.test(error.message)) {
            throw error;
          }
          if (error.code === "bad_offset") {
            const resumed = await invokeDeepStorage({ action: "resume", session_id: sessionId });
            offset = Number(resumed.next_offset || 0);
            sent = true;
            break;
          }
          if (attempt === 5) break;
          const delay = (error.code === "busy" || error.code === "rate_limited") && Number(error.retryAfter) > 0
            ? Number(error.retryAfter) * 1000
            : Math.min(1000 * (2 ** (attempt - 1)), 8000);
          await wait(delay);
        }
      }

      if (!sent) throw new Error("Le morceau n'a pas pu être envoyé après plusieurs tentatives. " + (lastError?.message || ""));
    }

    showMessage(videoMessage, "Finalisation du fichier sur DeepStorage…");
    const finished = await invokeDeepStorage({ action: "finish", session_id: sessionId });
    if (!finished?.link) throw new Error("DeepStorage n'a pas renvoyé le lien de lecture final.");
    return finished;
  } catch (error) {
    try { await invokeDeepStorage({ action: "abort", session_id: sessionId }); } catch {}
    throw error;
  }
}

function updateProviderFields() {
  const isCloudinary = providerSelect.value === "cloudinary";
  const isDeepStorage = providerSelect.value === "deepstorage";
  const isVioo = providerSelect.value === "vioo";
  const isDropbox = providerSelect.value === "dropbox";
  const isOneDrive = providerSelect.value === "onedrive";
  const isMux = providerSelect.value === "mux";
  const isBunny = providerSelect.value === "bunny";
  const isR2 = providerSelect.value === "r2";
  cloudinaryFields.classList.toggle("admin-hidden", !isCloudinary);
  viooFields.classList.toggle("admin-hidden", !isVioo);
  dropboxFields.classList.toggle("admin-hidden", !isDropbox);
  oneDriveFields.classList.toggle("admin-hidden", !isOneDrive);
  deepStorageFields.classList.toggle("admin-hidden", !isDeepStorage);
  muxFields.classList.toggle("admin-hidden", !isMux);
  bunnyFields.classList.toggle("admin-hidden", !isBunny);
  r2Fields.classList.toggle("admin-hidden", !isR2);
  r2FileInput.disabled = !isR2;
  if (!isR2) r2FileInput.value = "";
  bunnyVideoIdInput.disabled = !isBunny;
  bunnyDownloadUrlInput.disabled = !isBunny;

  if (!isCloudinary) videoFileInput.value = "";
  if (!isDeepStorage) deepStorageFileInput.value = "";
  if (!isMux) muxFileInput.value = "";
  videoFileInput.disabled = !isCloudinary || Boolean(editingId);
  deepStorageFileInput.disabled = !isDeepStorage || !deepStorageStatus.available;
  muxFileInput.disabled = !isMux || Boolean(editingId);
  coverFileInput.disabled = false;
  cloudinaryIdInput.disabled = !isCloudinary;
  refreshOneDriveHelper();
  if (isDeepStorage) {
    saveButton.disabled = !deepStorageStatus.available && !editingId;
    checkDeepStorageAvailability(true);
  } else {
    saveButton.disabled = false;
  }
}

providerSelect.addEventListener("change", updateProviderFields);

function isOneDriveEmbedUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return false;

    // Liens d'intégration OneDrive classiques.
    if (["onedrive.live.com", "www.onedrive.com"].includes(url.hostname)) {
      return url.pathname.toLowerCase().includes("/embed") || url.searchParams.has("embed");
    }

    // Microsoft Graph peut retourner un lien embed raccourci 1drv.ms/v/c/...
    // Pour le format observé, le lien embed n'a pas le paramètre ?e= des liens
    // de partage classiques copiés depuis OneDrive.
    if (url.hostname === "1drv.ms") {
      return /^\/v\/c\/[^/]+\/[^/]+\/?$/i.test(url.pathname) &&
        url.search === "" &&
        url.hash === "";
    }

    return false;
  } catch {
    return false;
  }
}

function refreshOneDriveHelper() {
  const value = oneDriveUrlInput.value.trim();
  const isEmbed = Boolean(value) && isOneDriveEmbedUrl(value);

  // Le panneau et son bouton restent visibles dès que le fournisseur OneDrive est sélectionné.
  oneDriveHelper.classList.remove("admin-hidden");
  oneDriveChatGPTButton.classList.toggle("admin-hidden", isEmbed);

  if (!value) {
    oneDriveHelperMessage.textContent = "Après avoir copié ton lien de partage OneDrive, colle-le dans la case ci-dessus puis clique sur le bouton pour le transmettre à ChatGPT.";
    oneDriveChatGPTButton.textContent = "Ouvrir ChatGPT pour convertir le lien";
  } else if (isEmbed) {
    oneDriveHelperMessage.textContent = "✓ Un lien d’intégration OneDrive semble détecté. Tu peux l’enregistrer directement.";
  } else {
    oneDriveHelperMessage.textContent = "⚠ Ce lien semble être un lien de partage classique. Convertis-le en véritable lien d’intégration avec ChatGPT avant d’enregistrer.";
    oneDriveChatGPTButton.textContent = "Copier le lien et ouvrir ChatGPT";
  }
}

oneDriveUrlInput.addEventListener("input", refreshOneDriveHelper);

oneDriveChatGPTButton.addEventListener("click", async () => {
  const sharedUrl = oneDriveUrlInput.value.trim();
  if (!sharedUrl) {
    oneDriveHelperMessage.textContent = "Colle d’abord le lien de partage que tu as copié sur OneDrive dans la case située juste au-dessus.";
    oneDriveUrlInput.focus();
    return;
  }

  const prompt = "Aide-moi à convertir ce lien de partage OneDrive en véritable URL d’intégration vidéo (iframe) compatible avec mon site Zeno Video. Vérifie le type de lien et, si tu peux accéder au fichier via les outils connectés, récupère le véritable lien embed. Ne modifie aucune autorisation de partage sans me demander confirmation. Voici le lien : " + sharedUrl;

  try {
    await navigator.clipboard.writeText(prompt);
    oneDriveHelperMessage.textContent = "✓ Demande copiée. Ouverture de ChatGPT… Colle simplement le texte dans la conversation.";
  } catch {
    oneDriveHelperMessage.textContent = "ChatGPT va s’ouvrir. Si la demande n’est pas copiée automatiquement, copie le lien OneDrive et colle-le dans la conversation.";
  }
  window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
});

function clearCoverPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  coverPreviewImage.removeAttribute("src");
  coverPreview.classList.add("admin-hidden");
}

function updateCoverProviderHelp() {
  if (!coverUploadHelp || !coverProviderSelect) return;
  coverUploadHelp.textContent = coverProviderSelect.value === "imagekit"
    ? "La miniature sera envoyée sur ImageKit (offre gratuite : 25 Mo maximum par image). Cloudinary reste disponible dans le menu si besoin."
    : "La miniature sera envoyée sur Cloudinary, quel que soit l’hébergeur de la vidéo. Tu peux choisir ImageKit dans le menu pour utiliser son CDN à la place.";
}
coverProviderSelect?.addEventListener("change", updateCoverProviderHelp);
updateCoverProviderHelp();

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

  if (coverProviderSelect.value === "imagekit" && file.size > 25 * 1024 * 1024) {
    coverFileInput.value = "";
    showMessage(videoMessage, "ImageKit Free accepte les images jusqu’à 25 Mo. Choisis une image plus légère ou utilise Cloudinary.");
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


async function loadAdminAnnouncements() {
  const [{ data: announcements, error }, { data: linkedVideos, error: linkedError }] = await Promise.all([
    db.from("video_announcements").select("*").order("created_at", { ascending: false }),
    db.from("videos").select("id,announcement_id,is_published,provider,mux_status").not("announcement_id", "is", null)
  ]);
  if (error || linkedError) { announcementMessage.textContent = "Chargement des annonces impossible : " + (error || linkedError).message; return; }
  announcementsCache = announcements || [];
  announcementCount.textContent = announcementsCache.length + " annonce(s)";
  announcementList.replaceChildren(); announcementSelect.replaceChildren();
  const none = document.createElement("option"); none.value = ""; none.textContent = "Aucune annonce — vidéo indépendante"; announcementSelect.append(none);
  for (const item of announcementsCache) {
    if (item.media_type === "video") continue;
    const linked = (linkedVideos || []).find(video => video.announcement_id === item.id);
    const option = document.createElement("option"); option.value = item.id;
    option.textContent = item.title + (linked ? " — déjà associée" : " — disponible"); option.disabled = Boolean(linked) && editingVideo?.announcement_id !== item.id; announcementSelect.append(option);
    const card = document.createElement("article"); card.className = "admin-video";
    const title = document.createElement("h3"); title.textContent = item.title;
    const status = document.createElement("p"); status.textContent = linked ? (linked.is_published ? "Vidéo publiée" : linked.provider === "mux" && linked.mux_status !== "ready" ? "Vidéo en préparation" : "Vidéo associée — en attente de publication") : "À venir";
    const date = document.createElement("p"); date.textContent = item.scheduled_for ? "Sortie prévue : " + new Date(item.scheduled_for).toLocaleString("fr-FR") : "Date non définie";
    const actions = document.createElement("div"); actions.className = "admin-actions";
    const edit = document.createElement("button"); edit.textContent = "Modifier";
    edit.addEventListener("click", () => {
      editingAnnouncementId = item.id;
      currentAnnouncementCover = item.cover_url || null;
      document.getElementById("announcement-title").value = item.title || "";
      document.getElementById("announcement-description").value = item.description || "";
      document.getElementById("announcement-scheduled").value = item.scheduled_for ? new Date(item.scheduled_for).toISOString().slice(0, 16) : "";
      announcementCoverInput.value = "";
      if (currentAnnouncementCover) { announcementCoverPreview.src = currentAnnouncementCover; announcementCoverPreview.classList.remove("admin-hidden"); }
      else announcementCoverPreview.classList.add("admin-hidden");
      document.getElementById("announcement-save").textContent = "Enregistrer l'annonce";
      document.getElementById("announcement-cancel").classList.remove("admin-hidden");
      announcementForm.scrollIntoView({ behavior: "smooth" });
    });
    const visibility = document.createElement("button"); visibility.className = "alt"; visibility.textContent = item.is_visible ? "Masquer" : "Afficher";
    visibility.addEventListener("click", async () => { const { error: e } = await db.from("video_announcements").update({ is_visible: !item.is_visible }).eq("id", item.id); if (e) announcementMessage.textContent = e.message; await loadAdminAnnouncements(); });
    const remove = document.createElement("button"); remove.className = "danger"; remove.textContent = "Supprimer"; remove.disabled = Boolean(linked);
    remove.title = linked ? "Dissocie d'abord la vidéo." : "";
    remove.addEventListener("click", async () => { if (!confirm("Supprimer l'annonce « " + item.title + " » ?")) return; const { error: e } = await db.from("video_announcements").delete().eq("id", item.id); if (e) announcementMessage.textContent = e.message; await loadAdminAnnouncements(); });
    actions.append(edit, visibility, remove); card.append(title, status, date, actions); announcementList.append(card);
  }
  if (!announcementsCache.length) announcementList.textContent = "Aucune annonce pour le moment.";
}

announcementCoverInput.addEventListener("change", () => {
  const file = announcementCoverInput.files[0];
  if (!file) { announcementCoverPreview.classList.add("admin-hidden"); return; }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { announcementMessage.textContent = "Choisis une image PNG, JPG ou WebP."; announcementCoverInput.value = ""; return; }
  announcementCoverPreview.src = URL.createObjectURL(file); announcementCoverPreview.classList.remove("admin-hidden");
});

announcementForm.addEventListener("submit", async event => {
  event.preventDefault();
  const title = document.getElementById("announcement-title").value.trim();
  const description = document.getElementById("announcement-description").value.trim();
  const dateValue = document.getElementById("announcement-scheduled").value;
  const file = announcementCoverInput.files[0];
  if (!title || (!file && !currentAnnouncementCover)) { announcementMessage.textContent = "Ajoute un titre et une couverture."; return; }
  const button = document.getElementById("announcement-save"); button.disabled = true;
  try {
    let coverUrl = currentAnnouncementCover;
    if (file) {
      announcementMessage.textContent = announcementCoverProvider.value === "imagekit" ? "Envoi de la couverture vers ImageKit…" : "Envoi de la couverture vers Cloudinary…";
      const uploaded = announcementCoverProvider.value === "imagekit" ? await uploadToImageKit(file) : await uploadToCloudinary(file, "image");
      coverUrl = uploaded.url || uploaded.secure_url;
      if (!coverUrl) throw new Error("Aucune URL de couverture reçue.");
    }
    const payload = { title, description, cover_url: coverUrl, scheduled_for: dateValue ? new Date(dateValue).toISOString() : null, updated_at: new Date().toISOString() };
    const result = editingAnnouncementId
      ? await db.from("video_announcements").update(payload).eq("id", editingAnnouncementId)
      : await db.from("video_announcements").insert({ ...payload, is_visible: true });
    if (result.error) throw result.error;
    announcementForm.reset(); editingAnnouncementId = null; currentAnnouncementCover = null;
    announcementCoverPreview.removeAttribute("src"); announcementCoverPreview.classList.add("admin-hidden");
    document.getElementById("announcement-save").textContent = "Créer l'annonce";
    document.getElementById("announcement-cancel").classList.add("admin-hidden");
    announcementMessage.textContent = "Annonce enregistrée avec succès."; await loadAdminAnnouncements();
  } catch (error) { announcementMessage.textContent = "Erreur : " + (error.message || String(error)); }
  finally { button.disabled = false; }
});

document.getElementById("announcement-cancel").addEventListener("click", () => {
  announcementForm.reset(); editingAnnouncementId = null; currentAnnouncementCover = null;
  announcementCoverPreview.removeAttribute("src"); announcementCoverPreview.classList.add("admin-hidden");
  document.getElementById("announcement-save").textContent = "Créer l'annonce";
  document.getElementById("announcement-cancel").classList.add("admin-hidden");
  announcementMessage.textContent = "";
});

announcementSelect.addEventListener("change", () => {
  const item = announcementsCache.find(announcement => announcement.id === announcementSelect.value);
  if (!item) return;
  document.getElementById("video-name").value = item.title;
  document.getElementById("video-description").value = item.description || "";
  currentThumbnailUrl = item.cover_url || null;
  if (currentThumbnailUrl) displayCoverPreview(currentThumbnailUrl, "Couverture de l'annonce");
  else clearCoverPreview();
});

function resetVideoForm() {
  videoForm.reset();
  editingId = null;
  editingVideo = null;
  videoFormat = "mp4";
  currentThumbnailUrl = null;
  announcementSelect.value = "";
  clearCoverPreview();

  document.getElementById("form-title").textContent = "Ajouter une vidéo";
  saveButton.textContent = "Envoyer et ajouter la vidéo";
  cancelEditButton.classList.add("admin-hidden");
  videoFileInput.disabled = false;
  coverFileInput.disabled = false;
  cloudinaryIdInput.readOnly = false;
  providerSelect.value = "cloudinary";
  viooIdInput.value = "";
  viooThumbnailInput.value = "";
  dropboxUrlInput.value = "";
  oneDriveUrlInput.value = "";
  oneDriveDownloadUrlInput.value = "";
  bunnyDownloadUrlInput.value = "";
  deepStorageFileInput.value = "";
  muxFileInput.value = "";
  r2FileInput.value = "";
  bunnyVideoIdInput.value = "";
  updateProviderFields();
  refreshOneDriveHelper();
}


/* Modération des commentaires — toutes les actions sensibles passent par l'Edge Function authentifiée. */
const adminCommentsList = document.getElementById("admin-comments-list");
const adminCommentsMessage = document.getElementById("admin-comments-message");
const adminCommentFilter = document.getElementById("admin-comment-video-filter");
const adminCommentTotal = document.getElementById("admin-comment-total");
const adminCommentUnanswered = document.getElementById("admin-comment-unanswered");
const adminCommentHidden = document.getElementById("admin-comment-hidden");
const adminCommentVisitors = document.getElementById("admin-comment-visitors");

function commentAdminMessage(message, error = false) {
  if (!adminCommentsMessage) return;
  adminCommentsMessage.textContent = message;
  adminCommentsMessage.className = "admin-message" + (error ? " error" : "");
}
async function invokeCommentAdmin(payload) {
  const { data, error } = await db.functions.invoke("video-comments", { body: payload });
  if (error) {
    let detail = error.message || "Erreur du service de commentaires.";
    try {
      if (error.context && typeof error.context.json === "function") {
        const body = await error.context.json();
        detail = body.error || body.message || detail;
      }
    } catch {}
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
function formatAdminCommentDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}
function populateAdminCommentFilter() {
  if (!adminCommentFilter) return;
  const selected = adminCommentFilter.value;
  adminCommentFilter.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "Toutes les vidéos";
  adminCommentFilter.append(all);
  for (const video of adminVideosCache || []) {
    const option = document.createElement("option");
    option.value = video.id;
    option.textContent = video.title || "Vidéo sans titre";
    adminCommentFilter.append(option);
  }
  adminCommentFilter.value = selected;
}
function renderAdminComments(comments) {
  adminCommentsList.replaceChildren();
  const roots = comments.filter(item => !item.parent_id);
  const replies = new Map();
  for (const item of comments.filter(item => item.parent_id)) {
    if (!replies.has(item.parent_id)) replies.set(item.parent_id, []);
    replies.get(item.parent_id).push(item);
  }
  const videoNames = new Map((adminVideosCache || []).map(video => [video.id, video.title]));
  const uniqueVisitors = new Set(roots.map(item => item.visitor_id).filter(Boolean));
  adminCommentTotal.textContent = comments.length.toLocaleString("fr-FR");
  adminCommentUnanswered.textContent = roots.filter(item => !(replies.get(item.id) || []).length).length.toLocaleString("fr-FR");
  adminCommentHidden.textContent = comments.filter(item => item.is_hidden).length.toLocaleString("fr-FR");
  adminCommentVisitors.textContent = uniqueVisitors.size.toLocaleString("fr-FR");
  if (!roots.length) {
    const empty = document.createElement("p");
    empty.className = "comments-empty";
    empty.textContent = "Aucun commentaire pour le moment.";
    adminCommentsList.append(empty);
    return;
  }
  roots.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const comment of roots) {
    const card = document.createElement("article");
    card.className = "comment-admin-card";
    const heading = document.createElement("div");
    heading.className = "comment-admin-heading";
    const author = document.createElement("strong");
    author.textContent = comment.author_name || "Utilisateur";
    const date = document.createElement("span");
    date.className = "comment-admin-date";
    date.textContent = formatAdminCommentDate(comment.created_at);
    heading.append(author, date);
    const video = document.createElement("p");
    video.className = "comment-admin-meta";
    video.textContent = "Vidéo : " + (videoNames.get(comment.video_id) || "Vidéo supprimée ou indisponible");
    const content = document.createElement("p");
    content.className = "comment-content";
    content.textContent = comment.content || "";
    card.append(heading, video, content);
    if (comment.is_hidden) {
      const hidden = document.createElement("span");
      hidden.className = "comment-hidden-label";
      hidden.textContent = "COMMENTAIRE MASQUÉ";
      card.append(hidden);
    }
    const threadReplies = replies.get(comment.id) || [];
    if (threadReplies.length) {
      const replyWrap = document.createElement("div");
      replyWrap.className = "comment-admin-replies";
      for (const reply of threadReplies) {
        const replyCard = document.createElement("div");
        replyCard.className = "comment-admin-reply";
        const replyAuthor = document.createElement("strong");
        replyAuthor.textContent = reply.author_name || "Administration Zeno Video";
        const replyDate = document.createElement("small");
        replyDate.className = "comment-admin-date";
        replyDate.textContent = formatAdminCommentDate(reply.created_at);
        const replyContent = document.createElement("p");
        replyContent.textContent = reply.content || "";
        const replyDelete = document.createElement("button");
        replyDelete.type = "button";
        replyDelete.className = "danger";
        replyDelete.textContent = "Supprimer la réponse";
        replyDelete.addEventListener("click", async () => {
          if (!confirm("Supprimer cette réponse ?")) return;
          try {
            await invokeCommentAdmin({ action: "admin_delete", commentId: reply.id });
            await loadAdminComments();
          } catch (error) { commentAdminMessage(error.message, true); }
        });
        replyCard.append(replyAuthor, replyDate, replyContent, replyDelete);
        replyWrap.append(replyCard);
      }
      card.append(replyWrap);
    }
    const replyForm = document.createElement("form");
    replyForm.className = "comment-admin-reply";
    const replyLabel = document.createElement("label");
    replyLabel.textContent = threadReplies.length ? "Ajouter une autre réponse publique" : "Répondre publiquement";
    const replyInput = document.createElement("textarea");
    replyInput.rows = 2;
    replyInput.maxLength = 2000;
    replyInput.required = true;
    replyInput.placeholder = "Écris ta réponse…";
    const replyButton = document.createElement("button");
    replyButton.type = "submit";
    replyButton.textContent = "Envoyer la réponse";
    replyForm.append(replyLabel, replyInput, replyButton);
    replyForm.addEventListener("submit", async event => {
      event.preventDefault();
      const content = replyInput.value.trim();
      if (!content) return;
      replyButton.disabled = true;
      try {
        await invokeCommentAdmin({ action: "admin_reply", commentId: comment.id, content });
        await loadAdminComments();
        commentAdminMessage("Réponse publiée sous le commentaire.");
      } catch (error) {
        commentAdminMessage(error.message, true);
        replyButton.disabled = false;
      }
    });
    const actions = document.createElement("div");
    actions.className = "comment-admin-actions";
    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.className = "alt";
    hideButton.textContent = comment.is_hidden ? "Rendre visible" : "Masquer";
    hideButton.addEventListener("click", async () => {
      hideButton.disabled = true;
      try {
        await invokeCommentAdmin({ action: "admin_hide", commentId: comment.id, hidden: !comment.is_hidden });
        await loadAdminComments();
        commentAdminMessage(comment.is_hidden ? "Commentaire rendu visible." : "Commentaire masqué.");
      } catch (error) {
        commentAdminMessage(error.message, true);
        hideButton.disabled = false;
      }
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "Supprimer";
    deleteButton.addEventListener("click", async () => {
      if (!confirm("Supprimer ce commentaire et toutes ses réponses ? Cette action est définitive.")) return;
      deleteButton.disabled = true;
      try {
        await invokeCommentAdmin({ action: "admin_delete", commentId: comment.id });
        await loadAdminComments();
        commentAdminMessage("Commentaire supprimé.");
      } catch (error) {
        commentAdminMessage(error.message, true);
        deleteButton.disabled = false;
      }
    });
    actions.append(hideButton, deleteButton);
    card.append(replyForm, actions);
    adminCommentsList.append(card);
  }
}
async function loadAdminComments() {
  if (!adminCommentsList) return;
  populateAdminCommentFilter();
  adminCommentsList.replaceChildren();
  commentAdminMessage("Chargement des commentaires…");
  try {
    const payload = { action: "admin_list" };
    if (adminCommentFilter?.value) payload.videoId = adminCommentFilter.value;
    const result = await invokeCommentAdmin(payload);
    renderAdminComments(Array.isArray(result.comments) ? result.comments : []);
    commentAdminMessage("Commentaires actualisés.");
  } catch (error) {
    commentAdminMessage("Impossible de charger les commentaires : " + error.message, true);
    const empty = document.createElement("p");
    empty.className = "comments-empty";
    empty.textContent = "Le service de commentaires n’est pas disponible pour le moment.";
    adminCommentsList.append(empty);
  }
}
document.getElementById("refresh-admin-comments")?.addEventListener("click", loadAdminComments);
adminCommentFilter?.addEventListener("change", loadAdminComments);

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
  updateWeeklyMaintenanceReminder();
  await loadAdminCategories();
  await loadAdminAnnouncements();
  await loadAdminVideos();
  await loadAdminComments();
  await loadHostingUsage(dropboxOAuthJustConnected);
  await checkPermanentDeleteConfig();
  await checkDeepStorageAvailability(true);
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

async function prepareMuxDownload(video, button) {
  if (!video?.id || video.provider !== "mux" || video.mux_status !== "ready") return;
  if (!confirm("Démarrer ou vérifier la préparation du fichier MP4 téléchargeable de « " + video.title + " » ? Mux facture le stockage du MP4 et sa livraison lorsqu'il est téléchargé.")) return;

  button.disabled = true;
  button.textContent = "Vérification du MP4…";
  muxDownloadsPreparing.add(video.id);
  showMessage(videoMessage, "Vérification de l'état du MP4 sur Mux…");

  const maxChecks = 80;
  const checkDelayMs = 15000;

  try {
    for (let attempt = 1; attempt <= maxChecks; attempt++) {
      const { data, error } = await db.functions.invoke("mux-enable-download", {
        body: { videoId: video.id }
      });

      if (error) {
        let details = error.message || "Impossible de vérifier le téléchargement Mux.";
        try {
          if (error.context && typeof error.context.json === "function") {
            const payload = await error.context.json();
            details = payload.error || payload.message || details;
          }
        } catch {}
        throw new Error(details);
      }
      if (data?.error) throw new Error(data.error);

      if (data?.ready && data?.downloadUrl) {
        muxDownloadsPreparing.delete(video.id);
        button.textContent = "Téléchargement activé";
        showMessage(videoMessage, "✓ Téléchargement activé. Le bouton est maintenant disponible sur la page publique.");
        await loadAdminVideos();
        return;
      }

      if (data?.status === "errored" || data?.status === "failed") {
        throw new Error("Mux n'a pas pu générer le MP4. La vidéo originale reste disponible ; tu peux réessayer après vérification.");
      }

      button.textContent = "MP4 en préparation…";
      showMessage(
        videoMessage,
        "Mux prépare toujours le MP4 (" + attempt + "/" + maxChecks + "). Vérification automatique toutes les 15 secondes."
      );

      if (attempt < maxChecks) {
        await new Promise(resolve => setTimeout(resolve, checkDelayMs));
      }
    }

    muxDownloadsPreparing.delete(video.id);
    button.disabled = false;
    button.textContent = "Vérifier l'état du MP4";
    showMessage(videoMessage, "Le MP4 est toujours en préparation après 20 minutes. Rien n'a été supprimé : appuie sur « Vérifier l'état du MP4 » pour contrôler à nouveau.");
  } catch (error) {
    muxDownloadsPreparing.delete(video.id);
    showMessage(videoMessage, "Erreur : " + error.message);
    button.disabled = false;
    button.textContent = "Réessayer la vérification MP4";
  }
}


async function loadAdminCategories() {
  const { data, error } = await db.from("video_categories")
    .select("id,name,sort_order,created_at,cover_url,cover_provider,cover_cloudinary_public_id,cover_imagekit_file_id,is_published,is_hidden")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    showMessage(categoryMessage, "Impossible de charger les catégories : " + error.message);
    return;
  }
  categoriesCache = data || [];
  updateVideoCategorySelect();
  renderCategoryManager();
}

function updateVideoCategorySelect() {
  if (!categorySelect) return;
  const selected = categorySelect.value;
  categorySelect.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Aucune catégorie";
  categorySelect.append(none);
  for (const category of categoriesCache) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.append(option);
  }
  categorySelect.value = selected;
}

function renderCategoryManager() {
  if (!categoryList) return;
  categoryList.replaceChildren();
  if (!categoriesCache.length) {
    const empty = document.createElement("p");
    empty.className = "cover-help";
    empty.textContent = "Aucune catégorie pour le moment. Crée ta première catégorie ci-dessus.";
    categoryList.append(empty);
    return;
  }
  for (const category of categoriesCache) {
    const videosInCategory = adminVideosCache.filter(video => video.category_id === category.id && !video.announcement_id);
    const card = document.createElement("article");
    card.className = "admin-video category-admin-card";
    const name = document.createElement("input");
    name.type = "text";
    name.value = category.name;
    name.maxLength = 80;
    name.setAttribute("aria-label", "Nom de la catégorie " + category.name);
    const coverPreview = document.createElement("div");
    coverPreview.className = "category-admin-cover-preview";
    if (category.cover_url) {
      const coverImage = document.createElement("img");
      coverImage.src = category.cover_url;
      coverImage.alt = "Couverture de " + category.name;
      coverPreview.append(coverImage);
    } else {
      coverPreview.textContent = "Aucune couverture";
    }
    const coverControls = document.createElement("div");
    coverControls.className = "category-cover-controls";
    const coverFile = document.createElement("input");
    coverFile.type = "file";
    coverFile.accept = "image/jpeg,image/png,image/webp";
    coverFile.setAttribute("aria-label", "Choisir une couverture pour " + category.name);
    const coverProvider = document.createElement("select");
    coverProvider.setAttribute("aria-label", "Hébergeur de la couverture de " + category.name);
    coverProvider.innerHTML = '<option value="imagekit">ImageKit</option><option value="cloudinary">Cloudinary</option>';
    coverProvider.value = category.cover_provider === "cloudinary" ? "cloudinary" : "imagekit";
    const saveCover = document.createElement("button");
    saveCover.type = "button";
    saveCover.className = "alt";
    saveCover.textContent = category.cover_url ? "Changer la couverture" : "Ajouter une couverture";
    saveCover.addEventListener("click", () => saveCategoryCover(category, coverFile, coverProvider, saveCover));
    coverControls.append(coverFile, coverProvider, saveCover);

    const count = document.createElement("p");
    count.textContent = videosInCategory.length + (videosInCategory.length > 1 ? " vidéo(s) classée(s)" : " vidéo classée");
    // Un dossier est effectivement publié s'il est marqué publié OU si au moins
    // une de ses vidéos indépendantes est publiée individuellement.
    const isCategoryEffectivelyPublished = Boolean(category.is_published) ||
      videosInCategory.some(video => video.is_published);
    const publishCategory = document.createElement("button");
    publishCategory.type = "button";
    publishCategory.className = "alt";
    publishCategory.textContent = isCategoryEffectivelyPublished ? "Dépublier le dossier" : "Publier le dossier";
    publishCategory.addEventListener("click", async () => {
      const nextPublishedState = !isCategoryEffectivelyPublished;
      const action = isCategoryEffectivelyPublished ? "dépublier" : "publier";
      const details = isCategoryEffectivelyPublished
        ? "Le dossier et toutes les vidéos indépendantes qu'il contient seront dépubliés et disparaîtront du site public. Les vidéos resteront dans ton administration."
        : "Le dossier et toutes les vidéos indépendantes qu'il contient seront publiés et visibles sur le site public.";
      if (!confirm("Veux-tu " + action + " le dossier « " + category.name + " » ? " + details)) return;
      publishCategory.disabled = true;

      const { error: videosError } = await db.from("videos")
        .update({ is_published: nextPublishedState })
        .eq("category_id", category.id)
        .is("announcement_id", null);
      if (videosError) {
        publishCategory.disabled = false;
        showMessage(categoryMessage, "Impossible de " + action + " les vidéos du dossier : " + videosError.message);
        return;
      }

      const { error: categoryError } = await db.from("video_categories")
        .update({ is_published: nextPublishedState, is_hidden: false })
        .eq("id", category.id);
      if (categoryError) {
        showMessage(categoryMessage, "Les vidéos ont été " + (nextPublishedState ? "publiées" : "dépubliées") + ", mais le statut du dossier n'a pas pu être enregistré : " + categoryError.message);
        await loadAdminVideos();
        await loadAdminCategories();
        return;
      }

      showMessage(categoryMessage, "Dossier « " + category.name + " » et toutes ses vidéos " + (nextPublishedState ? "publiés." : "dépubliés."));
      await loadAdminVideos();
      await loadAdminCategories();
    });

    const openFolder = document.createElement("button");
    openFolder.type = "button";
    openFolder.className = "alt category-admin-open";
    openFolder.textContent = "Ouvrir le dossier";
    openFolder.addEventListener("click", () => {
      activeAdminCategoryId = category.id;
      loadAdminVideos();
      document.getElementById("admin-video-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const actions = document.createElement("div");
    actions.className = "admin-actions";

    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "Enregistrer le nom";
    rename.addEventListener("click", async () => {
      const newName = name.value.trim();
      if (!newName) {
        showMessage(categoryMessage, "Le nom d'une catégorie ne peut pas être vide.");
        name.focus();
        return;
      }
      rename.disabled = true;
      const { error } = await db.from("video_categories").update({ name: newName }).eq("id", category.id);
      rename.disabled = false;
      if (error) {
        showMessage(categoryMessage, "Impossible de renommer cette catégorie : " + error.message);
        return;
      }
      showMessage(categoryMessage, "Catégorie renommée.");
      await loadAdminCategories();
    });

    const empty = document.createElement("button");
    empty.type = "button";
    empty.className = "alt";
    empty.textContent = "Vider";
    empty.disabled = videosInCategory.length === 0;
    empty.addEventListener("click", async () => {
      if (!confirm("Retirer les " + videosInCategory.length + " vidéo(s) de « " + category.name + " » ? Les vidéos resteront dans Zeno Video, sans catégorie.")) return;
      empty.disabled = true;
      const { error } = await db.from("videos").update({ category_id: null }).eq("category_id", category.id);
      if (error) {
        empty.disabled = false;
        showMessage(categoryMessage, "Impossible de vider la catégorie : " + error.message);
        return;
      }
      showMessage(categoryMessage, "Catégorie vidée. Les vidéos sont conservées sans catégorie.");
      await loadAdminVideos();
      await loadAdminCategories();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Supprimer la catégorie";
    remove.addEventListener("click", async () => {
      if (!confirm("Supprimer la catégorie « " + category.name + " » ? Les vidéos seront conservées et redeviendront sans catégorie.")) return;
      remove.disabled = true;
      remove.disabled = true;
      const { data, error } = await db.functions.invoke("delete-video-permanently", {
        body: { categoryId: category.id, preserveVideos: true }
      });
      if (error || !data?.success) {
        remove.disabled = false;
        showMessage(categoryMessage, data?.error || error?.message || "La suppression de la catégorie n'a pas été confirmée.");
        return;
      }
      showMessage(categoryMessage, data.message || "Catégorie supprimée. Les vidéos ont été conservées sans catégorie.");
      await loadAdminCategories();
      await loadAdminVideos();
    });

    const permanentRemove = document.createElement("button");
    permanentRemove.type = "button";
    permanentRemove.className = "danger";
    permanentRemove.textContent = "Supprimer la catégorie et ses vidéos";
    permanentRemove.addEventListener("click", () => permanentlyDeleteCategory(category, videosInCategory.length, permanentRemove));

    actions.append(openFolder, publishCategory, rename, empty, remove, permanentRemove);
    card.append(name, coverPreview, coverControls, count, actions);
    categoryList.append(card);
  }
}

async function uploadCategoryCover(file, provider) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choisis une couverture JPG, PNG ou WebP.");
  if (provider === "cloudinary") {
    const uploaded = await uploadToCloudinary(file, "image", "Envoi de la couverture de catégorie vers Cloudinary…");
    return { cover_url: uploaded.secure_url, cover_provider: "cloudinary", cover_cloudinary_public_id: uploaded.public_id, cover_imagekit_file_id: null };
  }
  const uploaded = await uploadToImageKit(file);
  return { cover_url: uploaded.url, cover_provider: "imagekit", cover_cloudinary_public_id: null, cover_imagekit_file_id: uploaded.fileId };
}

async function saveCategoryCover(category, fileInput, providerSelect, button) {
  const file = fileInput.files?.[0];
  if (!file) { showMessage(categoryMessage, "Choisis d'abord une image pour la couverture."); return; }
  button.disabled = true;
  try {
    showMessage(categoryMessage, "Préparation de la couverture de « " + category.name + " »…");
    const coverData = await uploadCategoryCover(file, providerSelect.value);
    const { error } = await db.from("video_categories").update(coverData).eq("id", category.id);
    if (error) throw new Error("Image envoyée, mais l'enregistrement Supabase a échoué : " + error.message);
    showMessage(categoryMessage, "Couverture de « " + category.name + " » enregistrée.");
    await loadAdminCategories();
  } catch (error) { showMessage(categoryMessage, "Erreur : " + error.message); }
  finally { button.disabled = false; }
}

categoryForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const name = categoryNameInput.value.trim();
  if (!name) { showMessage(categoryMessage, "Indique un nom pour cette catégorie."); return; }
  const submit = categoryForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const { data, error } = await db.from("video_categories")
      .insert({ name })
      .select("id,name,sort_order,created_at,cover_url,cover_provider,cover_cloudinary_public_id,cover_imagekit_file_id,is_published,is_hidden")
      .single();
    if (error) throw new Error(error.code === "23505" ? "Une catégorie porte déjà ce nom." : error.message);
    categoryNameInput.value = "";
    showMessage(categoryMessage, "Catégorie « " + data.name + " » créée.");
    if (categoryCoverFileInput?.files?.[0]) {
      try {
        const coverData = await uploadCategoryCover(categoryCoverFileInput.files[0], categoryCoverProviderSelect?.value || "imagekit");
        const { error: coverError } = await db.from("video_categories").update(coverData).eq("id", data.id);
        if (coverError) throw new Error(coverError.message);
        showMessage(categoryMessage, "Catégorie « " + data.name + " » créée avec sa couverture.");
      } catch (coverError) { showMessage(categoryMessage, "Catégorie créée, mais sa couverture n'a pas pu être enregistrée : " + coverError.message); }
    }
    if (categoryCoverFileInput) categoryCoverFileInput.value = "";
    await loadAdminCategories();
    if (categorySelect) categorySelect.value = data.id;
  } catch (error) { showMessage(categoryMessage, "Impossible de créer la catégorie : " + error.message); }
  finally { submit.disabled = false; }
});

async function permanentlyDeleteCategory(category, displayedCount, button) {
  const { data: videos, error: listError } = await db.from("videos").select("id,title,provider,cloudinary_public_id,mux_asset_id,playback_url").eq("category_id", category.id);
  if (listError) { showMessage(categoryMessage, "Impossible de lire les vidéos de cette catégorie : " + listError.message); return; }
  const total = videos?.length || 0;
  const warning = "SUPPRESSION DÉFINITIVE\n\nLe dossier « " + category.name + " » et ses " + total +
    " vidéo(s) vont être supprimés de Zeno Video. Cette action est irréversible.\n\nCloudinary, Mux et Cloudflare R2 seront sollicités lorsque leurs connexions sont disponibles. Pour les autres hébergeurs, seules les fiches Zeno Video seront supprimées ; les fichiers distants resteront chez leur hébergeur.\n\nContinuer ?";
  if (!confirm(warning)) return;
  button.disabled = true;
  const categoryButtons = categoryList.querySelectorAll("button");
  categoryButtons.forEach(item => item.disabled = true);
  let removed = 0;
  try {
    const configResult = await db.functions.invoke("delete-video-permanently", { body: { checkOnly: true } });
    const deletionConfig = configResult.data || {};
    for (const video of videos || []) {
      const provider = String(video.provider || "cloudinary").toLowerCase();
      const canDeleteRemote = (provider === "cloudinary" && Boolean(deletionConfig.cloudinary && video.cloudinary_public_id)) ||
        (provider === "mux" && Boolean(deletionConfig.mux && video.mux_asset_id)) ||
        (provider === "r2" && Boolean(deletionConfig.r2 && video.playback_url));
      showMessage(categoryMessage, "Suppression de la vidéo " + (removed + 1) + "/" + total + " : " + video.title + "…");
      const { data, error } = await db.functions.invoke("delete-video-permanently", { body: { videoId: video.id, deleteVideoAsset: canDeleteRemote } });
      if (error || !data?.success) {
        let details = data?.error || error?.message || "La suppression n'a pas été confirmée.";
        try { if (error?.context && typeof error.context.json === "function") { const payload = await error.context.json(); details = payload.error || payload.message || details; } } catch {}
        throw new Error("Arrêt après " + removed + "/" + total + " vidéo(s). Échec sur « " + video.title + " » : " + details);
      }
      removed++;
    }
    showMessage(categoryMessage, "Suppression du dossier et de sa couverture…");
    const { data: categoryResult, error: categoryError } = await db.functions.invoke("delete-video-permanently", { body: { categoryId: category.id } });
    if (categoryError || !categoryResult?.success) throw new Error(categoryResult?.error || categoryError?.message || "Impossible de supprimer le dossier après le traitement de ses vidéos.");
    showMessage(categoryMessage, "✓ " + categoryResult.message);
    await loadAdminCategories();
    await loadAdminVideos();
  } catch (error) {
    showMessage(categoryMessage, error.message + " Le dossier est conservé pour permettre de reprendre la suppression.");
    await loadAdminCategories();
    await loadAdminVideos();
  } finally {
    categoryButtons.forEach(item => item.disabled = false);
    button.disabled = false;
  }
}

function getNextVideoSortOrder(categoryId, excludedVideoId = null) {
  const currentOrders = adminVideosCache
    .filter(video =>
      video.id !== excludedVideoId &&
      !video.announcement_id &&
      (video.category_id || null) === (categoryId || null)
    )
    .map(video => Number(video.sort_order) || 0);
  return Math.max(0, ...currentOrders) + 10;
}

async function saveVideoOrder(orderedVideos) {
  showMessage(videoMessage, "Enregistrement du nouvel ordre d’affichage…");
  const results = await Promise.all(orderedVideos.map((video, index) =>
    db.from("videos")
      .update({ sort_order: (index + 1) * 10 })
      .eq("id", video.id)
  ));
  const failed = results.find(result => result.error);
  if (failed) {
    showMessage(videoMessage, "L’ordre n’a pas pu être entièrement enregistré : " + failed.error.message);
    await loadAdminVideos();
    return;
  }
  showMessage(videoMessage, "Nouvel ordre d’affichage enregistré. Le site public sera actualisé automatiquement.");
  await loadAdminVideos();
}

async function saveVideoCategory(video, select, button) {
  button.disabled = true;
  const nextCategoryId = select.value || null;
  const nextSortOrder = nextCategoryId === (video.category_id || null)
    ? Number(video.sort_order)
    : getNextVideoSortOrder(nextCategoryId, video.id);
  const { error } = await db.from("videos")
    .update({
      category_id: nextCategoryId,
      sort_order: nextSortOrder
    })
    .eq("id", video.id);
  button.disabled = false;
  if (error) {
    showMessage(videoMessage, "Impossible de déplacer cette vidéo : " + error.message);
    return;
  }
  showMessage(videoMessage, "Catégorie de « " + video.title + " » mise à jour.");
  await loadAdminCategories();
  await loadAdminVideos();
}

async function loadAdminVideos() {
  showMessage(videoMessage, "Chargement des vidéos...");
  videoList.innerHTML = "";

  const { data: videos, error } = await db
    .from("videos")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    showMessage(videoMessage, "Impossible d'actualiser la liste : " + error.message);
    return;
  }

  const libraryVideos = videos.filter(video => {
    if (!video.announcement_id) return true;
    const linkedAnnouncement = announcementsCache.find(item => item.id === video.announcement_id);
    return linkedAnnouncement?.media_type !== "video";
  });

  adminVideosCache = videos;
  renderCategoryManager();
  showMessage(videoMessage, "");
  adminCount.textContent = libraryVideos.length + " vidéo(s)";

  const totalViews = libraryVideos.reduce((sum, video) => sum + Number(video.views || 0), 0);
  const totalDownloads = libraryVideos.reduce((sum, video) => sum + Number(video.downloads || 0), 0);
  document.getElementById("stat-total").textContent = libraryVideos.length.toLocaleString("fr-FR");
  document.getElementById("stat-published").textContent = libraryVideos.filter(video => video.is_published).length.toLocaleString("fr-FR");
  document.getElementById("stat-views").textContent = totalViews.toLocaleString("fr-FR");
  document.getElementById("stat-downloads").textContent = totalDownloads.toLocaleString("fr-FR");

  if (activeAdminCategoryId && !categoriesCache.some(category => category.id === activeAdminCategoryId)) activeAdminCategoryId = null;
  const currentCategory = categoriesCache.find(category => category.id === activeAdminCategoryId) || null;
  const visibleVideos = currentCategory
    ? libraryVideos.filter(video => video.category_id === currentCategory.id && !video.announcement_id)
    : libraryVideos.filter(video => !video.category_id || Boolean(video.announcement_id));

  if (currentCategory) {
    const navigation = document.createElement("div");
    navigation.className = "category-navigation";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "alt category-back";
    back.textContent = "← Retour aux dossiers";
    back.addEventListener("click", async () => {
      activeAdminCategoryId = null;
      await loadAdminVideos();
      categoryList?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const heading = document.createElement("h3");
    heading.textContent = currentCategory.name + " · " + visibleVideos.length + (visibleVideos.length > 1 ? " vidéos" : " vidéo");
    navigation.append(back, heading);
    videoList.append(navigation);
  } else {
    const heading = document.createElement("p");
    heading.className = "category-list-hint";
    heading.textContent = "Vidéos sans catégorie · ouvre un dossier ci-dessus pour consulter les vidéos classées.";
    videoList.append(heading);
  }

  adminCount.textContent = visibleVideos.length + " vidéo(s) affichée(s)";
  if (visibleVideos.length === 0) {
    const message = document.createElement("p");
    message.className = "cover-help";
    message.textContent = currentCategory ? "Ce dossier ne contient encore aucune vidéo." : "Aucune vidéo sans catégorie. Ouvre un dossier pour consulter les vidéos classées.";
    videoList.append(message);
    return;
  }

  for (const video of visibleVideos) {
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
    status.textContent = video.provider === "mux" && video.mux_status !== "ready"
      ? "Statut : " + (video.mux_status === "errored" ? "Erreur de traitement Mux" : video.mux_status === "upload_failed" ? "Échec de l'envoi Mux" : "Traitement Mux en cours")
      : video.is_published ? "Statut : Publiée" : "Statut : Non publiée";

    const categoryLabel = document.createElement("p");
    const videoCategory = categoriesCache.find(category => category.id === video.category_id);
    categoryLabel.textContent = video.announcement_id ? "Annonce liée · conservée hors des catégories" : "Catégorie : " + (videoCategory?.name || "Aucune catégorie");
    const categoryControls = document.createElement("div");
    categoryControls.className = "category-video-controls";
    if (!video.announcement_id) {
    const categoryMoveSelect = document.createElement("select");
    categoryMoveSelect.setAttribute("aria-label", "Déplacer " + video.title + " vers une catégorie");
    const noCategoryOption = document.createElement("option");
    noCategoryOption.value = "";
    noCategoryOption.textContent = "Aucune catégorie";
    categoryMoveSelect.append(noCategoryOption);
    for (const category of categoriesCache) {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      categoryMoveSelect.append(option);
    }
    categoryMoveSelect.value = video.category_id || "";
    const moveButton = document.createElement("button");
    moveButton.type = "button";
    moveButton.className = "alt";
    moveButton.textContent = "Déplacer";
    moveButton.addEventListener("click", () => saveVideoCategory(video, categoryMoveSelect, moveButton));
    categoryControls.append(categoryMoveSelect, moveButton);
    }

    const sortableVideos = visibleVideos.filter(item => !item.announcement_id);
    const videoOrderIndex = sortableVideos.findIndex(item => item.id === video.id);
    let orderControls = null;
    if (!video.announcement_id && videoOrderIndex !== -1) {
      orderControls = document.createElement("div");
      orderControls.className = "video-order-controls";
      const orderLabel = document.createElement("span");
      orderLabel.textContent = "Ordre public";
      const moveUp = document.createElement("button");
      moveUp.type = "button";
      moveUp.className = "alt";
      moveUp.textContent = "↑ Monter";
      moveUp.disabled = videoOrderIndex === 0;
      moveUp.setAttribute("aria-label", "Monter " + video.title + " dans l’ordre public");
      moveUp.addEventListener("click", async () => {
        const reordered = [...sortableVideos];
        [reordered[videoOrderIndex - 1], reordered[videoOrderIndex]] =
          [reordered[videoOrderIndex], reordered[videoOrderIndex - 1]];
        moveUp.disabled = true;
        moveDown.disabled = true;
        await saveVideoOrder(reordered);
      });
      const moveDown = document.createElement("button");
      moveDown.type = "button";
      moveDown.className = "alt";
      moveDown.textContent = "↓ Descendre";
      moveDown.disabled = videoOrderIndex === sortableVideos.length - 1;
      moveDown.setAttribute("aria-label", "Descendre " + video.title + " dans l’ordre public");
      moveDown.addEventListener("click", async () => {
        const reordered = [...sortableVideos];
        [reordered[videoOrderIndex], reordered[videoOrderIndex + 1]] =
          [reordered[videoOrderIndex + 1], reordered[videoOrderIndex]];
        moveUp.disabled = true;
        moveDown.disabled = true;
        await saveVideoOrder(reordered);
      });
      orderControls.append(orderLabel, moveUp, moveDown);
    }

    const providerLabel = document.createElement("p");
    const providerNames = { cloudinary: "Cloudinary", vioo: "Vioo", dropbox: "Dropbox", onedrive: "OneDrive", deepstorage: "DeepStorage", mux: "Mux", bunny: "Bunny Stream", r2: "Cloudflare R2" };
    providerLabel.textContent = "Hébergeur : " + (providerNames[video.provider] || "Cloudinary");

    const actions = document.createElement("div");
    actions.className = "admin-actions";

    const editButton = document.createElement("button");
    editButton.textContent = "Modifier";
    editButton.addEventListener("click", () => editVideo(video));

    const publishButton = document.createElement("button");
    publishButton.className = "alt";
    publishButton.textContent = video.is_published ? "Dépublier" : "Publier";
    publishButton.disabled = video.provider === "mux" && video.mux_status !== "ready";
    publishButton.addEventListener("click", () => togglePublication(video));

    const deleteButton = document.createElement("button");
    deleteButton.className = "alt";
    deleteButton.textContent = "Supprimer + couverture";
    deleteButton.addEventListener("click", () => deleteVideo(video));

    const resetStatsButton = document.createElement("button");
    resetStatsButton.className = "danger";
    resetStatsButton.textContent = "Réinitialiser les compteurs";
    resetStatsButton.addEventListener("click", () => resetVideoStatistics(video.id, video.title));

    const permanentDeleteButton = document.createElement("button");
    permanentDeleteButton.className = "danger";
    permanentDeleteButton.textContent = "Supprimer vidéo + couverture";
    permanentDeleteButton.addEventListener("click", () => permanentlyDeleteVideo(video));

    actions.append(editButton, publishButton, deleteButton, resetStatsButton);
    if (video.provider === "mux" && video.mux_status === "ready") {
      const muxDownloadButton = document.createElement("button");
      muxDownloadButton.className = "alt";
      if (video.download_url) {
        muxDownloadButton.textContent = "Téléchargement activé";
        muxDownloadButton.disabled = true;
      } else if (muxDownloadsPreparing.has(video.id)) {
        muxDownloadButton.textContent = "MP4 en préparation…";
        muxDownloadButton.disabled = true;
      } else {
        muxDownloadButton.textContent = "Activer téléchargement MP4";
        muxDownloadButton.addEventListener("click", () => prepareMuxDownload(video, muxDownloadButton));
      }
      actions.append(muxDownloadButton);
    }
    if (["cloudinary", "mux", "r2"].includes(video.provider || "cloudinary") &&
        ((video.provider || "cloudinary") !== "mux" || Boolean(video.mux_asset_id)) &&
        ((video.provider || "cloudinary") !== "r2" || Boolean(video.playback_url))) {
      actions.append(permanentDeleteButton);
    }
    card.append(title, description, views, downloads, status, categoryLabel, categoryControls);
    if (orderControls) card.append(orderControls);
    card.append(providerLabel, actions);
    videoList.append(card);
  }
}

function editVideo(video) {
  editingId = video.id;
  editingVideo = video;
  categorySelect.value = video.category_id || "";
  announcementSelect.value = video.announcement_id || "";
  videoFormat = video.format || "mp4";
  currentThumbnailUrl = video.thumbnail_url || null;
  providerSelect.value = video.provider || "cloudinary";
  oneDriveDownloadUrlInput.value = "";

  document.getElementById("video-name").value = video.title;
  document.getElementById("video-description").value = video.description || "";
  cloudinaryIdInput.value = video.cloudinary_public_id || "";

  if (providerSelect.value === "vioo") {
    viooIdInput.value = video.playback_url || "";
    viooThumbnailInput.value = video.thumbnail_url || "";
    dropboxUrlInput.value = "";
  } else if (providerSelect.value === "dropbox") {
    dropboxUrlInput.value = (video.playback_url || "").replace(/([?&])raw=1(&|$)/, "$1dl=0$2").replace(/[?&]$/, "");
    viooIdInput.value = "";
    viooThumbnailInput.value = "";
    oneDriveUrlInput.value = "";
  } else if (providerSelect.value === "onedrive") {
    oneDriveUrlInput.value = video.playback_url || "";
    oneDriveDownloadUrlInput.value = video.download_url || "";
    refreshOneDriveHelper();
    viooIdInput.value = "";
    viooThumbnailInput.value = "";
    dropboxUrlInput.value = "";
  } else if (providerSelect.value === "bunny") {
    const bunnyMatch = String(video.playback_url || "").match(/\/embed\/\d+\/([^/?#]+)/);
    bunnyVideoIdInput.value = bunnyMatch ? decodeURIComponent(bunnyMatch[1]) : "";
    bunnyDownloadUrlInput.value = video.download_url || "";
    viooIdInput.value = "";
    viooThumbnailInput.value = "";
    dropboxUrlInput.value = "";
    oneDriveUrlInput.value = "";
  } else {
    bunnyVideoIdInput.value = "";
    bunnyDownloadUrlInput.value = "";
    viooIdInput.value = "";
    viooThumbnailInput.value = "";
    dropboxUrlInput.value = "";
    oneDriveUrlInput.value = "";
  }

  if (currentThumbnailUrl) {
    displayCoverPreview(currentThumbnailUrl, "Couverture actuellement enregistrée");
  } else {
    clearCoverPreview();
  }
  updateProviderFields();

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

async function uploadToImageKit(file) {
  const { data: auth, error: authError } = await db.functions.invoke("imagekit-upload-auth", { body: {} });
  if (authError) {
    let details = authError.message || "Impossible d'obtenir l'autorisation ImageKit.";
    try {
      if (authError.context && typeof authError.context.json === "function") {
        const payload = await authError.context.json();
        details = payload.error || payload.message || details;
      }
    } catch {}
    throw new Error(details);
  }
  if (!auth?.token || !auth?.signature || !auth?.expire || !auth?.publicKey) {
    throw new Error("Supabase n'a pas fourni les paramètres sécurisés d'envoi ImageKit.");
  }
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("fileName", file.name);
  form.append("publicKey", auth.publicKey);
  form.append("token", auth.token);
  form.append("expire", String(auth.expire));
  form.append("signature", auth.signature);
  form.append("folder", "/zeno-covers");
  form.append("useUniqueFileName", "true");
  form.append("isPrivateFile", "false");
  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://upload.imagekit.io/api/v1/files/upload");
    xhr.timeout = 300000;
    xhr.upload.addEventListener("progress", event => {
      const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null;
      showMessage(videoMessage, percent === null ? "Envoi de la miniature vers ImageKit…" : "Envoi de la miniature vers ImageKit : " + percent + "%");
    });
    xhr.addEventListener("load", () => {
      let uploaded;
      try { uploaded = JSON.parse(xhr.responseText || "{}"); }
      catch { reject(new Error("Réponse illisible d'ImageKit (HTTP " + xhr.status + ").")); return; }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(uploaded.message || uploaded.help || "ImageKit a refusé l'image (HTTP " + xhr.status + ")."));
        return;
      }
      if (!uploaded.url || !uploaded.fileId) {
        reject(new Error("ImageKit n'a pas renvoyé l'URL publique attendue."));
        return;
      }
      resolve(uploaded);
    });
    xhr.addEventListener("error", () => reject(new Error("Connexion interrompue pendant l'envoi vers ImageKit.")));
    xhr.addEventListener("timeout", () => reject(new Error("L'envoi vers ImageKit a dépassé 5 minutes.")));
    xhr.addEventListener("abort", () => reject(new Error("Envoi ImageKit annulé.")));
    xhr.send(form);
  });
}

function uploadToMux(file, uploadUrl) {
  return new Promise((resolve, reject) => {
    const upChunkLibrary = window.UpChunk;
    if (!upChunkLibrary?.createUpload) {
      reject(new Error("Le module d'envoi Mux n'a pas pu se charger. Recharge la page puis réessaie."));
      return;
    }

    const startedAt = Date.now();
    let lastProgressAt = startedAt;
    let lastProgressBytes = 0;
    let currentChunk = null;
    let retryCount = 0;
    let averageSpeed = 0;

    const formatUploadDuration = seconds => {
      if (!Number.isFinite(seconds) || seconds < 0) return "—";
      const total = Math.ceil(seconds);
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const secs = total % 60;
      if (hours) return hours + " h " + minutes + " min";
      if (minutes) return minutes + " min " + secs + " s";
      return secs + " s";
    };

    const formatUploadSpeed = bytesPerSecond => {
      if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "calcul…";
      return (bytesPerSecond / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " Mo/s";
    };

    const upload = upChunkLibrary.createUpload({
      endpoint: uploadUrl,
      file,
      chunkSize: 10240,
      attempts: 5,
      dynamicChunkSize: true,
      minChunkSize: 5120,
      maxChunkSize: 30720
    });

    upload.on("attempt", event => {
      const detail = event.detail || {};
      currentChunk = Number.isFinite(Number(detail.chunkNumber)) ? Number(detail.chunkNumber) + 1 : null;
    });

    upload.on("attemptFailure", () => {
      retryCount++;
    });

    upload.on("progress", event => {
      const percent = Math.max(0, Math.min(100, Number(event.detail) || 0));
      const now = Date.now();
      const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1000);
      const uploadedBytes = file.size * percent / 100;
      const intervalSeconds = Math.max(0.001, (now - lastProgressAt) / 1000);
      const intervalBytes = Math.max(0, uploadedBytes - lastProgressBytes);
      const instantSpeed = intervalBytes / intervalSeconds;
      averageSpeed = uploadedBytes / elapsedSeconds;
      const remainingSeconds = averageSpeed > 0
        ? ((file.size - uploadedBytes) / averageSpeed)
        : NaN;
      const details = [
        "Envoi reprenable vers Mux : " + Math.round(percent) + "%",
        "débit moyen " + formatUploadSpeed(averageSpeed),
        "débit récent " + formatUploadSpeed(instantSpeed),
        "écoulé " + formatUploadDuration(elapsedSeconds),
        "restant estimé " + formatUploadDuration(remainingSeconds),
        "reprises " + retryCount
      ];
      if (currentChunk !== null) details.push("morceau " + currentChunk);
      showMessage(muxStatusElement || videoMessage, details.join(" · "));
      lastProgressAt = now;
      lastProgressBytes = uploadedBytes;
    });

    upload.on("offline", () => showMessage(muxStatusElement || videoMessage, "Connexion interrompue : Mux met l'envoi en pause et le reprendra automatiquement. Temps écoulé : " + formatUploadDuration((Date.now() - startedAt) / 1000) + "."));
    upload.on("online", () => showMessage(muxStatusElement || videoMessage, "Connexion rétablie : reprise de l'envoi vers Mux… Reprises détectées : " + retryCount + "."));
    upload.on("error", event => {
      reject(new Error(event.detail?.message || "Le transfert vers Mux a échoué après plusieurs tentatives."));
    });
    upload.on("success", () => {
      showMessage(muxStatusElement || videoMessage, "✓ Envoi terminé vers Mux à 100 % · durée " + formatUploadDuration((Date.now() - startedAt) / 1000) + " · reprises " + retryCount + ". Mux commence maintenant le traitement.");
      resolve();
    });
  });
}

function getR2ContentType(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mkv") return "video/x-matroska";
  return file.type || "application/octet-stream";
}

async function uploadToR2(file) {
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  const session = sessionData?.session;
  if (sessionError || !session?.access_token) throw new Error("Ta session administrateur a expiré. Reconnecte-toi avant l'envoi vers R2.");

  const authHeaders = { Authorization: "Bearer " + session.access_token, apikey: SUPABASE_KEY };
  const requestJson = async (path, method, body) => {
    const response = await fetch(new URL(path, R2_WORKER_URL), {
      method, headers: { ...authHeaders, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Cloudflare R2 a refusé la demande (HTTP " + response.status + ").");
    return data;
  };
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  // IndexedDB conserve l'identifiant multipart et les ETags, jamais le contenu du fichier.
  // Après fermeture/rechargement, il suffit de sélectionner à nouveau exactement le même fichier.
  const fileId = [file.name, file.size, file.lastModified].join("|");
  const openResumeDb = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("Ce navigateur ne permet pas la sauvegarde de reprise R2. Utilise un navigateur Android récent."));
    const request = window.indexedDB.open("zeno-video-r2-resume", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("uploads")) request.result.createObjectStore("uploads", { keyPath: "fileId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Impossible d'ouvrir la sauvegarde locale de reprise R2."));
    request.onblocked = () => reject(new Error("La sauvegarde locale R2 est bloquée par un autre onglet. Ferme les autres onglets Zeno Video et réessaie."));
  });
  const runResumeStore = async (mode, action) => {
    const database = await openResumeDb();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("uploads", mode);
      const request = action(transaction.objectStore("uploads"));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error("Erreur de sauvegarde de la reprise R2."));
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Erreur de sauvegarde de la reprise R2.")); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Sauvegarde de la reprise R2 annulée.")); };
    });
  };
  const readResume = () => runResumeStore("readonly", store => store.get(fileId));
  const readAllResumes = () => runResumeStore("readonly", store => store.getAll());
  const saveResume = value => runResumeStore("readwrite", store => store.put({ ...value, updatedAt: Date.now() }));
  const deleteResume = resumeId => runResumeStore("readwrite", store => store.delete(resumeId));
  const clearResume = () => deleteResume(fileId);

  let state;
  let isResuming = false;
  try {
    state = await readResume();
    if (state) {
      if (!state.key || !state.uploadId || state.fileId !== fileId) {
        throw new Error("Une ancienne session R2 existe pour ce fichier, mais ses informations sont incomplètes. Elle a été conservée ; aucun nouvel envoi n'a été lancé.");
      }
      isResuming = true;
    } else {
      const savedUploads = await readAllResumes();
      const pendingUploads = savedUploads.filter(item =>
        item && item.fileId && item.key && item.uploadId && Array.isArray(item.parts)
      );
      const matchingUploads = pendingUploads.filter(item =>
        item.filename === file.name && Number(item.size) === file.size
      );

      if (matchingUploads.length > 1) {
        const choices = matchingUploads
          .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
          .map((item, index) => (index + 1) + ". " + item.filename + " · " +
            new Date(Number(item.updatedAt || item.createdAt || 0)).toLocaleString("fr-FR") +
            " · " + (item.parts?.length || 0) + " partie(s)")
          .join("\n");
        throw new Error("Plusieurs anciennes sessions correspondent au nom et à la taille de ce fichier. Aucune n'a été modifiée et aucun nouvel envoi n'a été lancé. Détails :\n" + choices);
      }

      if (matchingUploads.length === 1) {
        const previous = matchingUploads[0];
        const sameModified = Number(previous.lastModified) === Number(file.lastModified);
        const prompt = sameModified
          ? "Une session R2 inachevée correspondant à ce fichier a été retrouvée (" + (previous.parts?.length || 0) +
            " partie(s) conservée(s)). Veux-tu reprendre cette session ?"
          : "Une session R2 inachevée a été retrouvée pour « " + previous.filename + " » (" +
            Number(previous.size).toLocaleString("fr-FR") + " octets, " + (previous.parts?.length || 0) +
            " partie(s) conservée(s)), mais sa date de modification diffère de celle du fichier sélectionné.\n\nConfirme uniquement si tu as sélectionné exactement la même vidéo, sans modification. Reprendre cette session ?";
        if (!window.confirm(prompt)) {
          throw new Error("Ancienne session R2 conservée. Aucun nouvel envoi n'a été lancé.");
        }
        state = { ...previous, fileId, lastModified: file.lastModified };
        await saveResume(state);
        if (previous.fileId !== fileId) await deleteResume(previous.fileId);
        isResuming = true;
      } else if (pendingUploads.length) {
        const summary = pendingUploads.slice(0, 5).map(item =>
          "• " + item.filename + " · " + Number(item.size).toLocaleString("fr-FR") +
          " octets · " + (item.parts?.length || 0) + " partie(s)"
        ).join("\n");
        const more = pendingUploads.length > 5 ? "\n… et " + (pendingUploads.length - 5) + " autre(s)." : "";
        if (!window.confirm("D'autres sessions R2 inachevées sont sauvegardées sur cet appareil :\n" +
          summary + more + "\n\nElles seront conservées. Veux-tu démarrer un nouvel envoi pour le fichier sélectionné ?")) {
          throw new Error("Nouvel envoi annulé. Les anciennes sessions R2 sont conservées.");
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && /Aucune n'a été modifiée|Ancienne session|Nouvel envoi annulé|Une ancienne session/.test(error.message)) throw error;
    throw new Error("Impossible de sécuriser la reprise de cet envoi : " + (error.message || String(error)));
  }

  if (isResuming) {
    // Récupère aussi le cas où R2 avait terminé mais où la réponse finale s'était perdue.
    const mediaPath = "/media/" + state.key.split("/").map(encodeURIComponent).join("/");
    try {
      const head = await fetch(new URL(mediaPath, R2_WORKER_URL), { method: "HEAD" });
      if (head.ok) {
        const result = { key: state.key, url: new URL(mediaPath, R2_WORKER_URL).toString(),
          size: Number(head.headers.get("Content-Length")) || file.size,
          contentType: head.headers.get("Content-Type") || file.type || "application/octet-stream",
          etag: head.headers.get("ETag") || null };
        await clearResume().catch(error => console.warn("Zeno Video R2: nettoyage local impossible.", error));
        return result;
      }
    } catch (error) { console.warn("Zeno Video R2: vérification de reprise différée.", error); }
  }

  if (!isResuming) {
    const created = await requestJson("/multipart/create", "POST", {
      filename: file.name, size: file.size, contentType: getR2ContentType(file)
    });
    if (!created.key || !created.uploadId || !Number.isSafeInteger(created.partSize) || created.partSize < 5 * 1024 * 1024) {
      throw new Error("Cloudflare R2 n'a pas renvoyé les paramètres multipart attendus.");
    }
    const count = Math.ceil(file.size / created.partSize);
    if (count < 1 || count > 10000 || created.partCount !== count) throw new Error("Le nombre de parties du téléversement R2 est invalide.");
    state = { fileId, filename: file.name, size: file.size, lastModified: file.lastModified,
      key: created.key, uploadId: created.uploadId, partSize: created.partSize, partCount: count,
      parts: [], createdAt: Date.now(), updatedAt: Date.now() };
    try { await saveResume(state); }
    catch (error) { throw new Error("L'envoi n'a pas commencé : impossible d'enregistrer son identifiant de reprise sur cet appareil. " + (error.message || String(error))); }
  }

  if (state.filename !== file.name || state.size !== file.size || state.lastModified !== file.lastModified) {
    throw new Error("Le fichier sélectionné ne correspond pas à l'envoi interrompu. Sélectionne exactement le même fichier pour reprendre.");
  }
  const partCount = Math.ceil(file.size / state.partSize);
  if (!state.key || !state.uploadId || !Number.isSafeInteger(state.partSize) || state.partSize < 5 * 1024 * 1024 ||
      state.partCount !== partCount || !Array.isArray(state.parts)) {
    throw new Error("Les informations de reprise R2 sont incomplètes. L'envoi conservé n'a pas été supprimé.");
  }

  const uploadedParts = new Array(partCount);
  for (const part of state.parts) {
    const number = Number(part?.partNumber);
    if (Number.isInteger(number) && number >= 1 && number <= partCount && part.etag) {
      uploadedParts[number - 1] = { partNumber: number, etag: String(part.etag) };
    }
  }
  let completedBytes = 0;
  for (let index = 0; index < partCount; index++) {
    if (uploadedParts[index]) completedBytes += Math.min(state.partSize, file.size - index * state.partSize);
  }
  const progressByPart = new Map();
  const reportProgress = () => {
    let activeBytes = 0;
    for (const value of progressByPart.values()) activeBytes += value;
    const sent = Math.min(file.size, completedBytes + activeBytes);
    const percent = Math.min(100, Math.round(sent / file.size * 100));
    const message = (isResuming ? "Reprise Cloudflare R2 : " : "Envoi vers Cloudflare R2 : ") + percent +
      "% (" + sent.toLocaleString("fr-FR") + " / " + file.size.toLocaleString("fr-FR") + " octets)";
    showMessage(videoMessage, message);
    if (r2StatusElement) r2StatusElement.textContent = message;
  };

  if (isResuming) {
    const savedCount = uploadedParts.filter(Boolean).length;
    const message = "Reprise R2 : " + savedCount + " partie(s) déjà envoyée(s) conservée(s).";
    showMessage(videoMessage, message);
    if (r2StatusElement) r2StatusElement.textContent = message;
  }

  const uploadPart = async index => {
    const partNumber = index + 1, startByte = index * state.partSize;
    const endByte = Math.min(file.size, startByte + state.partSize), chunk = file.slice(startByte, endByte);
    const partUrl = new URL("/multipart/part", R2_WORKER_URL);
    partUrl.searchParams.set("key", state.key);
    partUrl.searchParams.set("uploadId", state.uploadId);
    partUrl.searchParams.set("partNumber", String(partNumber));
    const send = () => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", partUrl.toString());
      xhr.timeout = 10 * 60 * 1000;
      xhr.setRequestHeader("Authorization", authHeaders.Authorization);
      xhr.setRequestHeader("apikey", authHeaders.apikey);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.addEventListener("progress", event => {
        if (event.lengthComputable) { progressByPart.set(partNumber, Math.min(chunk.size, event.loaded)); reportProgress(); }
      });
      xhr.addEventListener("load", () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
        if (xhr.status < 200 || xhr.status >= 300 || !data.etag || Number(data.partNumber) !== partNumber) {
          reject(new Error(data.error || "Échec de la partie " + partNumber + " (HTTP " + xhr.status + ")."));
          return;
        }
        resolve(data);
      });
      xhr.addEventListener("error", () => reject(new Error("Connexion interrompue pendant l'envoi de la partie " + partNumber + " (HTTP " + (xhr.status || "aucune réponse") + "). Vérifie la connexion puis réessaie.")));
      xhr.addEventListener("timeout", () => reject(new Error("Délai dépassé pendant l'envoi de la partie " + partNumber + ".")));
      xhr.addEventListener("abort", () => reject(new Error("Envoi de la partie " + partNumber + " interrompu par le navigateur.")));
      xhr.send(chunk);
    });

    let lastError;
    for (let attempt = 1; attempt <= 5; attempt++) {
      progressByPart.set(partNumber, 0);
      try {
        const uploaded = await send();
        uploadedParts[index] = { partNumber, etag: uploaded.etag };
        state.parts = uploadedParts.filter(Boolean);
        // ETag écrit immédiatement : seule la partie en cours peut devoir être renvoyée.
        await saveResume(state);
        completedBytes += chunk.size;
        progressByPart.delete(partNumber);
        reportProgress();
        return;
      } catch (error) {
        lastError = error;
        progressByPart.delete(partNumber);
        reportProgress();
        if (attempt < 5) {
          const delay = Math.min(12000, 1500 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 250);
          showMessage(videoMessage, "Partie " + partNumber + " : nouvelle tentative " + (attempt + 1) +
            "/5 dans " + (delay / 1000).toFixed(1) + " s…");
          await sleep(delay);
        }
      }
    }
    throw new Error("La partie " + partNumber + " a échoué après 5 tentatives. " + (lastError?.message || "Erreur réseau."));
  };

  try {
    // Un seul bloc à la fois. Les blocs dont l'ETag est déjà sauvegardé sont ignorés.
    for (let index = 0; index < partCount; index++) {
      if (uploadedParts[index]) continue;
      await uploadPart(index);
    }
    showMessage(videoMessage, "Toutes les parties sont conservées. Finalisation de la vidéo dans R2…");
    if (r2StatusElement) r2StatusElement.textContent = "Finalisation du fichier…";
    const completePath = "/multipart/complete?key=" + encodeURIComponent(state.key) +
      "&uploadId=" + encodeURIComponent(state.uploadId);
    const result = await requestJson(completePath, "POST", { parts: uploadedParts });
    if (!result.url || !result.key) throw new Error("Cloudflare R2 n'a pas renvoyé l'URL publique attendue.");
    await clearResume().catch(error => console.warn("Zeno Video R2 : nettoyage local impossible.", error));
    return result;
  } catch (error) {
    const percent = Math.round(completedBytes / file.size * 100);
    const message = "Envoi interrompu à " + percent + "%. Les " + uploadedParts.filter(Boolean).length +
      " partie(s) déjà envoyées sont conservées sur cet appareil. Reconnecte-toi, sélectionne exactement le même fichier, " +
      "puis relance l'envoi pour reprendre. Détail : " + (error?.message || String(error));
    showMessage(videoMessage, message);
    if (r2StatusElement) r2StatusElement.textContent = message;
    // Ne jamais annuler le multipart après une erreur réseau : l'envoi doit rester reprenable.
    throw new Error(message);
  }
}
async function loadR2Usage() {
  const status = document.getElementById("r2-hosting-settings-status");
  if (!hostingUsageCards) return;
  try {
    const { data: sessionData, error: sessionError } = await db.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (sessionError || !token) throw new Error("Session administrateur indisponible.");
    const response = await fetch(R2_WORKER_URL + "/admin/usage", {
      headers: { Authorization: "Bearer " + token, apikey: SUPABASE_KEY }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Statistiques R2 indisponibles (HTTP " + response.status + ").");
    r2Status = { available: true, message: "✓ Worker R2 connecté · bucket " + data.bucket + (data.complete ? "" : " · mesure partielle") };
    if (status) {
      status.textContent = r2Status.message;
      status.className = "admin-message success";
    }
    const card = document.createElement("article");
    card.className = "hosting-usage-card";
    const heading = document.createElement("div");
    heading.className = "hosting-usage-heading";
    const title = document.createElement("h3");
    title.textContent = "Cloudflare R2";
    const state = document.createElement("span");
    state.className = "hosting-usage-status " + (data.complete ? "ok" : "partial");
    state.textContent = data.complete ? "Mesure disponible" : "Mesure partielle";
    heading.append(title, state);
    card.appendChild(heading);
    addHostingMetric(card, "Vidéos liées dans Zeno", formatUsageNumber(adminVideosCache.filter(video => video.provider === "r2").length, 0));
    addHostingMetric(card, "Objets dans le bucket", formatUsageNumber(data.objectCount, 0));
    addHostingMetric(card, "Stockage R2 utilisé", formatUsageBytes(data.totalBytes));
    addHostingMetric(card, "Bucket", data.bucket);
    if (data.note) addHostingMetric(card, "Note", data.note);
    hostingUsageCards.appendChild(card);
  } catch (error) {
    r2Status = { available: false, message: error.message || "Worker R2 non joignable." };
    if (status) {
      status.textContent = "R2 non vérifié : " + r2Status.message;
      status.className = "admin-message status-pending";
    }
    const card = document.createElement("article");
    card.className = "hosting-usage-card";
    const title = document.createElement("h3");
    title.textContent = "Cloudflare R2";
    const note = document.createElement("p");
    note.textContent = "Statistiques indisponibles : " + r2Status.message;
    card.append(title, note);
    hostingUsageCards.appendChild(card);
  }
}

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const provider = providerSelect.value;
  const title = document.getElementById("video-name").value.trim();
  const description = document.getElementById("video-description").value.trim();
  const selectedFile = provider === "cloudinary"
    ? videoFileInput.files[0]
    : provider === "deepstorage" ? deepStorageFileInput.files[0]
    : provider === "mux" ? muxFileInput.files[0]
    : provider === "r2" ? r2FileInput.files[0] : null;
  const selectedCover = coverFileInput.files[0];
  const selectedAnnouncementId = announcementSelect.value || null;
  const selectedAnnouncement = selectedAnnouncementId ? announcementsCache.find(item => item.id === selectedAnnouncementId) : null;
  if (selectedAnnouncement) currentThumbnailUrl = selectedAnnouncement.cover_url || currentThumbnailUrl;
  let publicId = provider === "cloudinary" ? cloudinaryIdInput.value.trim() : null;
  let thumbnail = provider === "vioo"
    ? (viooThumbnailInput.value.trim() || currentThumbnailUrl)
    : currentThumbnailUrl;
  let thumbnailProvider = editingVideo?.thumbnail_provider || null;
  let thumbnailCloudinaryPublicId = editingVideo?.thumbnail_cloudinary_public_id || null;
  let thumbnailImageKitFileId = editingVideo?.thumbnail_imagekit_file_id || null;
  let playbackUrl = null;
  let downloadUrl = null;
  let coverWarning = "";
  let muxUploadStarted = false;
  let muxVideoId = null;
  let coverAlreadyUploaded = false;

  if (!title) {
    showMessage(videoMessage, "Indique un titre pour la vidéo.");
    return;
  }

  if (provider === "r2" && !editingId && !selectedFile) {
    showMessage(videoMessage, "Choisis le fichier vidéo à envoyer sur Cloudflare R2.");
    return;
  }

  if (provider === "r2" && editingId && editingVideo?.provider !== "r2" && !selectedFile) {
    showMessage(videoMessage, "Pour changer l’hébergement d’une vidéo existante vers R2, sélectionne son nouveau fichier.");
    return;
  }

  if (provider === "r2" && selectedFile && selectedFile.size > R2_MAX_UPLOAD_BYTES) {
    showMessage(videoMessage, "La limite actuelle de Cloudflare R2 est de 500 Mio par vidéo.");
    return;
  }

  if (provider === "mux" && !editingId && !selectedFile) {
    showMessage(videoMessage, "Choisis le fichier vidéo à envoyer sur Mux.");
    return;
  }

  if (provider === "mux" && editingId && editingVideo?.provider !== "mux") {
    showMessage(videoMessage, "Pour changer une vidéo existante vers Mux, ajoute-la comme nouvelle vidéo plutôt que de remplacer son hébergement.");
    return;
  }

  if (provider === "deepstorage" && !editingId && !selectedFile) {
    showMessage(videoMessage, "Choisis le fichier vidéo à envoyer sur DeepStorage.");
    return;
  }

  if (provider === "deepstorage" && selectedFile && !deepStorageStatus.available) {
    showMessage(videoMessage, deepStorageStatus.message || "L'accès API DeepStorage n'est pas disponible. Choisis un autre hébergeur.");
    await checkDeepStorageAvailability(true);
    return;
  }

  if (provider === "cloudinary" && !editingId && !selectedFile && !publicId) {
    showMessage(videoMessage, "Choisis un fichier vidéo ou saisis un identifiant public Cloudinary.");
    return;
  }

  if (provider === "bunny" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bunnyVideoIdInput.value.trim())) {
    showMessage(videoMessage, "Indique un identifiant vidéo Bunny Stream valide (format UUID).");
    bunnyVideoIdInput.focus();
    return;
  }

  if (provider === "bunny" && bunnyDownloadUrlInput.value.trim()) {
    try {
      const bunnyDownloadUrl = new URL(bunnyDownloadUrlInput.value.trim());
      if (bunnyDownloadUrl.protocol !== "https:" || bunnyDownloadUrl.username || bunnyDownloadUrl.password) throw new Error();
    } catch {
      showMessage(videoMessage, "Le lien de téléchargement Bunny doit être une URL HTTPS valide.");
      bunnyDownloadUrlInput.focus();
      return;
    }
  }

  if (provider === "vioo" && !viooIdInput.value.trim()) {
    showMessage(videoMessage, "Indique l'identifiant ou le lien du lecteur Vioo.");
    return;
  }

  if (provider === "dropbox" && !dropboxUrlInput.value.trim()) {
    showMessage(videoMessage, "Colle le lien de partage Dropbox de la vidéo.");
    return;
  }

  if (provider === "onedrive" && !oneDriveUrlInput.value.trim()) {
    showMessage(videoMessage, "Colle le lien de lecteur OneDrive.");
    return;
  }

  if (provider === "onedrive" && !oneDriveDownloadUrlInput.value.trim()) {
    showMessage(videoMessage, "Colle aussi le lien de partage OneDrive classique pour activer le téléchargement.");
    oneDriveDownloadUrlInput.focus();
    return;
  }

  if (provider === "onedrive" && !isOneDriveEmbedUrl(oneDriveUrlInput.value)) {
    showMessage(videoMessage, "Ce lien semble être un lien de partage classique, pas un lien d’intégration. Utilise le bouton « Copier le lien et ouvrir ChatGPT », récupère le lien embed puis remplace celui-ci avant d’enregistrer.");
    refreshOneDriveHelper();
    return;
  }

  if (selectedFile) {
    const selectedExtension = selectedFile.name.split(".").pop()?.toLowerCase();
    const isR2Mkv = provider === "r2" && selectedExtension === "mkv";
    const allowedVideoType = ["video/mp4", "video/quicktime", "video/webm"].includes(selectedFile.type);
    if (!isR2Mkv && !allowedVideoType) {
      showMessage(videoMessage, provider === "r2"
        ? "Format non accepté. Choisis un fichier MP4, MOV, WebM ou MKV."
        : "Format non accepté. Choisis un fichier MP4, MOV ou WebM.");
      return;
    }
  }

  if (selectedCover && !["image/jpeg", "image/png", "image/webp"].includes(selectedCover.type)) {
    showMessage(videoMessage, "Format d'image non accepté. Choisis un fichier PNG, JPG ou WebP.");
    return;
  }

  if (provider !== "cloudinary" && thumbnail && !selectedCover) {
    try {
      const thumbnailUrl = new URL(thumbnail);
      if (thumbnailUrl.protocol !== "https:") throw new Error();
    } catch {
      showMessage(videoMessage, "L'URL de la miniature doit être une adresse HTTPS valide.");
      return;
    }
  }

  saveButton.disabled = true;
  providerSelect.disabled = true;
  videoFileInput.disabled = true;
  deepStorageFileInput.disabled = true;
  r2FileInput.disabled = true;
  coverFileInput.disabled = true;

  try {
    if (provider === "cloudinary") {
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
          thumbnailProvider = "cloudinary_video";
          thumbnailCloudinaryPublicId = null;
          thumbnailImageKitFileId = null;
        }
        cloudinaryIdInput.value = publicId;
      }

      if (!thumbnail && publicId) {
        thumbnail = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0/${publicId}.jpg`;
        thumbnailProvider = "cloudinary_video";
        thumbnailCloudinaryPublicId = null;
        thumbnailImageKitFileId = null;
      }

      if (!publicId) {
        throw new Error("Identifiant Cloudinary manquant.");
      }

      const playerUrl = new URL("https://player.cloudinary.com/embed/");
      playerUrl.searchParams.set("cloud_name", CLOUD_NAME);
      playerUrl.searchParams.set("public_id", publicId);
      playbackUrl = playerUrl.toString();
    } else if (provider === "vioo") {
      playbackUrl = normalizeViooEmbedUrl(viooIdInput.value);
      publicId = null;
      videoFormat = null;
    } else if (provider === "dropbox") {
      playbackUrl = normalizeDropboxUrl(dropboxUrlInput.value);
      publicId = null;
      videoFormat = null;
    } else if (provider === "onedrive") {
      playbackUrl = normalizeOneDriveEmbedUrl(oneDriveUrlInput.value);
      downloadUrl = normalizeOneDriveDownloadUrl(oneDriveDownloadUrlInput.value);
      publicId = null;
      videoFormat = null;
    } else if (provider === "r2") {
      publicId = null;
      if (selectedFile) {
        showMessage(videoMessage, "Envoi sécurisé de la vidéo vers Cloudflare R2…");
        const uploaded = await uploadToR2(selectedFile);
        playbackUrl = uploaded.url;
        downloadUrl = uploaded.url;
        videoFormat = selectedFile.name.split(".").pop()?.toLowerCase() || null;
        r2Status = { available: true, message: "✓ Connexion R2 et envoi réussis." };
        if (r2StatusElement) r2StatusElement.textContent = r2Status.message;
      } else if (editingVideo?.provider === "r2") {
        playbackUrl = editingVideo.playback_url;
        downloadUrl = editingVideo.download_url || editingVideo.playback_url;
        videoFormat = editingVideo.format || null;
      } else {
        throw new Error("Aucun fichier R2 à envoyer.");
      }
    } else if (provider === "deepstorage") {
      publicId = null;
      if (selectedFile) {
        showMessage(videoMessage, "Préparation de l'envoi sécurisé vers DeepStorage…");
        const uploaded = await uploadToDeepStorage(selectedFile);
        playbackUrl = uploaded.link;
        downloadUrl = uploaded.link;
        videoFormat = selectedFile.name.split(".").pop()?.toLowerCase() || null;
      } else if (editingVideo?.provider === "deepstorage") {
        playbackUrl = editingVideo.playback_url;
        downloadUrl = editingVideo.download_url || editingVideo.playback_url;
        videoFormat = editingVideo.format || null;
      } else {
        throw new Error("Aucun fichier DeepStorage à envoyer.");
      }
    } else if (provider === "bunny") {
      const bunnyVideoId = bunnyVideoIdInput.value.trim();
      playbackUrl = "https://player.mediadelivery.net/embed/" + BUNNY_LIBRARY_ID + "/" + encodeURIComponent(bunnyVideoId);
      downloadUrl = bunnyDownloadUrlInput.value.trim() || null;
      publicId = null;
      videoFormat = null;
    } else if (provider === "mux") {
      publicId = null;
      videoFormat = null;

      if (selectedFile) {
        if (selectedFile.size > 1024 * 1024 * 1024) {
          throw new Error("La taille maximale autorisée pour un envoi Mux depuis ce formulaire est de 1 Go.");
        }

        if (selectedCover && !selectedAnnouncementId) {
          coverAlreadyUploaded = true;
          try {
            showMessage(videoMessage, coverProviderSelect.value === "imagekit" ? "Envoi de la miniature vers ImageKit..." : "Envoi de la miniature vers Cloudinary...");
            const uploadedCover = coverProviderSelect.value === "imagekit"
              ? await uploadToImageKit(selectedCover)
              : await uploadToCloudinary(selectedCover, "image");
            thumbnail = uploadedCover.url || uploadedCover.secure_url;
            thumbnailProvider = coverProviderSelect.value;
            thumbnailCloudinaryPublicId = coverProviderSelect.value === "cloudinary" ? uploadedCover.public_id : null;
            thumbnailImageKitFileId = coverProviderSelect.value === "imagekit" ? uploadedCover.fileId : null;
          } catch (coverError) {
            coverWarning = " La miniature n'a pas pu être envoyée (" + coverError.message + ").";
            console.error("Zeno Video Mux cover upload:", coverError);
          }
        }

        showMessage(videoMessage, "Préparation de l'envoi sécurisé vers Mux...");
        const { data: uploadInfo, error: uploadError } = await db.functions.invoke("mux-create-upload", {
          body: {
            title: selectedAnnouncement?.title || title,
            description: selectedAnnouncement?.description || description,
            filename: selectedFile.name,
            content_type: selectedFile.type || "application/octet-stream",
            size: selectedFile.size,
            thumbnail_url: thumbnail || null,
            thumbnail_provider: thumbnailProvider,
            thumbnail_cloudinary_public_id: thumbnailCloudinaryPublicId,
            thumbnail_imagekit_file_id: thumbnailImageKitFileId,
            announcement_id: selectedAnnouncementId,
            sort_order: getNextVideoSortOrder(selectedAnnouncementId ? null : (categorySelect.value || null))
          }
        });

        if (uploadError) {
          let details = uploadError.message || "Impossible de préparer l'envoi Mux.";
          try {
            if (uploadError.context && typeof uploadError.context.json === "function") {
              const response = await uploadError.context.json();
              details = response.error || response.message || details;
            }
          } catch {}
          throw new Error(details);
        }
        if (!uploadInfo?.uploadUrl || !uploadInfo?.videoId) {
          throw new Error("Supabase n'a pas fourni l'URL sécurisée d'envoi Mux.");
        }

        muxVideoId = uploadInfo.videoId;
        try {
          await uploadToMux(selectedFile, uploadInfo.uploadUrl);
        } catch (uploadFailure) {
          await db.from("videos").update({ mux_status: "upload_failed" }).eq("id", muxVideoId);
          throw uploadFailure;
        }

        muxUploadStarted = true;
        playbackUrl = "";
        showMessage(videoMessage, selectedAnnouncementId
          ? "✓ Fichier envoyé à Mux. Traitement en cours : l'annonce restera « À VENIR » jusqu'à ton clic sur « Publier »."
          : "✓ Fichier envoyé à Mux. Traitement en cours : la vidéo indépendante sera publiée quand Mux la déclarera prête.");
      } else if (editingVideo?.provider === "mux") {
        playbackUrl = editingVideo.playback_url;
        thumbnail = editingVideo.thumbnail_url || thumbnail;
      } else {
        throw new Error("Aucun fichier Mux à envoyer.");
      }
    } else {
      throw new Error("Hébergeur vidéo non pris en charge.");
    }

    if (selectedCover && !selectedAnnouncementId && !coverAlreadyUploaded) {
      try {
        showMessage(videoMessage, coverProviderSelect.value === "imagekit" ? "Envoi de la miniature vers ImageKit..." : "Conversion de la miniature en PNG...");
        const uploadedCover = coverProviderSelect.value === "imagekit"
          ? await uploadToImageKit(selectedCover)
          : await uploadToCloudinary(selectedCover, "image");
        thumbnail = uploadedCover.url || uploadedCover.secure_url;
        thumbnailProvider = coverProviderSelect.value;
        thumbnailCloudinaryPublicId = coverProviderSelect.value === "cloudinary" ? uploadedCover.public_id : null;
        thumbnailImageKitFileId = coverProviderSelect.value === "imagekit" ? uploadedCover.fileId : null;
      } catch (coverError) {
        coverWarning = provider === "cloudinary"
          ? " La couverture n'a pas pu être envoyée (" + coverError.message + "). Une miniature automatique sera utilisée."
          : " La miniature n'a pas pu être envoyée (" + coverError.message + "). La vidéo hébergée sur " + (provider === "dropbox" ? "Dropbox" : provider === "onedrive" ? "OneDrive" : "Vioo") + " sera enregistrée sans cette miniature.";
        console.error("Zeno Video cover upload:", coverError);
      }
    }

    if (muxUploadStarted) {
      showMessage(videoMessage, selectedAnnouncementId
        ? "✓ Vidéo envoyée à Mux. L'annonce restera « À VENIR » jusqu'à ton clic sur « Publier »." + coverWarning
        : "✓ Vidéo envoyée à Mux. Elle sera publiée après traitement." + coverWarning);
      resetVideoForm();
      await loadAdminVideos();
      await loadAdminAnnouncements();
      return;
    }

    showMessage(videoMessage, "Enregistrement de la vidéo dans la bibliothèque...");
    const videoData = {
      title: selectedAnnouncement?.title || title,
      description: selectedAnnouncement?.description || description,
      provider,
      announcement_id: selectedAnnouncementId,
      category_id: selectedAnnouncementId ? null : (categorySelect.value || null),
      cloudinary_public_id: publicId,
      playback_url: playbackUrl,
      download_url: downloadUrl,
      thumbnail_url: thumbnail || null,
      thumbnail_provider: thumbnailProvider,
      thumbnail_cloudinary_public_id: thumbnailCloudinaryPublicId,
      thumbnail_imagekit_file_id: thumbnailImageKitFileId,
      format: ["cloudinary", "r2"].includes(provider) ? videoFormat : null,
      mux_upload_id: provider === "mux" ? (editingVideo?.mux_upload_id || null) : null,
      mux_asset_id: provider === "mux" ? (editingVideo?.mux_asset_id || null) : null,
      mux_playback_id: provider === "mux" ? (editingVideo?.mux_playback_id || null) : null,
      mux_status: provider === "mux" ? (editingVideo?.mux_status || null) : null
    };

    if (editingId && editingVideo) {
      const destinationCategoryId = selectedAnnouncementId ? null : (categorySelect.value || null);
      if (destinationCategoryId !== (editingVideo.category_id || null)) {
        videoData.sort_order = getNextVideoSortOrder(destinationCategoryId, editingVideo.id);
      }
    }

    let result;
    const saveStartedAt = new Date().toISOString();
    if (editingId) {
      result = await db.from("videos").update(videoData).eq("id", editingId);
    } else {
      result = await db.from("videos").insert({
        ...videoData,
        is_published: !selectedAnnouncementId,
        sort_order: getNextVideoSortOrder(selectedAnnouncementId ? null : (categorySelect.value || null))
      });
    }

    if (result.error && !editingId && result.error.message.includes("Failed to fetch")) {
      // Le serveur peut avoir validé l'insertion alors que le navigateur a perdu la réponse.
      const verification = await db.from("videos")
        .select("id,title,provider,playback_url")
        .eq("title", title)
        .eq("provider", provider)
        .eq("playback_url", playbackUrl)
        .gte("created_at", saveStartedAt)
        .limit(1)
        .maybeSingle();

      if (verification.error) {
        throw new Error(
          "Réponse réseau incertaine : impossible de confirmer si Supabase a enregistré la vidéo. " +
          "Ne la renvoie pas tout de suite ; recharge « Mes vidéos » pour vérifier."
        );
      }

      if (verification.data) result = { error: null };
    }

    if (result.error) {
      throw new Error(
        "Supabase a refusé l'enregistrement : " + result.error.message
      );
    }

    const successMessage = (editingId ? "Vidéo modifiée avec succès !" : "Vidéo ajoutée avec succès !") + coverWarning;
    showMessage(videoMessage, successMessage);
    resetVideoForm();
    try {
      await loadAdminVideos();
    } catch (refreshError) {
      console.error("Zeno Video: refresh after save failed:", refreshError);
      showMessage(videoMessage, successMessage + " La liste n'a pas pu être actualisée ; recharge la page pour la voir.");
    }
  } catch (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
  } finally {
    saveButton.disabled = false;
    providerSelect.disabled = false;
    videoFileInput.disabled = providerSelect.value !== "cloudinary" || Boolean(editingId);
    deepStorageFileInput.disabled = providerSelect.value !== "deepstorage" || !deepStorageStatus.available;
    muxFileInput.disabled = providerSelect.value !== "mux" || Boolean(editingId);
    coverFileInput.disabled = false;
    if (providerSelect.value === "deepstorage" && !deepStorageStatus.available && !editingId) saveButton.disabled = true;
  }
});

cancelEditButton.addEventListener("click", () => {
  resetVideoForm();
  showMessage(videoMessage, "");
});

async function togglePublication(video) {
  if (!video.is_published && video.provider === "mux" && video.mux_status !== "ready") {
    showMessage(videoMessage, "La vidéo doit être prête sur Mux avant publication.");
    return;
  }
  const { error } = await db.from("videos")
    .update({ is_published: !video.is_published })
    .eq("id", video.id);

  if (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
    return;
  }
  await loadAdminVideos();
  await loadAdminAnnouncements();
}

async function deleteVideo(video) {
  const coverProvider = video.thumbnail_provider ||
    (video.thumbnail_url?.includes("ik.imagekit.io") ? "imagekit" :
      video.thumbnail_url?.includes("res.cloudinary.com") ? "cloudinary" : null);
  const coverMessage = coverProvider === "imagekit"
    ? " Sa couverture sera également supprimée d'ImageKit."
    : coverProvider === "cloudinary"
      ? " Sa couverture sera également supprimée de Cloudinary."
      : " La référence de couverture sera retirée de Supabase.";
  if (!confirm("Retirer « " + video.title + " » de la bibliothèque ?" + coverMessage + " Le fichier vidéo restera chez son hébergeur.")) return;
  showMessage(videoMessage, "Suppression de la vidéo et de sa couverture en cours…");
  const buttons = videoList.querySelectorAll("button");
  buttons.forEach(button => button.disabled = true);
  try {
    const { data, error } = await db.functions.invoke("delete-video-permanently", {
      body: { videoId: video.id, deleteVideoAsset: false }
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
    showMessage(videoMessage, data.message || "Vidéo retirée de Supabase et couverture nettoyée.");
    await loadAdminVideos();
  } catch (error) {
    showMessage(videoMessage, "Erreur : " + error.message);
    buttons.forEach(button => button.disabled = false);
  }
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

    status.textContent = "✓ Suppression définitive prête : connexions Cloudinary, ImageKit, Mux et Cloudflare R2 vérifiées. Aucun fichier n'a été supprimé.";
    status.className = "admin-message success";
  } catch (error) {
    status.textContent = "⚠ Vérification impossible : " + (error?.message || "erreur de communication avec Supabase.");
    status.className = "admin-message error";
  }
}

async function permanentlyDeleteVideo(video) {
  const provider = video.provider || "cloudinary";
  if (!["cloudinary", "mux", "r2"].includes(provider)) {
    showMessage(videoMessage, "La suppression définitive automatique est disponible pour Cloudinary, Mux et Cloudflare R2.");
    return;
  }
  if (provider === "mux" && !video.mux_asset_id) {
    showMessage(videoMessage, "Mux n'a pas encore fourni l'identifiant de l'asset. Attends la fin du traitement avant la suppression définitive.");
    return;
  }

  const providerName = provider === "mux" ? "Mux" : provider === "r2" ? "Cloudflare R2" : "Cloudinary";
  const confirmed = confirm(
    "SUPPRESSION DÉFINITIVE\n\nLa vidéo « " + video.title +
    " » sera supprimée de " + providerName + " ET de Supabase. Sa couverture hébergée sera supprimée aussi, sauf si elle est encore utilisée par une annonce ou une autre vidéo. Cette action est irréversible.\n\nContinuer ?"
  );
  if (!confirmed) return;

  showMessage(videoMessage, "Suppression définitive de " + providerName + " et Supabase en cours...");
  const buttons = videoList.querySelectorAll("button");
  buttons.forEach(button => button.disabled = true);

  try {
    const { data, error } = await db.functions.invoke("delete-video-permanently", {
      body: { videoId: video.id, deleteVideoAsset: true }
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

    showMessage(videoMessage, data.message || "Vidéo supprimée définitivement de " + providerName + " et de Supabase.");
    await loadAdminVideos();
    await loadAdminAnnouncements();
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
