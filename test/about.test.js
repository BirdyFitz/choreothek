// „Über Choreothek“ und „Problem melden“ (Paket 9): Versionen, Lizenzen, Bericht ohne Schlüssel/Pfade
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sanitize } from '../src/server/appInfo.js';
import { startServer } from '../src/server/server.js';
import { closeDB } from '../src/server/db.js';

let session;
let dir;
const headers = () => ({ 'Content-Type': 'application/json', 'X-Choreothek-Token': session.token });
const post = async (p, body) => (await fetch(`${session.url}api/${p}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })).json();

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'choreothek-about-'));
  session = await startServer({ dataDir: dir });
});

after(() => {
  session.server.close();
  closeDB();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Bericht: Pfade gekürzt, Schlüssel und E-Mail-Adressen entfernt', () => {
  assert.equal(sanitize('ENOENT: C:\\Users\\Erika\\Tanz\\Jam 1\\Notes.pdf fehlt'), 'ENOENT: …\\Notes.pdf fehlt');
  assert.equal(sanitize('Netz: \\\\nas\\Freigabe\\Ordner\\Video.mp4'), 'Netz: …\\Video.mp4');
  assert.equal(sanitize('key sk-ant-api03-abcdefghijk und AIzaSyA1234567890abcdefghijkl'), 'key [Schlüssel entfernt] und [Schlüssel entfernt]');
  assert.equal(sanitize('von erika@example.org'), 'von [E-Mail entfernt]');
  assert.equal(sanitize('/Users/erika/Musik/lied.mp3'), '…/lied.mp3');
  // Ordnernamen mit Personennamen fallen ganz weg
  assert.equal(sanitize('Ordner nicht gefunden: D:\\Tanz\\2023 Jam Musterstadt, Erika'), 'Ordner nicht gefunden: …\\');
});

test('Über: Version und Drittlizenzen aus den mitgelieferten Paketen', async () => {
  const about = await (await fetch(`${session.url}api/about`)).json();
  assert.match(about.version, /^\d+\.\d+\.\d+/);
  assert.ok(about.os);
  const names = about.licenses.map((l) => l.name);
  assert.ok(names.includes('react') && names.includes('better-sqlite3'));
  assert.ok(about.licenses.every((l) => l.license && l.license !== '?'), JSON.stringify(about.licenses.filter((l) => l.license === '?')));
});

test('Problem melden: Beschreibung, Versionen und gemeldete Fehler, bereinigt', async () => {
  await post('client-error', { message: 'TypeError in C:\\Users\\Erika\\x\\App.jsx mit sk-ant-geheimgeheim' });
  const { text } = await post('problem-report', { description: 'Beim Klick auf Speichern passiert nichts.' });
  assert.match(text, /^Beschreibung:\nBeim Klick/);
  assert.match(text, /Choreothek \d/);
  assert.match(text, /oberfläche: TypeError in …\\App\.jsx mit \[Schlüssel entfernt\]/);
  assert.ok(!text.includes('Erika'));
});
