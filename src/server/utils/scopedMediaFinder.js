import fs from 'fs';
import path from 'path';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv']);
const DIACRITICS_PATTERN = new RegExp('[̀-ͯ]', 'g');

export function categorize(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}

// Erwartet Dateinamen wie "<id>-Mega Mix 79 - 01 Bam Bam - Merengue Urbano.mp3" oder
// "<id>-ZIN 100 Live - 02 Zeta.mp4" / "<id>-ZIN 100 1on1 - 01 Zeta - L Foot - Cues Off.mp4".
// Der Songname steht nach der Tracknummer im zweiten Segment — aber je nach Dateiart können
// danach noch 0 (Live-Video), 1 (MP3: Rhythmus) oder 2 (1on1-Video: "L Foot - Cues Off")
// weitere Segmente folgen, und der Songname selbst kann eigene " - " enthalten
// (z.B. "Atrévete – Te – Te"). Deshalb werden mehrere mögliche Grenzen als Kandidaten
// zurückgegeben statt einer einzigen fixen Aufteilung.
export function extractSongNameCandidates(filename) {
  const base = filename.replace(/\.[a-zA-Z0-9]+$/, '');
  const parts = base.split(' - ');
  if (parts.length < 2) return [];

  const candidates = new Set();
  for (let end = parts.length; end > 1; end--) {
    const joined = parts.slice(1, end).join(' - ');
    const match = joined.match(/^\d+\s+(.*)$/);
    const name = (match ? match[1] : joined).trim();
    if (name) candidates.add(name);
  }
  return Array.from(candidates);
}

