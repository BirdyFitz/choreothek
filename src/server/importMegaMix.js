import fs from 'fs';
import path from 'path';
import { getAllMegaMixes, insertMegaMix, insertMegaMixSongs, updateMegaMixFolder, getSetting } from './db.js';
import { parseMegaMixFilename } from './utils/musicFilenameParser.js';
import { scanMegaMixFromSettings } from './scan/settings.js';
import { t } from '../shared/i18n.js';

const AUDIO = /\.(mp3|m4a|wav|flac|ogg)$/i;

// Songangaben aus dem Dateinamen ("<id>-Mega Mix 60 - 01 Titel - Rhythmus.mp3"); weicht der Name
// davon ab, wird er ohne Rhythmus als Titel übernommen statt die ganze Edition abzulehnen
function songFromFile(filename) {
  try {
    const p = parseMegaMixFilename(filename);
    return { name: p.songName, rhythm: p.rhythm, position: p.position };
  } catch {
    const base = filename.replace(/\.[a-z0-9]+$/i, '').replace(/^\d+-/, '');
    const m = base.match(/^(\d+)\s+(.*)$/);
    return { name: (m ? m[2] : base).trim(), rhythm: null, position: m ? parseInt(m[1], 10) : null };
  }
}

// MegaMixe brauchen keine KI: Songs, Reihenfolge und Rhythmus stehen in den Dateinamen
export async function importMegaMix() {
  if (!(await getSetting('megamix_root'))) {
    throw new Error(t('errors.noMegamixFolder'));
  }

  const existing = await getAllMegaMixes();
  const alreadyImported = new Set(existing.map((m) => m.edition_label));
  const withoutFolder = new Set(existing.filter((m) => !m.source_folder).map((m) => m.edition_label));
  const { editions } = await scanMegaMixFromSettings();

  let importedEditions = 0;
  let importedSongs = 0;
  let skippedEditions = 0;
  let updatedFolders = 0;
  const errors = [];

  for (const { number, folder } of editions) {
    const editionLabel = `Mega Mix ${number}`;
    if (alreadyImported.has(editionLabel)) {
      // Bereits eingelesen: fehlenden Ordner nachtragen (z. B. Ordner kam erst später dazu)
      if (withoutFolder.has(editionLabel)) {
        await updateMegaMixFolder(editionLabel, folder);
        withoutFolder.delete(editionLabel);
        updatedFolders++;
      }
      skippedEditions++;
      continue;
    }

    try {
      const files = (await fs.promises.readdir(folder)).filter((f) => AUDIO.test(f));
      const songs = files.map(songFromFile).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const megamixId = await insertMegaMix(number, editionLabel, folder);
      await insertMegaMixSongs(megamixId, songs);
      alreadyImported.add(editionLabel);
      importedEditions++;
      importedSongs += songs.length;
      console.log(`✓ ${editionLabel}: ${songs.length} Songs`);
    } catch (error) {
      errors.push(`${path.basename(folder)}: ${error.message}`);
    }
  }

  return { importedEditions, importedSongs, skippedEditions, updatedFolders, errors };
}
