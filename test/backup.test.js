// Sicherung (Paket 8): erstellen, prüfen, wiederherstellen, abgelehnte Dateien, fehlende Ordner,
// Erinnerung. Erfundene Daten.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yazl from 'yazl';
import { startServer } from '../src/server/server.js';
import { closeDB, insertJam, insertSongs, getAllJams, setSetting } from '../src/server/db.js';
import { getUploadsDir } from '../src/server/paths.js';

let session;
let dir;
const headers = () => ({ 'Content-Type': 'application/json', 'X-Choreothek-Token': session.token });
const call = async (method, p, body) => {
  const res = await fetch(`${session.url}api/${p}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

function writeZip(file, entries) {
  return new Promise((resolve) => {
    const zip = new yazl.ZipFile();
    for (const [name, content] of entries) zip.addBuffer(Buffer.from(content), name);
    zip.end();
    zip.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve);
  });
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'choreothek-backup-'));
  session = await startServer({ dataDir: path.join(dir, 'daten') });
  fs.mkdirSync(path.join(dir, 'Jams'));
  await call('POST', 'settings', { media_roots: [path.join(dir, 'Jams')] });
  const id = await insertJam('Erika Beispiel', '2. Mai 2025', '1-notes.pdf', null, null);
  await insertSongs(id, [{ name: 'Sonnenschein', rhythm: 'Salsa', position: 1, page: 2 }]);
  fs.writeFileSync(path.join(getUploadsDir(), '1-notes.pdf'), 'PDF-Inhalt');
  await call('POST', 'ai/key', { provider: 'anthropic', key: 'sk-geheim' });
});

after(() => {
  session.server.close();
  closeDB();
  fs.rmSync(dir, { recursive: true, force: true });
});

const backupFile = () => path.join(dir, 'Sicherung.zip');

test('Erinnerung: fällig, solange noch nie gesichert wurde', async () => {
  const { body } = await call('GET', 'backup/status');
  assert.equal(body.due, true);
  assert.equal(body.lastBackupAt, null);
  assert.match(body.defaultName, /^Choreothek-Sicherung-\d{4}-\d{2}-\d{2}\.zip$/);
});

test('Sicherung erstellen: Datenbank und PDF-Kopien, keine Schlüssel', async () => {
  assert.equal((await call('POST', 'backup/create', { target: 'relativ.zip' })).status, 400);
  const res = await call('POST', 'backup/create', { target: backupFile() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.counts, { jams: 1, zinVolumes: 0, megamixes: 0 });
  assert.equal(res.body.pdfs, 1);
  assert.equal(res.body.apiKeysIncluded, false);
  const raw = fs.readFileSync(backupFile());
  assert.ok(!raw.includes('sk-geheim'), 'kein API-Schlüssel in der Datei');
  assert.ok(!fs.existsSync(`${backupFile()}.part`));
  const status = (await call('GET', 'backup/status')).body;
  assert.equal(status.due, false);
  assert.equal(status.daysSince, 0);
});

test('Wiederherstellen: alter Stand zurück, bisheriger Stand beiseitegelegt', async () => {
  // nach der Sicherung verändert
  await insertJam('Neue Jam', null, '2-neu.pdf', null, null);
  fs.writeFileSync(path.join(getUploadsDir(), '2-neu.pdf'), 'neu');
  fs.unlinkSync(path.join(getUploadsDir(), '1-notes.pdf'));

  const inspect = await call('POST', 'backup/inspect', { source: backupFile() });
  assert.equal(inspect.body.counts.jams, 1);
  const res = await call('POST', 'backup/restore', { source: backupFile() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual((await getAllJams()).map((j) => j.pdf_filename), ['1-notes.pdf']);
  assert.equal(fs.readFileSync(path.join(getUploadsDir(), '1-notes.pdf'), 'utf8'), 'PDF-Inhalt');
  assert.ok(!fs.existsSync(path.join(getUploadsDir(), '2-neu.pdf')));
  assert.ok(fs.existsSync(`${getUploadsDir()}-vor-wiederherstellung`), 'bisherige PDF-Kopien beiseitegelegt');
  // Suche funktioniert mit der wiederhergestellten Datenbank
  const rows = await (await fetch(`${session.url}api/search?song=sonnen`)).json();
  assert.deepEqual(rows.map((r) => r.song_name), ['Sonnenschein']);
});

test('Fehlende Ordner nach Wiederherstellung werden gemeldet', async () => {
  await setSetting('megamix_root', path.join(dir, 'gibt es nicht'));
  const { body } = await call('GET', 'backup/missing-folders');
  assert.deepEqual(body.folders.map((f) => f.kind), ['megamixRoot']);
});

test('Abgelehnt: keine Sicherung, fremde Pfade, neuere Version -- bisheriger Stand bleibt', async () => {
  const before = (await getAllJams()).length;
  const notZip = path.join(dir, 'kaputt.zip');
  fs.writeFileSync(notZip, 'kein zip');
  assert.equal((await call('POST', 'backup/restore', { source: notZip })).body.code, 'notAZip');

  const evil = path.join(dir, 'boese.zip');
  // Pfade mit „..“ lässt schon die ZIP-Bibliothek nicht zu; hier: fremde Datei bzw. Unterordner
  await writeZip(evil, [['manifest.json', JSON.stringify({ app: 'Choreothek', schema: 1 })], ['choreothek.sqlite', 'x'], ['start.exe', 'x']]);
  assert.equal((await call('POST', 'backup/restore', { source: evil })).body.code, 'unexpectedContent');
  const sub = path.join(dir, 'unterordner.zip');
  await writeZip(sub, [['manifest.json', JSON.stringify({ app: 'Choreothek', schema: 1 })], ['choreothek.sqlite', 'x'], ['uploads/tief/x.pdf', 'x']]);
  assert.equal((await call('POST', 'backup/restore', { source: sub })).body.code, 'unexpectedContent');

  const other = path.join(dir, 'fremd.zip');
  await writeZip(other, [['manifest.json', JSON.stringify({ app: 'Etwas anderes' })], ['choreothek.sqlite', 'x']]);
  assert.equal((await call('POST', 'backup/restore', { source: other })).body.code, 'notABackup');

  const newer = path.join(dir, 'neuer.zip');
  await writeZip(newer, [['manifest.json', JSON.stringify({ app: 'Choreothek', schema: 999 })], ['choreothek.sqlite', 'x']]);
  assert.equal((await call('POST', 'backup/restore', { source: newer })).body.code, 'newerVersion');

  assert.equal((await getAllJams()).length, before);
});

test('Nach dem Wiederherstellen gilt die Sicherung selbst als letzte Sicherung', async () => {
  const { body } = await call('GET', 'backup/status');
  assert.ok(body.lastBackupAt);
  assert.equal(body.due, false);
});
