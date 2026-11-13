import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = 'dist';
const required = ['index.html','admin.html','watch.html','style.css','library.js','videos.js','admin.js','watch.js'];
const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  console.error('Fichiers manquants dans le site généré :', missing.join(', '));
  process.exit(1);
}
const read = (file) => readFileSync(join(root, file), 'utf8');
const home = read('index.html');
const admin = read('admin.html');
const watch = read('watch.html');
const checks = [
  ['Accueil : feuille de style avec préfixe GitHub Pages', /href="\/zeno-video\/style\.css/i.test(home)],
  ['Accueil : chargement des données vidéos', /\/zeno-video\/videos\.js/i.test(home)],
  ['Accueil : chargement de la galerie', /\/zeno-video\/library\.js/i.test(home)],
  ['Administration : script conservé', /admin\.js/i.test(admin)],
  ['Lecteur : script conservé', /watch\.js/i.test(watch)],
  ['Lecteur : lecture par identifiant URL', /location\.search/i.test(read('watch.js'))]
];
let failed = false;
for (const [label, passed] of checks) {
  console.log((passed ? '✓ ' : '✗ ') + label);
  if (!passed) failed = true;
}
if (failed) process.exit(1);
console.log('Vérification des routes et ressources Zeno Video réussie.');
