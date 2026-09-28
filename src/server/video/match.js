// Abgleich Handy-Video ↔ Musikdateien einer Jam und daraus der Vorschlag zum Umbenennen/Schneiden.
// Regeln und Schwellen wie in der erprobten Python-Fassung (Stand 27.09.2026).
import { FPS, forEachHash } from './fingerprint.js';

export const MIN_HITS = 8; // Kette zählt überhaupt
export const COUNTS_HITS = 12; // Abschnitt zählt für den Vorschlag
export const SURE_HITS = 30; // ab hier „sicher“
const GAP = 20 * FPS; // Lücke, die eine Kette trennt
const MERGE_GAP_S = 25; // gleiche Musikdatei, näher als 25 s -> ein Abschnitt
const MIN_LENGTH_S = 5;
const EDGE_BUFFER_S = 5;
const RENAME_SHARE = 0.6; // ein Abschnitt deckt ≥ 60 % des Videos ab -> nur umbenennen
const INSIDE_SHARE = 0.7;

// Python round(): x,5 wird zur geraden Zahl gerundet
function pyRound(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

// Index aller Hashes der Musikdateien: hash -> [refIndex, frame, refIndex, frame, …]
export function buildIndex(refPrints) {
  const index = new Map();
  refPrints.forEach((print, ri) => {
    forEachHash(print, (h, t) => {
      let list = index.get(h);
      if (!list) index.set(h, (list = []));
      list.push(ri, t);
    });
  });
  return index;
}

// Abschnitte eines Videos: [{ ref, start, end, hits }] (Sekunden im Video), nach Beginn sortiert
export function segmentsFor(videoPrint, index) {
  const hits = new Map(); // "ref|versatz" -> Frames im Video
  forEachHash(videoPrint, (h, tv) => {
    const list = index.get(h);
    if (!list) return;
    for (let k = 0; k < list.length; k += 2) {
      const key = `${list[k]}|${pyRound((list[k + 1] - tv) / 2)}`;
      let arr = hits.get(key);
      if (!arr) hits.set(key, (arr = []));
      arr.push(tv);
    }
  });
  const segs = [];
  for (const [key, tvs] of hits) {
    if (tvs.length < MIN_HITS) continue;
    const ref = Number(key.split('|')[0]);
    tvs.sort((a, b) => a - b);
    let chunk = [tvs[0]];
    const flush = () => {
      if (chunk.length >= MIN_HITS) segs.push({ ref, start: chunk[0] / FPS, end: chunk[chunk.length - 1] / FPS, hits: chunk.length });
    };
    for (let i = 1; i < tvs.length; i++) {
      if (tvs[i] - tvs[i - 1] > GAP) {
        flush();
        chunk = [];
      }
      chunk.push(tvs[i]);
    }
    flush();
  }
  segs.sort((a, b) => a.ref - b.ref || a.start - b.start);
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.ref === s.ref && s.start <= last.end + MERGE_GAP_S) {
      last.end = Math.max(last.end, s.end);
      last.hits += s.hits;
    } else {
      merged.push({ ...s });
    }
  }
  return merged.sort((a, b) => a.start - b.start);
}

// Vorschlag je Video: kein Treffer / umbenennen (ein Song füllt das Video) / schneiden (mehrere Songs).
// Teile: { ref, start, end, hits, sure } -- Grenzen in der Mitte der Lücke, außen 5 s Puffer
export function proposalFor(segments, duration) {
  const segs = segments.filter((s) => s.hits >= COUNTS_HITS && s.end - s.start > MIN_LENGTH_S);
  const keep = [];
  for (const s of [...segs].sort((a, b) => b.hits - a.hits)) {
    const inside = keep.some((k) => Math.min(s.end, k.end) - Math.max(s.start, k.start) > INSIDE_SHARE * (s.end - s.start));
    if (!inside) keep.push({ ...s });
  }
  keep.sort((a, b) => a.start - b.start);
  const joined = [];
  for (const k of keep) {
    const last = joined[joined.length - 1];
    if (last && last.ref === k.ref) {
      last.end = Math.max(last.end, k.end);
      last.hits += k.hits;
    } else {
      joined.push({ ...k });
    }
  }
  if (!joined.length) return { action: 'none', parts: [] };
  const round1 = (x) => Math.round(x * 10) / 10;
  const parts = joined.map((s, i) => ({
    ref: s.ref,
    hits: s.hits,
    sure: s.hits >= SURE_HITS,
    start: round1(i === 0 ? Math.max(0, s.start - EDGE_BUFFER_S) : (joined[i - 1].end + s.start) / 2),
    end: round1(i === joined.length - 1 ? Math.min(duration, s.end + EDGE_BUFFER_S) : (s.end + joined[i + 1].start) / 2)
  }));
  const single = joined.length === 1 && joined[0].end - joined[0].start >= RENAME_SHARE * duration;
  return { action: single ? 'rename' : 'cut', parts };
}
