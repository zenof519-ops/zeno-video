import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
const admin = read('admin.html');
const watch = read('watch.html');
const checks = [
  ['Configuration : préfixe GitHub Pages conservé', astroConfig.includes("base: '/zeno-video'")],
  ['Accueil : contenu Zeno Video généré', home.includes('ZENO VIDEO') && home.includes('Bienvenue dans')],
  ['Accueil : zone de galerie générée', home.includes('video-grid') && home.includes('video-count')],
  ['Ressources : feuille de style copiée', existsSync(join(root, 'style.css'))],
  ['Ressources : scripts de galerie copiés', existsSync(join(root, 'videos.js')) && existsSync(join(root, 'library.js'))],
  ['Administration : script conservé', admin.includes('admin.js')],
  ['Lecteur : script conservé', watch.includes('watch.js')],
  ['Lecteur : lecture par identifiant URL', read('watch.js').includes('location.search')]
];
let failed = false;
for (const [label, passed] of checks) {
  console.log((passed ? '✓ ' : '✗ ') + label);
  if (!passed) failed = true;
}
if (failed) process.exit(1);
console.log('Vérification des routes et ressources Zeno Video réussie.');
