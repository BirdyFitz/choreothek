import express from 'express';
import fs from 'fs';
import path from 'path';
import { getSetting, setSetting } from '../db.js';
import { importMegaMix } from '../importMegaMix.js';
import { importJamSessions } from '../importJamSessions.js';
import { importZinVolumes } from '../importZinVolumes.js';
import { redeemPlan, closePermit, GateError } from '../ai/gate.js';
import { rememberConfirmation } from '../ai/aiService.js';
import { t } from '../../shared/i18n.js';
import { mediaRoots } from '../fileAccess.js';
import { startProgress, reportProgress, finishProgress, getProgress, requestCancel, isCancelRequested } from '../importProgress.js';

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
    const zinVolumesVideoRoot = await getSetting('zin_volumes_video_root');
    res.json({
      megamix_root: megamixRoot || '',
      zin_volumes_mp3_root: zinVolumesMp3Root || '',
      zin_volumes_choreo_root: zinVolumesChoreoRoot || '',
      zin_volumes_video_root: zinVolumesVideoRoot || ''
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
    const zinVolumesVideoRoot = (req.body.zin_volumes_video_root || '').trim();

    if (megamixRoot && !isValidDir(megamixRoot)) {
      return res.status(400).json({ error: t('errors.folderNotFound', { path: megamixRoot }) });
    }
    if (zinVolumesMp3Root && !isValidDir(zinVolumesMp3Root)) {
      return res.status(400).json({ error: t('errors.folderNotFound', { path: zinVolumesMp3Root }) });
    }
    if (zinVolumesChoreoRoot && !isValidDir(zinVolumesChoreoRoot)) {
      return res.status(400).json({ error: t('errors.folderNotFound', { path: zinVolumesChoreoRoot }) });
    }
    if (zinVolumesVideoRoot && !isValidDir(zinVolumesVideoRoot)) {
      return res.status(400).json({ error: t('errors.folderNotFound', { path: zinVolumesVideoRoot }) });
    }

    await setSetting('megamix_root', megamixRoot);
    await setSetting('zin_volumes_mp3_root', zinVolumesMp3Root);
    await setSetting('zin_volumes_choreo_root', zinVolumesChoreoRoot);
    await setSetting('zin_volumes_video_root', zinVolumesVideoRoot);

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

// KI-Einlesen: nur mit einem vorher angeforderten Plan (POST /api/ai/plan), der bestätigt
// bzw. nach den Regeln „nicht mehr fragen“ freigegeben ist (Grundsatz 5, zentrale Sperre).
function aiImportRoute(kind, runImport) {
  return async (req, res) => {
    const { planId, confirmed = false, dontAskAgain = false } = req.body || {};
    // Es läuft immer nur ein Einlesen -- vor dem Einlösen prüfen, damit der Plan nicht verfällt
    if (!startProgress(kind)) return res.status(409).json({ error: t('errors.importRunning') });
    let permit;
    try {
      permit = redeemPlan(planId, kind, { confirmed: confirmed === true });
    } catch (error) {
      finishProgress();
      if (error instanceof GateError) {
        return res.status(409).json({ error: t(`errors.ai.${error.code}`), code: error.code });
      }
      throw error;
    }
    // Pläne zum Neu-Auslesen eines einzelnen Eintrags gelten nicht für das Einlesen
    if (permit.plan.target) {
      closePermit(permit);
      finishProgress();
      return res.status(409).json({ error: t('errors.ai.planWrongKind'), code: 'planWrongKind' });
    }
    try {
      await rememberConfirmation(permit, { confirmed: confirmed === true, dontAskAgain: dontAskAgain === true });
      const result = await runImport(permit, { onProgress: reportProgress, isCancelled: isCancelRequested });
      if (isCancelRequested()) result.cancelled = true;
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('KI-Einlesen-Fehler:', error);
      res.status(500).json({ error: error.message });
    } finally {
      closePermit(permit);
      finishProgress();
    }
  };
}

router.get('/import-progress', (req, res) => res.json(getProgress()));
router.post('/import-cancel', (req, res) => res.json({ success: requestCancel() }));

router.post('/reimport/jam-sessions', aiImportRoute('jam', (permit, opts) => importJamSessions(permit, opts)));
router.post('/reimport/zin-volumes', aiImportRoute('zin', (permit, opts) => importZinVolumes(permit, opts)));

// Liefert Audio-/Videodateien aus den gezielt zugeordneten MegaMix-/ZIN-Volume-Ordnern aus.
// dir muss unterhalb eines der konfigurierten Datenquellen-Roots liegen (Path-Traversal-Schutz).
router.get('/library-media', async (req, res) => {
  try {
    const { dir, file } = req.query;
    if (!dir || !file) {
      return res.status(400).end();
    }

    const allowedRoots = await mediaRoots();
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
