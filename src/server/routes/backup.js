// Sicherung erstellen, prüfen, wiederherstellen; Erinnerung; fehlende Ordner nach Wiederherstellung.
// Die Pfade kommen aus den Windows-Dialogen des Hauptprozesses.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createBackup, inspectBackup, restoreBackup, missingFolders, backupStatus, defaultBackupName, BackupError } from '../backup.js';
import { setSetting } from '../db.js';
import { t } from '../../shared/i18n.js';

const router = express.Router();
let appVersion = null;

export function setBackupAppVersion(v) {
  appVersion = v;
}

function sendError(res, error) {
  if (error instanceof BackupError) return res.status(400).json({ error: t(`errors.backup.${error.code}`), code: error.code });
  console.error('Sicherung-Fehler:', error);
  return res.status(500).json({ error: error.message });
}

const zipPath = (p) => typeof p === 'string' && p.toLowerCase().endsWith('.zip') && path.isAbsolute(p);

router.get('/backup/status', async (req, res) => {
  try {
    res.json({ ...(await backupStatus()), defaultName: defaultBackupName() });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/backup/settings', async (req, res) => {
  await setSetting('backup_reminder', req.body.reminder ? '1' : '0');
  res.json({ success: true });
});

router.post('/backup/create', async (req, res) => {
  try {
    const { target } = req.body;
    if (!zipPath(target) || !fs.existsSync(path.dirname(target))) return res.status(400).json({ error: t('errors.backup.badTarget') });
    res.json(await createBackup(target, { appVersion }));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/backup/inspect', async (req, res) => {
  try {
    const { source } = req.body;
    if (!zipPath(source) || !fs.existsSync(source)) return res.status(400).json({ error: t('errors.backup.notAZip') });
    res.json(await inspectBackup(source));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/backup/restore', async (req, res) => {
  try {
    const { source } = req.body;
    if (!zipPath(source) || !fs.existsSync(source)) return res.status(400).json({ error: t('errors.backup.notAZip') });
    const manifest = await restoreBackup(source);
    res.json({ manifest, missing: await missingFolders() });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/backup/missing-folders', async (req, res) => {
  try {
    res.json(await missingFolders());
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
