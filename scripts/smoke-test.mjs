import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = 'dist';
const required = ['index.html','admin.html','watch.html','announcement-admin.html','announcement-admin.js','announcement.html','announcement-viewer.js','style.css','library.js','videos.js','admin.js','watch.js','posthog.js','posthog-config.js'];
const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  const files = existsSync(root) ? readdirSync(root, { recursive: true }).map(String) : [];
  console.error('Fichiers manquants dans le site généré :', missing.join(', '));
  console.error('Contenu réel de dist :', files.join(', ') || '(dossier dist absent ou vide)');
  process.exit(1);
}
const read = (file) => readFileSync(join(root, file), 'utf8');
const home = read('index.html');
const rootHome = readFileSync('index.html', 'utf8');
const astroConfig = readFileSync('astro.config.mjs', 'utf8');
const hostingUsageFunction = readFileSync('supabase/functions/hosting-usage/index.ts', 'utf8');
const muxWebhookFunction = readFileSync('supabase/functions/mux-webhook/index.ts', 'utf8');
const videoCounterFunction = readFileSync('supabase/functions/video-counter/index.ts', 'utf8');
const videoCounterMigration = readFileSync('supabase/migrations/20261114201000_rate_limit_public_video_counters.sql', 'utf8');
const admin = read('admin.html');
const watch = read('watch.html');
const announcementAdmin = read('announcement-admin.html');
const announcementViewer = read('announcement.html');
const browserScripts = ['videos.js', 'library.js', 'admin.js', 'watch.js', 'announcement-admin.js', 'announcement-viewer.js', 'posthog.js'];
const checks = [
  ['Configuration : préfixe GitHub Pages conservé', astroConfig.includes("base: '/zeno-video'")],
  ['Accueil : contenu Zeno Video généré', home.includes('ZENO VIDEO') && home.includes('Bienvenue dans')],
  ['Accueil : zone de galerie générée', home.includes('video-grid') && home.includes('video-count')],
  ['Pages publiques : index.html racine contient les conteneurs des dossiers et des vidéos', rootHome.includes('id="category-filters"') && rootHome.includes('id="video-grid"') && rootHome.includes('id="empty-message"')],
  ['Pages publiques : index.html racine charge la version actuelle du script de bibliothèque', rootHome.includes('library.js?v=21')],
  ['Accueil : CSS relié au bon chemin GitHub Pages', /href="\/zeno-video\/style\.css\?v=\d+"/.test(home)],
  ['Accueil : scripts reliés au bon chemin GitHub Pages', /src="\/zeno-video\/library\.js\?v=\d+"/.test(home) && home.includes('src="/zeno-video/videos.js"')],
  ['Ressources : feuille de style copiée', existsSync(join(root, 'style.css'))],
  ['Ressources : scripts de galerie copiés', existsSync(join(root, 'videos.js')) && existsSync(join(root, 'library.js'))],
  ['Administration : script conservé', /<script src="admin\.js\?v=\d+" defer><\/script>/.test(admin)],
  ['Maintenance : rappel hebdomadaire présent dans le tableau administrateur', admin.includes('weekly-maintenance-panel') && admin.includes('complete-weekly-maintenance')],
  ['Maintenance : logique de rappel du samedi présente', read('admin.js').includes('function updateWeeklyMaintenanceReminder') && read('admin.js').includes('mostRecentSaturdayKey')],
  ['Administration : suivi des quotas hébergeurs présent', admin.includes('hosting-usage-panel') && admin.includes('refresh-hosting-usage')],
  ['Suivi hébergeurs : compteurs de lecture et téléchargement rattachés au bon service', hostingUsageFunction.includes('metrics: { ...metrics, zeno }') && hostingUsageFunction.includes('metrics: { zeno }')],
  ['Mux : webhook MP4 utilise l’identifiant de l’asset parent, pas celui de la rendition', muxWebhookFunction.includes('data.asset_id ||') && muxWebhookFunction.includes('(event.object?.type === "asset" ? event.object.id : "")') && muxWebhookFunction.includes('Parent asset ID missing from static rendition webhook.')],
  ['Administration : script de suivi des hébergeurs présent', read('admin.js').includes('function loadHostingUsage')],
  ['Administration : valeurs nulles affichées comme indisponibles', read('admin.js').includes('value === null || value === undefined')],
  ['Administration : fichiers de stockage non mesurés signalés', read('admin.js').includes('Fichiers dont la taille est inconnue')],
  ['Administration : stockage DeepStorage estimé depuis les liens', read('admin.js').includes('Stockage Zeno mesuré') && read('admin.js').includes('Fichiers Zeno mesurés')],
  ['Administration : choix ImageKit pour les miniatures', admin.includes('id="cover-provider"') && admin.includes('value="imagekit"')],
  ['Administration : annonces avec couvertures Cloudinary et ImageKit', admin.includes('id="announcement-form"') && admin.includes('id="announcement-cover-provider"') && admin.includes('value="cloudinary"') && admin.includes('value="imagekit"')],
  ['Administration : association et publication manuelle des annonces', read('admin.js').includes('async function loadAdminAnnouncements') && read('admin.js').includes('announcement_id: selectedAnnouncementId') && read('admin.js').includes('is_published: !selectedAnnouncementId')],
  ['Accueil : annonces à venir et cartes liées', read('library.js').includes('/rest/v1/video_announcements') && read('library.js').includes('announcement_id') && read('library.js').includes('À VENIR')],
  ['Lecteur : URL d’annonce conservée après publication', read('watch.js').includes('const announcementId') && read('watch.js').includes('announcement_id=eq.') && read('watch.js').includes('is_published=eq.true')],
  ['Lecteur : titre, description et couverture de l’annonce conservés après publication', read('watch.js').includes('linkedAnnouncement.title') && read('watch.js').includes('video.thumbnail_url = linkedAnnouncement.cover_url')],
  ['Mux : upload lié à une annonce sans publication automatique', readFileSync('supabase/functions/mux-create-upload/index.ts', 'utf8').includes('announcement_id: announcementId') && readFileSync('supabase/functions/mux-create-upload/index.ts', 'utf8').includes('is_published: false') && muxWebhookFunction.includes('publishQuery') && muxWebhookFunction.includes('.is("announcement_id", null)')],

  ['Annonces : page de gestion générée', announcementAdmin.includes('id="announcement-form"') && announcementAdmin.includes('id="media-type"')],
  ['Annonces : photo et vidéo ont des sélecteurs de fichiers distincts', announcementAdmin.includes('id="cover-file" type="file" accept="image/jpeg,image/png,image/webp"') && announcementAdmin.includes('id="cloudinary-file" type="file" accept="video/mp4,video/quicktime,video/webm"')],
  ['Annonces : choix Cloudinary ou ImageKit pour les photos et couvertures', announcementAdmin.includes('id="cover-provider"') && announcementAdmin.includes('value="cloudinary"') && announcementAdmin.includes('value="imagekit"') && read('announcement-admin.js').includes('uploadToImageKit(file)') && read('announcement-admin.js').includes('imagekit-upload-auth') && read('announcement-admin.js').includes('coverProviderSelect.value')],
  ['Annonces : limite gratuite ImageKit de 25 Mo contrôlée', read('announcement-admin.js').includes('coverFile.size>25*1024*1024')],
  ['Annonces Mux : fournisseur de couverture transmis à Mux', read('announcement-admin.js').includes('thumbnail_provider:coverProvider') && read('announcement-admin.js').includes('thumbnail_imagekit_file_id:coverProvider==="imagekit"')],
  ['Annonces : sept hébergeurs proposés avec leurs panneaux dédiés', ['cloudinary','mux','vioo','dropbox','onedrive','deepstorage','bunny'].every(provider => announcementAdmin.includes('id="' + provider + '-fields"'))],
  ['Annonces : téléversements Cloudinary, Mux et DeepStorage réutilisés', read('announcement-admin.js').includes('uploadToCloudinary') && read('announcement-admin.js').includes('uploadToMux') && read('announcement-admin.js').includes('uploadToDeepStorage')],
  ['Annonces vidéo : restent hors de la liste des vidéos ordinaires', read('admin.js').includes('linkedAnnouncement?.media_type !== "video"') && read('admin.js').includes('if (item.media_type === "video") continue;')],
  ['Annonces : outils OneDrive, Dropbox et Vioo conservés', read('announcement-admin.js').includes('normalizeOneDriveEmbedUrl') && read('announcement-admin.js').includes('normalizeDropboxUrl') && read('announcement-admin.js').includes('normalizeViooEmbedUrl')],
  ['Bunny : statistiques et paramètres d’hébergement intégrés', read('admin.js').includes('snapshot.provider === "bunny"') && read('admin.html').includes('id="bunny-hosting-settings"') && readFileSync('supabase/functions/hosting-usage/index.ts', 'utf8').includes('async function bunnyMetrics')],
  ['DeepStorage : paramètres d’hébergement et état API affichés', read('admin.js').includes('function updateDeepStorageHostingSettings') && read('admin.html').includes('id="deepstorage-hosting-settings"') && readFileSync('supabase/functions/hosting-usage/index.ts', 'utf8').includes('(provider === "deepstorage" && !metrics.apiAvailable)')],
  ['Annonces Bunny : lecteur et téléchargement facultatif', read('announcement-admin.js').includes('video_download_url') && read('announcement-viewer.js').includes('provider === "bunny"') && read('announcement-viewer.js').includes('Télécharger la vidéo')],
  ['Annonces Mux : création d’un envoi associé à l’annonce', read('announcement-admin.js').includes('mux-create-upload') && read('announcement-admin.js').includes('announcement_id:created.id') && read('announcement-admin.js').includes('mux-pending:')],
  ['Annonces Mux : webhook synchronise le lecteur et la publication publique', muxWebhookFunction.includes('syncAnnouncementMuxState') && muxWebhookFunction.includes('video_url: videoUrl') && muxWebhookFunction.includes('is_published: true')],
  ['Annonce publique : état de traitement Mux affiché', read('announcement-viewer.js').includes('mux-pending:') && read('announcement-viewer.js').includes('mux-error')],
  ['Annonce publique : lecteur mis à jour dans le build', announcementViewer.includes('announcement-viewer.js?v=3')],
  ['PostHog : configuration publique présente dans le build', existsSync(join(root, 'posthog-config.js'))],
  ['PostHog : SDK chargé depuis le domaine CDN officiel', read('posthog.js').includes('replace(".i.posthog.com", "-assets.i.posthog.com")')],
  ['PostHog : SDK chargé sur la page d’accueil', home.includes('posthog-config.js') && home.includes('posthog.js?v=2')],
  ['PostHog : SDK chargé sur le lecteur vidéo', watch.includes('posthog-config.js') && watch.includes('posthog.js?v=2')],
  ['PostHog : administration privée exclue du suivi', !admin.includes('posthog.js')],
  ['PostHog : événements vidéo personnalisés présents', read('watch.js').includes('video_launch_requested') && read('watch.js').includes('video_download_requested')],
  ['PostHog : clic de téléchargement capturé sans bloquer le lien natif', read('watch.js').includes('captureAnalytics("video_download_requested"') && read('watch.js').includes('transport: "sendBeacon"') && !read('watch.js').includes('event.preventDefault()') && !read('watch.js').includes('window.open(destination')],
  ['Lecteur : script conservé et cache actualisé', /watch\.js\?v=\d+/.test(watch)],
  ['Lecteur : lecture par identifiant URL', read('watch.js').includes('location.search')],
  ['Compteurs : lecteur et galerie utilisent la fonction Edge sécurisée', read('watch.js').includes('/functions/v1/video-counter') && read('library.js').includes('/functions/v1/video-counter')],
  ['Compteurs : anciennes RPC publiques retirées du JavaScript', !read('watch.js').includes('/rest/v1/rpc/register_video_') && !read('library.js').includes('/rest/v1/rpc/register_video_')],
  ['Sécurité : limitation par IP hachée côté serveur', videoCounterFunction.includes('HMAC') && videoCounterFunction.includes('SUPABASE_SERVICE_ROLE_KEY') && videoCounterMigration.includes('THEN 120 ELSE 30 END')],
  ['Lecteur : miniature récupérée depuis Supabase', read('watch.js').includes('thumbnail_url,playback_url')],
  ['Lecteur : couverture affichée avant lancement', read('watch.js').includes('function showCoverPreview')],
  ['Lecteur : aperçu préalable Cloudinary', read('watch.js').includes('function showCloudinaryPlayer')],
  ['Bunny Stream : identifiant et URL MP4 facultative configurables dans l’administration', read('admin.html').includes('id="bunny-video-id"') && read('admin.html').includes('id="bunny-download-url"') && read('admin.js').includes('downloadUrl = bunnyDownloadUrlInput.value.trim() || null')],
  ['Bunny Stream : bouton Télécharger activé uniquement avec une URL directe enregistrée', read('watch.js').includes('function showBunnyPlayer') && read('watch.js').includes('downloadButton.href = video.download_url') && read('watch.js').includes('downloadButton.hidden = false')],
  ['Bunny Stream : bouton Télécharger présent sur les cartes de la galerie', read('library.js').includes('provider === "bunny" && video.download_url') && read('library.js').includes('download.href = new URL(video.download_url).toString()')],
  ['Administration : suppression de couverture sécurisée', read('admin.js').includes('deleteVideoAsset: false') && read('admin.js').includes('thumbnail_imagekit_file_id')],
  ['Administration : bouton de suppression définitive proposé pour Cloudinary et Mux', read('admin.js').includes('["cloudinary", "mux"].includes(video.provider || "cloudinary")') && read('admin.js').includes('video.mux_asset_id')],
  ['Suppression Mux : l’API Mux supprime l’asset côté serveur', readFileSync('supabase/functions/delete-video-permanently/index.ts', 'utf8').includes('https://api.mux.com/video/v1/assets/') && readFileSync('supabase/functions/delete-video-permanently/index.ts', 'utf8').includes('MUX_TOKEN_SECRET')],
  ['Suppression : couverture partagée protégée', readFileSync('supabase/functions/delete-video-permanently/index.ts', 'utf8').includes('from("video_announcements").select("id").eq("cover_url", thumbnailUrl)') && readFileSync('supabase/functions/delete-video-permanently/index.ts', 'utf8').includes('coverIsShared')],
  ['Lecteur : miniature native pour les vidéos directes', read('watch.js').includes('media.poster = video.thumbnail_url')],
  ['Catégories : dossiers publics avec couvertures personnalisées', read('library.js').includes('function renderHome()') && read('library.js').includes('cover_url') && home.includes('category-folder-grid')],
  ['Accueil : les vidéos classées sont retirées de la page racine et accessibles en ouvrant leur dossier', read('library.js').includes('const uncategorizedVideos = categoryVideos.filter(video => !video.category_id)') && read('library.js').includes('function renderCategory(category)') && read('library.js').includes('← Retour à la bibliothèque')],
  ['Accueil : les annonces restent affichées à la racine, hors des catégories', read('library.js').includes('for (const announcement of announcements)') && read('library.js').includes('const categoryVideos = regularVideos')],
  ['Administration : la liste racine masque les vidéos classées et les dossiers permettent de les ouvrir', read('admin.js').includes('activeAdminCategoryId = category.id') && read('admin.js').includes('const visibleVideos = currentCategory') && read('admin.js').includes('Retour aux dossiers')],
  ['Administration : retour d’un dossier vers les cartes des dossiers', read('admin.js').includes('categoryList?.scrollIntoView({ behavior: "smooth", block: "start" })') && read('admin.js').includes('await loadAdminVideos()')],
  ['Catégories : création, renommage et couverture dans l’administration', read('admin.html').includes('category-cover-file') && read('admin.js').includes('async function uploadCategoryCover') && read('admin.js').includes('Enregistrer le nom')],
  ['Catégories : suppression simple et suppression définitive distinctes', read('admin.js').includes('Supprimer la catégorie') && read('admin.js').includes('Supprimer la catégorie et ses vidéos') && read('admin.js').includes('permanentlyDeleteCategory')],
  ['Catégories : Edge Function sécurisée pour supprimer le contenu du dossier', readFileSync('supabase/functions/delete-video-permanently/index.ts', 'utf8').includes('if (body.categoryId)') && readFileSync('supabase/functions/delete-video-permanently/index.ts', 'utf8').includes('deleteVideoAsset')],
]; 

