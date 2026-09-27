// Grundtest: Server startet mit leerer SQLite-Datenbank, Schutz greift, Suche funktioniert.
// Testdaten sind frei erfunden (kein ZIN-Material, keine realen Personen).
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

test('KI-Einlesen ist gesperrt (Grundsatz 5)', async () => {
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
