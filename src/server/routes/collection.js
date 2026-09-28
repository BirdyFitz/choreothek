// Bibliothek: Jams, ZIN Volumes und MegaMixe anzeigen und bearbeiten (Kopfdaten, Songs, Löschen),
// einzeln neu auslesen (KI, nur mit Plan und Meldung) und Jammer-Schreibweisen vereinheitlichen.
import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  COLLECTION_TYPES,
  listCollection,
  getCollectionItem,
  updateCollectionHead,
  replaceCollectionSongs,
  deleteCollectionItem,
  jammerNameCounts,
  renameJammer,
  getSongWithFolders,
  setSongMediaOverride
} from '../db.js';
import { mediaFor, autoMediaFor, filesOf, parseOverride, pathFromMediaUrl } from '../media.js';
import { isAllowedFile } from '../fileAccess.js';
import { categorize } from '../utils/scopedMediaFinder.js';
import { getUploadsDir } from '../paths.js';
import { zinFolders } from '../scan/settings.js';
import { buildPlan, extractWithAi, rememberConfirmation, AiError } from '../ai/aiService.js';
import { redeemPlan, closePermit, GateError } from '../ai/gate.js';
import { t } from '../../shared/i18n.js';

const router = express.Router();

class InputError extends Error {}

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const pageOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new InputError(t('errors.edit.invalidPage'));
  return n;
};

function typeOf(req) {
  if (!COLLECTION_TYPES[req.params.type]) throw new InputError(t('errors.invalidRequest'));
  return req.params.type;
}

async function itemOf(req) {
  const type = typeOf(req);
  const item = await getCollectionItem(type, Number(req.params.id));
  if (!item) throw new InputError(t('errors.edit.notFound'));
  return { type, item };
}

function sendError(res, error) {
  if (error instanceof InputError) return res.status(400).json({ error: error.message });
  if (error instanceof GateError) return res.status(409).json({ error: t(`errors.ai.${error.code}`), code: error.code });
  if (error instanceof AiError) return res.status(502).json({ error: t(`errors.ai.${error.code}`), code: error.code });
  console.error('Bibliothek-Fehler:', error);
  return res.status(500).json({ error: error.message });
}

router.get('/collection/:type', async (req, res) => {
  try {
    res.json(await listCollection(typeOf(req)));
  } catch (error) {
    sendError(res, error);
  }
});

// Original-PDFs im Archiv zu den PDF-Kopien der App (für das Kontextmenü: Öffnen, Explorer …):
// Jam: <Jam-Ordner>/<Name>, Volume: <Choreo-Notes-Ordner>/<Name>; nicht gefunden -> fehlt
async function pdfSources(type, item) {
  const folder = type === 'jam' ? item.source_folder : (await zinFolders()).choreoRoot;
  const names = type === 'jam' ? [item.pdf_filename] : item.songs.flatMap((s) => [s.live_pdf_filename, s.oneonone_pdf_filename]);
  const result = {};
  for (const name of new Set(names.filter(Boolean))) {
    const original = folder && path.join(folder, name.replace(/^\d+-/, ''));
    if (original && fs.existsSync(original)) result[name] = original;
  }
  return result;
}

router.get('/collection/:type/:id', async (req, res) => {
  try {
    const { type, item } = await itemOf(req);
    res.json({ ...item, pdf_sources: type === 'megamix' ? {} : await pdfSources(type, item) });
  } catch (error) {
    sendError(res, error);
  }
});

// Kopfdaten: Jam (Jammer, Datum, Ort, Ordner für Musik/Videos) bzw. Ordner der Volumes/MegaMixe
router.put('/collection/:type/:id', async (req, res) => {
  try {
    const { type, item } = await itemOf(req);
    const fields = {};
    for (const key of COLLECTION_TYPES[type].head) {
      if (!(key in req.body)) continue;
      const value = text(req.body[key]);
      if (key.endsWith('folder')) {
        if (value && !isDir(value)) throw new InputError(t('errors.folderNotFound', { path: value }));
        fields[key] = value ? path.resolve(value) : null;
      } else {
        fields[key] = value;
      }
    }
    if (type === 'jam' && 'jammer_name' in fields && !fields.jammer_name) throw new InputError(t('errors.edit.jammerRequired'));
    await updateCollectionHead(type, item.id, fields);
    res.json(await getCollectionItem(type, item.id));
  } catch (error) {
    sendError(res, error);
  }
});

