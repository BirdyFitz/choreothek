// Wandelt die frei formulierten Datumsangaben aus den Choreo-Notes-PDFs in ein ISO-Datum
// (YYYY-MM-DD) um, damit nach Datum gefiltert werden kann. Vorkommende Formate u. a.:
// "01.12.2018", "1.8.2021", "20/01/2024", "2023-05-14", "07 May 2022", "15. Mai 2022",
// "12 October, 2024", "August 27, 2023", "Sept 16, 2023", "Feb 2025" (nur Monat -> Tag 1).
// Nicht erkennbar -> null.

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8,
  sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12
};

function monthFromWord(word) {
  const key = word.toLowerCase().replace('ä', 'a').slice(0, 3);
  return MONTHS[key] || null;
}

function toIso(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d || m > 12 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // z.B. 31.02.
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseJamDate(text) {
  if (!text) return null;
  const s = String(text).trim();
  let m;

  // 2023-05-14
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return toIso(m[1], m[2], m[3]);
  // 01.12.2018 / 1.8.2021 / 20/01/2024
  if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) return toIso(m[3], m[2], m[1]);
  // 07 May 2022 / 15. Mai 2022 / 12 October, 2024
  if ((m = s.match(/^(\d{1,2})\.?\s+([A-Za-zÄäÖöÜü]+)\.?,?\s+(\d{4})$/))) {
    const month = monthFromWord(m[2]);
    return month ? toIso(m[3], month, m[1]) : null;
  }
  // August 27, 2023 / Sept 16, 2023
  if ((m = s.match(/^([A-Za-zÄäÖöÜü]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const month = monthFromWord(m[1]);
    return month ? toIso(m[3], month, m[2]) : null;
  }
  // Feb 2025
  if ((m = s.match(/^([A-Za-zÄäÖöÜü]+)\.?\s+(\d{4})$/))) {
    const month = monthFromWord(m[1]);
    return month ? toIso(m[2], month, 1) : null;
  }
  return null;
}
