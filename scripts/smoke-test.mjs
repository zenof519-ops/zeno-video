import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = 'dist';
const required = ['index.html','admin.html','watch.html','style.css','library.js','videos.js','admin.js','watch.js'];
const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  const files = existsSync(root) ? readdirSync(root, { recursive: true }).map(String) : [];
  console.error('Fichiers manquants dans le site généré :', missing.join(', '));
  console.error('Contenu réel de dist :', files.join(', ') || '(dossier dist absent ou vide)');
  process.exit(1);
}
const read = (file) => readFileSync(join(root, file), 'utf8');
const home = read('index.html');
const astroConfig = readFileSync('astro.config.mjs', 'utf8');
const hostingUsageFunction = readFileSync('supabase/functions/hosting-usage/index.ts', 'utf8');
const muxWebhookFunction = readFileSync('supabase/functions/mux-webhook/index.ts', 'utf8');
const admin = read('admin.html');
const watch = read('watch.html');
const browserScripts = ['videos.js', 'library.js', 'admin.js', 'watch.js'];
const checks = [
  ['Configuration : préfixe GitHub Pages conservé', astroConfig.includes("base: '/zeno-video'")],
  ['Accueil : contenu Zeno Video généré', home.includes('ZENO VIDEO') && home.includes('Bienvenue dans')],
  ['Accueil : zone de galerie générée', home.includes('video-grid') && home.includes('video-count')],
  ['Accueil : CSS relié au bon chemin GitHub Pages', home.includes('href="/zeno-video/style.css?v=11"')],
  ['Accueil : scripts reliés au bon chemin GitHub Pages', home.includes('src="/zeno-video/library.js?v=12"') && home.includes('src="/zeno-video/videos.js"')],
  ['Ressources : feuille de style copiée', existsSync(join(root, 'style.css'))],
  ['Ressources : scripts de galerie copiés', existsSync(join(root, 'videos.js')) && existsSync(join(root, 'library.js'))],
  ['Administration : script conservé', /<script src="admin\.js\?v=\d+" defer><\/script>/.test(admin)],
  ['Administration : suivi des quotas hébergeurs présent', admin.includes('hosting-usage-panel') && admin.includes('refresh-hosting-usage')],
  ['Suivi hébergeurs : compteurs de lecture et téléchargement rattachés au bon service', hostingUsageFunction.includes('metrics: { ...metrics, zeno }') && hostingUsageFunction.includes('metrics: { zeno }')],
  ['Mux : webhook MP4 utilise l’identifiant de l’asset parent, pas celui de la rendition', muxWebhookFunction.includes('data.asset_id ||') && muxWebhookFunction.includes('(event.object?.type === "asset" ? event.object.id : "")') && muxWebhookFunction.includes('Parent asset ID missing from static rendition webhook.')],
  ['Administration : script de suivi des hébergeurs présent', read('admin.js').includes('function loadHostingUsage')],
  ['Administration : valeurs nulles affichées comme indisponibles', read('admin.js').includes('value === null || value === undefined')],
  ['Administration : fichiers de stockage non mesurés signalés', read('admin.js').includes('Fichiers dont la taille est inconnue')],
  ['Administration : stockage DeepStorage estimé depuis les liens', read('admin.js').includes('Stockage Zeno mesuré') && read('admin.js').includes('Fichiers Zeno mesurés')],
  ['Administration : choix ImageKit pour les miniatures', admin.includes('id="cover-provider"') && admin.includes('value="imagekit"')],
  ['Lecteur : script conservé et cache actualisé', watch.includes('watch.js?v=17')],
  ['Lecteur : lecture par identifiant URL', read('watch.js').includes('location.search')],
  ['Lecteur : miniature récupérée depuis Supabase', read('watch.js').includes('thumbnail_url,playback_url')],
  ['Lecteur : couverture affichée avant lancement', read('watch.js').includes('function showCoverPreview')],
  ['Lecteur : aperçu préalable Cloudinary', read('watch.js').includes('function showCloudinaryPlayer')],
  ['Administration : suppression de couverture sécurisée', read('admin.js').includes('deleteVideoAsset: false') && read('admin.js').includes('thumbnail_imagekit_file_id')],
  ['Lecteur : miniature native pour les vidéos directes', read('watch.js').includes('media.poster = video.thumbnail_url')]
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
const mirroredFiles = ['admin.html', 'admin.js', 'watch.html', 'watch.js', 'library.js', 'style.css', 'videos.js'];
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
