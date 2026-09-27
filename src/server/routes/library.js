import express from 'express';
import fs from 'fs';
import path from 'path';
import { getSetting, setSetting } from '../db.js';
import { importMegaMix } from '../importMegaMix.js';

const router = express.Router();

function isValidDir(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

function isUnderRoot(target, root) {
  const targetResolved = path.resolve(target);
  const rootResolved = path.resolve(root);
  return targetResolved === rootResolved || targetResolved.startsWith(rootResolved + path.sep);
}

router.get('/library-settings', async (req, res) => {
  try {
    const megamixRoot = await getSetting('megamix_root');
    const zinVolumesMp3Root = await getSetting('zin_volumes_mp3_root');
    const zinVolumesChoreoRoot = await getSetting('zin_volumes_choreo_root');
    res.json({
      megamix_root: megamixRoot || '',
      zin_volumes_mp3_root: zinVolumesMp3Root || '',
      zin_volumes_choreo_root: zinVolumesChoreoRoot || ''
    });
  } catch (error) {
    console.error('Library-Settings-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/library-settings', async (req, res) => {
  try {
    const megamixRoot = (req.body.megamix_root || '').trim();
    const zinVolumesMp3Root = (req.body.zin_volumes_mp3_root || '').trim();
    const zinVolumesChoreoRoot = (req.body.zin_volumes_choreo_root || '').trim();

    if (megamixRoot && !isValidDir(megamixRoot)) {
      return res.status(400).json({ error: `Ordner nicht gefunden: ${megamixRoot}` });
    }
    if (zinVolumesMp3Root && !isValidDir(zinVolumesMp3Root)) {
      return res.status(400).json({ error: `Ordner nicht gefunden: ${zinVolumesMp3Root}` });
    }
    if (zinVolumesChoreoRoot && !isValidDir(zinVolumesChoreoRoot)) {
      return res.status(400).json({ error: `Ordner nicht gefunden: ${zinVolumesChoreoRoot}` });
    }

    await setSetting('megamix_root', megamixRoot);
    await setSetting('zin_volumes_mp3_root', zinVolumesMp3Root);
    await setSetting('zin_volumes_choreo_root', zinVolumesChoreoRoot);

    res.json({ success: true });
  } catch (error) {
    console.error('Library-Settings-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/reimport/megamix', async (req, res) => {
  try {
    const result = await importMegaMix();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('MegaMix-Reimport-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// KI-Einlesen ist gesperrt, bis die KI-Schicht mit Bestätigungssperre steht (Plan Paket 3,
// Grundsatz 5: keine KI-Nutzung ohne Meldung).
router.post('/reimport/jam-sessions', (req, res) => {
  res.status(409).json({ error: 'Das Einlesen von Jam Sessions über die KI folgt in einer späteren Version.' });
});

// KI-Einlesen ist gesperrt, bis die KI-Schicht mit Bestätigungssperre steht (Plan Paket 3,
// Grundsatz 5: keine KI-Nutzung ohne Meldung).
router.post('/reimport/zin-volumes', (req, res) => {
  res.status(409).json({ error: 'Das Einlesen von ZIN Volumes über die KI folgt in einer späteren Version.' });
});

// Liefert Audio-/Videodateien aus den gezielt zugeordneten MegaMix-/ZIN-Volume-Ordnern aus.
// dir muss unterhalb eines der konfigurierten Datenquellen-Roots liegen (Path-Traversal-Schutz).
router.get('/library-media', async (req, res) => {
  try {
    const { dir, file } = req.query;
    if (!dir || !file) {
      return res.status(400).end();
    }

    const megamixRoot = await getSetting('megamix_root');
    const zinVolumesMp3Root = await getSetting('zin_volumes_mp3_root');
    const choreoRoot = await getSetting('zin_volumes_choreo_root');
    const videoRoot = choreoRoot ? path.dirname(choreoRoot) : null;
    const mediaRootsRaw = await getSetting('media_roots');
    const jamMediaRoots = mediaRootsRaw ? JSON.parse(mediaRootsRaw) : [];

    const allowedRoots = [megamixRoot, zinVolumesMp3Root, videoRoot, ...jamMediaRoots].filter(Boolean);
    const targetDir = path.resolve(dir);
    const allowed = allowedRoots.some((root) => isUnderRoot(targetDir, root));
    if (!allowed) {
      return res.status(403).end();
    }

    const filePath = path.join(targetDir, file);
    if (!isUnderRoot(filePath, targetDir) || !fs.existsSync(filePath)) {
      return res.status(404).end();
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Library-Media-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
