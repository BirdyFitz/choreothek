// Erkennung der Jam Sessions in den Jam-Ordnern (Vorschau vor dem Einlesen und Grundlage des Imports).
// Jede PDF ist eine Jam -- außer sie passt auf die Ignorierliste. Liegt sie als einzige PDF in
// ihrem Ordner, ist das der Jam-Ordner (Musik/Videos werden dort gesucht). Liegen mehrere PDFs
// zusammen, bekommt keine automatisch einen Medienordner; er kann von Hand zugewiesen werden.
import fs from 'fs';
import path from 'path';
import { getAllJams, getSetting } from '../db.js';
import { t } from '../../shared/i18n.js';

export const DEFAULT_IGNORE_PATTERNS = ['Handout'];
export const IGNORE_PATTERNS_SETTING = 'jam_ignore_patterns';
// PDFs, aus denen die KI keine Songs lesen konnte (Merkliste) -- nicht bei jedem Einlesen erneut senden
export const NO_SONGS_SETTING = 'jam_import_ignoriert';
export const MEDIA_OVERRIDES_SETTING = 'jam_media_overrides';

const originalName = (pdfFilename) => pdfFilename.replace(/^\d+-/, '').toLowerCase();
const key = (dir, name) => `${path.resolve(dir).toLowerCase()}|${name}`;
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

async function readJson(settingKey, fallback) {
  const raw = await getSetting(settingKey);
  return raw ? JSON.parse(raw) : fallback;
}

async function findAllPdfs(rootPath) {
  const entries = await fs.promises.readdir(rootPath, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name))
    .filter((pdfPath) => !/(^|[\\/])Originale[\\/]/i.test(path.relative(rootPath, pdfPath)));
}

export function matchesIgnore(fileName, patterns) {
  const lower = fileName.toLowerCase();
  return patterns.find((p) => p.trim() && lower.includes(p.trim().toLowerCase())) || null;
}

export async function scanJams() {
  const roots = await readJson('media_roots', []);
  if (roots.length === 0) {
    throw new Error(t('errors.noJamFolder'));
  }
  const patterns = await readJson(IGNORE_PATTERNS_SETTING, DEFAULT_IGNORE_PATTERNS);
  const noSongs = new Set(await readJson(NO_SONGS_SETTING, []));
  const mediaOverrides = await readJson(MEDIA_OVERRIDES_SETTING, {});

  const all = [];
  const ignored = [];
  for (const root of roots) {
    for (const pdf of await findAllPdfs(root)) {
      const pattern = matchesIgnore(path.basename(pdf), patterns);
      if (pattern) ignored.push({ pdf, pattern });
      else all.push({ pdf, root, name: path.basename(pdf).toLowerCase(), folder: path.dirname(pdf) });
    }
  }

  // Eigener Jam-Ordner: genau eine (nicht ignorierte) PDF darin und nicht der Jam-Ordner selbst
  const perFolder = new Map();
  for (const j of all) perFolder.set(j.folder.toLowerCase(), (perFolder.get(j.folder.toLowerCase()) || 0) + 1);
  for (const j of all) {
    j.ownFolder = perFolder.get(j.folder.toLowerCase()) === 1 && !samePath(j.folder, j.root);
    j.mediaFolder = mediaOverrides[j.pdf] || (j.ownFolder ? j.folder : null);
    j.mediaAssigned = Boolean(mediaOverrides[j.pdf]);
  }

  // Bereits eingelesen: gleicher Ordner + Dateiname; bei Jams ohne bekannten Ordner nur der Name
  // (derselbe Dateiname kommt in verschiedenen Jams vor, z. B. "Feb Choreo Notes.pdf")
  const jams = await getAllJams();
  const importedAt = new Set(jams.filter((j) => j.source_folder).map((j) => key(j.source_folder, originalName(j.pdf_filename))));
  const importedNameOnly = new Set(jams.filter((j) => !j.source_folder).map((j) => originalName(j.pdf_filename)));
  const byName = new Map();
  for (const j of all) byName.set(j.name, [...(byName.get(j.name) || []), j]);

  // Jams ohne bekannten Ordner, deren PDF eindeutig in einem eigenen Jam-Ordner liegt
  const folderUpdates = [];
  for (const jam of jams) {
    if (jam.source_folder) continue;
    const matches = byName.get(originalName(jam.pdf_filename));
    if (matches && matches.length === 1 && matches[0].mediaFolder) {
      folderUpdates.push({ jam, folder: matches[0].mediaFolder });
      importedAt.add(key(matches[0].mediaFolder, matches[0].name));
      importedNameOnly.delete(matches[0].name);
    }
  }

  for (const j of all) {
    const imported = (j.mediaFolder && importedAt.has(key(j.mediaFolder, j.name))) || importedAt.has(key(j.folder, j.name)) || importedNameOnly.has(j.name);
    j.status = imported ? 'imported' : noSongs.has(j.name) ? 'noSongs' : 'new';
  }

  return { jams: all, ignored, folderUpdates, patterns };
}
