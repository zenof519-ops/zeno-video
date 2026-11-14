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
const saveButton = document.getElementById("save-button");
const cancelEditButton = document.getElementById("cancel-edit");

let editingId = null;
let editingVideo = null;
let deepStorageStatus = { checked: false, available: false, message: "Vérification de l'accès API DeepStorage…" };
let videoFormat = "mp4";
let currentThumbnailUrl = null;
let previewObjectUrl = null;
const muxDownloadsPreparing = new Set();

function showMessage(element, message) {
  element.textContent = message;
}

const hostingUsageCards = document.getElementById("hosting-usage-cards");
const hostingUsageUpdated = document.getElementById("hosting-usage-updated");
const refreshHostingUsageButton = document.getElementById("refresh-hosting-usage");

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

function renderHostingUsage(snapshots) {
  hostingUsageCards.replaceChildren();
  const labels = {
    cloudinary: "Cloudinary",
    mux: "Mux",
    imagekit: "ImageKit (miniatures)",
    deepstorage: "DeepStorage",
    dropbox: "Dropbox",
    onedrive: "OneDrive",
    vioo: "Vioo"
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
    status.className = "hosting-usage-status " + (snapshot.status || "error");
    status.textContent = statusLabels[snapshot.status] || "État inconnu";
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
    } else if (snapshot.provider === "dropbox" || snapshot.provider === "onedrive") {
      addHostingMetric(card, "Fichiers Zeno mesurés", formatUsageNumber(metrics.measuredFiles || 0, 0) + " / " + formatUsageNumber(metrics.linkedVideos || 0, 0));
      addHostingMetric(card, "Espace occupé par les fichiers Zeno mesurés", formatUsageBytes(metrics.zenoFilesSizeBytes));
      addHostingMetric(card, "Fichiers dont la taille est inconnue", formatUsageNumber(metrics.unknownFiles, 0));
      addHostingMetric(card, "Quota global du compte", "Connexion OAuth nécessaire pour obtenir une valeur exacte");
    } else if (snapshot.provider === "vioo") {
      addHostingMetric(card, "Quota et stockage fournisseur", "Non accessibles automatiquement pour le moment");
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

    if (!refresh && snapshots.length === 0) {
      ({ data, error } = await db.functions.invoke("hosting-usage", { body: { action: "refresh" } }));
      if (error) throw new Error(error.message || "Impossible de lancer la première mesure.");
      snapshots = Array.isArray(data?.snapshots) ? data.snapshots : [];
    }

    renderHostingUsage(snapshots);
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


async function resetVideoStatistics(videoId, videoTitle) {
  const confirmed = confirm(
    "Réinitialiser les statistiques de « " + videoTitle + " » ?\\n\\nSes lectures et téléchargements passeront à zéro. Cette action ne peut pas être annulée."
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
    "Réinitialiser les statistiques de TOUTES les vidéos ?\\n\\nTous les compteurs de lectures et de téléchargements passeront à zéro. Cette action ne peut pas être annulée."
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
  cloudinaryFields.classList.toggle("admin-hidden", !isCloudinary);
  viooFields.classList.toggle("admin-hidden", !isVioo);
  dropboxFields.classList.toggle("admin-hidden", !isDropbox);
  oneDriveFields.classList.toggle("admin-hidden", !isOneDrive);
  deepStorageFields.classList.toggle("admin-hidden", !isDeepStorage);
  muxFields.classList.toggle("admin-hidden", !isMux);

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

function resetVideoForm() {
  videoForm.reset();
  editingId = null;
  editingVideo = null;
  videoFormat = "mp4";
  currentThumbnailUrl = null;
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
  deepStorageFileInput.value = "";
  muxFileInput.value = "";
  updateProviderFields();
  refreshOneDriveHelper();
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
  await loadHostingUsage(false);
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
  if (!confirm("Préparer le fichier MP4 téléchargeable de « " + video.title + " » ? Mux facturera le stockage du MP4 et sa livraison lorsqu'il sera téléchargé.")) return;

  button.disabled = true;
  button.textContent = "Préparation du MP4…";
  showMessage(videoMessage, "Demande de génération du fichier MP4 sur Mux…");

  try {
    const { data, error } = await db.functions.invoke("mux-enable-download", {
      body: { videoId: video.id }
    });
    if (error) {
      let details = error.message || "Impossible de préparer le téléchargement Mux.";
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
    } else {
      muxDownloadsPreparing.add(video.id);
      button.textContent = "MP4 en préparation…";
      showMessage(videoMessage, "✓ Demande acceptée par Mux. Le bouton public apparaîtra automatiquement dès que le MP4 sera prêt.");
    }
  } catch (error) {
    muxDownloadsPreparing.delete(video.id);
    showMessage(videoMessage, "Erreur : " + error.message);
    button.disabled = false;
    button.textContent = "Activer téléchargement MP4";
  }
}

async function loadAdminVideos() {
  showMessage(videoMessage, "Chargement des vidéos...");
  videoList.innerHTML = "";

  const { data: videos, error } = await db
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showMessage(videoMessage, "Impossible d'actualiser la liste : " + error.message);
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
    status.textContent = video.provider === "mux" && video.mux_status !== "ready"
      ? "Statut : " + (video.mux_status === "errored" ? "Erreur de traitement Mux" : video.mux_status === "upload_failed" ? "Échec de l'envoi Mux" : "Traitement Mux en cours")
      : video.is_published ? "Statut : Publiée" : "Statut : Non publiée";

    const providerLabel = document.createElement("p");
    const providerNames = { cloudinary: "Cloudinary", vioo: "Vioo", dropbox: "Dropbox", onedrive: "OneDrive", deepstorage: "DeepStorage", mux: "Mux" };
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
    if ((video.provider || "cloudinary") === "cloudinary") {
      actions.append(permanentDeleteButton);
    }
    card.append(title, description, views, downloads, status, providerLabel, actions);
    videoList.append(card);
  }
}

function editVideo(video) {
  editingId = video.id;
  editingVideo = video;
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
  } else {
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

    const upload = upChunkLibrary.createUpload({
      endpoint: uploadUrl,
      file,
      chunkSize: 5120,
      attempts: 5,
      dynamicChunkSize: true,
      minChunkSize: 256,
      maxChunkSize: 20480
    });

    upload.on("progress", event => {
      const percent = Math.round(Number(event.detail) || 0);
      showMessage(videoMessage, "Envoi reprenable vers Mux : " + percent + "%");
    });
    upload.on("offline", () => showMessage(videoMessage, "Connexion interrompue : Mux met l'envoi en pause et le reprendra automatiquement."));
    upload.on("online", () => showMessage(videoMessage, "Connexion rétablie : reprise de l'envoi vers Mux…"));
    upload.on("error", event => {
      reject(new Error(event.detail?.message || "Le transfert vers Mux a échoué après plusieurs tentatives."));
    });
    upload.on("success", resolve);
  });
}

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const provider = providerSelect.value;
  const title = document.getElementById("video-name").value.trim();
  const description = document.getElementById("video-description").value.trim();
  const selectedFile = provider === "cloudinary"
    ? videoFileInput.files[0]
    : provider === "deepstorage" ? deepStorageFileInput.files[0]
    : provider === "mux" ? muxFileInput.files[0] : null;
  const selectedCover = coverFileInput.files[0];
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

  if (selectedFile && !["video/mp4", "video/quicktime", "video/webm"].includes(selectedFile.type)) {
    showMessage(videoMessage, "Format non accepté. Choisis un fichier MP4, MOV ou WebM.");
    return;
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
    } else if (provider === "mux") {
      publicId = null;
      videoFormat = null;

      if (selectedFile) {
        if (selectedFile.size > 1024 * 1024 * 1024) {
          throw new Error("La taille maximale autorisée pour un envoi Mux depuis ce formulaire est de 1 Go.");
        }

        if (selectedCover) {
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
            title,
            description,
            filename: selectedFile.name,
            content_type: selectedFile.type || "application/octet-stream",
            size: selectedFile.size,
            thumbnail_url: thumbnail || null,
            thumbnail_provider: thumbnailProvider,
            thumbnail_cloudinary_public_id: thumbnailCloudinaryPublicId,
            thumbnail_imagekit_file_id: thumbnailImageKitFileId
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
        showMessage(videoMessage, "✓ Fichier envoyé à Mux. Traitement vidéo en cours : elle apparaîtra dans la bibliothèque après validation de Mux.");
      } else if (editingVideo?.provider === "mux") {
        playbackUrl = editingVideo.playback_url;
        thumbnail = editingVideo.thumbnail_url || thumbnail;
      } else {
        throw new Error("Aucun fichier Mux à envoyer.");
      }
    } else {
      throw new Error("Hébergeur vidéo non pris en charge.");
    }

    if (selectedCover && !coverAlreadyUploaded) {
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
      showMessage(videoMessage, "✓ Vidéo envoyée à Mux. Traitement en cours..." + coverWarning);
      resetVideoForm();
      await loadAdminVideos();
      return;
    }

    showMessage(videoMessage, "Enregistrement de la vidéo dans la bibliothèque...");
    const videoData = {
      title,
      description,
      provider,
      cloudinary_public_id: publicId,
      playback_url: playbackUrl,
      download_url: downloadUrl,
      thumbnail_url: thumbnail || null,
      thumbnail_provider: thumbnailProvider,
      thumbnail_cloudinary_public_id: thumbnailCloudinaryPublicId,
      thumbnail_imagekit_file_id: thumbnailImageKitFileId,
      format: provider === "cloudinary" ? videoFormat : null,
      mux_upload_id: provider === "mux" ? (editingVideo?.mux_upload_id || null) : null,
      mux_asset_id: provider === "mux" ? (editingVideo?.mux_asset_id || null) : null,
      mux_playback_id: provider === "mux" ? (editingVideo?.mux_playback_id || null) : null,
      mux_status: provider === "mux" ? (editingVideo?.mux_status || null) : null
    };

    let result;
    const saveStartedAt = new Date().toISOString();
    if (editingId) {
      result = await db.from("videos").update(videoData).eq("id", editingId);
    } else {
      result = await db.from("videos").insert({ ...videoData, is_published: true });
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

    status.textContent = "✓ Nettoyage des couvertures prêt : connexions Cloudinary et ImageKit vérifiées. Aucun fichier n'a été supprimé.";
    status.className = "admin-message success";
  } catch (error) {
    status.textContent = "⚠ Vérification impossible : " + (error?.message || "erreur de communication avec Supabase.");
    status.className = "admin-message error";
  }
}

async function permanentlyDeleteVideo(video) {
  if ((video.provider || "cloudinary") !== "cloudinary") {
    showMessage(videoMessage, "La suppression définitive automatique n'est disponible que pour Cloudinary.");
    return;
  }

  const confirmed = confirm(
    "SUPPRESSION DÉFINITIVE\n\nLa vidéo « " + video.title +
    " » et sa couverture seront supprimées de Cloudinary/ImageKit ET de Supabase. Cette action est irréversible.\n\nContinuer ?"
  );
  if (!confirmed) return;

  showMessage(videoMessage, "Suppression définitive de Cloudinary et Supabase en cours...");
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

    showMessage(videoMessage, data.message || "Vidéo et couverture supprimées définitivement de leurs hébergeurs et de Supabase.");
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
