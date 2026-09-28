// „Über Choreothek“, „Problem melden“, Fehler aus der Oberfläche, Einstellung für Vorabversionen
import express from 'express';
import { about, thirdPartyLicenses, problemReport, recordError } from '../appInfo.js';
import { getSetting, setSetting } from '../db.js';

const router = express.Router();

// Vorgabe wie im Updater: in der Pilotphase (0.x) Vorabversionen an
const prereleaseDefault = () => about().version.startsWith('0.');

router.get('/about', (req, res) => {
  res.json({ ...about(), licenses: thirdPartyLicenses() });
});

router.post('/problem-report', (req, res) => {
  res.json({ text: problemReport(typeof req.body.description === 'string' ? req.body.description : '') });
});

// Fehler aus der Oberfläche (window.onerror) ins Protokoll
router.post('/client-error', (req, res) => {
  if (typeof req.body.message === 'string') recordError('oberfläche', req.body.message);
  res.json({ success: true });
});

router.get('/updates/settings', async (req, res) => {
  const setting = await getSetting('updates_prerelease');
  res.json({ prerelease: setting === null ? prereleaseDefault() : setting === '1' });
});

router.post('/updates/settings', async (req, res) => {
  await setSetting('updates_prerelease', req.body.prerelease ? '1' : '0');
  res.json({ success: true });
});

export default router;
