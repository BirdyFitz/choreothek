import fs from 'fs';
import path from 'path';
import { getUploadsDir } from './paths.js';
import { getAllJams, insertJam, insertSongs, updateJamFolder, getSetting, setSetting } from './db.js';
import { extractWithAi, isFatalAiError, AiError } from './ai/aiService.js';
import { t } from '../shared/i18n.js';

// Keine Choreo Notes einer Jam (Vorgabe): Handouts von Ausbildungen/Academies.
// Eigene Ausschlüsse folgen als Einstellung (Plan Paket 4).
const EXCLUDED_PATTERN = /handout/i;

// PDFs, aus denen die KI keine Songs lesen konnte -- werden gemerkt und nicht bei jedem
// Einlesen erneut (kostenpflichtig) an die KI geschickt
const IGNORE_SETTING = 'jam_import_ignoriert';

async function findAllPdfs(rootPath) {
  const entries = await fs.promises.readdir(rootPath, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name))
    .filter((pdfPath) => !/[\\/]Originale[\\/]/i.test(path.relative(rootPath, pdfPath) ? `/${path.relative(rootPath, pdfPath)}` : ''));
}

async function getJamRoots() {
  const raw = await getSetting('media_roots');
  return raw ? JSON.parse(raw) : [];
}

const originalName = (pdfFilename) => pdfFilename.replace(/^\d+-/, '').toLowerCase();
const key = (dir, name) => `${path.resolve(dir).toLowerCase()}|${name}`;

// Bestandsaufnahme: alle PDFs in den Jam-Ordnern und was davon schon eingelesen ist.
// Bereits importiert: gleicher Ordner + Dateiname; bei Jams ohne bekannten Ordner nur der Name
// (derselbe Dateiname kommt in verschiedenen Jams vor, z.B. "Feb Choreo Notes.pdf")
async function scanJams() {
  const roots = await getJamRoots();
  if (roots.length === 0) {
    throw new Error(t('errors.noJamFolder'));
  }

  const ignoredRaw = await getSetting(IGNORE_SETTING);
  const ignored = new Set(ignoredRaw ? JSON.parse(ignoredRaw) : []);

  const byName = new Map();
  for (const root of roots) {
    for (const pdfPath of await findAllPdfs(root)) {
      const name = path.basename(pdfPath).toLowerCase();
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(pdfPath);
    }
  }

  const jams = await getAllJams();
  const importedAt = new Set(jams.filter((j) => j.source_folder).map((j) => key(j.source_folder, originalName(j.pdf_filename))));
  const importedNameOnly = new Set(jams.filter((j) => !j.source_folder).map((j) => originalName(j.pdf_filename)));

  // Jams ohne bekannten Ordner, deren PDF eindeutig im Archiv liegt
  const folderUpdates = [];
  for (const jam of jams) {
    if (jam.source_folder) continue;
    const matches = byName.get(originalName(jam.pdf_filename));
    if (matches && matches.length === 1) folderUpdates.push({ jam, folder: path.dirname(matches[0]) });
  }
  for (const { jam, folder } of folderUpdates) {
    importedAt.add(key(folder, originalName(jam.pdf_filename)));
    importedNameOnly.delete(originalName(jam.pdf_filename));
  }

  const isNew = (name, sourcePath) =>
    !importedAt.has(key(path.dirname(sourcePath), name)) && !importedNameOnly.has(name) && !EXCLUDED_PATTERN.test(name) && !ignored.has(name);

  const all = [...byName.entries()].flatMap(([name, paths]) => paths.map((p) => ({ name, sourcePath: p })));
  const candidates = all.filter((c) => isNew(c.name, c.sourcePath));
  return { all, candidates, folderUpdates, ignored, isNew };
}

// Für den KI-Plan: welche PDFs würden an die KI gehen (ohne etwas zu verändern)
export async function findJamCandidates() {
  const { candidates } = await scanJams();
  return candidates.map((c) => ({ label: path.basename(c.sourcePath), files: [c.sourcePath] }));
}

// Liest die im bestätigten Plan genannten Jam-PDFs ein (KI-Extraktion) und trägt bei
// vorhandenen Jams einen fehlenden Quellordner nach (ohne KI).
export async function importJamSessions(permit, log = console.log) {
  const { all, folderUpdates, ignored, isNew } = await scanJams();

  let importedEditions = 0;
  let importedSongs = 0;
  let updatedFolders = 0;
  const errors = [];

  for (const { jam, folder } of folderUpdates) {
    await updateJamFolder(jam.id, folder);
    updatedFolders++;
    log(`✓ Ordner nachgetragen: ${originalName(jam.pdf_filename)}`);
  }

  let i = 0;
  for (const item of permit.plan.items) {
    const sourcePath = item.files[0];
    const name = path.basename(sourcePath).toLowerCase();
    // Nur, was bestätigt wurde und inzwischen nicht anderweitig eingelesen ist
    if (!fs.existsSync(sourcePath) || !isNew(name, sourcePath)) continue;
    const destFilename = `${Date.now() + i++}-${path.basename(sourcePath)}`;
    const destPath = path.join(getUploadsDir(), destFilename);

    try {
      fs.copyFileSync(sourcePath, destPath);
      const data = await extractWithAi(permit, 'jam', [destPath]);
      if (data.songs.length === 0) {
        fs.unlinkSync(destPath);
        ignored.add(name);
        errors.push(t('errors.noSongsRecognized', { file: path.basename(sourcePath) }));
        continue;
      }
      const jamId = await insertJam(data.jammer_name, data.jam_date, destFilename, data.location, path.dirname(sourcePath));
      await insertSongs(jamId, data.songs);
      importedEditions++;
      importedSongs += data.songs.length;
      log(`✓ ${path.basename(sourcePath)}: ${data.songs.length} Songs`);
    } catch (error) {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      const text = error instanceof AiError ? t(`errors.ai.${error.code}`) : error.message;
      errors.push(`${path.basename(sourcePath)}: ${text}`);
      if (error instanceof AiError && isFatalAiError(error.code)) break;
    }
  }

  await setSetting(IGNORE_SETTING, JSON.stringify([...ignored].sort()));
  const skippedEditions = all.length - permit.plan.items.length;
  return { importedEditions, importedSongs, skippedEditions, updatedFolders, errors, aiCostUsd: permit.costUsd };
}
