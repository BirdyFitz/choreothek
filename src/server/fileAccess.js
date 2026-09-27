// Welche Dateien darf die App im Kontextmenü öffnen/zeigen? Nur Dateien aus den eingestellten
// Datenquellen und den PDF-Kopien der App -- nie beliebige Pfade aus der Oberfläche.
import fs from 'fs';
import path from 'path';
import { getSetting } from './db.js';
import { getUploadsDir } from './paths.js';

async function allowedRoots() {
  const roots = [getUploadsDir()];
  roots.push(...JSON.parse((await getSetting('media_roots')) || '[]'));
  for (const key of ['megamix_root', 'zin_volumes_mp3_root']) {
    const value = await getSetting(key);
    if (value) roots.push(value);
  }
  // Videos der ZIN Volumes liegen im Ordner über den Choreo Notes
  const choreoRoot = await getSetting('zin_volumes_choreo_root');
  if (choreoRoot) roots.push(path.dirname(choreoRoot));
  return roots.filter(Boolean).map((r) => path.resolve(r).toLowerCase());
}

export async function isAllowedFile(file) {
  if (!file) return false;
  const resolved = path.resolve(file).toLowerCase();
  const roots = await allowedRoots();
  if (!roots.some((root) => resolved.startsWith(root + path.sep))) return false;
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

// Ziel aus der Oberfläche: { dir, file } (Musik/Video) oder { sourcePath, uploadName }
// (Choreo Notes: Original bevorzugt, sonst die Kopie der App). Ergebnis: erlaubter Pfad oder null.
export async function resolveFileTarget(target) {
  const candidates = [];
  if (target?.dir && target?.file) candidates.push(path.join(target.dir, target.file));
  if (target?.sourcePath) candidates.push(target.sourcePath);
  if (target?.uploadName) candidates.push(path.join(getUploadsDir(), path.basename(target.uploadName)));
  for (const candidate of candidates) {
    if (await isAllowedFile(candidate)) return candidate;
  }
  return null;
}

export function isAppCopy(file) {
  return path.resolve(file).toLowerCase().startsWith(path.resolve(getUploadsDir()).toLowerCase() + path.sep);
}
