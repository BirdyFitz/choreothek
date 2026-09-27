import express from 'express';
import fs from 'fs';
import { getSetting, setSetting } from '../db.js';
import { buildMediaIndex } from '../utils/mediaFinder.js';

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
      return res.status(400).json({ error: `Ordner nicht gefunden: ${invalid.join(', ')}` });
    }

    await setSetting('media_roots', JSON.stringify(mediaRoots));
    const filesIndexed = await buildMediaIndex(mediaRoots);

    res.json({ success: true, files_indexed: filesIndexed });
  } catch (error) {
    console.error('Settings-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
