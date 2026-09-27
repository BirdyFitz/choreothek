import fs from 'fs';
import path from 'path';
import { getUploadsDir } from './paths.js';
import {
  getAllZinVolumeEditionLabels,
  getAllZinVolumesFull,
  insertZinVolume,
  insertZinVolumeSongs,
  updateZinVolumeFolders,
  getSetting
} from './db.js';
import { extractWithAi, isFatalAiError, AiError } from './ai/aiService.js';
import { findFolderByEditionNumber } from './utils/editionFolderResolver.js';
import { findWarmupSongs } from './utils/warmupParser.js';
import { t } from '../shared/i18n.js';


const VARIANT_ORDER = { combined: 0, live: 1, oneonone: 2 };

function detectVariant(filename) {
  if (/1on1/i.test(filename)) return 'oneonone';
  if (/live/i.test(filename)) return 'live';
  return 'combined';
}

function groupPdfsByEdition(pdfFilenames) {
  const groups = new Map();
  for (const filename of pdfFilenames) {
    const match = filename.match(/^(\d+)/);
    if (!match) continue;
    const editionNumber = parseInt(match[1], 10);
    if (!groups.has(editionNumber)) groups.set(editionNumber, []);
    groups.get(editionNumber).push({ filename, variant: detectVariant(filename) });
  }
  for (const files of groups.values()) {
    files.sort((a, b) => VARIANT_ORDER[a.variant] - VARIANT_ORDER[b.variant]);
  }
  return groups;
}

async function scanZin() {
  const root = await getSetting('zin_volumes_choreo_root');
  if (!root) {
    throw new Error(t('errors.noChoreoFolder'));
  }
  const alreadyImported = new Set(await getAllZinVolumeEditionLabels());
  const allFiles = await fs.promises.readdir(root);
  const groups = groupPdfsByEdition(allFiles.filter((f) => f.toLowerCase().endsWith('.pdf')));
  const label = (editionNumber) => `ZIN Volume ${editionNumber}`;
  const candidates = [...groups]
    .filter(([editionNumber]) => !alreadyImported.has(label(editionNumber)))
    .map(([editionNumber, files]) => ({
      label: label(editionNumber),
      editionNumber,
      files: files.map((f) => path.join(root, f.filename))
    }));
  return { root, groups, alreadyImported, candidates };
}

// Für den KI-Plan: welche Volumes (PDF-Gruppen) würden an die KI gehen
export async function findZinCandidates() {
  return (await scanZin()).candidates;
}

// Liest die im bestätigten Plan genannten Volumes ein (KI-Extraktion) und trägt bei bereits
// eingelesenen Volumes fehlende Audio-/Video-Ordner nach (ohne KI).
export async function importZinVolumes(permit) {
  const { root, groups, alreadyImported } = await scanZin();
  const mp3Root = await getSetting('zin_volumes_mp3_root');
  const videoRoot = path.dirname(root);

  let importedEditions = 0;
  let importedSongs = 0;
  const skippedEditions = groups.size - permit.plan.items.length;
  const errors = [];

  for (const item of permit.plan.items) {
    const { editionNumber } = item;
    const editionLabel = item.label;
    if (alreadyImported.has(editionLabel) || !item.files.every((f) => fs.existsSync(f))) continue;
    try {
      const destFilenames = [];
      const destPaths = [];
      for (const file of item.files) {
        const timestamp = Date.now() + destFilenames.length;
        const destFilename = `${timestamp}-${path.basename(file)}`;
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

      const audioFolder = findFolderByEditionNumber(mp3Root, editionNumber, null);
      const liveVideoFolder = findFolderByEditionNumber(videoRoot, editionNumber, 'live-class');
      const oneOnOneVideoFolder = findFolderByEditionNumber(videoRoot, editionNumber, 'one-on-one');

      // Die Warm-up-Medley (i.d.R. 3 Songs, eine gemeinsame Choreo auf Seite 1 der LIVE-PDF)
      // steht nicht als eigene Song-Zeile in der Choreo-Notes-PDF und wird stattdessen direkt
      // aus den Warm-up-MP3-Dateinamen ergänzt.
      const warmupSongs = findWarmupSongs(audioFolder).map((w, i, arr) => ({
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

      const zinVolumeId = await insertZinVolume(editionNumber, editionLabel, audioFolder, liveVideoFolder, oneOnOneVideoFolder);
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

  // Bereits importierte Volumes: fehlende Audio-/Video-Ordner nachtragen (z.B. Videos erst
  // nach dem Einlesen entpackt). Gesetzte Ordner bleiben unverändert, kein KI-Aufruf.
  let updatedFolders = 0;
  for (const zv of await getAllZinVolumesFull()) {
    if (zv.audio_folder && zv.live_video_folder && zv.oneonone_video_folder) continue;
    const audioFolder = zv.audio_folder || findFolderByEditionNumber(mp3Root, zv.edition_number, null);
    const liveVideoFolder = zv.live_video_folder || findFolderByEditionNumber(videoRoot, zv.edition_number, 'live-class');
    const oneOnOneVideoFolder =
      zv.oneonone_video_folder || findFolderByEditionNumber(videoRoot, zv.edition_number, 'one-on-one');
    if (
      audioFolder !== zv.audio_folder ||
      liveVideoFolder !== zv.live_video_folder ||
      oneOnOneVideoFolder !== zv.oneonone_video_folder
    ) {
      await updateZinVolumeFolders(zv.edition_label, audioFolder, liveVideoFolder, oneOnOneVideoFolder);
      updatedFolders++;
      console.log(`✓ ${zv.edition_label}: fehlende Ordner nachgetragen`);
    }
  }

  return { importedEditions, importedSongs, skippedEditions, updatedFolders, errors, aiCostUsd: permit.costUsd };
}
