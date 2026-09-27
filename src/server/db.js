// Datenbank-Schicht (SQLite, eine Datei im Datenordner der App).
// Die Funktionen sind async wie in der NAS-Version, damit Routen und Importe unverändert bleiben;
// better-sqlite3 arbeitet intern synchron.
import path from 'path';
import Database from 'better-sqlite3';
import { parseJamDate } from './utils/jamDate.js';
import { getDataDir } from './paths.js';

let db = null;

// Schema-Stände; neue Stände nur anhängen, nie ändern (PRAGMA user_version = Anzahl ausgeführter)
const MIGRATIONS = [
  `
  CREATE TABLE jams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jammer_name TEXT NOT NULL,
    jam_date TEXT,
    jam_datum TEXT,
    location TEXT,
    pdf_filename TEXT,
    source_folder TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jam_id INTEGER NOT NULL REFERENCES jams(id) ON DELETE CASCADE,
    song_name TEXT NOT NULL,
    artist TEXT,
    rhythm TEXT,
    position INTEGER,
    page INTEGER
  );
  CREATE INDEX idx_songs_jam ON songs(jam_id);
  CREATE INDEX idx_jams_jammer ON jams(jammer_name);
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE megamixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_number INTEGER,
    edition_label TEXT NOT NULL UNIQUE,
    source_folder TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE megamix_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    megamix_id INTEGER NOT NULL REFERENCES megamixes(id) ON DELETE CASCADE,
    song_name TEXT NOT NULL,
    rhythm TEXT,
    position INTEGER
  );
  CREATE INDEX idx_megamix_songs_megamix ON megamix_songs(megamix_id);
  CREATE TABLE zin_volumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_number INTEGER,
    edition_label TEXT NOT NULL UNIQUE,
    audio_folder TEXT,
    live_video_folder TEXT,
    oneonone_video_folder TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE zin_volume_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zin_volume_id INTEGER NOT NULL REFERENCES zin_volumes(id) ON DELETE CASCADE,
    song_name TEXT NOT NULL,
    artist TEXT,
    rhythm TEXT,
    position INTEGER,
    live_pdf_filename TEXT,
    live_page INTEGER,
    oneonone_pdf_filename TEXT,
    oneonone_page INTEGER
  );
  CREATE INDEX idx_zin_volume_songs_volume ON zin_volume_songs(zin_volume_id);
  `
];

function open(file) {
  const conn = new Database(file);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  // Vergleich ohne Groß-/Kleinschreibung auch für Umlaute (SQLite-LIKE kann das nur für ASCII)
  conn.function('lower_de', { deterministic: true }, (v) => (v == null ? null : String(v).toLocaleLowerCase('de')));
  return conn;
}

function migrate(conn) {
  const current = conn.pragma('user_version', { simple: true });
  for (let i = current; i < MIGRATIONS.length; i++) {
    conn.transaction(() => {
      conn.exec(MIGRATIONS[i]);
      conn.pragma(`user_version = ${i + 1}`);
    })();
  }
}

function getDb() {
  if (!db) throw new Error('Datenbank nicht initialisiert (initDB zuerst aufrufen)');
  return db;
}

// file: Pfad zur Datenbankdatei; Vorgabe <Datenordner>/choreothek.sqlite, ':memory:' für Tests
export async function initDB(file) {
  if (!db) {
    db = open(file || path.join(getDataDir(), 'choreothek.sqlite'));
    migrate(db);
  }
  return db;
}

export function closeDB() {
  if (db) db.close();
  db = null;
}

export async function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

