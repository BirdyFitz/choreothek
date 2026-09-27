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
import { extractZinVolumeSongs } from './utils/zinVolumeExtractor.js';
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

export async function importZinVolumes(choreoRoot) {
  const root = choreoRoot || (await getSetting('zin_volumes_choreo_root'));
  if (!root) {
    throw new Error(t('errors.noChoreoFolder'));
  }

  const mp3Root = await getSetting('zin_volumes_mp3_root');
  const videoRoot = path.dirname(root);

  const alreadyImported = new Set(await getAllZinVolumeEditionLabels());

  const allFiles = await fs.promises.readdir(root);
  const pdfFilenames = allFiles.filter((f) => f.toLowerCase().endsWith('.pdf'));
  const groups = groupPdfsByEdition(pdfFilenames);

  let importedEditions = 0;
  let importedSongs = 0;
  let skippedEditions = 0;
  const errors = [];

  for (const [editionNumber, files] of groups) {
    const editionLabel = `ZIN Volume ${editionNumber}`;
    if (alreadyImported.has(editionLabel)) {
      skippedEditions++;
      continue;
    }

    try {
      const destFilenames = [];
      const destPaths = [];
      for (const file of files) {
        const timestamp = Date.now() + destFilenames.length;
        const destFilename = `${timestamp}-${file.filename}`;
        const destPath = path.join(getUploadsDir(), destFilename);
        fs.copyFileSync(path.join(root, file.filename), destPath);
        destFilenames.push(destFilename);
        destPaths.push(destPath);
      }

      const data = await extractZinVolumeSongs(destPaths);

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
      errors.push(`${editionLabel}: ${error.message}`);
      console.error(`✗ ${editionLabel}: ${error.message}`);
    }
  }

  // Bereits importierte Volumes: fehlende Audio-/Video-Ordner nachtragen (z.B. Videos erst
  // nach dem Einlesen entpackt). Gesetzte Ordner bleiben unverändert, kein Claude-Aufruf.
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

  return { importedEditions, importedSongs, skippedEditions, updatedFolders, errors };
}
