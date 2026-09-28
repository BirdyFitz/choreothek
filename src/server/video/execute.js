// Vorschläge der Videoanalyse ausführen und rückgängig machen. Nichts wird überschrieben:
// existiert ein Ziel schon, bleibt die Datei unverändert und das Protokoll nennt den Grund.
// Protokoll je Lauf (in der Datenbank), damit „Rückgängig“ genau diese Schritte umkehrt.
import fs from 'fs';
import path from 'path';
import { cutCopy, mediaDuration } from './ffmpeg.js';

export const ORIGINALS = 'Originale';

// Zeichen, die in Windows-Dateinamen nicht erlaubt sind
export function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

export function targetName(song, videoPath) {
  const ext = path.extname(videoPath);
  return `${safeName(song)} - ${path.basename(videoPath, ext)}${ext}`;
}

// items: [{ video, action: 'rename' | 'cut', parts: [{ song, start, end }] }]
// jamFolder: Ordner der Jam (dort entsteht der Unterordner „Originale“)
// Ergebnis: Protokoll [{ video, action, status, ... }]
export async function executeItems(jamFolder, items, { onProgress = () => {}, isCancelled = () => false } = {}) {
  const log = [];
  for (const [i, item] of items.entries()) {
    if (isCancelled()) break;
    onProgress({ done: i, total: items.length, current: path.basename(item.video) });
    const src = item.video;
    const folder = path.dirname(src);
    if (!fs.existsSync(src)) {
      log.push({ video: src, action: item.action, status: 'missing' });
      continue;
    }

    if (item.action === 'rename') {
      const dst = path.join(folder, targetName(item.parts[0].song, src));
      if (fs.existsSync(dst)) {
        log.push({ video: src, action: 'rename', status: 'targetExists', dst });
        continue;
      }
      fs.renameSync(src, dst);
      log.push({ video: src, action: 'rename', status: 'done', dst });
      continue;
    }

    // Schneiden: erst alle Teile anlegen und prüfen, dann das Original wegräumen
    const made = [];
    let problem = null;
    for (const p of item.parts) {
      const dst = path.join(folder, targetName(p.song, src));
      if (fs.existsSync(dst)) {
        problem = { status: 'targetExists', dst };
        break;
      }
      try {
        await cutCopy(src, dst, p.start, p.end);
        const d = await mediaDuration(dst);
        // Schnitt ohne Neukodieren beginnt am Schlüsselbild davor -- kürzer als erwartet ist ein Fehler
        if (d < 0.8 * (p.end - p.start)) throw new Error(`Teil nur ${d.toFixed(1)} s lang`);
        made.push({ dst, start: p.start, end: p.end, duration: Math.round(d * 10) / 10 });
      } catch (error) {
        if (fs.existsSync(dst)) fs.unlinkSync(dst);
        problem = { status: 'cutFailed', error: String(error.message).slice(-300) };
        break;
      }
    }
    if (problem) {
      for (const m of made) if (fs.existsSync(m.dst)) fs.unlinkSync(m.dst);
      log.push({ video: src, action: 'cut', ...problem });
      continue;
    }
    const originals = path.join(jamFolder, ORIGINALS);
    fs.mkdirSync(originals, { recursive: true });
    const moved = path.join(originals, path.basename(src));
    if (fs.existsSync(moved)) {
      log.push({ video: src, action: 'cut', status: 'doneOriginalKept', parts: made });
      continue;
    }
    fs.renameSync(src, moved);
    log.push({ video: src, action: 'cut', status: 'done', parts: made, original: moved });
  }
  onProgress({ done: items.length, total: items.length, current: null });
  return log;
}

// Rückgängig: in umgekehrter Reihenfolge; Dateien, die inzwischen verändert wurden, bleiben stehen
export function undoLog(log) {
  const result = [];
  for (const entry of [...log].reverse()) {
    if (entry.action === 'rename' && entry.status === 'done') {
      if (fs.existsSync(entry.dst) && !fs.existsSync(entry.video)) {
        fs.renameSync(entry.dst, entry.video);
        result.push({ video: entry.video, status: 'undone' });
      } else {
        result.push({ video: entry.video, status: 'undoSkipped' });
      }
    }
    if (entry.action === 'cut' && (entry.status === 'done' || entry.status === 'doneOriginalKept')) {
      for (const p of entry.parts) if (fs.existsSync(p.dst)) fs.unlinkSync(p.dst);
      if (entry.original && fs.existsSync(entry.original) && !fs.existsSync(entry.video)) {
        fs.renameSync(entry.original, entry.video);
      }
      result.push({ video: entry.video, status: fs.existsSync(entry.video) ? 'undone' : 'undoSkipped' });
    }
  }
  return result;
}
