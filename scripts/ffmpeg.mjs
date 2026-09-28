// ffmpeg für den Installer bereitstellen (Ziel: build/ffmpeg, wird als „ffmpeg“ neben die App gelegt).
//
//   node scripts/ffmpeg.mjs          lädt die LGPL-Fassung (shared) von BtbN/FFmpeg-Builds und prüft die
//                                    Prüfsumme gegen deren checksums.sha256 (für GitHub Actions)
//   node scripts/ffmpeg.mjs --local  kopiert ein vorhandenes ffmpeg (Einstellung/winget/PATH) -- ohne Download
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import yauzl from 'yauzl';
import { ffmpegPath } from '../src/server/video/ffmpeg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'build', 'ffmpeg');
const RELEASES = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest';

function reset() {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}

function local() {
  const ff = ffmpegPath();
  if (ff === 'ffmpeg' || !fs.existsSync(ff)) throw new Error('Kein ffmpeg gefunden (CHOREOTHEK_FFMPEG setzen oder per winget installieren).');
  reset();
  const dir = path.dirname(ff);
  for (const f of fs.readdirSync(dir).filter((f) => /^(ffmpeg|ffprobe)\.exe$|\.dll$/i.test(f))) fs.copyFileSync(path.join(dir, f), path.join(target, f));
  for (const lic of ['LICENSE', 'LICENSE.txt', 'README.txt']) {
    const p = path.join(dir, '..', lic);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(target, `LICENSE-ffmpeg${path.extname(lic) || '.txt'}`));
  }
  console.log(`ffmpeg aus ${dir} nach ${target} kopiert`);
}

async function json(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'choreothek-build', Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function download() {
  const release = await json(RELEASES);
  // neueste feste Version (nicht „master“), LGPL, gemeinsame Bibliotheken: ffmpeg-n9.0-latest-win64-lgpl-shared-9.0.zip
  const assets = release.assets
    .map((a) => ({ ...a, v: a.name.match(/^ffmpeg-n(\d+)\.(\d+)-latest-win64-lgpl-shared-\1\.\2\.zip$/) }))
    .filter((a) => a.v)
    .sort((a, b) => b.v[1] - a.v[1] || b.v[2] - a.v[2]);
  const asset = assets[0];
  if (!asset) throw new Error('Keine passende ffmpeg-Datei in der Release-Liste gefunden.');
  const sums = await (await fetch(release.assets.find((a) => a.name === 'checksums.sha256').browser_download_url)).text();
  const expected = sums.split('\n').find((l) => l.trim().endsWith(asset.name))?.split(/\s+/)[0];
  if (!expected) throw new Error(`Keine Prüfsumme für ${asset.name}`);

  console.log(`Lade ${asset.name} (${Math.round(asset.size / 1e6)} MB) …`);
  const buf = Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer());
  const actual = crypto.createHash('sha256').update(buf).digest('hex');
  if (actual !== expected) throw new Error(`Prüfsumme stimmt nicht: ${actual} statt ${expected}`);

  reset();
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.on('end', resolve);
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        const name = entry.fileName;
        const base = path.basename(name);
        const wanted = /\/bin\/((ffmpeg|ffprobe)\.exe|[^/]+\.dll)$/i.test(name) ? base : /\/LICENSE\.txt$/i.test(name) ? 'LICENSE-ffmpeg.txt' : null;
        if (!wanted) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => {
          if (e) return reject(e);
          stream.pipe(fs.createWriteStream(path.join(target, wanted))).on('close', () => zip.readEntry());
        });
      });
      zip.readEntry();
    });
  });
  console.log(`ffmpeg ${asset.v[1]}.${asset.v[2]} (LGPL) geprüft und nach ${target} entpackt: ${fs.readdirSync(target).join(', ')}`);
}

(process.argv.includes('--local') ? Promise.resolve().then(local) : download()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