// Songliste ersetzen (ändern, ergänzen, löschen, umsortieren in einem Schritt)
router.put('/collection/:type/:id/songs', async (req, res) => {
  try {
    const { type, item } = await itemOf(req);
    if (!Array.isArray(req.body.songs)) throw new InputError(t('errors.invalidRequest'));
    // PDFs eines Volumes: nur die, die schon zu diesem Volume gehören
    const pdfs = new Set(item.songs.flatMap((s) => [s.live_pdf_filename, s.oneonone_pdf_filename]).filter(Boolean));
    const songs = req.body.songs.map((s) => {
      const name = text(s.song_name);
      if (!name) throw new InputError(t('errors.edit.songNameRequired'));
      // id: bestehender Song (wird aktualisiert, behält seine Zuordnungen von Hand); ohne id neu
      const song = { id: Number.isInteger(s.id) ? s.id : undefined, song_name: name, rhythm: text(s.rhythm), position: Number.isInteger(s.position) ? s.position : undefined };
      if (type !== 'megamix') song.artist = text(s.artist);
      if (type === 'jam') song.page = pageOrNull(s.page);
      if (type === 'zin') {
        for (const kind of ['live', 'oneonone']) {
          const file = text(s[`${kind}_pdf_filename`]);
          if (file && !pdfs.has(file)) throw new InputError(t('errors.invalidRequest'));
          song[`${kind}_page`] = pageOrNull(s[`${kind}_page`]);
          song[`${kind}_pdf_filename`] = song[`${kind}_page`] ? file || [...pdfs][0] || null : null;
        }
      }
      return song;
    });
    await replaceCollectionSongs(type, item.id, songs);
    res.json(await getCollectionItem(type, item.id));
  } catch (error) {
    sendError(res, error);
  }
});

