import fs from 'fs';
import path from 'path';
import { getUploadsDir } from './paths.js';
import { getAllZinVolumeEditionLabels, getAllZinVolumesFull, insertZinVolume, insertZinVolumeSongs, updateZinVolumeFolders } from './db.js';
import { extractWithAi, isFatalAiError, AiError } from './ai/aiService.js';
import { scanZinFromSettings, zinFolders } from './scan/settings.js';
import { findWarmupSongs } from './utils/warmupParser.js';
import { t } from '../shared/i18n.js';

const label = (editionNumber) => `ZIN Volume ${editionNumber}`;

async function scanZin() {
  const { choreoRoot } = await zinFolders();
  if (!choreoRoot) {
    throw new Error(t('errors.noChoreoFolder'));
  }
  const alreadyImported = new Set(await getAllZinVolumeEditionLabels());
  const { editions } = await scanZinFromSettings();
  const candidates = editions
    .filter((e) => e.pdfs.length > 0 && !alreadyImported.has(label(e.number)))
    .map((e) => ({ label: label(e.number), editionNumber: e.number, files: e.pdfs.map((p) => p.file) }));
  return { editions, alreadyImported, candidates };
}

// Für den KI-Plan: welche Volumes (PDF-Gruppen) würden an die KI gehen
export async function findZinCandidates() {
  return (await scanZin()).candidates;
}

// Liest die im bestätigten Plan genannten Volumes ein (KI-Extraktion) und trägt bei bereits
// eingelesenen Volumes fehlende Musik-/Video-Ordner nach (ohne KI).
// onProgress({ done, total, current }) meldet den Fortschritt je Volume; isCancelled() bricht nach dem
// laufenden Volume ab.
export async function importZinVolumes(permit, { onProgress = () => {}, isCancelled = () => false } = {}) {
  const { editions, alreadyImported } = await scanZin();
  const byNumber = new Map(editions.map((e) => [e.number, e]));

  let importedEditions = 0;
  let importedSongs = 0;
  const skippedEditions = editions.filter((e) => e.pdfs.length > 0).length - permit.plan.items.length;
  const errors = [];

  const items = permit.plan.items;
  for (const [index, item] of items.entries()) {
    if (isCancelled()) break;
    const { editionNumber } = item;
    const editionLabel = item.label;
    onProgress({ done: index, total: items.length, current: editionLabel });
    const edition = byNumber.get(editionNumber);
    if (!edition || alreadyImported.has(editionLabel) || !item.files.every((f) => fs.existsSync(f))) continue;
    try {
      const destFilenames = [];
      const destPaths = [];
      for (const file of item.files) {
        const destFilename = `${Date.now() + destFilenames.length}-${path.basename(file)}`;
        const destPath = path.join(getUploadsDir(), destFilename);
        fs.copyFileSync(file, destPath);
        destFilenames.push(destFilename);
        destPaths.push(destPath);
      }

      const data = await extractWithAi(permit, 'zin', destPaths);

      const songs = data.songs.map((s, i) => ({
        name: s.name,
        artist: s.artist,
        rhythm: s.rhythm,
        position: i + 1,
        live_pdf_filename: s.live_page && s.live_source ? destFilenames[s.live_source - 1] : null,
        live_page: s.live_page ?? null,
        oneonone_pdf_filename: s.oneonone_page && s.oneonone_source ? destFilenames[s.oneonone_source - 1] : null,
        oneonone_page: s.oneonone_page ?? null
      }));

      // Die Warm-up-Medley (i.d.R. 3 Songs, eine gemeinsame Choreo auf Seite 1 der LIVE-PDF)
      // steht nicht als eigene Song-Zeile in der Choreo-Notes-PDF und wird stattdessen direkt
      // aus den Warm-up-MP3-Dateinamen ergänzt.
      const warmupSongs = findWarmupSongs(edition.musicFolder).map((w, i, arr) => ({
        name: w.name,
        artist: null,
        rhythm: 'Warm-up',
        position: i - arr.length,
        live_pdf_filename: destFilenames[0],
        live_page: 1,
        oneonone_pdf_filename: null,
        oneonone_page: null
      }));

      const allSongs = [...warmupSongs, ...songs];
      const zinVolumeId = await insertZinVolume(editionNumber, editionLabel, edition.musicFolder, edition.liveFolder, edition.oneononeFolder);
      await insertZinVolumeSongs(zinVolumeId, allSongs);

      alreadyImported.add(editionLabel);
      importedEditions++;
      importedSongs += allSongs.length;
      console.log(`✓ ${editionLabel}: ${allSongs.length} Songs`);
    } catch (error) {
      const text = error instanceof AiError ? t(`errors.ai.${error.code}`) : error.message;
      errors.push(`${editionLabel}: ${text}`);
      console.error(`✗ ${editionLabel}: ${error.message}`);
      if (error instanceof AiError && isFatalAiError(error.code)) break;
    }
  }
  onProgress({ done: items.length, total: items.length, current: null });

  // Bereits eingelesene Volumes: fehlende Ordner nachtragen (z. B. Videos erst nach dem Einlesen
  // entpackt). Gesetzte Ordner bleiben unverändert, kein KI-Aufruf.
  let updatedFolders = 0;
  for (const zv of await getAllZinVolumesFull()) {
    const e = byNumber.get(zv.edition_number);
    if (!e) continue;
    const audioFolder = zv.audio_folder || e.musicFolder;
    const liveVideoFolder = zv.live_video_folder || e.liveFolder;
    const oneOnOneVideoFolder = zv.oneonone_video_folder || e.oneononeFolder;
    if (audioFolder !== zv.audio_folder || liveVideoFolder !== zv.live_video_folder || oneOnOneVideoFolder !== zv.oneonone_video_folder) {
      await updateZinVolumeFolders(zv.edition_label, audioFolder, liveVideoFolder, oneOnOneVideoFolder);
      updatedFolders++;
      console.log(`✓ ${zv.edition_label}: fehlende Ordner nachgetragen`);
    }
  }

  return { importedEditions, importedSongs, skippedEditions, updatedFolders, errors, aiCostUsd: permit.costUsd };
}