export async function insertJam(jammerName, jamDate, pdfFilename, location, sourceFolder = null) {
  const info = getDb()
    .prepare(
      'INSERT INTO jams (jammer_name, jam_date, jam_datum, location, pdf_filename, source_folder) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(jammerName, jamDate, parseJamDate(jamDate), location, pdfFilename, sourceFolder);
  return Number(info.lastInsertRowid);
}

export async function updateJamFolder(jamId, sourceFolder) {
  getDb().prepare('UPDATE jams SET source_folder = ? WHERE id = ?').run(sourceFolder, jamId);
}

export async function insertSongs(jamId, songs) {
  const stmt = getDb().prepare(
    'INSERT INTO songs (jam_id, song_name, artist, rhythm, position, page) VALUES (?, ?, ?, ?, ?, ?)'
  );
  getDb().transaction(() => {
    for (const song of songs) {
      stmt.run(jamId, song.name, song.artist ?? null, song.rhythm ?? null, song.position ?? null, song.page ?? null);
    }
  })();
}

export async function updateJam(jamId, jammerName, jamDate, location) {
  getDb()
    .prepare('UPDATE jams SET jammer_name = ?, jam_date = ?, jam_datum = ?, location = ? WHERE id = ?')
    .run(jammerName, jamDate, parseJamDate(jamDate), location, jamId);
}

export async function deleteSongsForJam(jamId) {
  getDb().prepare('DELETE FROM songs WHERE jam_id = ?').run(jamId);
}

export async function getAllJams() {
  return getDb().prepare('SELECT id, pdf_filename, source_folder FROM jams ORDER BY id').all();
}

// Für die Jam-Auswahl im Suchen-Tab
export async function getJamList() {
  return getDb()
    .prepare(
      `SELECT j.id, j.jammer_name, j.jam_date, j.jam_datum, j.location,
              (SELECT COUNT(*) FROM songs s WHERE s.jam_id = j.id) AS song_count
       FROM jams j
       ORDER BY j.jam_datum DESC NULLS LAST, j.jammer_name`
    )
    .all();
}

const contains = (column) => `lower_de(${column}) LIKE lower_de(?)`;

// rhythm: Teilstring, Groß-/Kleinschreibung egal ("sal" findet alle Salsa-Varianten).
// datumVon/datumBis (YYYY-MM-DD) und ort gibt es nur bei Jam Sessions -- sind sie gesetzt,
// werden MegaMix und ZIN Volumes nicht mit durchsucht.
// song: Teilstring im Songtitel, alle drei Quellen. jamId: genau eine Jam Session.
export async function searchSongs(rhythm, jammerName, megamix, zinVolume, datumVon, datumBis, ort, song, jamId) {
  const branches = [];
  const params = [];

  const jamOnly = Boolean(jammerName || datumVon || datumBis || ort || jamId);
  const wantsJam = !megamix && !zinVolume;
  const wantsMegamix = !jamOnly && !zinVolume;
  const wantsZinVolume = !jamOnly && !megamix;

  if (wantsJam) {
    let cond = 'WHERE 1=1';
    if (rhythm) {
      params.push(`%${rhythm}%`);
      cond += ` AND ${contains('s.rhythm')}`;
    }
    if (song) {
      params.push(`%${song}%`);
      cond += ` AND ${contains('s.song_name')}`;
    }
    if (jammerName) {
      params.push(`%${jammerName}%`);
      cond += ` AND ${contains('j.jammer_name')}`;
    }
    if (datumVon) {
      params.push(datumVon);
      cond += ' AND j.jam_datum >= ?';
    }
    if (datumBis) {
      params.push(datumBis);
      cond += ' AND j.jam_datum <= ?';
    }
    if (ort) {
      params.push(`%${ort}%`);
      cond += ` AND ${contains('j.location')}`;
    }
    if (jamId) {
      params.push(Number(jamId));
      cond += ' AND j.id = ?';
    }
    branches.push(`
      SELECT 'jam_session' AS source_type, j.id AS group_id, s.song_name, s.artist, s.rhythm, s.position,
             s.page, j.pdf_filename,
             NULL AS live_pdf_filename, NULL AS live_page,
             NULL AS oneonone_pdf_filename, NULL AS oneonone_page,
             j.jammer_name, j.jam_date, j.jam_datum, j.location, NULL AS edition_label, j.created_at,
             j.source_folder, NULL AS audio_folder,
             NULL AS live_video_folder, NULL AS oneonone_video_folder
      FROM songs s JOIN jams j ON j.id = s.jam_id ${cond}
    `);
  }

  if (wantsMegamix) {
    let cond = 'WHERE 1=1';
    if (rhythm) {
      params.push(`%${rhythm}%`);
      cond += ` AND ${contains('ms.rhythm')}`;
    }
    if (song) {
      params.push(`%${song}%`);
      cond += ` AND ${contains('ms.song_name')}`;
    }
    if (megamix) {
      params.push(megamix);
      cond += ' AND m.edition_label = ?';
    }
    branches.push(`
      SELECT 'megamix' AS source_type, m.id AS group_id, ms.song_name, NULL AS artist, ms.rhythm, ms.position,
             NULL AS page, NULL AS pdf_filename,
             NULL AS live_pdf_filename, NULL AS live_page,
             NULL AS oneonone_pdf_filename, NULL AS oneonone_page,
             NULL AS jammer_name, NULL AS jam_date, NULL AS jam_datum, NULL AS location, m.edition_label, m.created_at,
             m.source_folder, NULL AS audio_folder,
             NULL AS live_video_folder, NULL AS oneonone_video_folder
      FROM megamix_songs ms JOIN megamixes m ON m.id = ms.megamix_id ${cond}
    `);
  }

  if (wantsZinVolume) {
    let cond = 'WHERE 1=1';
    if (rhythm) {
      params.push(`%${rhythm}%`);
      cond += ` AND ${contains('zs.rhythm')}`;
    }
    if (song) {
      params.push(`%${song}%`);
      cond += ` AND ${contains('zs.song_name')}`;
    }
    if (zinVolume) {
      params.push(zinVolume);
      cond += ' AND zv.edition_label = ?';
    }
    branches.push(`
      SELECT 'zin_volume' AS source_type, zv.id AS group_id, zs.song_name, zs.artist, zs.rhythm, zs.position,
             NULL AS page, NULL AS pdf_filename,
             zs.live_pdf_filename, zs.live_page, zs.oneonone_pdf_filename, zs.oneonone_page,
             NULL AS jammer_name, NULL AS jam_date, NULL AS jam_datum, NULL AS location, zv.edition_label, zv.created_at,
             NULL AS source_folder, zv.audio_folder, zv.live_video_folder, zv.oneonone_video_folder
      FROM zin_volume_songs zs JOIN zin_volumes zv ON zv.id = zs.zin_volume_id ${cond}
    `);
  }

  if (branches.length === 0) return [];
  return getDb()
    .prepare(`${branches.join(' UNION ALL ')} ORDER BY created_at DESC, position`)
    .all(...params);
}

export async function getAllRhythms() {
  return getDb()
    .prepare(
      `SELECT DISTINCT rhythm FROM (
         SELECT rhythm FROM songs WHERE rhythm IS NOT NULL
         UNION SELECT rhythm FROM megamix_songs WHERE rhythm IS NOT NULL
         UNION SELECT rhythm FROM zin_volume_songs WHERE rhythm IS NOT NULL
       ) ORDER BY rhythm`
    )
    .all()
    .map((r) => r.rhythm);
}

export async function getAllJammers() {
  return getDb()
    .prepare('SELECT DISTINCT jammer_name FROM jams ORDER BY jammer_name')
    .all()
    .map((j) => j.jammer_name);
}

export async function getAllMegaMixEditionLabels() {
  return getDb()
    .prepare('SELECT edition_label FROM megamixes ORDER BY edition_label')
    .all()
    .map((r) => r.edition_label);
}

export async function insertMegaMix(editionNumber, editionLabel, sourceFolder) {
  const info = getDb()
    .prepare('INSERT INTO megamixes (edition_number, edition_label, source_folder) VALUES (?, ?, ?)')
    .run(editionNumber, editionLabel, sourceFolder);
  return Number(info.lastInsertRowid);
}

export async function insertMegaMixSongs(megamixId, songs) {
  const stmt = getDb().prepare('INSERT INTO megamix_songs (megamix_id, song_name, rhythm, position) VALUES (?, ?, ?, ?)');
  getDb().transaction(() => {
    for (const song of songs) stmt.run(megamixId, song.name, song.rhythm ?? null, song.position ?? null);
  })();
}

export async function getAllZinVolumeEditionLabels() {
  return getDb()
    .prepare('SELECT edition_label FROM zin_volumes ORDER BY edition_label')
    .all()
    .map((r) => r.edition_label);
}

export async function insertZinVolume(editionNumber, editionLabel, audioFolder, liveVideoFolder, oneononeVideoFolder) {
  const info = getDb()
    .prepare(
      `INSERT INTO zin_volumes (edition_number, edition_label, audio_folder, live_video_folder, oneonone_video_folder)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(editionNumber, editionLabel, audioFolder, liveVideoFolder, oneononeVideoFolder);
  return Number(info.lastInsertRowid);
}

export async function updateMegaMixFolder(editionLabel, sourceFolder) {
  getDb().prepare('UPDATE megamixes SET source_folder = ? WHERE edition_label = ?').run(sourceFolder, editionLabel);
}

export async function updateZinVolumeFolders(editionLabel, audioFolder, liveVideoFolder, oneononeVideoFolder) {
  getDb()
    .prepare('UPDATE zin_volumes SET audio_folder = ?, live_video_folder = ?, oneonone_video_folder = ? WHERE edition_label = ?')
    .run(audioFolder, liveVideoFolder, oneononeVideoFolder, editionLabel);
}

export async function getAllMegaMixes() {
  return getDb().prepare('SELECT edition_label, source_folder FROM megamixes ORDER BY edition_label').all();
}

export async function getAllZinVolumesFull() {
  return getDb()
    .prepare(
      'SELECT edition_number, edition_label, audio_folder, live_video_folder, oneonone_video_folder FROM zin_volumes ORDER BY edition_label'
    )
    .all();
}

export async function insertZinVolumeSongs(zinVolumeId, songs) {
  const stmt = getDb().prepare(
    `INSERT INTO zin_volume_songs
       (zin_volume_id, song_name, artist, rhythm, position, live_pdf_filename, live_page, oneonone_pdf_filename, oneonone_page)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  getDb().transaction(() => {
    for (const song of songs) {
      stmt.run(
        zinVolumeId, song.name, song.artist ?? null, song.rhythm ?? null, song.position ?? null,
        song.live_pdf_filename ?? null, song.live_page ?? null, song.oneonone_pdf_filename ?? null, song.oneonone_page ?? null
      );
    }
  })();
}
