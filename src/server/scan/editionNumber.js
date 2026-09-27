// Editionsnummer aus einem Ordner- oder Dateinamen, tolerant gegenüber den Namensformen der
// Downloads und eigener Ordner, z. B.:
//   "ZIN 100", "zin-volume-100-live-class", "Zin Volume 105.pdf", "87 Live Choreo Notes.pdf",
//   "1247-ZIN 99 Live - 01 Warm-up.mp4" (vorne eine Download-Kennung), "Maga Mix 60"
// Liefert null, wenn keine Nummer eindeutig erkennbar ist (z. B. "ZIN Volume Trial").

// Zahl direkt hinter einem Stichwort hat Vorrang (die Download-Kennung „1247-“ davor zählt nicht)
const KEYWORD_PATTERN = /(?:zin|volume|vol\.?|mega\s*-?\s*mix|maga\s*-?\s*mix|megamix)[\s_-]*(\d{1,4})(?!\d)/i;
// sonst: Zahl am Anfang, gefolgt von Leerzeichen (nicht „1247-…“, das ist eine Download-Kennung)
const LEADING_PATTERN = /^(\d{1,4})(?=[\s_]|$)/;

export function editionNumber(name) {
  const base = String(name).replace(/\.[a-z0-9]{2,4}$/i, '');
  const keyword = base.match(KEYWORD_PATTERN);
  if (keyword) return parseInt(keyword[1], 10);
  const leading = base.match(LEADING_PATTERN);
  if (leading) return parseInt(leading[1], 10);
  return null;
}

// Art einer Choreo-Notes-PDF bzw. eines Videoordners
export function variantOf(name) {
  if (/1\s*on\s*1|one[\s_-]*on[\s_-]*one/i.test(name)) return 'oneonone';
  if (/live/i.test(name)) return 'live';
  return 'combined';
}
