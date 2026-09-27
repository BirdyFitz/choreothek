// Angaben zu einer Musik-/Videodatei für den Detailbereich (wie im Windows-Explorer):
// Titel, Album, Genre, Länge, Bitrate … aus den Tags, dazu das eingebettete Cover.
// Nur Dateien aus den Datenquellen (siehe fileAccess.js).
import fs from 'fs';
import path from 'path';
import express from 'express';
import { parseFile, selectCover } from 'music-metadata';
import { isAllowedFile } from '../fileAccess.js';

const router = express.Router();

async function fileFromQuery(req) {
  const { dir, file } = req.query;
  if (!dir || !file) return null;
  const full = path.join(String(dir), String(file));
  return (await isAllowedFile(full)) ? full : null;
}

router.get('/media-info', async (req, res) => {
  try {
    const file = await fileFromQuery(req);
    if (!file) return res.status(404).json({ error: 'Datei nicht gefunden' });
    const stat = fs.statSync(file);
    const info = {
      name: path.basename(file),
      folder: path.dirname(file),
      size: stat.size,
      modified: stat.mtime.toISOString()
    };
    try {
      const meta = await parseFile(file, { duration: true, skipCovers: false });
      const c = meta.common;
      Object.assign(info, {
        title: c.title || null,
        artist: c.artist || null,
        album: c.album || null,
        albumartist: c.albumartist || null,
        genre: c.genre?.join(', ') || null,
        year: c.year || null,
        track: c.track?.no || null,
        duration: meta.format.duration ? Math.round(meta.format.duration) : null,
        bitrate: meta.format.bitrate ? Math.round(meta.format.bitrate / 1000) : null,
        codec: meta.format.codec || meta.format.container || null,
        width: meta.format.videoWidth || null,
        height: meta.format.videoHeight || null,
        hasCover: Boolean(selectCover(c.picture))
      });
    } catch {
      // keine lesbaren Tags (z. B. manche Handy-Videos) -- nur Dateiangaben
    }
    res.json(info);
  } catch (error) {
    console.error('Media-Info-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/media-cover', async (req, res) => {
  try {
    const file = await fileFromQuery(req);
    if (!file) return res.status(404).end();
    const meta = await parseFile(file, { skipCovers: false, duration: false });
    const cover = selectCover(meta.common.picture);
    if (!cover) return res.status(404).end();
    res.set('Content-Type', cover.format || 'image/jpeg');
    res.set('Cache-Control', 'max-age=3600');
    res.send(Buffer.from(cover.data));
  } catch {
    res.status(404).end();
  }
});

export default router;
