import fs from 'fs';

// Die Warm-up-Medley (i.d.R. 3 Songs, gemeinsame Choreo auf Seite 1 der LIVE-PDF) wird
// nicht aus der Choreo-Notes-PDF extrahiert (Claude bekäme nur einen zusammengesetzten
// Titel wie "PODEROSA / SELVA / ARE YOU READY" ohne klare Song-Grenzen), sondern direkt aus
// den MP3-Dateinamen im Musikordner des Volumes, wo jeder Warm-up-Song als eigene Datei
// mit Rhythmus "Warm-up" vorliegt (z.B. "01 La Fiesta - Warm-up.mp3").
export function findWarmupSongs(audioFolder) {
  if (!audioFolder) return [];

  let files;
  try {
    files = fs.readdirSync(audioFolder);
  } catch {
    return [];
  }

  const warmups = [];
  for (const filename of files) {
    if (!filename.toLowerCase().endsWith('.mp3')) continue;
    const base = filename.replace(/\.mp3$/i, '');
    const parts = base.split(' - ');
    if (parts.length < 3) continue;

    const rhythm = parts[parts.length - 1].trim();
    if (rhythm.toLowerCase() !== 'warm-up') continue;

    const namePart = parts.slice(1, -1).join(' - ');
    const match = namePart.match(/^(\d+)\s+(.*)$/);
    const position = match ? parseInt(match[1], 10) : 0;
    const name = (match ? match[2] : namePart).trim();
    if (name) warmups.push({ position, name });
  }

  warmups.sort((a, b) => a.position - b.position);
  return warmups;
}
