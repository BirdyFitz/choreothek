import express from 'express';
import fs from 'fs';
import { getSetting, setSetting } from '../db.js';
import { buildMediaIndex } from '../utils/mediaFinder.js';
import { t } from '../../shared/i18n.js';

const router = express.Router();

router.get('/settings', async (req, res) => {
  try {
    const raw = await getSetting('media_roots');
    res.json({ media_roots: raw ? JSON.parse(raw) : [] });
  } catch (error) {
    console.error('Settings-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const mediaRoots = Array.isArray(req.body.media_roots)
      ? req.body.media_roots.map((p) => p.trim()).filter(Boolean)
      : [];

    const invalid = mediaRoots.filter(
      (p) => !fs.existsSync(p) || !fs.statSync(p).isDirectory()
    );
    if (invalid.length > 0) {
      return res.status(400).json({ error: t('errors.folderNotFound', { path: invalid.join(', ') }) });
    }

    await setSetting('media_roots', JSON.stringify(mediaRoots));
    const filesIndexed = await buildMediaIndex(mediaRoots);

    res.json({ success: true, files_indexed: filesIndexed });
  } catch (error) {
    console.error('Settings-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Einrichtungsassistent: gilt als erledigt, wenn abgeschlossen oder schon Ordner eingestellt sind
// (Installationen von vor dem Assistenten)
router.get('/setup', async (req, res) => {
  const done = (await getSetting('setup_done')) === '1';
  const folders = await Promise.all(['megamix_root', 'zin_volumes_mp3_root', 'zin_volumes_choreo_root'].map(getSetting));
  const jamRoots = JSON.parse((await getSetting('media_roots')) || '[]');
  res.json({ done: done || jamRoots.length > 0 || folders.some(Boolean) });
});

router.post('/setup', async (req, res) => {
  await setSetting('setup_done', req.body.done ? '1' : '0');
  res.json({ success: true });
});

export default router;
