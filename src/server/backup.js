// Sicherung: Datenbank (mit Einstellungen, ohne API-Schlüssel -- die liegen verschlüsselt in einer
// eigenen Datei und sind an das Windows-Konto gebunden) und die PDF-Kopien als eine .zip-Datei.
// Wiederherstellen legt den bisherigen Stand vorher beiseite (…-vor-wiederherstellung).
import fs from 'fs';
import path from 'path';
import yazl from 'yazl';
import yauzl from 'yauzl';
import { getDataDir, getUploadsDir } from './paths.js';
import { initDB, closeDB, getDbFile, snapshotDatabase, collectionCounts, getSetting, setSetting, SCHEMA_VERSION } from './db.js';
import { zinFolders, ZIN_OVERRIDES_SETTING, MEGAMIX_OVERRIDES_SETTING } from './scan/settings.js';
import { MEDIA_OVERRIDES_SETTING } from './scan/jams.js';

const DB_ENTRY = 'choreothek.sqlite';
const MANIFEST = 'manifest.json';
const UPLOADS = 'uploads/';
const BEFORE_RESTORE = 'vor-wiederherstellung';
export const REMINDER_DAYS = 30;

export class BackupError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function defaultBackupName(date = new Date()) {
  return `Choreothek-Sicherung-${date.toISOString().slice(0, 10)}.zip`;
}

export async function createBackup(target, { appVersion = null } = {}) {
  const work = fs.mkdtempSync(path.join(getDataDir(), 'sicherung-'));
  try {
    const snapshot = path.join(work, DB_ENTRY);
    await snapshotDatabase(snapshot);
    const uploads = fs.existsSync(getUploadsDir()) ? fs.readdirSync(getUploadsDir()).filter((f) => fs.statSync(path.join(getUploadsDir(), f)).isFile()) : [];
    const manifest = {
      app: 'Choreothek',
      appVersion,
      created: new Date().toISOString(),
      schema: SCHEMA_VERSION,
      counts: await collectionCounts(),
      pdfs: uploads.length,
      apiKeysIncluded: false
    };
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), MANIFEST);
    zip.addFile(snapshot, DB_ENTRY);
    for (const f of uploads) zip.addFile(path.join(getUploadsDir(), f), UPLOADS + f, { compress: false });
    zip.end();
    // erst als .part schreiben, damit eine abgebrochene Sicherung nie wie eine fertige aussieht
    const part = `${target}.part`;
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(part);
      zip.outputStream.pipe(out).on('close', resolve).on('error', reject);
      zip.outputStream.on('error', reject);
    });
    fs.renameSync(part, target);
    await setSetting('last_backup_at', manifest.created);
    return { ...manifest, file: target, bytes: fs.statSync(target).size };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function openZip(file) {
  return new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => (err ? reject(new BackupError('notAZip')) : resolve(zip))));
}

