// Videoanalyse je Jam: Handy-Videos per Tonvergleich den Songs zuordnen, dann (nach Prüfung und
// Bestätigung in der Oberfläche) umbenennen bzw. schneiden. Jeder Lauf ist rückgängig zu machen.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { getCollectionItem, getSongWithFolders, insertVideoRun, listVideoRuns, getVideoRun, markVideoRunUndone } from '../db.js';
import { mediaFor, filesOf, pathFromMediaUrl } from '../media.js';
import { ffmpegPath } from '../video/ffmpeg.js';
import { executeItems, undoLog, safeName } from '../video/execute.js';
import { t } from '../../shared/i18n.js';

// Im installierten Programm liegt der Worker ausgepackt neben dem Archiv (app.asar.unpacked) --
// Worker-Threads laden dort zuverlässig, aus dem Archiv selbst nicht in jeder Electron-Version
function workerFile() {
  const inArchive = fileURLToPath(new URL('../video/analyzeWorker.js', import.meta.url));
  const unpacked = inArchive.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  return unpacked !== inArchive && fs.existsSync(unpacked) ? unpacked : inArchive;
}

const router = express.Router();
const lower = (p) => path.resolve(p).toLowerCase();

class InputError extends Error {}

// Titel aus dem Namen einer Musikdatei, wenn sie keinem Song der Jam zugeordnet ist
// ("329-Mega Mix 60 - 01 Titel - Rhythmus.mp3" -> "Titel", "05 Titel.m4a" -> "Titel")
export function titleFromFile(file) {
  let base = path.basename(file, path.extname(file));
  const mm = base.match(/^\d+-(?:Mega|Maga) Mix \d+ - \d+ (.*?) - [^-]+$/i);
  if (mm) return mm[1];
  base = base.replace(/^\d+\s*-?\s*/, '').replace(/\s*\[.*$/, '');
  if ((base.match(/\(/g) || []).length > (base.match(/\)/g) || []).length) base = base.slice(0, base.lastIndexOf('('));
  return base.split(' - ')[0].trim();
}

async function jamOf(req) {
  const jam = await getCollectionItem('jam', Number(req.params.jamId));
  if (!jam) throw new InputError(t('errors.edit.notFound'));
  if (!jam.source_folder || !fs.existsSync(jam.source_folder)) throw new InputError(t('errors.video.noFolder'));
  return jam;
}

// Musik- und Videodateien im Jam-Ordner (ohne „Originale“) und welcher Song sie nutzt
async function jamFiles(jam) {
  const cache = new Map();
  const usedBy = new Map();
  for (const s of jam.songs) {
    const song = await getSongWithFolders('jam', s.id);
    const media = mediaFor(song, cache);
    for (const m of [...media.audio, ...media.video]) {
      const k = lower(pathFromMediaUrl(m.url));
      usedBy.set(k, [...(usedBy.get(k) || []), s.song_name]);
    }
  }
  const files = filesOf({ source_type: 'jam_session', source_folder: jam.source_folder }, cache);
  return files.map((f) => ({ ...f, songs: usedBy.get(lower(f.path)) || [] }));
}

router.get('/video/:jamId/candidates', async (req, res) => {
  try {
    const jam = await jamOf(req);
    const files = await jamFiles(jam);
    res.json({
      videos: files.filter((f) => f.kind === 'video').map(({ path: p, label, url, songs }) => ({ path: p, label, url, songs })),
      audioCount: files.filter((f) => f.kind === 'audio').length,
      songs: jam.songs.map((s) => s.song_name)
    });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------- Analyse-Auftrag (immer nur einer) ----------

let job = null;

router.post('/video/:jamId/analyze', async (req, res) => {
  try {
    if (job?.state === 'running') return res.status(409).json({ error: t('errors.video.running') });
    const jam = await jamOf(req);
    const files = await jamFiles(jam);
    const allowed = new Set(files.filter((f) => f.kind === 'video').map((f) => lower(f.path)));
    const videos = Array.isArray(req.body.videos) ? req.body.videos.filter((v) => typeof v === 'string' && allowed.has(lower(v))) : [];
    if (!videos.length) throw new InputError(t('errors.video.noVideos'));
    const audio = files.filter((f) => f.kind === 'audio');
    if (!audio.length) throw new InputError(t('errors.video.noMusic'));
    // Musikdatei -> Song der Jam (über die Zuordnung), sonst Titel aus dem Dateinamen
    const songOf = (p) => files.find((f) => lower(f.path) === lower(p))?.songs[0] || titleFromFile(p);

    const refs = audio.map((f) => f.path);
    job = { jamId: jam.id, state: 'running', done: 0, total: refs.length + videos.length, current: null, results: [] };
    const current = job;
    const worker = new Worker(workerFile(), { workerData: { ffmpeg: ffmpegPath(), refs, videos } });
    current.worker = worker;
    worker.on('message', (m) => {
      if (m.type === 'progress') Object.assign(current, { done: m.done, total: m.total, current: path.basename(m.current) });
      if (m.type === 'video') {
        const r = m.result;
        current.results.push({
          ...r,
          label: path.basename(r.video),
          parts: (r.parts || []).map((p) => ({ ...p, ref: refs[p.ref], refLabel: path.basename(refs[p.ref]), song: songOf(refs[p.ref]) })),
          segments: undefined
        });
      }
      if (m.type === 'done') Object.assign(current, { state: m.cancelled ? 'cancelled' : 'done', done: current.total, current: null });
    });
    worker.on('error', (e) => Object.assign(current, { state: 'error', error: e.message }));
    worker.on('exit', () => {
      if (current.state === 'running') current.state = 'error';
      delete current.worker;
    });
    res.status(202).json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/video/job', (req, res) => {
  if (!job) return res.json(null);
  // eslint-disable-next-line no-unused-vars
  const { worker, ...state } = job;
  res.json(state);
});

router.post('/video/cancel', (req, res) => {
  job?.worker?.postMessage('cancel');
  res.json({ success: true });
});

// ---------- Ausführen und Rückgängig ----------

router.post('/video/:jamId/execute', async (req, res) => {
  try {
    const jam = await jamOf(req);
    const allowed = new Set((await jamFiles(jam)).filter((f) => f.kind === 'video').map((f) => lower(f.path)));
    const items = (Array.isArray(req.body.items) ? req.body.items : []).map((item) => {
      if (!allowed.has(lower(item.video || '')) || !['rename', 'cut'].includes(item.action)) throw new InputError(t('errors.invalidRequest'));
      const parts = (item.parts || []).map((p) => {
        const song = typeof p.song === 'string' ? safeName(p.song) : '';
        const start = Number(p.start);
        const end = Number(p.end);
        if (!song) throw new InputError(t('errors.video.songRequired'));
        if (!(start >= 0 && end > start)) throw new InputError(t('errors.video.badTimes', { song }));
        return { song, start, end };
      });
      if (!parts.length || (item.action === 'rename' && parts.length !== 1)) throw new InputError(t('errors.invalidRequest'));
      return { video: item.video, action: item.action, parts };
    });
    if (!items.length) throw new InputError(t('errors.video.nothingSelected'));
    const log = await executeItems(jam.source_folder, items);
    const runId = await insertVideoRun(jam.id, log);
    res.json({ runId, log });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/video/:jamId/runs', async (req, res) => {
  try {
    res.json(await listVideoRuns(Number(req.params.jamId)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/video/runs/:runId/undo', async (req, res) => {
  try {
    const run = await getVideoRun(Number(req.params.runId));
    if (!run) throw new InputError(t('errors.edit.notFound'));
    if (run.undone_at) throw new InputError(t('errors.video.alreadyUndone'));
    const result = undoLog(run.log);
    await markVideoRunUndone(run.id, result);
    res.json({ result });
  } catch (error) {
    sendError(res, error);
  }
});

function sendError(res, error) {
  if (error instanceof InputError) return res.status(400).json({ error: error.message });
  console.error('Videoanalyse-Fehler:', error);
  return res.status(500).json({ error: error.message });
}

export default router;
