// Datenordner der App (Datenbank, PDF-Kopien, Protokoll). Electron setzt ihn beim Start auf
// %APPDATA%\Choreothek; Tests setzen einen temporären Ordner.
import fs from 'fs';
import path from 'path';

let dataDir = null;

export function setDataDir(dir) {
  dataDir = dir;
  fs.mkdirSync(getUploadsDir(), { recursive: true });
}

export function getDataDir() {
  if (!dataDir) throw new Error('Datenordner nicht gesetzt (setDataDir)');
  return dataDir;
}

// Kopien der eingelesenen PDFs für die Choreo-Notes-Ansicht
export function getUploadsDir() {
  return path.join(getDataDir(), 'uploads');
}