// Gleicht Schreibvarianten zwischen PDF-Songnamen (z.B. "Ella Quiere Mambo (Zumba Version)",
// "Let's Get Crazy! (Mambo Drop)", "Currucucú", "Jack & Rose Instructions") und Dateinamen
// (z.B. "Ella Quiere Mambo-Zumba Version", "LETS GET CRAZY-Mambo Drop", "Currucucu",
// "Jack and Rose Instructions") aus: Akzente entfernen, "&"/"+"/"feat." auf ein gemeinsames
// Wortbild bringen, restliche Satzzeichen/Klammern raus.
function normalizeSongName(name) {
  return name
    .normalize('NFD')
    .replace(DIACRITICS_PATTERN, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, 'plus')
    .replace(/\bfeaturing\b/g, 'ft')
    .replace(/\bfeat\.?\b/g, 'ft')
    .replace(/^bonus\s*track\s*/, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Toleranz für kleine Tippfehler (z.B. Claude liest "Templequeo" statt "Temblequeo"),
// nur als letzter Ausweg genutzt und ausschließlich innerhalb des einen gezielten
// Editions-Ordners (wenige Dateien) — kein Risiko für Verwechslungen über das Archiv hinweg.
function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

function isCloseEnough(a, b) {
  if (!a || !b) return false;
  const maxDistance = Math.min(2, Math.floor(Math.max(a.length, b.length) * 0.15));
  return levenshtein(a, b) <= maxDistance;
}

// Dateien eines Ordners (optional inkl. Unterordner). cache (Map, pro Suchanfrage) verhindert,
// dass derselbe Ordner für jeden Song erneut über das Netz gelesen wird.
export function listFiles(folder, recursive, cache) {
  const key = `${recursive ? 'r' : 'f'}:${folder}`;
  if (cache && cache.has(key)) return cache.get(key);
  let files = [];
  try {
    files = fs
      .readdirSync(folder, { recursive, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => ({ dir: recursive ? e.parentPath || e.path : folder, name: e.name }))
      // Unterordner "Originale" enthält ungeschnittene Handy-Videos, deren Teile nach Songs
      // benannt daneben liegen -- nicht zuordnen und nicht als "nicht zugeordnet" zeigen
      .filter((e) => !/[\\/]Originale([\\/]|$)/i.test(path.relative(folder, e.dir) ? `/${path.relative(folder, e.dir)}` : ''));
  } catch {
    files = [];
  }
  if (cache) cache.set(key, files);
  return files;
}

function splitByCategory(matches) {
  const audio = [];
  const video = [];
  for (const match of matches) {
    if (match.category === 'audio') audio.push({ url: match.url, label: match.label });
    else video.push({ url: match.url, label: match.label });
  }
  return { audio, video };
}

export function findExactMediaMatches(folders, songName, urlBuilder, cache) {
  if (!songName) return { audio: [], video: [] };
  const needle = normalizeSongName(songName);

  const exact = [];
  const fuzzy = [];

  for (const folder of folders.filter(Boolean)) {
    for (const { name: filename } of listFiles(folder, false, cache)) {
      const category = categorize(filename);
      if (!category) continue;

      const candidates = extractSongNameCandidates(filename).map(normalizeSongName);
      const match = { url: urlBuilder(folder, filename), label: filename, category };

      // Zweiter exakter Vergleich ohne Leerzeichen, für Abkürzungen wie "R.L.P." (-> "r l p")
      // gegenüber Dateiname "RLP" (-> "rlp") -- trifft nur bei identischer Buchstabenfolge.
      if (candidates.includes(needle) || candidates.some((c) => c.replace(/ /g, '') === needle.replace(/ /g, ''))) {
        exact.push(match);
      } else if (candidates.some((c) => isCloseEnough(c, needle))) {
        fuzzy.push(match);
      }
    }
  }

  // Fuzzy-Treffer nur verwenden, wenn es gar keinen exakten Treffer gab.
  return splitByCategory(exact.length > 0 ? exact : fuzzy);
}

// Für Jam-Session-Ordner: Dateinamen dort sind uneinheitlich (Handy-Aufnahmen, individuelle
// Benennung) und lassen sich nicht wie bei MegaMix/ZIN Volume in Songnamen zerlegen. Deshalb
// wird der Songname im ganzen Dateinamen gesucht -- begrenzt auf den einen Ordner der Jam
// (inkl. Unterordner wie "Party"), nie archivweit. Beide Seiten werden wie bei ZIN normalisiert
// (Akzente, Satzzeichen, Klammern, "&"/"feat."):
//   1. als ganze Wörter im Dateinamen ("la guaracha oh oh oh" in "03 la guaracha oh oh oh live")
//   2. ohne Leerzeichen, ab 4 Zeichen ("mi gente" in "MiGente.mp4", "r l p" in "RLP.mp4")
//   3. nur wenn 1./2. nichts finden: kleine Tippfehler, Wortfolge gleicher Länge
export function findSubstringMediaMatches(folder, songName, urlBuilder, cache) {
  if (!songName || !folder) return { audio: [], video: [] };
  const needle = normalizeSongName(songName);
  if (!needle) {
    // Titel ohne lateinische Buchstaben (z.B. hebräisch, kyrillisch): Normalisierung ließe
    // nichts übrig -- dann wie früher den Originaltitel im Dateinamen suchen
    const raw = songName.trim().toLowerCase();
    return splitByCategory(
      listFiles(folder, true, cache)
        .filter((f) => categorize(f.name) && f.name.toLowerCase().includes(raw))
        .map((f) => ({ url: urlBuilder(f.dir, f.name), label: f.name, category: categorize(f.name) }))
    );
  }
  const needleCompact = needle.replace(/ /g, '');
  const needleWords = needle.split(' ');

  const exact = [];
  const fuzzy = [];

  for (const file of listFiles(folder, true, cache)) {
    const category = categorize(file.name);
    if (!category) continue;

    const hay = normalizeSongName(file.name.replace(/\.[a-zA-Z0-9]+$/, ''));
    const match = { url: urlBuilder(file.dir, file.name), label: file.name, category };

    if (
      ` ${hay} `.includes(` ${needle} `) ||
      (needleCompact.length >= 4 && hay.replace(/ /g, '').includes(needleCompact))
    ) {
      exact.push(match);
      continue;
    }

    const words = hay.split(' ');
    for (let i = 0; i + needleWords.length <= words.length; i++) {
      if (isCloseEnough(words.slice(i, i + needleWords.length).join(' '), needle)) {
        fuzzy.push(match);
        break;
      }
    }
  }

  return splitByCategory(exact.length > 0 ? exact : fuzzy);
}

// Videos in den Ordnern einer Jam bzw. eines ZIN Volumes, die keinem Song zugeordnet wurden
// (z.B. Warm-up-Video, anders benannte Handy-Aufnahmen). matchedUrls: URLs aller Treffer.
export function findUnassignedVideos(folders, recursive, matchedUrls, urlBuilder, cache) {
  const result = [];
  const seen = new Set();
  for (const folder of folders.filter(Boolean)) {
    for (const file of listFiles(folder, recursive, cache)) {
      if (categorize(file.name) !== 'video') continue;
      const url = urlBuilder(file.dir, file.name);
      if (matchedUrls.has(url) || seen.has(url)) continue;
      seen.add(url);
      result.push({ url, label: file.name, name: file.name.replace(/\.[a-zA-Z0-9]+$/, '') });
    }
  }
  return result.sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

// Für die Suche nach Songtitel: passt ein freier Suchtext zu einem Dateinamen?
export function fileNameMatchesText(fileName, text) {
  const needle = normalizeSongName(text || '');
  if (!needle) return true;
  const hay = normalizeSongName(fileName);
  return hay.includes(needle) || hay.replace(/ /g, '').includes(needle.replace(/ /g, ''));
}
