// Erkennung (Paket 4): Editionsnummern, Volumes, MegaMixe, Jams und Vorschau. Ordnerstrukturen
// und Namen frei erfunden (kein fremdes Trainingsmaterial, keine realen Personen); Dateien sind leer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { editionNumber, variantOf } from '../src/server/scan/editionNumber.js';
import { scanZinVolumes, scanMegaMixes } from '../src/server/scan/volumes.js';
import { startServer } from '../src/server/server.js';
import { closeDB, insertJam, getAllMegaMixes } from '../src/server/db.js';
import { importMegaMix } from '../src/server/importMegaMix.js';

let base;
let session;

function touch(...parts) {
  const file = path.join(base, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  return file;
}
const dir = (...parts) => path.join(base, ...parts);
const headers = () => ({ 'Content-Type': 'application/json', 'X-Choreothek-Token': session.token });
const post = (p, body) => fetch(`${session.url}api/${p}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
const preview = async () => (await fetch(`${session.url}api/preview`)).json();

before(async () => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'choreothek-scan-'));

  // Volumes: eine gemeinsame PDF, eine Live+1on1-Aufteilung, eine PDF im Unterordner
  touch('Volumes', 'Choreo Notes', '7 Choreo Notes.pdf');
  touch('Volumes', 'Choreo Notes', '8 Live Choreo Notes.pdf');
  touch('Volumes', 'Choreo Notes', '8 1ON1 Choreo Notes.pdf');
  touch('Volumes', 'Choreo Notes', 'Volume 9', 'Notizen.pdf');
  touch('Volumes', 'Choreo Notes', 'Probe ohne Nummer.pdf');
  for (const n of [7, 8, 9]) {
    touch('Musik', `Volume ${n}`, `100-Volume ${n} - 01 Erster Titel - Salsa.mp3`);
    touch('Volumes', `volume-${n}-live-class`, `55-Volume ${n} Live - 01 Warm-up.mp4`);
  }
  touch('Volumes', 'volume-7-one-on-one', '56-Volume 7 1on1 - 01 Titel.mp4');
  // Ordner ohne Nummer im Namen, aber alle Dateien tragen dieselbe Nummer
  touch('Musik', 'Sammlung A', '1-Volume 8 - 01 Lied - Cumbia.mp3');
  touch('Musik', 'Sammlung A', '1-Volume 8 - 02 Lied - Cumbia.mp3');
  // Sammelordner: eine einzelne Datei mit Nummer macht ihn nicht zu diesem Volume
  touch('Volumes', 'one-on-one-rueckblick', '9-A_Titel_ohne_Nummer.mp4');
  touch('Volumes', 'one-on-one-rueckblick', '9-B_Mix_Volume_7_Titel.mp4');
  touch('Volumes', 'one-on-one-rueckblick', '9-C_noch_einer.mp4');
  fs.mkdirSync(dir('Musik', 'Neuer Ordner'), { recursive: true });

  // MegaMixe, eine mit Tippfehler im Ordnernamen, eine mit abweichenden Dateinamen
  touch('MegaMix', 'Maga Mix 3', '329-Mega Mix 3 - 01 Morgenrot - Merengue.mp3');
  touch('MegaMix', 'Mega Mix 4', '330-Mega Mix 4 - 02 Abendrot - Salsa.mp3');
  touch('MegaMix', 'Mega Mix 4', '330-Mega Mix 4 - 01 Mittag.mp3');

  // Jams: eigener Ordner, Ordner mit Teilnahmebestätigung, geteilter Ordner, Handout
  touch('Jams', '2024_05_04 Jam Musterstadt', 'Choreo Notes Mai.pdf');
  touch('Jams', '2024_06_01 Jam Beispielhausen', 'Choreo Notes Juni.pdf');
  touch('Jams', '2024_06_01 Jam Beispielhausen', 'Erika Beispiel.pdf');
  touch('Jams', 'Sammelordner', 'Jam A.pdf');
  touch('Jams', 'Sammelordner', 'Jam B.pdf');
  touch('Jams', 'Academy', 'Salsa-Handout-DE.pdf');
  touch('Jams', '2024_05_04 Jam Musterstadt', 'Originale', 'Choreo Notes Mai.pdf');

  session = await startServer({ dataDir: dir('daten') });
  await post('settings', { media_roots: [dir('Jams')] });
  await post('library-settings', {
    megamix_root: dir('MegaMix'),
    zin_volumes_mp3_root: dir('Musik'),
    zin_volumes_choreo_root: dir('Volumes', 'Choreo Notes')
  });
});

after(() => {
  session.server.close();
  closeDB();
  fs.rmSync(base, { recursive: true, force: true });
});

test('Editionsnummer aus verschiedenen Namensformen', () => {
  assert.equal(editionNumber('Volume 100'), 100);
  assert.equal(editionNumber('volume-100-live-class'), 100);
  assert.equal(editionNumber('Vol. 105.pdf'), 105);
  assert.equal(editionNumber('87 Live Choreo Notes.pdf'), 87);
  assert.equal(editionNumber('1247-Volume 99 Live - 01 Warm-up.mp4'), 99, 'Download-Kennung vorne zählt nicht');
  assert.equal(editionNumber('Maga Mix 60'), 60);
  assert.equal(editionNumber('329-Mega Mix 60 - 01 Titel - Salsa.mp3'), 60);
  assert.equal(editionNumber('Volume Trial'), null);
  assert.equal(editionNumber('Neuer Ordner'), null);
  assert.equal(variantOf('87 1ON1 Choreo Notes.pdf'), 'oneonone');
  assert.equal(variantOf('volume-7-one-on-one'), 'oneonone');
  assert.equal(variantOf('87 Live Choreo Notes.pdf'), 'live');
});

test('Volumes: PDFs, Musik und Videos werden je Nummer zusammengeführt', () => {
  const { editions, unrecognized } = scanZinVolumes({ choreoRoot: dir('Volumes', 'Choreo Notes'), musicRoot: dir('Musik'), videoRoot: dir('Volumes') });
  const byNumber = Object.fromEntries(editions.map((e) => [e.number, e]));
  assert.deepEqual(Object.keys(byNumber).map(Number), [7, 8, 9]);
  assert.deepEqual(byNumber[8].pdfs.map((p) => p.variant), ['live', 'oneonone'], 'Live vor 1on1');
  assert.equal(byNumber[9].pdfs.length, 1, 'Nummer aus dem Unterordner');
  assert.ok(byNumber[7].musicFolder.endsWith('Volume 7'));
  assert.ok(byNumber[7].oneononeFolder.endsWith('volume-7-one-on-one'));
  assert.equal(byNumber[8].oneononeFolder, null);

  const kinds = unrecognized.map((u) => `${u.kind}:${path.basename(u.path)}${u.duplicateOf ? '*' : ''}`).sort();
  assert.deepEqual(kinds, ['music:Sammlung A*', 'oneonone:one-on-one-rueckblick', 'pdf:Probe ohne Nummer.pdf'], 'leerer Ordner zählt nicht, Sammelordner nicht als Volume 7');
});

test('Volumes: Zuordnung von Hand geht vor und nimmt den Ordner aus „nicht erkannt“', () => {
  const { editions, unrecognized } = scanZinVolumes({
    choreoRoot: dir('Volumes', 'Choreo Notes'),
    musicRoot: dir('Musik'),
    videoRoot: dir('Volumes'),
    overrides: { 8: { oneononeFolder: dir('Volumes', 'one-on-one-rueckblick') } }
  });
  const e8 = editions.find((e) => e.number === 8);
  assert.equal(e8.oneononeCount, 3);
  assert.ok(!unrecognized.some((u) => u.path.endsWith('one-on-one-rueckblick')));
});

test('MegaMixe: Tippfehler im Ordnernamen, abweichende Dateinamen werden trotzdem eingelesen', async () => {
  const { editions } = scanMegaMixes({ root: dir('MegaMix') });
  assert.deepEqual(editions.map((e) => e.number), [3, 4]);
  const result = await importMegaMix();
  assert.equal(result.importedEditions, 2);
  assert.deepEqual(result.errors, []);
  assert.deepEqual((await getAllMegaMixes()).map((m) => m.edition_label).sort(), ['Mega Mix 3', 'Mega Mix 4']);
});

test('Jams: Ignorierliste, eigener und geteilter Ordner, Originale ausgenommen', async () => {
  await post('preview/ignore-patterns', { patterns: ['Handout', 'Erika Beispiel'] });
  const { jams } = await preview();
  const rows = Object.fromEntries(jams.rows.map((r) => [path.basename(r.pdf), r]));
  assert.deepEqual(Object.keys(rows).sort(), ['Choreo Notes Juni.pdf', 'Choreo Notes Mai.pdf', 'Jam A.pdf', 'Jam B.pdf']);
  assert.equal(rows['Choreo Notes Juni.pdf'].ownFolder, true, 'Teilnahmebestätigung ignoriert → eigener Ordner');
  assert.equal(rows['Jam A.pdf'].ownFolder, false);
  assert.equal(rows['Jam A.pdf'].mediaFolder, null, 'geteilter Ordner bekommt keinen Medienordner');
  assert.deepEqual(jams.ignored.map((i) => i.pattern).sort(), ['Erika Beispiel', 'Handout']);
  assert.ok(jams.rows.every((r) => r.status === 'new'));
});

test('Jams: Medienordner von Hand, eingelesen und Merkliste', async () => {
  const jamA = dir('Jams', 'Sammelordner', 'Jam A.pdf');
  assert.equal((await post('preview/jam-media', { pdf: jamA, folder: dir('Jams', 'gibt es nicht') })).status, 400);
  await post('preview/jam-media', { pdf: jamA, folder: dir('Jams', 'Sammelordner') });
  await insertJam('Probe', null, '1-Choreo Notes Mai.pdf', null, dir('Jams', '2024_05_04 Jam Musterstadt'));
  await post('preview/no-songs/remove', { name: 'x' });

  const { jams } = await preview();
  const rows = Object.fromEntries(jams.rows.map((r) => [path.basename(r.pdf), r]));
  assert.equal(rows['Jam A.pdf'].mediaAssigned, true);
  assert.equal(rows['Choreo Notes Mai.pdf'].status, 'imported');
  assert.equal(rows['Choreo Notes Juni.pdf'].status, 'new');
});

test('Vorschau: Volumes mit Zuordnung von Hand über die Oberfläche', async () => {
  assert.equal((await post('preview/assign', { kind: 'zin', number: 8, field: 'falsch', folder: null })).status, 400);
  const ok = await post('preview/assign', { kind: 'zin', number: 8, field: 'oneononeFolder', folder: dir('Volumes', 'one-on-one-rueckblick') });
  assert.equal(ok.status, 200);
  const { zin, megamix } = await preview();
  const e8 = zin.editions.find((e) => e.number === 8);
  assert.deepEqual(e8.assigned, ['oneononeFolder']);
  assert.equal(e8.imported, false);
  assert.ok(megamix.editions.every((e) => e.imported));

  await post('preview/assign', { kind: 'zin', number: 8, field: 'oneononeFolder', folder: null });
  assert.equal((await preview()).zin.editions.find((e) => e.number === 8).oneononeFolder, null);
});