// Löschen samt Songs und nicht mehr gebrauchter PDF-Kopien der App (Originale bleiben unberührt)
router.delete('/collection/:type/:id', async (req, res) => {
  try {
    const { type, item } = await itemOf(req);
    const copies = await deleteCollectionItem(type, item.id);
    for (const name of copies) {
      const file = path.join(getUploadsDir(), path.basename(name));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

// PDF-Kopien, aus denen ein Eintrag eingelesen wurde (Live vor 1on1)
function pdfCopies(type, item) {
  const names =
    type === 'jam'
      ? [item.pdf_filename]
      : [...new Set([...item.songs.map((s) => s.live_pdf_filename), ...item.songs.map((s) => s.oneonone_pdf_filename)].filter(Boolean))];
  const files = names.filter(Boolean).map((n) => path.join(getUploadsDir(), path.basename(n)));
  if (!files.length || !files.every((f) => fs.existsSync(f))) throw new InputError(t('errors.edit.pdfMissing'));
  return files;
}

const aiKind = (type) => {
  if (type === 'megamix') throw new InputError(t('errors.edit.noAiForMegamix'));
  return type === 'jam' ? 'jam' : 'zin';
};

// Musik und Videos eines Eintrags: je Song die Zuordnung (automatisch bzw. von Hand, entfernte
// automatische Treffer) und alle Dateien in den Ordnern des Eintrags mit ihren Songs
router.get('/collection/:type/:id/media', async (req, res) => {
  try {
    const { type, item } = await itemOf(req);
    const cache = new Map();
    const songs = {};
    let files = [];
    const usedBy = new Map();
    for (const s of item.songs) {
      const song = await getSongWithFolders(type, s.id);
      if (!files.length) files = filesOf(song, cache);
      const media = mediaFor(song, cache);
      const override = parseOverride(song.media_override);
      const auto = autoMediaFor(song, cache);
      const autoPaths = new Set([...auto.audio, ...auto.video].map((m) => pathFromMediaUrl(m.url).toLowerCase()));
      songs[s.id] = {
        audio: media.audio.map((m) => ({ ...m, path: pathFromMediaUrl(m.url) })),
        video: media.video.map((m) => ({ ...m, path: pathFromMediaUrl(m.url) })),
        removed: override.remove.filter((p) => autoPaths.has(p.toLowerCase())).map((p) => ({ path: p, label: path.basename(p) }))
      };
      for (const m of [...media.audio, ...media.video]) {
        const k = pathFromMediaUrl(m.url).toLowerCase();
        usedBy.set(k, [...(usedBy.get(k) || []), s.id]);
      }
    }
    if (!item.songs.length) files = filesOf({ ...item, source_type: type === 'jam' ? 'jam_session' : type === 'zin' ? 'zin_volume' : 'megamix' }, cache);
    res.json({ songs, files: files.map((f) => ({ ...f, songs: usedBy.get(f.path.toLowerCase()) || [] })) });
  } catch (error) {
    sendError(res, error);
  }
});

// Zuordnung eines Songs ändern: add (Datei zuordnen), remove (Zuordnung lösen), restore
// (entfernten automatischen Treffer wieder zulassen)
router.post('/collection/:type/:id/songs/:songId/media', async (req, res) => {
  try {
    const { type, item } = await itemOf(req);
    const songId = Number(req.params.songId);
    if (!item.songs.some((s) => s.id === songId)) throw new InputError(t('errors.edit.notFound'));
    const { action, path: file } = req.body;
    if (typeof file !== 'string' || !['add', 'remove', 'restore'].includes(action)) throw new InputError(t('errors.invalidRequest'));
    const full = path.resolve(file);
    const same = (p) => p.toLowerCase() === full.toLowerCase();
    const song = await getSongWithFolders(type, songId);
    const override = parseOverride(song.media_override);
    if (action === 'add') {
      if (!categorize(full) || !(await isAllowedFile(full))) throw new InputError(t('errors.edit.fileNotAllowed'));
      override.remove = override.remove.filter((p) => !same(p));
      if (!override.add.some(same)) override.add.push(full);
    } else if (action === 'remove') {
      if (override.add.some(same)) override.add = override.add.filter((p) => !same(p));
      else if (!override.remove.some(same)) override.remove.push(full);
    } else {
      override.remove = override.remove.filter((p) => !same(p));
    }
    await setSongMediaOverride(type, songId, override);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

// Einzeln neu auslesen, Schritt 1: Plan (was wird gesendet, was kostet es)
router.post('/collection/:type/:id/plan', async (req, res) => {
  try {
    const { type, item } = await itemOf(req);
    const kind = aiKind(type);
    const files = pdfCopies(type, item);
    const label = type === 'jam' ? `${item.jammer_name}${item.jam_date ? `, ${item.jam_date}` : ''}` : item.edition_label;
    const plan = await buildPlan(kind, [{ label, files }], { target: { type, id: item.id } });
    const { items, ...rest } = plan;
    res.json({ ...rest, items: items.map((i) => ({ label: i.label, pdfs: i.files.length, pages: i.pages })) });
  } catch (error) {
    sendError(res, error);
  }
});

// Schritt 2: mit bestätigtem Plan auslesen. Ergebnis ist nur ein Vorschlag -- gespeichert wird
// erst, wenn er in der Oberfläche geprüft und übernommen wurde.
router.post('/collection/:type/:id/reextract', async (req, res) => {
  let permit;
  try {
    const { type, item } = await itemOf(req);
    const kind = aiKind(type);
    const { planId, confirmed = false, dontAskAgain = false } = req.body || {};
    permit = redeemPlan(planId, kind, { confirmed: confirmed === true });
    if (permit.plan.target?.type !== type || permit.plan.target?.id !== item.id) throw new GateError('planWrongKind');
    await rememberConfirmation(permit, { confirmed: confirmed === true, dontAskAgain: dontAskAgain === true });
    const files = pdfCopies(type, item);
    const data = await extractWithAi(permit, kind, files);

    let proposal;
    if (type === 'jam') {
      proposal = {
        head: { jammer_name: data.jammer_name, jam_date: data.jam_date, location: data.location },
        songs: data.songs.map((s) => ({ song_name: s.name, artist: s.artist, rhythm: s.rhythm, page: s.page }))
      };
    } else {
      // Warm-up-Songs stammen aus den MP3-Namen, nicht aus der PDF -- sie bleiben erhalten
      const warmups = item.songs.filter((s) => s.position <= 0);
      const nameOf = (source) => (source ? path.basename(files[source - 1]) : null);
      proposal = {
        songs: [
          ...warmups,
          ...data.songs.map((s) => ({
            song_name: s.name,
            artist: s.artist,
            rhythm: s.rhythm,
            live_pdf_filename: nameOf(s.live_source),
            live_page: s.live_page,
            oneonone_pdf_filename: nameOf(s.oneonone_source),
            oneonone_page: s.oneonone_page
          }))
        ]
      };
    }
    // Vorschlags-Songs mit gleichem Titel behalten ihre bisherige Nummer -- so bleiben Zuordnungen
    // von Hand (Musik/Videos) beim Übernehmen erhalten
    const byName = new Map(item.songs.map((x) => [x.song_name.trim().toLowerCase(), x.id]));
    for (const song of proposal.songs) {
      if (song.id == null) song.id = byName.get(song.song_name.trim().toLowerCase());
      byName.delete(song.song_name.trim().toLowerCase());
    }
    res.json({ proposal, aiCostUsd: permit.costUsd });
  } catch (error) {
    sendError(res, error);
  } finally {
    closePermit(permit);
  }
});

// Jammer-Schreibweisen: alle Namen mit Anzahl; Vorschläge für ähnliche Schreibweisen
const nameKey = (name) =>
  String(name)
    .toLocaleLowerCase('de')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*(&|\+|\bund\b|\band\b)\s*/g, ' & ')
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();

router.get('/jammers/variants', async (req, res) => {
  try {
    const names = await jammerNameCounts();
    const groups = new Map();
    for (const n of names) groups.set(nameKey(n.jammer_name), [...(groups.get(nameKey(n.jammer_name)) || []), n]);
    res.json({ names, similar: [...groups.values()].filter((g) => g.length > 1) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/jammers/rename', async (req, res) => {
  try {
    const from = Array.isArray(req.body.from) ? req.body.from : [req.body.from];
    const to = text(req.body.to);
    if (!to || !from.every((f) => typeof f === 'string')) throw new InputError(t('errors.edit.jammerRequired'));
    let changed = 0;
    for (const f of from) if (f !== to) changed += await renameJammer(f, to);
    res.json({ success: true, changed });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
