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
const admin = read('admin.html');
const watch = read('watch.html');
const checks = [
  ['Accueil : feuille de style avec préfixe GitHub Pages', home.includes('/zeno-video/style.css')],
  ['Accueil : chargement des données vidéos', home.includes('/zeno-video/videos.js')],
  ['Accueil : chargement de la galerie', home.includes('/zeno-video/library.js')],
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
