// Datenbank-Schicht (SQLite, eine Datei im Datenordner der App).
// Die Funktionen sind async wie in der NAS-Version, damit Routen und Importe unverändert bleiben;
// better-sqlite3 arbeitet intern synchron.
import path from 'path';
import Database from 'better-sqlite3';
import { parseJamDate } from './utils/jamDate.js';
import { getDataDir } from './paths.js';

let db = null;
let dbFile = null;

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
  `,
  // 2: Protokoll aller KI-Aufrufe (Kostenanzeige, Schätzung aus echten Werten)
  `
  CREATE TABLE ai_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    kind TEXT NOT NULL,
    files TEXT,
    pages INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd REAL,
    ok INTEGER NOT NULL,
    error TEXT
  );
  CREATE INDEX idx_ai_calls_provider ON ai_calls(provider, created_at);
  `,
  // 3: Musik/Videos je Song von Hand zuordnen bzw. automatische Treffer entfernen (JSON { add, remove })
  `
  ALTER TABLE songs ADD COLUMN media_override TEXT;
  ALTER TABLE zin_volume_songs ADD COLUMN media_override TEXT;
  ALTER TABLE megamix_songs ADD COLUMN media_override TEXT;
  `,
  // 4: Läufe der Videoanalyse (Protokoll je Lauf, für „Rückgängig“)
  `
  CREATE TABLE video_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jam_id INTEGER REFERENCES jams(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    log TEXT NOT NULL,
    undone_at TEXT,
    undo_log TEXT
  );
  `,
  // 5: Bezeichnungen der Volumes ohne Markenkürzel („… Volume 100“ -> „Volume 100“)
  `
  UPDATE zin_volumes SET edition_label = 'Volume ' || edition_number
  WHERE edition_number IS NOT NULL AND edition_label <> 'Volume ' || edition_number;
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
    dbFile = file || path.join(getDataDir(), 'choreothek.sqlite');
    db = open(dbFile);
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
// werden MegaMix und Volumes nicht mit durchsucht.
// song: Teilstring im Songtitel, alle drei Quellen. jamId: genau eine Jam Session.
// quelle: 'jam' | 'megamix' | 'zin' schränkt auf eine Quellenart ein (leer = alle).
export async function searchSongs(rhythm, jammerName, megamix, zinVolume, datumVon, datumBis, ort, song, jamId, quelle) {
  const branches = [];
  const params = [];

  const jamOnly = Boolean(jammerName || datumVon || datumBis || ort || jamId);
  const only = (q) => !quelle || quelle === q;
  const wantsJam = !megamix && !zinVolume && only('jam');
  const wantsMegamix = !jamOnly && !zinVolume && only('megamix');
  const wantsZinVolume = !jamOnly && !megamix && only('zin');

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
      SELECT 'jam_session' AS source_type, j.id AS group_id, s.id AS song_id, s.media_override, s.song_name, s.artist, s.rhythm, s.position,
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
      SELECT 'megamix' AS source_type, m.id AS group_id, ms.id AS song_id, ms.media_override, ms.song_name, NULL AS artist, ms.rhythm, ms.position,
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
      SELECT 'zin_volume' AS source_type, zv.id AS group_id, zs.id AS song_id, zs.media_override, zs.song_name, zs.artist, zs.rhythm, zs.position,
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
    .prepare('SELECT edition_label FROM megamixes ORDER BY edition_number, edition_label')
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
    .prepare('SELECT edition_label FROM zin_volumes ORDER BY edition_number, edition_label')
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

// ---------- KI-Aufrufe ----------

export async function logAiCall(c) {
  getDb()
    .prepare(
      `INSERT INTO ai_calls (provider, model, kind, files, pages, input_tokens, output_tokens, cost_usd, ok, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(c.provider, c.model, c.kind, c.files ?? null, c.pages ?? null, c.inputTokens ?? null, c.outputTokens ?? null, c.costUsd ?? null, c.ok ? 1 : 0, c.error ?? null);
}

// Gemessene Mittelwerte für die Kostenschätzung (nur erfolgreiche Aufrufe mit Seitenzahl)
export async function aiAverages(provider, kind) {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS calls, SUM(input_tokens) * 1.0 / NULLIF(SUM(pages), 0) AS input_per_page,
              AVG(output_tokens) AS output_per_call
       FROM ai_calls WHERE ok = 1 AND provider = ? AND kind = ? AND pages > 0`
    )
    .get(provider, kind);
}

export async function aiSpentSince(provider, sinceIso) {
  return (
    getDb()
      .prepare('SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM ai_calls WHERE provider = ? AND created_at >= ?')
      .get(provider, sinceIso.replace('T', ' ').slice(0, 19)).spent || 0
  );
}

// Kosten je Monat und Anbieter (für die Übersicht)
export async function aiCostsByMonth() {
  return getDb()
    .prepare(
      `SELECT substr(created_at, 1, 7) AS month, provider, COUNT(*) AS calls, SUM(ok) AS ok_calls,
              COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens,
              SUM(cost_usd) AS cost_usd, SUM(CASE WHEN cost_usd IS NULL AND ok = 1 THEN 1 ELSE 0 END) AS unpriced
       FROM ai_calls GROUP BY month, provider ORDER BY month DESC, provider`
    )
    .all();
}

// ---------- Bibliothek: Anzeigen und Bearbeiten ----------

// Je Art: Tabellen, Fremdschlüssel, bearbeitbare Kopf- und Songfelder
export const COLLECTION_TYPES = {
  jam: {
    table: 'jams',
    songTable: 'songs',
    fk: 'jam_id',
    head: ['jammer_name', 'jam_date', 'location', 'source_folder'],
    song: ['song_name', 'artist', 'rhythm', 'position', 'page']
  },
  zin: {
    table: 'zin_volumes',
    songTable: 'zin_volume_songs',
    fk: 'zin_volume_id',
    head: ['audio_folder', 'live_video_folder', 'oneonone_video_folder'],
    song: ['song_name', 'artist', 'rhythm', 'position', 'live_pdf_filename', 'live_page', 'oneonone_pdf_filename', 'oneonone_page']
  },
  megamix: {
    table: 'megamixes',
    songTable: 'megamix_songs',
    fk: 'megamix_id',
    head: ['source_folder'],
    song: ['song_name', 'rhythm', 'position']
  }
};

export async function listCollection(type) {
  const c = COLLECTION_TYPES[type];
  const count = `(SELECT COUNT(*) FROM ${c.songTable} s WHERE s.${c.fk} = t.id) AS song_count`;
  if (type === 'jam') {
    return getDb()
      .prepare(`SELECT t.id, t.jammer_name, t.jam_date, t.jam_datum, t.location, ${count} FROM jams t ORDER BY t.jam_datum DESC NULLS LAST, t.jammer_name`)
      .all();
  }
  return getDb().prepare(`SELECT t.id, t.edition_number, t.edition_label, ${count} FROM ${c.table} t ORDER BY t.edition_number, t.edition_label`).all();
}

export async function getCollectionItem(type, id) {
  const c = COLLECTION_TYPES[type];
  const item = getDb().prepare(`SELECT * FROM ${c.table} WHERE id = ?`).get(id);
  if (!item) return null;
  item.songs = getDb()
    .prepare(`SELECT id, ${c.song.join(', ')} FROM ${c.songTable} WHERE ${c.fk} = ? ORDER BY position, id`)
    .all(id);
  return item;
}

// Nur die für die Art erlaubten Kopffelder; beim Jam-Datum wird das ISO-Datum neu berechnet
export async function updateCollectionHead(type, id, fields) {
  const c = COLLECTION_TYPES[type];
  const keys = c.head.filter((k) => k in fields);
  if (!keys.length) return;
  const values = keys.map((k) => fields[k] ?? null);
  let sql = keys.map((k) => `${k} = ?`).join(', ');
  if (type === 'jam' && keys.includes('jam_date')) {
    sql += ', jam_datum = ?';
    values.push(parseJamDate(fields.jam_date));
  }
  getDb().prepare(`UPDATE ${c.table} SET ${sql} WHERE id = ?`).run(...values, id);
}

// Songliste übernehmen (in einer Transaktion): Songs mit Id dieses Eintrags werden aktualisiert
// (ihre Zuordnungen von Hand bleiben erhalten), ohne Id neu angelegt, fehlende gelöscht.
// Position aus der Reihenfolge, außer sie ist ausdrücklich gesetzt (Warm-up-Songs der Volumes
// stehen mit Position ≤ 0 vor den übrigen)
export async function replaceCollectionSongs(type, id, songs) {
  const c = COLLECTION_TYPES[type];
  const cols = c.song;
  const conn = getDb();
  const existing = new Set(conn.prepare(`SELECT id FROM ${c.songTable} WHERE ${c.fk} = ?`).all(id).map((r) => r.id));
  const insert = conn.prepare(`INSERT INTO ${c.songTable} (${c.fk}, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`);
  const update = conn.prepare(`UPDATE ${c.songTable} SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`);
  const remove = conn.prepare(`DELETE FROM ${c.songTable} WHERE id = ?`);
  conn.transaction(() => {
    const kept = new Set();
    songs.forEach((song, i) => {
      const row = { ...song, position: Number.isInteger(song.position) ? song.position : i + 1 };
      const values = cols.map((k) => row[k] ?? null);
      if (existing.has(song.id) && !kept.has(song.id)) {
        update.run(...values, song.id);
        kept.add(song.id);
      } else {
        insert.run(id, ...values);
      }
    });
    for (const songId of existing) if (!kept.has(songId)) remove.run(songId);
  })();
}

// Ein Song mit den Ordnern seines Eintrags (für Musik/Videos), Form wie ein Suchtreffer
export async function getSongWithFolders(type, songId) {
  const sql = {
    jam: `SELECT 'jam_session' AS source_type, s.id AS song_id, s.jam_id AS group_id, s.song_name, s.media_override,
                 j.source_folder, NULL AS audio_folder, NULL AS live_video_folder, NULL AS oneonone_video_folder
          FROM songs s JOIN jams j ON j.id = s.jam_id WHERE s.id = ?`,
    zin: `SELECT 'zin_volume' AS source_type, s.id AS song_id, s.zin_volume_id AS group_id, s.song_name, s.media_override,
                 NULL AS source_folder, z.audio_folder, z.live_video_folder, z.oneonone_video_folder
          FROM zin_volume_songs s JOIN zin_volumes z ON z.id = s.zin_volume_id WHERE s.id = ?`,
    megamix: `SELECT 'megamix' AS source_type, s.id AS song_id, s.megamix_id AS group_id, s.song_name, s.media_override,
                     m.source_folder, NULL AS audio_folder, NULL AS live_video_folder, NULL AS oneonone_video_folder
              FROM megamix_songs s JOIN megamixes m ON m.id = s.megamix_id WHERE s.id = ?`
  }[type];
  return getDb().prepare(sql).get(songId) || null;
}

export async function setSongMediaOverride(type, songId, override) {
  const c = COLLECTION_TYPES[type];
  const empty = !override.add.length && !override.remove.length;
  getDb().prepare(`UPDATE ${c.songTable} SET media_override = ? WHERE id = ?`).run(empty ? null : JSON.stringify(override), songId);
}

// Löscht einen Eintrag samt Songs; liefert die Namen der PDF-Kopien, die dann niemand mehr nutzt
export async function deleteCollectionItem(type, id) {
  const item = await getCollectionItem(type, id);
  if (!item) return [];
  const c = COLLECTION_TYPES[type];
  const pdfs =
    type === 'jam'
      ? [item.pdf_filename]
      : type === 'zin'
        ? item.songs.flatMap((s) => [s.live_pdf_filename, s.oneonone_pdf_filename])
        : [];
  getDb().prepare(`DELETE FROM ${c.table} WHERE id = ?`).run(id);
  return [...new Set(pdfs.filter(Boolean))];
}

export async function jammerNameCounts() {
  return getDb().prepare('SELECT jammer_name, COUNT(*) AS jams FROM jams GROUP BY jammer_name ORDER BY jammer_name').all();
}

// Schreibweise eines Jammers vereinheitlichen; liefert die Zahl geänderter Jams
export async function renameJammer(from, to) {
  return getDb().prepare('UPDATE jams SET jammer_name = ? WHERE jammer_name = ?').run(to, from).changes;
}

// Alle Ordner, die Einträgen zugeordnet sind (auch von Hand in der Bibliothek gewählte)
export async function assignedFolders() {
  return getDb()
    .prepare(
      `SELECT source_folder AS f FROM jams UNION SELECT source_folder FROM megamixes
       UNION SELECT audio_folder FROM zin_volumes UNION SELECT live_video_folder FROM zin_volumes
       UNION SELECT oneonone_video_folder FROM zin_volumes`
    )
    .all()
    .map((r) => r.f)
    .filter(Boolean);
}

// ---------- Videoanalyse: Läufe ----------

export async function insertVideoRun(jamId, log) {
  return Number(getDb().prepare('INSERT INTO video_runs (jam_id, log) VALUES (?, ?)').run(jamId, JSON.stringify(log)).lastInsertRowid);
}

export async function listVideoRuns(jamId) {
  return getDb()
    .prepare('SELECT id, jam_id, created_at, log, undone_at FROM video_runs WHERE jam_id = ? ORDER BY id DESC')
    .all(jamId)
    .map((r) => ({ ...r, log: JSON.parse(r.log) }));
}

export async function getVideoRun(id) {
  const r = getDb().prepare('SELECT * FROM video_runs WHERE id = ?').get(id);
  return r ? { ...r, log: JSON.parse(r.log) } : null;
}

export async function markVideoRunUndone(id, undoLog) {
  getDb().prepare('UPDATE video_runs SET undone_at = CURRENT_TIMESTAMP, undo_log = ? WHERE id = ?').run(JSON.stringify(undoLog), id);
}

// ---------- Sicherung ----------

export const SCHEMA_VERSION = MIGRATIONS.length;

export function getDbFile() {
  return dbFile;
}

// Stimmige Kopie der Datenbank, auch während die App sie benutzt (SQLite-Sicherungsfunktion)
export async function snapshotDatabase(target) {
  await getDb().backup(target);
}

export async function collectionCounts() {
  const n = (table) => getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  return { jams: n('jams'), zinVolumes: n('zin_volumes'), megamixes: n('megamixes') };
}
