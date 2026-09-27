import fs from 'fs';
import path from 'path';
import { getAllMegaMixes, insertMegaMix, insertMegaMixSongs, updateMegaMixFolder, getSetting } from './db.js';
import { parseMegaMixFilename } from './utils/musicFilenameParser.js';

export async function importMegaMix(mediaRoot) {
  const root = mediaRoot || (await getSetting('megamix_root'));
  if (!root) {
    throw new Error('Kein MegaMix-Ordner eingestellt (Einstellungen → Datenquellen).');
  }

  const existing = await getAllMegaMixes();
  const alreadyImported = new Set(existing.map((m) => m.edition_label));
  const withoutFolder = new Set(existing.filter((m) => !m.source_folder).map((m) => m.edition_label));

  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory());

  let importedEditions = 0;
  let importedSongs = 0;
  let skippedEditions = 0;
  let updatedFolders = 0;
  const errors = [];

  for (const folder of folders) {
    const folderPath = path.join(root, folder.name);
    const files = await fs.promises.readdir(folderPath);
    const mp3s = files.filter((f) => f.toLowerCase().endsWith('.mp3'));
    if (mp3s.length === 0) continue;

    let parsed;
    try {
      parsed = mp3s.map((f) => ({ filename: f, ...parseMegaMixFilename(f) }));
    } catch (error) {
      errors.push(`${folder.name}: ${error.message}`);
      continue;
    }

    const editionLabel = parsed[0].editionLabel;
    if (alreadyImported.has(editionLabel)) {
      // Bereits importiert: fehlenden Ordner nachtragen (z.B. Ordner kam erst später dazu)
      if (withoutFolder.has(editionLabel)) {
        await updateMegaMixFolder(editionLabel, folderPath);
        withoutFolder.delete(editionLabel);
        updatedFolders++;
      }
      skippedEditions++;
      continue;
    }

    parsed.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const megamixId = await insertMegaMix(parsed[0].editionNumber, editionLabel, folderPath);
    await insertMegaMixSongs(
      megamixId,
      parsed.map((p) => ({ name: p.songName, rhythm: p.rhythm, position: p.position }))
    );

    alreadyImported.add(editionLabel);
    importedEditions++;
    importedSongs += parsed.length;
    console.log(`✓ ${editionLabel}: ${parsed.length} Songs`);
  }

  return { importedEditions, importedSongs, skippedEditions, updatedFolders, errors };
}
