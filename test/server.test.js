// Grundtest: Server startet mit leerer SQLite-Datenbank, Schutz greift, Suche funktioniert.
// Testdaten sind frei erfunden (kein fremdes Trainingsmaterial, keine realen Personen).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { startServer } from '../src/server/server.js';
import { insertJam, insertSongs, insertMegaMix, insertMegaMixSongs, closeDB } from '../src/server/db.js';

let session;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'choreothek-test-'));
  session = await startServer({ dataDir });

  const jamId = await insertJam('Erika Beispiel', '14. März 2025', '1-test.pdf', 'Turnhalle Musterstadt', null);
  await insertSongs(jamId, [
    { name: 'Sonnenschein', artist: 'Die Testband', rhythm: 'Salsa', position: 1, page: 2 },
    { name: 'Überraschung', artist: null, rhythm: 'Cumbia / Salsa', position: 2, page: 3 },
    { name: 'Nachtzug', artist: null, rhythm: 'Reggaeton', position: 3, page: 4 }
  ]);
  const mmId = await insertMegaMix(1, 'Mega Mix 1', null);
  await insertMegaMixSongs(mmId, [{ name: 'Morgenrot', rhythm: 'Merengue', position: 1 }]);
  await insertMegaMix(10, 'Mega Mix 10', null);
  await insertMegaMix(2, 'Mega Mix 2', null);
});

after(() => {
  session.server.close();
  closeDB();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const api = (p, opts = {}) => fetch(`${session.url}api/${p}`, opts);

test('Datenbankdatei liegt im Datenordner', () => {
  assert.ok(fs.existsSync(path.join(dataDir, 'choreothek.sqlite')));
  assert.ok(fs.existsSync(path.join(dataDir, 'uploads')));
});

test('Server antwortet nur auf 127.0.0.1', async () => {
  assert.equal((await api('health')).status, 200);
  const res = await fetch(`http://localhost:${session.port}/api/health`);
  assert.equal(res.status, 403, 'fremder Host-Header muss abgewiesen werden');
});

test('Ändernde Anfragen brauchen den Token', async () => {
  const body = JSON.stringify({ media_roots: [] });
  const headers = { 'Content-Type': 'application/json' };
  assert.equal((await api('settings', { method: 'POST', body, headers })).status, 403);
  const ok = await api('settings', { method: 'POST', body, headers: { ...headers, 'X-Choreothek-Token': session.token } });
  assert.equal(ok.status, 200);
});

test('KI-Einlesen ohne Plan ist gesperrt (Grundsatz 5)', async () => {
  const headers = { 'X-Choreothek-Token': session.token };
  for (const kind of ['jam-sessions', 'zin-volumes']) {
    const res = await api(`reimport/${kind}`, { method: 'POST', headers });
    assert.equal(res.status, 409, kind);
  }
});

test('Rhythmus als Teilstring ohne Groß-/Kleinschreibung', async () => {
  const rows = await (await api('search?rhythm=SAL')).json();
  assert.deepEqual(rows.map((r) => r.song_name).sort(), ['Sonnenschein', 'Überraschung']);
});

test('Songsuche mit Umlaut in anderer Schreibweise', async () => {
  const rows = await (await api(`search?song=${encodeURIComponent('überr')}`)).json();
  assert.deepEqual(rows.map((r) => r.song_name), ['Überraschung']);
});

test('Datumsfilter und Ort nur für Jams', async () => {
  const rows = await (await api('search?datum_von=2025-03-01&datum_bis=2025-03-31&ort=musterstadt')).json();
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.source_type === 'jam_session'));
  assert.equal(rows[0].jam_date, '14. März 2025');
  assert.equal(rows[0].jam_datum, '2025-03-14', 'ISO-Datum für die Sortierung nach Datum');
});

test('Jam-Liste mit erkanntem Datum und Songzahl', async () => {
  const jams = await (await api('jams')).json();
  assert.equal(jams.length, 1);
  assert.equal(jams[0].jam_datum, '2025-03-14');
  assert.equal(jams[0].song_count, 3);
});

test('MegaMix-Liste nach Nummer sortiert (2 vor 10)', async () => {
  assert.deepEqual(await (await api('megamixes')).json(), ['Mega Mix 1', 'Mega Mix 2', 'Mega Mix 10']);
});

