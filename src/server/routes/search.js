import fs from 'fs';
import path from 'path';
import express from 'express';
import { getSetting, searchSongs, getJamList, getAllRhythms, getAllJammers, getAllMegaMixEditionLabels, getAllZinVolumeEditionLabels } from '../db.js';
import { findUnassignedVideos, fileNameMatchesText } from '../utils/scopedMediaFinder.js';
import { libraryMediaUrl, mediaFor } from '../media.js';

const router = express.Router();

// Choreo Notes liegen als Kopie in der App (uploads, Name mit Zeitstempel-Präfix). Für das
// Kontextmenü (Öffnen, Im Explorer anzeigen) wird das Original im Archiv gesucht:
// Jam: <Jam-Ordner>/<Name>, Volume: <Choreo-Notes-Ordner>/<Name>. Nicht gefunden -> null.
function originalPdf(folder, uploadName, cache) {
  if (!folder || !uploadName) return null;
  const candidate = path.join(folder, uploadName.replace(/^\d+-/, ''));
  if (!cache.has(candidate)) cache.set(candidate, fs.existsSync(candidate) ? candidate : null);
  return cache.get(candidate);
}

function withPdfSources(row, choreoRoot, cache) {
  const isJam = row.source_type === 'jam_session';
  return {
    ...row,
    pdf_source_path: isJam ? originalPdf(row.source_folder, row.pdf_filename, cache) : null,
    live_pdf_source_path: isJam ? null : originalPdf(choreoRoot, row.live_pdf_filename, cache),
    oneonone_pdf_source_path: isJam ? null : originalPdf(choreoRoot, row.oneonone_pdf_filename, cache)
  };
}

function stripInternal(song) {
  // eslint-disable-next-line no-unused-vars
  const { source_folder, audio_folder, live_video_folder, oneonone_video_folder, media_override, ...rest } = song;
  return rest;
}

// Nicht zugeordnete Videos je Jam / Volume als eigene Zeilen (unassigned: true), damit
// sie trotzdem anklickbar sind. Nur ohne Rhythmusfilter (Dateien haben keinen Rhythmus);
// mit Songfilter nur Videos, deren Dateiname den Suchtext enthält. MegaMix hat keine Videos.
async function unassignedVideoRows(query, results, mediaByRow, cache) {
  const { rhythm, jammer, megamix, zin_volume: zinVolume, datum_von: datumVon, datum_bis: datumBis, ort, song, jam_id: jamId, quelle } = query;
  if (rhythm) return [];

  // Umfang = alle Jams/Volumes, die ohne Songfilter getroffen würden
  const scope = song
    ? await searchSongs(undefined, jammer, megamix, zinVolume, datumVon, datumBis, ort, undefined, jamId, quelle)
    : results;

  const groups = new Map();
  for (const row of scope) {
    if (row.source_type === 'megamix') continue;
    const key = `${row.source_type}:${row.group_id}`;
    if (!groups.has(key)) groups.set(key, { base: row, matched: new Set() });
    const { audio, video } = mediaByRow.get(row) || mediaFor(row, cache);
    for (const media of [...audio, ...video]) groups.get(key).matched.add(media.url);
  }

  const rows = [];
  for (const { base, matched } of groups.values()) {
    const isJam = base.source_type === 'jam_session';
    const folders = isJam ? [base.source_folder] : [base.live_video_folder, base.oneonone_video_folder];
    for (const video of findUnassignedVideos(folders, isJam, matched, libraryMediaUrl, cache)) {
      if (song && !fileNameMatchesText(video.name, song)) continue;
      rows.push({
        ...stripInternal(base),
        unassigned: true,
        song_name: video.name,
        artist: null,
        rhythm: null,
        position: null,
        page: null,
        pdf_filename: null,
        live_pdf_filename: null,
        live_page: null,
        oneonone_pdf_filename: null,
        oneonone_page: null,
        audio_paths: [],
        video_paths: [{ url: video.url, label: video.label }]
      });
    }
  }
  return rows;
}

router.get('/search', async (req, res) => {
  try {
    const { rhythm, jammer, megamix, zin_volume: zinVolume, datum_von: datumVon, datum_bis: datumBis, ort, song, jam_id: jamId, quelle } = req.query;
    const results = await searchSongs(rhythm, jammer, megamix, zinVolume, datumVon, datumBis, ort, song, jamId, quelle);

    const cache = new Map();
    const pdfCache = new Map();
    const choreoRoot = await getSetting('zin_volumes_choreo_root');
    const mediaByRow = new Map();
    const rows = results.map((row) => {
      const media = mediaFor(row, cache);
      mediaByRow.set(row, media);
      return { ...stripInternal(withPdfSources(row, choreoRoot, pdfCache)), audio_paths: media.audio, video_paths: media.video };
    });

    rows.push(...(await unassignedVideoRows(req.query, results, mediaByRow, cache)));

    // Wie bisher neueste zuerst; nicht zugeordnete Videos direkt hinter den Songs ihrer Jam
    const time = (r) => (r.created_at ? new Date(r.created_at).getTime() : 0);
    rows.sort(
      (a, b) =>
        time(b) - time(a) ||
        a.source_type.localeCompare(b.source_type) ||
        a.group_id - b.group_id ||
        Number(Boolean(a.unassigned)) - Number(Boolean(b.unassigned)) ||
        (a.position ?? 0) - (b.position ?? 0) ||
        a.song_name.localeCompare(b.song_name, 'de')
    );

    res.json(rows);
  } catch (error) {
    console.error('Search-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/rhythms', async (req, res) => {
  try {
    const rhythms = await getAllRhythms();
    res.json(rhythms);
  } catch (error) {
    console.error('Rhythms-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/jams', async (req, res) => {
  try {
    const jams = await getJamList();
    res.json(jams);
  } catch (error) {
    console.error('Jams-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/jammers', async (req, res) => {
  try {
    const jammers = await getAllJammers();
    res.json(jammers);
  } catch (error) {
    console.error('Jammers-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/megamixes', async (req, res) => {
  try {
    const megamixes = await getAllMegaMixEditionLabels();
    res.json(megamixes);
  } catch (error) {
    console.error('MegaMixes-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/zin-volumes', async (req, res) => {
  try {
    const zinVolumes = await getAllZinVolumeEditionLabels();
    res.json(zinVolumes);
  } catch (error) {
    console.error('Volumes-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
