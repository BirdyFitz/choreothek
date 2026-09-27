import fs from 'fs';
import path from 'path';
import { getUploadsDir } from './paths.js';
import { getAllJams, insertJam, insertSongs, updateJamFolder, getSetting, setSetting } from './db.js';
import { extractJamData } from './utils/claudeExtractor.js';
import { t } from '../shared/i18n.js';

// Keine Choreo Notes einer Jam (Vorgabe): Handouts von Ausbildungen/Academies.
// Eigene Ausschlüsse folgen als Einstellung (Plan Paket 4).
const EXCLUDED_PATTERN = /handout/i;

// PDFs, aus denen Claude keine Songs lesen konnte -- werden gemerkt und nicht bei jedem
// Einlesen erneut (kostenpflichtig) an Claude geschickt
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
  const roots = raw ? JSON.parse(raw) : [];
  if (roots.length > 0) return roots;
  return [];
}

const originalName = (pdfFilename) => pdfFilename.replace(/^\d+-/, '').toLowerCase();

// Liest neue Jam-Session-PDFs aus den Jam-Session-Ordnern ein (Claude-Extraktion) und trägt
// bei vorhandenen Jams einen fehlenden Quellordner nach (z.B. manuell hochgeladene PDFs,
// die inzwischen im Archiv liegen). Bereits importierte PDFs werden am Dateinamen erkannt.
export async function importJamSessions(log = console.log) {
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
  // Bereits importiert: gleicher Ordner + Dateiname; bei Jams ohne bekannten Ordner nur der Name
  // (derselbe Dateiname kommt in verschiedenen Jams vor, z.B. "Feb Choreo Notes.pdf")
  const key = (dir, name) => `${path.resolve(dir).toLowerCase()}|${name}`;
  const importedAt = new Set(jams.filter((j) => j.source_folder).map((j) => key(j.source_folder, originalName(j.pdf_filename))));
  const importedNameOnly = new Set(jams.filter((j) => !j.source_folder).map((j) => originalName(j.pdf_filename)));

  let importedEditions = 0;
  let importedSongs = 0;
  let skippedEditions = 0;
  let updatedFolders = 0;
  const errors = [];

  // Fehlende Quellordner nachtragen (nur bei eindeutigem Dateinamen)
  for (const jam of jams) {
    if (jam.source_folder) continue;
    const matches = byName.get(originalName(jam.pdf_filename));
    if (matches && matches.length === 1) {
      await updateJamFolder(jam.id, path.dirname(matches[0]));
      importedAt.add(key(path.dirname(matches[0]), originalName(jam.pdf_filename)));
      importedNameOnly.delete(originalName(jam.pdf_filename));
      updatedFolders++;
      log(`✓ Ordner nachgetragen: ${originalName(jam.pdf_filename)}`);
    }
  }

  const candidates = [...byName.entries()].flatMap(([name, paths]) => paths.map((p) => [name, p]));
  let i = 0;
  for (const [name, sourcePath] of candidates) {
    if (
      importedAt.has(key(path.dirname(sourcePath), name)) ||
      importedNameOnly.has(name) ||
      EXCLUDED_PATTERN.test(name) ||
      ignored.has(name)
    ) {
      skippedEditions++;
      continue;
    }
    const destFilename = `${Date.now() + i++}-${path.basename(sourcePath)}`;
    const destPath = path.join(getUploadsDir(), destFilename);

    try {
      fs.copyFileSync(sourcePath, destPath);
      const data = await extractJamData(destPath);
      if (!data.songs || data.songs.length === 0) {
        fs.unlinkSync(destPath);
        ignored.add(name);
        errors.push(t('errors.noSongsRecognized', { file: path.basename(sourcePath) }));
        continue;
      }
      const jamId = await insertJam(data.jammer_name, data.jam_date, destFilename, data.location, path.dirname(sourcePath));
      await insertSongs(jamId, data.songs);
      importedEditions++;
      importedSongs += data.songs.length;
      log(`✓ ${path.basename(sourcePath)}: ${data.songs.length} Songs (Jammer: ${data.jammer_name})`);
    } catch (error) {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      errors.push(`${path.basename(sourcePath)}: ${error.message}`);
    }
  }

  await setSetting(IGNORE_SETTING, JSON.stringify([...ignored].sort()));
  return { importedEditions, importedSongs, skippedEditions, updatedFolders, errors };
}
