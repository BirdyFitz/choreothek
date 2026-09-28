// Musik und Videos zu Songs: automatische Zuordnung über die Dateinamen in den Ordnern des
// Eintrags, ergänzt um Zuordnungen von Hand (media_override: { add: [Pfade], remove: [Pfade] }).
import path from 'path';
import { findExactMediaMatches, findSubstringMediaMatches, listFiles, categorize } from './utils/scopedMediaFinder.js';

export function libraryMediaUrl(folder, filename) {
  return `/api/library-media?dir=${encodeURIComponent(folder)}&file=${encodeURIComponent(filename)}`;
}

// Pfad aus einer Medien-URL (Gegenstück zu libraryMediaUrl)
export function pathFromMediaUrl(url) {
  const params = new URL(url, 'http://x').searchParams;
  return path.join(params.get('dir'), params.get('file'));
}

const key = (p) => path.resolve(p).toLowerCase();

export function parseOverride(raw) {
  try {
    const o = raw ? JSON.parse(raw) : {};
    return { add: Array.isArray(o.add) ? o.add : [], remove: Array.isArray(o.remove) ? o.remove : [] };
  } catch {
    return { add: [], remove: [] };
  }
}

// Ordner eines Eintrags, in denen Musik/Videos gesucht werden (Jam inkl. Unterordner)
export function foldersOf(song) {
  if (song.source_type === 'jam_session') return { folders: [song.source_folder], recursive: true };
  if (song.source_type === 'megamix') return { folders: [song.source_folder], recursive: false };
  return { folders: [song.audio_folder, song.live_video_folder, song.oneonone_video_folder], recursive: false };
}

// Automatische Treffer ohne Zuordnungen von Hand
export function autoMediaFor(song, cache) {
  if (song.source_type === 'jam_session') {
    return findSubstringMediaMatches(song.source_folder, song.song_name, libraryMediaUrl, cache);
  }
  if (song.source_type === 'megamix') {
    return findExactMediaMatches([song.source_folder], song.song_name, libraryMediaUrl, cache);
  }
  return findExactMediaMatches([song.audio_folder, song.live_video_folder, song.oneonone_video_folder], song.song_name, libraryMediaUrl, cache);
}

// Treffer inkl. Zuordnungen von Hand: entfernte fallen weg, hinzugefügte kommen dazu (manual: true)
export function mediaFor(song, cache) {
  const auto = autoMediaFor(song, cache);
  const override = parseOverride(song.media_override);
  if (!override.add.length && !override.remove.length) return auto;
  const removed = new Set(override.remove.map(key));
  const result = { audio: [], video: [] };
  const seen = new Set();
  for (const kind of ['audio', 'video']) {
    for (const m of auto[kind]) {
      const k = key(pathFromMediaUrl(m.url));
      if (removed.has(k) || seen.has(k)) continue;
      seen.add(k);
      result[kind].push(m);
    }
  }
  for (const file of override.add) {
    const kind = categorize(file);
    if (!kind || seen.has(key(file))) continue;
    seen.add(key(file));
    result[kind].push({ url: libraryMediaUrl(path.dirname(file), path.basename(file)), label: path.basename(file), manual: true });
  }
  return result;
}

// Alle Musik- und Videodateien in den Ordnern eines Eintrags
export function filesOf(song, cache) {
  const { folders, recursive } = foldersOf(song);
  const files = [];
  const seen = new Set();
  for (const folder of folders.filter(Boolean)) {
    for (const f of listFiles(folder, recursive, cache)) {
      const kind = categorize(f.name);
      const full = path.join(f.dir, f.name);
      if (!kind || seen.has(key(full))) continue;
      seen.add(key(full));
      files.push({ path: full, label: path.relative(folder, full), kind, url: libraryMediaUrl(f.dir, f.name) });
    }
  }
  return files.sort((a, b) => a.label.localeCompare(b.label, 'de'));
}
