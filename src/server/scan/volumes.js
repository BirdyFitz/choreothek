// Erkennung der ZIN Volumes und MegaMixe in den eingestellten Ordnern (Vorschau vor dem Einlesen).
// Nummern werden tolerant aus Ordner- und Dateinamen gelesen; was nicht erkannt wird, landet in
// „unrecognized“ und kann in der Vorschau von Hand einer Edition zugeordnet werden (overrides).
import fs from 'fs';
import path from 'path';
import { editionNumber, variantOf } from './editionNumber.js';

const AUDIO = /\.(mp3|m4a|wav|flac|ogg)$/i;
const VIDEO = /\.(mp4|mov|m4v|avi|mkv)$/i;
const PDF = /\.pdf$/i;

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

const filesIn = (dir, pattern) => listDir(dir).filter((e) => e.isFile() && pattern.test(e.name)).map((e) => e.name);
const subfolders = (dir) => listDir(dir).filter((e) => e.isDirectory() && !/^originale$/i.test(e.name)).map((e) => path.join(dir, e.name));
// Ordner mit Nummer im eigenen Namen zuerst: sie haben Vorrang vor Ordnern, deren Nummer nur
// aus den Dateinamen stammt (sonst entschiede die Reihenfolge im Dateisystem)
const namedFirst = (folders) => [...folders].sort((a, b) => (editionNumber(path.basename(a)) == null) - (editionNumber(path.basename(b)) == null));
const samePath = (a, b) => Boolean(a && b) && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// Nummer eines Ordners: aus dem Ordnernamen, sonst aus den Dateinamen darin -- aber nur, wenn
// mindestens die Hälfte der Dateien dieselbe Nummer trägt (ein Sammelordner mit einer einzelnen
// „Zin_34“-Datei ist nicht Volume 34)
function folderNumber(folder, pattern) {
  const own = editionNumber(path.basename(folder));
  if (own != null) return own;
  const files = filesIn(folder, pattern);
  const counts = new Map();
  for (const f of files) {
    const n = editionNumber(f);
    if (n != null) counts.set(n, (counts.get(n) || 0) + 1);
  }
  const [best, count] = [...counts].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  return count >= Math.max(2, Math.ceil(files.length / 2)) ? best : null;
}

// overrides: { [nummer]: { musicFolder?, liveFolder?, oneononeFolder? } } -- von Hand zugeordnete Ordner
export function scanZinVolumes({ choreoRoot, musicRoot, videoRoot, overrides = {} }) {
  const editions = new Map();
  const unrecognized = [];
  const edition = (n) => {
    if (!editions.has(n)) {
      editions.set(n, { number: n, pdfs: [], musicFolder: null, mp3Count: 0, liveFolder: null, liveCount: 0, oneononeFolder: null, oneononeCount: 0 });
    }
    return editions.get(n);
  };

  // Choreo Notes: PDFs im Ordner und in Unterordnern (eine Ebene); Nummer aus Datei- oder Ordnername
  if (choreoRoot) {
    const places = [choreoRoot, ...subfolders(choreoRoot)];
    for (const dir of places) {
      for (const file of filesIn(dir, PDF)) {
        const n = editionNumber(file) ?? (dir === choreoRoot ? null : editionNumber(path.basename(dir)));
        const full = path.join(dir, file);
        if (n == null) unrecognized.push({ kind: 'pdf', path: full });
        else edition(n).pdfs.push({ file: full, variant: variantOf(file) });
      }
    }
  }

  const assign = (kind, folder, n, count, field, countField) => {
    if (n == null) return unrecognized.push({ kind, path: folder, count });
    const e = edition(n);
    if (e[field]) return unrecognized.push({ kind, path: folder, count, duplicateOf: n });
    e[field] = folder;
    e[countField] = count;
  };

  if (musicRoot) {
    for (const folder of namedFirst(subfolders(musicRoot))) {
      const count = filesIn(folder, AUDIO).length;
      if (count === 0) continue;
      assign('music', folder, folderNumber(folder, AUDIO), count, 'musicFolder', 'mp3Count');
    }
  }

  if (videoRoot) {
    for (const folder of namedFirst(subfolders(videoRoot))) {
      if (samePath(folder, choreoRoot)) continue;
      const videos = filesIn(folder, VIDEO);
      if (videos.length === 0) continue;
      let variant = variantOf(path.basename(folder));
      if (variant === 'combined') variant = variantOf(videos[0]);
      const n = folderNumber(folder, VIDEO);
      if (variant === 'live') assign('live', folder, n, videos.length, 'liveFolder', 'liveCount');
      else if (variant === 'oneonone') assign('oneonone', folder, n, videos.length, 'oneononeFolder', 'oneononeCount');
      else unrecognized.push({ kind: 'video', path: folder, count: videos.length });
    }
  }

  // Zuordnungen von Hand gehen vor; so zugeordnete Ordner sind nicht mehr „nicht erkannt“
  const COUNTS = { musicFolder: ['mp3Count', AUDIO], liveFolder: ['liveCount', VIDEO], oneononeFolder: ['oneononeCount', VIDEO] };
  for (const [n, o] of Object.entries(overrides)) {
    const e = edition(Number(n));
    for (const [field, [countField, pattern]] of Object.entries(COUNTS)) {
      if (!o[field]) continue;
      e[field] = o[field];
      e[countField] = filesIn(o[field], pattern).length;
      for (let i = unrecognized.length - 1; i >= 0; i--) if (samePath(unrecognized[i].path, o[field])) unrecognized.splice(i, 1);
    }
  }

  for (const e of editions.values()) {
    const order = { combined: 0, live: 1, oneonone: 2 };
    e.pdfs.sort((a, b) => order[a.variant] - order[b.variant]);
  }
  return { editions: [...editions.values()].sort((a, b) => a.number - b.number), unrecognized };
}

export function scanMegaMixes({ root, overrides = {} }) {
  const editions = new Map();
  const unrecognized = [];
  if (root) {
    for (const folder of namedFirst(subfolders(root))) {
      const count = filesIn(folder, AUDIO).length;
      if (count === 0) continue;
      const n = folderNumber(folder, AUDIO);
      if (n == null) unrecognized.push({ kind: 'music', path: folder, count });
      else if (editions.has(n)) unrecognized.push({ kind: 'music', path: folder, count, duplicateOf: n });
      else editions.set(n, { number: n, folder, mp3Count: count });
    }
  }
  for (const [n, o] of Object.entries(overrides)) {
    if (!o.musicFolder) continue;
    editions.set(Number(n), { number: Number(n), folder: o.musicFolder, mp3Count: filesIn(o.musicFolder, AUDIO).length });
    for (let i = unrecognized.length - 1; i >= 0; i--) if (samePath(unrecognized[i].path, o.musicFolder)) unrecognized.splice(i, 1);
  }
  return { editions: [...editions.values()].sort((a, b) => a.number - b.number), unrecognized };
}
