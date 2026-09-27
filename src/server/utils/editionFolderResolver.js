import fs from 'fs';
import path from 'path';

// Findet den Unterordner einer Edition anhand ihrer Nummer (als eigenständiges Zahlwort,
// nicht als Teilstring einer anderen Zahl) und optional eines zusätzlichen Stichworts
// (z.B. "live-class" / "one-on-one"), robust gegenüber kleinen Schreibvarianten
// (Bindestriche, Leerzeichen, Groß-/Kleinschreibung).
export function findFolderByEditionNumber(root, editionNumber, keyword) {
  if (!root || !fs.existsSync(root)) return null;

  const numberPattern = new RegExp(`(^|\\D)${editionNumber}(\\D|$)`);
  const keywordPattern = keyword ? new RegExp(keyword.replace(/[-\s]/g, '[-\\s]?'), 'i') : null;

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter((e) => e.isDirectory())
    .filter((e) => numberPattern.test(e.name))
    .filter((e) => !keywordPattern || keywordPattern.test(e.name));

  if (candidates.length === 0) return null;
  return path.join(root, candidates[0].name);
}
