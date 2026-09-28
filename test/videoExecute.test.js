// Videoanalyse (Paket 7): Umbenennen, Schneiden ohne Neukodieren, Original nach „Originale“,
// Rückgängig. Braucht ffmpeg (erzeugt ein kurzes Probevideo); ohne ffmpeg werden die Tests übersprungen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { ffmpegPath, mediaDuration } from '../src/server/video/ffmpeg.js';
import { executeItems, undoLog, targetName } from '../src/server/video/execute.js';

let dir;
const hasFfmpeg = spawnSync(ffmpegPath(), ['-version'], { windowsHide: true }).status === 0;
const opts = { skip: !hasFfmpeg && 'ffmpeg nicht gefunden' };

function makeVideo(file, seconds) {
  const r = spawnSync(
    ffmpegPath(),
    ['-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=160x120:rate=10:duration=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
      '-g', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', file],
    { windowsHide: true }
  );
  if (r.status !== 0) throw new Error(String(r.stderr));
}

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'choreothek-video-'));
  if (!hasFfmpeg) return;
  fs.mkdirSync(path.join(dir, 'Handy'));
  makeVideo(path.join(dir, 'Handy', 'VID_0001.mp4'), 30);
  makeVideo(path.join(dir, 'VID_0002.mp4'), 12);
  makeVideo(path.join(dir, 'VID_0003.mp4'), 12);
  fs.writeFileSync(path.join(dir, targetName('Belegt', 'VID_0003.mp4')), 'schon da');
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('Dateiname: Song vorn, verbotene Zeichen entfernt', () => {
  assert.equal(targetName('Ja: Oder / Nein?', 'C:/x/VID 1.MOV'), 'Ja Oder Nein - VID 1.MOV');
});

test('Ausführen und Rückgängig', opts, async () => {
  const cutSrc = path.join(dir, 'Handy', 'VID_0001.mp4');
  const renameSrc = path.join(dir, 'VID_0002.mp4');
  const blockedSrc = path.join(dir, 'VID_0003.mp4');
  const log = await executeItems(dir, [
    { video: cutSrc, action: 'cut', parts: [{ song: 'Erster', start: 0, end: 14 }, { song: 'Zweiter', start: 14, end: 30 }] },
    { video: renameSrc, action: 'rename', parts: [{ song: 'Einzeln', start: 0, end: 12 }] },
    { video: blockedSrc, action: 'rename', parts: [{ song: 'Belegt', start: 0, end: 12 }] }
  ]);
  assert.deepEqual(log.map((l) => l.status), ['done', 'done', 'targetExists']);

  const part1 = path.join(dir, 'Handy', 'Erster - VID_0001.mp4');
  const part2 = path.join(dir, 'Handy', 'Zweiter - VID_0001.mp4');
  assert.ok(fs.existsSync(part1) && fs.existsSync(part2));
  assert.ok(Math.abs((await mediaDuration(part2)) - 16) < 1.5, 'Länge des zweiten Teils');
  assert.ok(!fs.existsSync(cutSrc));
  assert.ok(fs.existsSync(path.join(dir, 'Originale', 'VID_0001.mp4')), 'Original im Originale-Ordner der Jam');
  assert.ok(fs.existsSync(path.join(dir, 'Einzeln - VID_0002.mp4')));
  assert.ok(fs.existsSync(blockedSrc), 'bei belegtem Ziel bleibt die Datei unverändert');
  assert.equal(fs.readFileSync(path.join(dir, 'Belegt - VID_0003.mp4'), 'utf8'), 'schon da', 'nichts überschrieben');

  const undone = undoLog(log);
  assert.deepEqual(undone.map((u) => u.status), ['undone', 'undone']);
  assert.ok(fs.existsSync(cutSrc) && fs.existsSync(renameSrc));
  assert.ok(!fs.existsSync(part1) && !fs.existsSync(part2));
  assert.ok(!fs.existsSync(path.join(dir, 'Originale', 'VID_0001.mp4')));
});

test('Fehlgeschlagener Schnitt hinterlässt keine halben Teile', opts, async () => {
  const src = path.join(dir, 'VID_0002.mp4');
  const log = await executeItems(dir, [{ video: src, action: 'cut', parts: [{ song: 'Gut', start: 0, end: 6 }, { song: 'Zu lang', start: 6, end: 60 }] }]);
  assert.equal(log[0].status, 'cutFailed');
  assert.ok(!fs.existsSync(path.join(dir, 'Gut - VID_0002.mp4')), 'schon angelegter Teil wieder entfernt');
  assert.ok(fs.existsSync(src));
});