test('MegaMix wird mit durchsucht, wenn kein Jam-Filter gesetzt ist', async () => {
  const rows = await (await api('search?rhythm=merengue')).json();
  assert.deepEqual(rows.map((r) => [r.source_type, r.song_name]), [['megamix', 'Morgenrot']]);
});

test('Kontextmenü: Original-PDF gefunden, nur Dateien aus den Datenquellen erlaubt', async () => {
  const { resolveFileTarget, isAppCopy } = await import('../src/server/fileAccess.js');
  const archive = path.join(dataDir, 'archiv');
  const jamFolder = path.join(archive, '2025_03_14 Beispiel-Jam');
  fs.mkdirSync(jamFolder, { recursive: true });
  const original = path.join(jamFolder, 'Choreo Notes.pdf');
  fs.writeFileSync(original, 'pdf');
  fs.writeFileSync(path.join(dataDir, 'uploads', '123-Choreo Notes.pdf'), 'pdf');
  const outside = path.join(dataDir, 'geheim.txt');
  fs.writeFileSync(outside, 'x');

  const headers = { 'Content-Type': 'application/json', 'X-Choreothek-Token': session.token };
  await api('settings', { method: 'POST', headers, body: JSON.stringify({ media_roots: [archive] }) });
  const jamId = await insertJam('Anna Muster', '2025-03-14', '123-Choreo Notes.pdf', 'Musterhalle', jamFolder);
  await insertSongs(jamId, [{ name: 'Probelied', rhythm: 'Samba', position: 1, page: 1 }]);

  const [row] = await (await api(`search?jam_id=${jamId}`)).json();
  assert.equal(row.pdf_source_path, original);

  assert.equal(await resolveFileTarget({ sourcePath: original, uploadName: '123-Choreo Notes.pdf' }), original);
  assert.equal(await resolveFileTarget({ dir: jamFolder, file: 'Choreo Notes.pdf' }), original);
  assert.equal(await resolveFileTarget({ sourcePath: outside }), null, 'Datei außerhalb der Datenquellen');
  assert.equal(await resolveFileTarget({ dir: archive, file: path.join('..', 'geheim.txt') }), null, 'Ausbruch per ..');
  assert.equal(await resolveFileTarget({ sourcePath: archive }), null, 'Ordner statt Datei');

  const fallback = await resolveFileTarget({ sourcePath: path.join(jamFolder, 'fehlt.pdf'), uploadName: path.join('..', '..', '123-Choreo Notes.pdf') });
  assert.equal(fallback, path.join(dataDir, 'uploads', '123-Choreo Notes.pdf'), 'Kopie der App, wenn Original fehlt');
  assert.ok(isAppCopy(fallback));
});

test('Filter nach Quelle', async () => {
  const onlyMix = await (await api('search?quelle=megamix')).json();
  assert.ok(onlyMix.length > 0 && onlyMix.every((r) => r.source_type === 'megamix'));
  const onlyJam = await (await api('search?quelle=jam')).json();
  assert.ok(onlyJam.length > 0 && onlyJam.every((r) => r.source_type === 'jam_session'));
});

test('Medien-Angaben nur für Dateien aus den Datenquellen', async () => {
  const q = (dir, file) => `media-info?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent(file)}`;
  const outside = await api(q(dataDir, 'geheim.txt'));
  assert.equal(outside.status, 404);
  const inside = await api(q(path.join(dataDir, 'archiv', '2025_03_14 Beispiel-Jam'), 'Choreo Notes.pdf'));
  assert.equal(inside.status, 200);
  const info = await inside.json();
  assert.equal(info.name, 'Choreo Notes.pdf');
  assert.equal(info.size, 3);
  assert.equal((await api(q(dataDir, 'geheim.txt').replace('media-info', 'media-cover'))).status, 404);
});

test('Einrichtungsassistent: offen ohne Ordner, erledigt nach Abschluss', async () => {
  const headers = { 'Content-Type': 'application/json', 'X-Choreothek-Token': session.token };
  await api('settings', { method: 'POST', headers, body: JSON.stringify({ media_roots: [] }) });
  assert.deepEqual(await (await api('setup')).json(), { done: false });
  await api('setup', { method: 'POST', headers, body: JSON.stringify({ done: true }) });
  assert.deepEqual(await (await api('setup')).json(), { done: true });
});
