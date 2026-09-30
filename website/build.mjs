// Webseite choreothek.eu bauen: Seiten aus pages/ in das gemeinsame Layout setzen, Dateien aus
// assets/ übernehmen -> dist/. Keine Pakete, kein JavaScript auf der Seite, keine fremden Quellen.
//
// Jede Seite beginnt mit einer Kopfzeile als HTML-Kommentar:
//   <!-- {"title": "…", "description": "…", "nav": "anleitung"} -->
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const layout = fs.readFileSync(path.join(root, 'layout.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, '..', 'package.json'), 'utf8'));

// Download: direkt die Installer-Datei der aktuellen Version (die Release-Seite von GitHub verwirrt:
// Installer unter „Assets“ versteckt, Werbung für GitHub). Deshalb lädt der Release-Workflow die
// Webseite erst hoch, wenn der Installer veröffentlicht ist.
const DOWNLOAD = `https://github.com/BirdyFitz/choreothek/releases/download/v${pkg.version}/Choreothek-Setup-${pkg.version}.exe`;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(path.join(root, 'assets'), dist, { recursive: true });

for (const file of fs.readdirSync(path.join(root, 'pages')).filter((f) => f.endsWith('.html'))) {
  const source = fs.readFileSync(path.join(root, 'pages', file), 'utf8');
  const head = source.match(/^<!--\s*(\{[\s\S]*?\})\s*-->/);
  if (!head) throw new Error(`${file}: Kopfzeile fehlt`);
  const meta = JSON.parse(head[1]);
  const body = source.slice(head[0].length);
  const html = layout
    .replaceAll('{{title}}', meta.title)
    .replaceAll('{{description}}', meta.description)
    .replaceAll('{{content}}', body)
    .replaceAll('{{download}}', DOWNLOAD)
    .replaceAll('{{version}}', pkg.version)
    .replaceAll('{{year}}', String(new Date().getFullYear()))
    .replace(new RegExp(`data-nav="${meta.nav}"`, 'g'), `data-nav="${meta.nav}" aria-current="page"`);
  if (/\{\{\w+\}\}/.test(html)) throw new Error(`${file}: Platzhalter nicht ersetzt: ${html.match(/\{\{\w+\}\}/)[0]}`);
  fs.writeFileSync(path.join(dist, file), html);
}
console.log(`Webseite gebaut: ${fs.readdirSync(dist).join(', ')}`);
