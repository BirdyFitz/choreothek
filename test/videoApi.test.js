// Videoanalyse über die Server-Schnittstelle: Kandidaten, Analyse im Hintergrund mit Fortschritt,
// Vorschlag, Ausführen, Rückgängig. Musik und Video werden erzeugt (braucht ffmpeg, sonst übersprungen).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { startServer } from '../src/server/server.js';
import { closeDB, insertJam, insertSongs } from '../src/server/db.js';
import { ffmpegPath } from '../src/server/video/ffmpeg.js';

const hasFfmpeg = spawnSync(ffmpegPath(), ['-version'], { windowsHide: true }).status === 0;
const opts = { skip: !hasFfmpeg && 'ffmpeg nicht gefunden' };
let session;
let dir;
let jamId;

// WAV (16 Bit mono, 8 kHz) mit wechselnden Tönen -- reproduzierbar je seed
function writeWav(file, seed, seconds) {
  const sr = 8000;
  const n = sr * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  let f1 = 300;
  let f2 = 900;
  for (let i = 0; i < n; i++) {
    if (i % 2000 === 0) {
      f1 = 150 + rnd() * 1200;
      f2 = 400 + rnd() * 2400;
    }
    const v = 0.5 * Math.sin((2 * Math.PI * f1 * i) / sr) + 0.3 * Math.sin((2 * Math.PI * f2 * i) / sr);
    buf.writeInt16LE(Math.round(v * 20000), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

const headers = () => ({ 'Content-Type': 'application/json', 'X-Choreothek-Token': session.token });
const call = async (method, p, body) => {
  const res = await fetch(`${session.url}api/${p}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'choreothek-vapi-'));
  session = await startServer({ dataDir: path.join(dir, 'daten') });
  if (!hasFfmpeg) return;
  const jam = path.join(dir, 'Jam');
  fs.mkdirSync(jam);
  writeWav(path.join(jam, '01 Sonnenschein.wav'), 1, 50);
  writeWav(path.join(jam, '02 Nachtzug.wav'), 2, 50);
  // Handy-Video: 30 s aus „Sonnenschein“ (ab 10 s), danach 25 s aus „Nachtzug“
  const r = spawnSync(
    ffmpegPath(),
    ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=55',
      '-ss', '10', '-t', '30', '-i', path.join(jam, '01 Sonnenschein.wav'), '-ss', '5', '-t', '25', '-i', path.join(jam, '02 Nachtzug.wav'),
      '-filter_complex', '[1:a][2:a]concat=n=2:v=0:a=1[a]', '-map', '0:v', '-map', '[a]', '-g', '10',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(jam, 'VID_0001.mp4')],
    { windowsHide: true }
  );
  if (r.status !== 0) throw new Error(String(r.stderr));
  jamId = await insertJam('Probe', null, '1-x.pdf', null, jam);
  await insertSongs(jamId, [{ name: 'Sonnenschein', rhythm: 'Salsa', position: 1 }]);
});

after(() => {
  session.server.close();
  closeDB();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Analyse, Vorschlag, Ausführen, Rückgängig', opts, async () => {
  const cand = (await call('GET', `video/${jamId}/candidates`)).body;
  assert.deepEqual(cand.videos.map((v) => v.label), ['VID_0001.mp4']);
  assert.equal(cand.audioCount, 2);

  assert.equal((await call('POST', `video/${jamId}/analyze`, { videos: [path.join(dir, 'fremd.mp4')] })).status, 400);
  assert.equal((await call('POST', `video/${jamId}/analyze`, { videos: [cand.videos[0].path] })).status, 202);
  let job;
  for (let i = 0; i < 600; i++) {
    job = (await call('GET', 'video/job')).body;
    if (job.state !== 'running') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(job.state, 'done', JSON.stringify(job));
  const [result] = job.results;
  assert.equal(result.action, 'cut');
  // Song aus der Zuordnung der Jam („Sonnenschein“) bzw. aus dem Dateinamen („Nachtzug“)
  assert.deepEqual(result.parts.map((p) => p.song), ['Sonnenschein', 'Nachtzug']);
  assert.ok(Math.abs(result.parts[0].end - 30) < 3, `Grenze bei ${result.parts[0].end}`);

  const exec = await call('POST', `video/${jamId}/execute`, {
    items: [{ video: result.video, action: 'cut', parts: result.parts.map(({ song, start, end }) => ({ song, start, end })) }]
  });
  assert.equal(exec.status, 200, JSON.stringify(exec.body));
  assert.equal(exec.body.log[0].status, 'done');
  const jamDir = path.dirname(result.video);
  assert.ok(fs.existsSync(path.join(jamDir, 'Sonnenschein - VID_0001.mp4')));
  assert.ok(fs.existsSync(path.join(jamDir, 'Originale', 'VID_0001.mp4')));

  // Originale zählen nicht mehr als Kandidaten; die Teile schon
  const after = (await call('GET', `video/${jamId}/candidates`)).body;
  assert.deepEqual(after.videos.map((v) => v.label).sort(), ['Nachtzug - VID_0001.mp4', 'Sonnenschein - VID_0001.mp4']);
  assert.ok(after.videos.find((v) => v.label.startsWith('Sonnenschein')).songs.includes('Sonnenschein'), 'Teil wird dem Song zugeordnet');

  const runs = (await call('GET', `video/${jamId}/runs`)).body;
  assert.equal(runs.length, 1);
  const undo = await call('POST', `video/runs/${runs[0].id}/undo`);
  assert.deepEqual(undo.body.result.map((r) => r.status), ['undone']);
  assert.ok(fs.existsSync(result.video));
  assert.equal((await call('POST', `video/runs/${runs[0].id}/undo`)).status, 400, 'nicht zweimal');
});
