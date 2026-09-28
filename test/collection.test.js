// Bibliothek (Paket 5): Kopfdaten und Songs bearbeiten, löschen, einzeln neu auslesen (Attrappe,
// keine Kosten), Jammer-Schreibweisen vereinheitlichen. Erfundene Daten.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { startServer } from '../src/server/server.js';
import { closeDB, insertJam, insertSongs, insertZinVolume, insertZinVolumeSongs, insertMegaMix, insertMegaMixSongs } from '../src/server/db.js';
import { getUploadsDir } from '../src/server/paths.js';
import { setProviderOverride } from '../src/server/ai/providers.js';

let session;
let dataDir;
let jamId;
let zinId;
let mmId;
let calls = 0;

const headers = () => ({ 'Content-Type': 'application/json', 'X-Choreothek-Token': session.token });
const call = async (method, p, body) => {
  const res = await fetch(`${session.url}api/${p}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

async function pdf(name, pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  fs.writeFileSync(path.join(getUploadsDir(), name), await doc.save());
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'choreothek-coll-'));
  session = await startServer({ dataDir });
  setProviderOverride({
    anthropic: {
      label: 'Attrappe',
      defaultModel: 'claude-sonnet-5',
      testKey: async () => 1,
      async extract({ pdfs }) {
        calls++;
        const text =
          pdfs.length === 1 && pdfs[0].name.includes('jam')
            ? { jammer_name: 'Erika Beispiel', jam_date: '3. Mai 2025', location: 'Musterhalle', songs: [{ name: 'Neuer Titel', rhythm: 'Salsa', page: 2 }] }
            : { volume_number: 5, songs: [{ name: 'Kernsong', rhythm: 'Cumbia', live_page: 3, live_source: 1, oneonone_page: 2, oneonone_source: 2 }] };
        return { text: JSON.stringify(text), inputTokens: 1000, outputTokens: 100 };
      }
    }
  });
  await call('POST', 'ai/key', { provider: 'anthropic', key: 'sk-test' });
  await call('POST', 'ai/settings', { privacyAck: true });

  await pdf('1-jam.pdf', 3);
  await pdf('2-live.pdf', 5);
  await pdf('3-1on1.pdf', 4);
  jamId = await insertJam('Erika Beispiel', '2. Mai 2025', '1-jam.pdf', 'Musterhalle', null);
  await insertSongs(jamId, [
    { name: 'Alt', rhythm: 'Salsa', position: 1, page: 2 },
    { name: 'Zweiter', rhythm: 'Merengue', position: 2, page: 3 }
  ]);
  await insertJam('erika  beispiel', null, '4-x.pdf', null, null);
  await insertJam('Erika Beispiel und Max Muster', null, '5-y.pdf', null, null);
  await insertJam('Erika Beispiel & Max Muster', null, '6-z.pdf', null, null);
  zinId = await insertZinVolume(5, 'ZIN Volume 5', null, null, null);
  await insertZinVolumeSongs(zinId, [
    { name: 'Aufwärmen', rhythm: 'Warm-up', position: -1, live_pdf_filename: '2-live.pdf', live_page: 1 },
    { name: 'Kernsong', rhythm: 'Salsa', position: 1, live_pdf_filename: '2-live.pdf', live_page: 3, oneonone_pdf_filename: '3-1on1.pdf', oneonone_page: 2 }
  ]);
  mmId = await insertMegaMix(9, 'Mega Mix 9', null);
  await insertMegaMixSongs(mmId, [{ name: 'Mix', rhythm: 'Salsa', position: 1 }]);
});

after(() => {
  setProviderOverride(null);
  session.server.close();
  closeDB();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Liste und Einzelansicht je Art', async () => {
  const jams = await call('GET', 'collection/jam');
  assert.equal(jams.body.length, 4);
  assert.equal(jams.body[0].jammer_name, 'Erika Beispiel', 'Jams mit Datum zuerst');
  const zin = await call('GET', `collection/zin/${zinId}`);
  assert.deepEqual(zin.body.songs.map((s) => s.song_name), ['Aufwärmen', 'Kernsong']);
  assert.equal((await call('GET', 'collection/falsch')).status, 400);
  assert.equal((await call('GET', 'collection/jam/9999')).status, 400);
});

test('Kopfdaten ändern: Datum wird neu erkannt, Ordner muss existieren, Jammer Pflicht', async () => {
  const ok = await call('PUT', `collection/jam/${jamId}`, { jam_date: '7. Juni 2025', location: 'Turnhalle' });
  assert.equal(ok.body.jam_datum, '2025-06-07');
  assert.equal(ok.body.location, 'Turnhalle');
  assert.equal((await call('PUT', `collection/jam/${jamId}`, { source_folder: path.join(dataDir, 'fehlt') })).status, 400);
  assert.equal((await call('PUT', `collection/jam/${jamId}`, { jammer_name: '  ' })).status, 400);
  const folder = await call('PUT', `collection/jam/${jamId}`, { source_folder: dataDir });
  assert.equal(folder.body.source_folder, path.resolve(dataDir));
});

test('Songs ändern, ergänzen, löschen, umsortieren', async () => {
  const res = await call('PUT', `collection/jam/${jamId}/songs`, {
    songs: [
      { song_name: 'Zweiter', rhythm: 'Merengue', page: 3 },
      { song_name: 'Ganz neu', artist: 'Die Testband', rhythm: '', page: '' }
    ]
  });
  assert.deepEqual(
    res.body.songs.map((s) => [s.song_name, s.artist, s.rhythm, s.position, s.page]),
    [
      ['Zweiter', null, 'Merengue', 1, 3],
      ['Ganz neu', 'Die Testband', null, 2, null]
    ]
  );
  assert.equal((await call('PUT', `collection/jam/${jamId}/songs`, { songs: [{ song_name: '' }] })).status, 400);
  assert.equal((await call('PUT', `collection/jam/${jamId}/songs`, { songs: [{ song_name: 'x', page: 0 }] })).status, 400);
});

test('Volume: Warm-up behält Position, nur eigene PDFs erlaubt', async () => {
  const bad = await call('PUT', `collection/zin/${zinId}/songs`, { songs: [{ song_name: 'x', live_pdf_filename: '99-fremd.pdf', live_page: 1 }] });
  assert.equal(bad.status, 400);
  const { body } = await call('GET', `collection/zin/${zinId}`);
  const res = await call('PUT', `collection/zin/${zinId}/songs`, { songs: body.songs });
  assert.deepEqual(res.body.songs.map((s) => [s.song_name, s.position]), [['Aufwärmen', -1], ['Kernsong', 1]]);
});

test('Einzeln neu auslesen: nur mit Plan, Plan nur für diesen Eintrag, Ergebnis nur Vorschlag', async () => {
  assert.equal((await call('POST', `collection/jam/${jamId}/reextract`, {})).status, 409);
  const plan = (await call('POST', `collection/jam/${jamId}/plan`)).body;
  assert.equal(plan.pdfCount, 1);
  assert.equal(plan.pages, 3);
  assert.ok(plan.mustConfirm);

  // Plan für diesen Eintrag taugt weder für einen anderen noch fürs Sammel-Einlesen
  const other = await insertJam('Probe', null, '1-jam.pdf', null, null);
  assert.equal((await call('POST', `collection/jam/${other}/reextract`, { planId: plan.id, confirmed: true })).status, 409);
  const plan2 = (await call('POST', `collection/jam/${jamId}/plan`)).body;
  assert.equal((await call('POST', 'reimport/jam-sessions', { planId: plan2.id, confirmed: true })).status, 409);
  assert.equal(calls, 0);

  const plan3 = (await call('POST', `collection/jam/${jamId}/plan`)).body;
  const res = await call('POST', `collection/jam/${jamId}/reextract`, { planId: plan3.id, confirmed: true });
  assert.equal(res.status, 200);
  assert.equal(calls, 1);
  assert.equal(res.body.proposal.head.jam_date, '3. Mai 2025');
  assert.deepEqual(res.body.proposal.songs, [{ song_name: 'Neuer Titel', artist: null, rhythm: 'Salsa', page: 2 }]);
  const stored = (await call('GET', `collection/jam/${jamId}`)).body;
  assert.equal(stored.songs[0].song_name, 'Zweiter', 'nichts gespeichert, bevor übernommen wird');
});

test('Volume neu auslesen: Warm-up bleibt, Seiten den PDFs zugeordnet; MegaMix ohne KI', async () => {
  const plan = (await call('POST', `collection/zin/${zinId}/plan`)).body;
  assert.equal(plan.pdfCount, 2);
  const res = await call('POST', `collection/zin/${zinId}/reextract`, { planId: plan.id, confirmed: true });
  const songs = res.body.proposal.songs;
  assert.equal(songs[0].song_name, 'Aufwärmen');
  assert.equal(songs[1].live_pdf_filename, '2-live.pdf');
  assert.equal(songs[1].oneonone_pdf_filename, '3-1on1.pdf');
  assert.equal((await call('POST', `collection/megamix/${mmId}/plan`)).status, 400);
});

test('Jammer-Schreibweisen: ähnliche werden gruppiert und zusammengeführt', async () => {
  const { body } = await call('GET', 'jammers/variants');
  const groups = body.similar.map((g) => g.map((n) => n.jammer_name).sort());
  assert.ok(groups.some((g) => g.includes('Erika Beispiel') && g.includes('erika  beispiel')));
  assert.ok(groups.some((g) => g.includes('Erika Beispiel & Max Muster') && g.includes('Erika Beispiel und Max Muster')));
  const res = await call('POST', 'jammers/rename', { from: ['erika  beispiel'], to: 'Erika Beispiel' });
  assert.equal(res.body.changed, 1);
  assert.ok(!(await call('GET', 'jammers/variants')).body.names.some((n) => n.jammer_name === 'erika  beispiel'));
});

test('Löschen entfernt Songs und die PDF-Kopie, Originale bleiben', async () => {
  assert.ok(fs.existsSync(path.join(getUploadsDir(), '2-live.pdf')));
  assert.equal((await call('DELETE', `collection/zin/${zinId}`)).status, 200);
  assert.equal((await call('GET', `collection/zin/${zinId}`)).status, 400);
  assert.ok(!fs.existsSync(path.join(getUploadsDir(), '2-live.pdf')));
});

test('Musik/Videos von Hand zuordnen: entfernen, hinzufügen, wiederherstellen; bleibt beim Speichern', async () => {
  const folder = path.join(dataDir, 'Jam Medien');
  fs.mkdirSync(path.join(folder, 'Party'), { recursive: true });
  for (const f of ['01 Sonnenschein.m4a', 'Sonnenschein - Salsa.mp4', 'VID_1234.mp4', path.join('Party', 'Abend.mp4')]) fs.writeFileSync(path.join(folder, f), '');
  const id = await insertJam('Medienprobe', null, '9-m.pdf', null, folder);
  await insertSongs(id, [{ name: 'Sonnenschein', rhythm: 'Salsa', position: 1 }, { name: 'Regen', rhythm: 'Cumbia', position: 2 }]);
  const item = (await call('GET', `collection/jam/${id}`)).body;
  const [sonne, regen] = item.songs;

  const first = await call("GET", `collection/jam/${id}/media`);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  let media = first.body;
  assert.deepEqual(media.songs[sonne.id].video.map((v) => v.label), ['Sonnenschein - Salsa.mp4']);
  assert.equal(media.files.length, 4, 'auch Unterordner');
  assert.deepEqual(media.files.find((f) => f.label === 'VID_1234.mp4').songs, []);

  const mediaUrl = (p) => `collection/jam/${id}/songs/${p}/media`;
  const vid = path.join(folder, 'VID_1234.mp4');
  await call('POST', mediaUrl(sonne.id), { action: 'remove', path: path.join(folder, 'Sonnenschein - Salsa.mp4') });
  await call('POST', mediaUrl(regen.id), { action: 'add', path: vid });
  assert.equal((await call('POST', mediaUrl(regen.id), { action: 'add', path: path.join(dataDir, 'fremd.mp4') })).status, 400);

  media = (await call('GET', `collection/jam/${id}/media`)).body;
  assert.deepEqual(media.songs[sonne.id].video, []);
  assert.deepEqual(media.songs[sonne.id].removed.map((r) => r.label), ['Sonnenschein - Salsa.mp4']);
  assert.equal(media.songs[regen.id].video[0].manual, true);

  // Suche zeigt die Zuordnung von Hand; das zugeordnete Video ist nicht mehr „nicht zugeordnet“
  const rows = await (await fetch(`${session.url}api/search?jam_id=${id}`)).json();
  assert.deepEqual(rows.find((r) => r.song_name === 'Regen').video_paths.map((v) => v.label), ['VID_1234.mp4']);
  assert.ok(!rows.some((r) => r.unassigned && r.song_name === 'VID_1234'));

  // Songliste speichern (umbenannt, umsortiert): Zuordnung bleibt am Song
  await call('PUT', `collection/jam/${id}/songs`, { songs: [{ ...regen, song_name: 'Regenbogen' }, sonne] });
  media = (await call('GET', `collection/jam/${id}/media`)).body;
  assert.deepEqual(media.songs[regen.id].video.map((v) => v.label), ['VID_1234.mp4']);

  await call('POST', mediaUrl(sonne.id), { action: 'restore', path: path.join(folder, 'Sonnenschein - Salsa.mp4') });
  await call('POST', mediaUrl(regen.id), { action: 'remove', path: vid });
  media = (await call('GET', `collection/jam/${id}/media`)).body;
  assert.deepEqual(media.songs[sonne.id].video.map((v) => v.label), ['Sonnenschein - Salsa.mp4']);
  assert.deepEqual(media.songs[regen.id].video, []);
});
