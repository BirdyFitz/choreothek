// Welche Dateien darf die App im Kontextmenü öffnen/zeigen? Nur Dateien aus den eingestellten
// Datenquellen und den PDF-Kopien der App -- nie beliebige Pfade aus der Oberfläche.
import fs from 'fs';
import path from 'path';
import { getSetting } from './db.js';
import { getUploadsDir } from './paths.js';
import { zinFolders, ZIN_OVERRIDES_SETTING, MEGAMIX_OVERRIDES_SETTING } from './scan/settings.js';
import { MEDIA_OVERRIDES_SETTING } from './scan/jams.js';

// Alle Ordner, aus denen Musik/Videos ausgeliefert werden dürfen: Datenquellen und die in der
// Vorschau von Hand zugeordneten Ordner (die auch außerhalb der Datenquellen liegen können)
export async function mediaRoots() {
  const json = async (key, fallback) => JSON.parse((await getSetting(key)) || JSON.stringify(fallback));
  const roots = [...(await json('media_roots', []))];
  const { choreoRoot, musicRoot, videoRoot } = await zinFolders();
  roots.push(await getSetting('megamix_root'), choreoRoot, musicRoot, videoRoot);
  for (const key of [ZIN_OVERRIDES_SETTING, MEGAMIX_OVERRIDES_SETTING]) {
    for (const entry of Object.values(await json(key, {}))) roots.push(...Object.values(entry));
  }
  roots.push(...Object.values(await json(MEDIA_OVERRIDES_SETTING, {})));
  return roots.filter(Boolean);
}

async function allowedRoots() {
  return [getUploadsDir(), ...(await mediaRoots())].map((r) => path.resolve(r).toLowerCase());
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