// Le build Astro copie les fichiers JavaScript publics sans les compiler.
// On les analyse donc explicitement pour détecter les erreurs de syntaxe avant déploiement.
for (const file of browserScripts) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('Erreur de syntaxe JavaScript dans ' + file + ':');
    console.error(result.stderr || result.stdout || 'node --check a échoué.');
  }
  checks.push(['JavaScript : syntaxe valide pour ' + file, result.status === 0]);
}

// Les fichiers racine et public sont des copies miroir maintenues ensemble.
const mirroredFiles = ['admin.html', 'admin.js', 'watch.html', 'watch.js', 'library.js', 'style.css', 'videos.js', 'announcement-admin.html', 'announcement-admin.js', 'announcement.html', 'announcement-viewer.js'];
const mirrorsMatch = mirroredFiles.every((file) =>
  readFileSync(file, 'utf8') === readFileSync(join('public', file), 'utf8')
);
checks.push(['Dépôt : copies racine et public synchronisées', mirrorsMatch]);

// Les clés publiques Supabase sont attendues côté navigateur ; les secrets serveur ne le sont jamais.
const publicBundle = browserScripts.map(read).join('\n');
const forbiddenSecrets = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLOUDINARY_API_SECRET',
  'MUX_TOKEN_SECRET',
  'DROPBOX_APP_SECRET',
  'IMAGEKIT_PRIVATE_KEY'
];
const leakedSecretNames = forbiddenSecrets.filter((name) => publicBundle.includes(name));
if (leakedSecretNames.length) {
  console.error('Identifiants réservés au serveur détectés dans les scripts publics :', leakedSecretNames.join(', '));
}
checks.push(['Sécurité : aucun nom de secret serveur dans les scripts publics', leakedSecretNames.length === 0]);

let failed = false;
for (const [label, passed] of checks) {
  console.log((passed ? '✓ ' : '✗ ') + label);
  if (!passed) failed = true;
}
if (failed) process.exit(1);
console.log('Vérification des routes, ressources, scripts et garde-fous Zeno Video réussie.');
