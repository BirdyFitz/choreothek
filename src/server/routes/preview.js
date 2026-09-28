// Vorschau vor dem Einlesen: was wird erkannt, was ist schon eingelesen, was fehlt -- und
// Korrekturen von Hand (Ordner zuordnen, Ignorierliste, Merkliste).
import express from 'express';
import fs from 'fs';
import path from 'path';
import { getSetting, setSetting, getAllZinVolumeEditionLabels, getAllMegaMixes } from '../db.js';
import { scanJams, IGNORE_PATTERNS_SETTING, NO_SONGS_SETTING, MEDIA_OVERRIDES_SETTING } from '../scan/jams.js';
import { scanZinFromSettings, scanMegaMixFromSettings, setOverride, zinFolders, ZIN_OVERRIDES_SETTING, MEGAMIX_OVERRIDES_SETTING } from '../scan/settings.js';
import { t } from '../../shared/i18n.js';

const router = express.Router();

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

async function readJson(key, fallback) {
  const raw = await getSetting(key);
  return raw ? JSON.parse(raw) : fallback;
}

// Eine Quelle ohne eingestellten Ordner ist kein Fehler, sondern „nicht eingerichtet“
async function safely(fn) {
  try {
    return await fn();
  } catch (error) {
    return { error: error.message };
  }
}

router.get('/preview', async (req, res) => {
  try {
    const jams = await safely(async () => {
      const scan = await scanJams();
      return {
        rows: scan.jams.map((j) => ({ pdf: j.pdf, folder: j.folder, status: j.status, ownFolder: j.ownFolder, mediaFolder: j.mediaFolder, mediaAssigned: j.mediaAssigned })),
        ignored: scan.ignored,
        patterns: scan.patterns,
        noSongs: await readJson(NO_SONGS_SETTING, [])
      };
    });

    const zin = await safely(async () => {
      const { choreoRoot } = await zinFolders();
      if (!choreoRoot) throw new Error(t('errors.noChoreoFolder'));
      const imported = new Set(await getAllZinVolumeEditionLabels());
      const overrides = await readJson(ZIN_OVERRIDES_SETTING, {});
      const scan = await scanZinFromSettings();
      return {
        editions: scan.editions.map((e) => ({
          ...e,
          imported: imported.has(`Volume ${e.number}`),
          assigned: Object.keys(overrides[e.number] || {})
        })),
        unrecognized: scan.unrecognized
      };
    });

    const megamix = await safely(async () => {
      if (!(await getSetting('megamix_root'))) throw new Error(t('errors.noMegamixFolder'));
      const imported = new Set((await getAllMegaMixes()).map((m) => m.edition_label));
      const overrides = await readJson(MEGAMIX_OVERRIDES_SETTING, {});
      const scan = await scanMegaMixFromSettings();
      return {
        editions: scan.editions.map((e) => ({ ...e, imported: imported.has(`Mega Mix ${e.number}`), assigned: Boolean(overrides[e.number]) })),
        unrecognized: scan.unrecognized
      };
    });

    res.json({ jams, zin, megamix });
  } catch (error) {
    console.error('Vorschau-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

const FIELDS = { zin: ['musicFolder', 'liveFolder', 'oneononeFolder'], megamix: ['musicFolder'] };

// Ordner einer Edition von Hand zuordnen (folder = null entfernt die Zuordnung)
router.post('/preview/assign', async (req, res) => {
  try {
    const { kind, number, field, folder } = req.body;
    if (!FIELDS[kind]?.includes(field) || !Number.isInteger(number) || number <= 0) {
      return res.status(400).json({ error: t('errors.invalidRequest') });
    }
    if (folder && !isDir(folder)) return res.status(400).json({ error: t('errors.folderNotFound', { path: folder }) });
    await setOverride(kind === 'zin' ? ZIN_OVERRIDES_SETTING : MEGAMIX_OVERRIDES_SETTING, number, field, folder ? path.resolve(folder) : null);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Medienordner einer Jam von Hand zuweisen (z. B. wenn mehrere Jams einen Ordner teilen)
router.post('/preview/jam-media', async (req, res) => {
  try {
    const { pdf, folder } = req.body;
    if (typeof pdf !== 'string' || !pdf.toLowerCase().endsWith('.pdf')) return res.status(400).json({ error: t('errors.invalidRequest') });
    if (folder && !isDir(folder)) return res.status(400).json({ error: t('errors.folderNotFound', { path: folder }) });
    const overrides = await readJson(MEDIA_OVERRIDES_SETTING, {});
    if (folder) overrides[pdf] = path.resolve(folder);
    else delete overrides[pdf];
    await setSetting(MEDIA_OVERRIDES_SETTING, JSON.stringify(overrides));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ignorierliste: Teile von PDF-Namen, die keine Choreo Notes einer Jam sind (z. B. „Handout“)
router.post('/preview/ignore-patterns', async (req, res) => {
  const { patterns } = req.body;
  if (!Array.isArray(patterns) || !patterns.every((p) => typeof p === 'string')) {
    return res.status(400).json({ error: t('errors.invalidRequest') });
  }
  const clean = [...new Set(patterns.map((p) => p.trim()).filter(Boolean))];
  await setSetting(IGNORE_PATTERNS_SETTING, JSON.stringify(clean));
  res.json({ success: true, patterns: clean });
});

// Merkliste: PDF wieder zum Einlesen zulassen (wurde übersprungen, weil keine Songs erkannt wurden)
router.post('/preview/no-songs/remove', async (req, res) => {
  const { name } = req.body;
  const list = (await readJson(NO_SONGS_SETTING, [])).filter((n) => n !== String(name || '').toLowerCase());
  await setSetting(NO_SONGS_SETTING, JSON.stringify(list));
  res.json({ success: true });
});

export default router;
