import fs from 'fs';
import path from 'path';
import { getUploadsDir } from './paths.js';
import { insertJam, insertSongs, updateJamFolder, getSetting, setSetting } from './db.js';
import { extractWithAi, isFatalAiError, AiError } from './ai/aiService.js';
import { scanJams, NO_SONGS_SETTING } from './scan/jams.js';
import { t } from '../shared/i18n.js';

// Für den KI-Plan: welche PDFs würden an die KI gehen (ohne etwas zu verändern)
export async function findJamCandidates() {
  const { jams } = await scanJams();
  return jams.filter((j) => j.status === 'new').map((j) => ({ label: path.basename(j.pdf), files: [j.pdf] }));
}

// Liest die im bestätigten Plan genannten Jam-PDFs ein (KI-Extraktion) und trägt bei
// vorhandenen Jams einen fehlenden Jam-Ordner nach (ohne KI).
// onProgress({ done, total, current }) meldet den Fortschritt je PDF.
export async function importJamSessions(permit, { log = console.log, onProgress = () => {} } = {}) {
  const { jams, folderUpdates } = await scanJams();
  const byPdf = new Map(jams.map((j) => [path.resolve(j.pdf).toLowerCase(), j]));
  const noSongsRaw = await getSetting(NO_SONGS_SETTING);
  const noSongs = new Set(noSongsRaw ? JSON.parse(noSongsRaw) : []);

  let importedEditions = 0;
  let importedSongs = 0;
  let updatedFolders = 0;
  const errors = [];

  for (const { jam, folder } of folderUpdates) {
    await updateJamFolder(jam.id, folder);
    updatedFolders++;
    log(`✓ Ordner nachgetragen: ${path.basename(folder)}`);
  }

  const items = permit.plan.items;
  let i = 0;
  for (const item of items) {
    const sourcePath = item.files[0];
    onProgress({ done: i, total: items.length, current: item.label });
    // Nur, was bestätigt wurde und weiterhin als neu erkannt wird
    const jam = byPdf.get(path.resolve(sourcePath).toLowerCase());
    if (!jam || jam.status !== 'new' || !fs.existsSync(sourcePath)) {
      i++;
      continue;
    }
    const destFilename = `${Date.now() + i++}-${path.basename(sourcePath)}`;
    const destPath = path.join(getUploadsDir(), destFilename);

    try {
      fs.copyFileSync(sourcePath, destPath);
      const data = await extractWithAi(permit, 'jam', [destPath]);
      if (data.songs.length === 0) {
        fs.unlinkSync(destPath);
        noSongs.add(jam.name);
        errors.push(t('errors.noSongsRecognized', { file: path.basename(sourcePath) }));
        continue;
      }
      const jamId = await insertJam(data.jammer_name, data.jam_date, destFilename, data.location, jam.mediaFolder);
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
  onProgress({ done: items.length, total: items.length, current: null });

  await setSetting(NO_SONGS_SETTING, JSON.stringify([...noSongs].sort()));
  const skippedEditions = jams.length - items.length;
  return { importedEditions, importedSongs, skippedEditions, updatedFolders, errors, aiCostUsd: permit.costUsd };
}