// Alle Einträge prüfen und (optional) auspacken. Erlaubt sind nur manifest.json,
// choreothek.sqlite und uploads/<Dateiname> -- keine Unterordner, keine Pfade nach außen.
async function readBackup(file, extractTo = null) {
  const zip = await openZip(file);
  const allowed = (name) => name === MANIFEST || name === DB_ENTRY || (name.startsWith(UPLOADS) && path.basename(name) === name.slice(UPLOADS.length) && !/[\\:]|^\.\.?$/.test(name.slice(UPLOADS.length)));
  let manifest = null;
  let hasDb = false;
  let pdfs = 0;
  await new Promise((resolve, rejectRaw) => {
    // bei Ablehnung die Datei schließen -- sonst bleibt sie unter Windows gesperrt
    const reject = (error) => {
      zip.close();
      rejectRaw(error);
    };
    zip.on('error', () => reject(new BackupError('notAZip')));
    zip.on('end', resolve);
    zip.on('entry', (entry) => {
      const name = entry.fileName;
      if (name.endsWith('/')) return zip.readEntry();
      if (!allowed(name)) return reject(new BackupError('unexpectedContent'));
      zip.openReadStream(entry, (err, stream) => {
        if (err) return reject(new BackupError('notAZip'));
        if (name === MANIFEST) {
          const chunks = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('end', () => {
            try {
              manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              return reject(new BackupError('notABackup'));
            }
            zip.readEntry();
          });
          return;
        }
        if (name === DB_ENTRY) hasDb = true;
        else pdfs++;
        if (!extractTo) {
          stream.resume();
          stream.on('end', () => zip.readEntry());
          return;
        }
        const dest = path.join(extractTo, ...name.split('/'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        stream.pipe(fs.createWriteStream(dest)).on('close', () => zip.readEntry()).on('error', reject);
      });
    });
    zip.readEntry();
  });
  if (!manifest || manifest.app !== 'Choreothek' || !hasDb) throw new BackupError('notABackup');
  if (manifest.schema > SCHEMA_VERSION) throw new BackupError('newerVersion');
  return { ...manifest, pdfsFound: pdfs };
}

export async function inspectBackup(file) {
  return readBackup(file);
}

// Bisherigen Stand beiseitelegen (nur der jeweils letzte bleibt), Sicherung einsetzen, Datenbank neu öffnen
export async function restoreBackup(file) {
  const dataDir = getDataDir();
  const work = fs.mkdtempSync(path.join(dataDir, 'wiederherstellung-'));
  try {
    // Erst vollständig prüfen und auspacken -- bis hier bleibt der bisherige Stand unberührt
    const manifest = await readBackup(file, work);
    const dbFile = getDbFile();
    const uploads = getUploadsDir();
    const oldDb = `${dbFile}.${BEFORE_RESTORE}`;
    const oldUploads = `${uploads}-${BEFORE_RESTORE}`;
    closeDB(); // schreibt die WAL-Datei zurück in die Datenbank
    try {
      for (const p of [oldDb, oldUploads]) fs.rmSync(p, { recursive: true, force: true });
      for (const ext of ['-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true });
      if (fs.existsSync(dbFile)) fs.renameSync(dbFile, oldDb);
      if (fs.existsSync(uploads)) fs.renameSync(uploads, oldUploads);
      fs.renameSync(path.join(work, DB_ENTRY), dbFile);
      const restoredUploads = path.join(work, 'uploads');
      if (fs.existsSync(restoredUploads)) fs.renameSync(restoredUploads, uploads);
      else fs.mkdirSync(uploads, { recursive: true });
      await initDB(dbFile); // ältere Sicherungen werden dabei auf den aktuellen Stand gebracht
      // Das Datum wird erst nach dem Packen gespeichert -- die wiederhergestellte Sicherung selbst zählt mindestens
      const last = await getSetting('last_backup_at');
      if (!last || last < manifest.created) await setSetting('last_backup_at', manifest.created);
    } catch (error) {
      // Tausch gescheitert: bisherigen Stand zurückholen, nie mit leerer Datenbank weitermachen
      closeDB();
      if (fs.existsSync(oldDb)) {
        fs.rmSync(dbFile, { force: true });
        fs.renameSync(oldDb, dbFile);
      }
      if (fs.existsSync(oldUploads)) {
        fs.rmSync(uploads, { recursive: true, force: true });
        fs.renameSync(oldUploads, uploads);
      }
      await initDB(dbFile);
      throw error;
    }
    return manifest;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Ordner aus den Einstellungen, die es auf diesem PC nicht gibt (z. B. nach Wiederherstellung
// auf einem anderen PC oder Windows-Konto)
export async function missingFolders() {
  const json = async (key, fallback) => JSON.parse((await getSetting(key)) || JSON.stringify(fallback));
  const { choreoRoot, musicRoot } = await zinFolders();
  const videoSetting = await getSetting('zin_volumes_video_root');
  const entries = [
    ...(await json('media_roots', [])).map((p) => ['jamRoots', p]),
    ['megamixRoot', await getSetting('megamix_root')],
    ['zinMusicRoot', musicRoot],
    ['zinChoreoRoot', choreoRoot],
    ['zinVideoRoot', videoSetting]
  ];
  let overrides = 0;
  for (const key of [ZIN_OVERRIDES_SETTING, MEGAMIX_OVERRIDES_SETTING]) {
    for (const e of Object.values(await json(key, {}))) for (const p of Object.values(e)) if (!fs.existsSync(p)) overrides++;
  }
  for (const p of Object.values(await json(MEDIA_OVERRIDES_SETTING, {}))) if (!fs.existsSync(p)) overrides++;
  return { folders: entries.filter(([, p]) => p && !fs.existsSync(p)).map(([kind, p]) => ({ kind, path: p })), overrides };
}

export async function backupStatus() {
  const last = await getSetting('last_backup_at');
  const reminder = (await getSetting('backup_reminder')) !== '0';
  const counts = await collectionCounts();
  const hasData = counts.jams + counts.zinVolumes + counts.megamixes > 0;
  const daysSince = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  return { lastBackupAt: last, reminder, due: reminder && hasData && (daysSince === null || daysSince >= REMINDER_DAYS), daysSince };
}
