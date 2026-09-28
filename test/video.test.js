// Videoanalyse (Paket 7): Fingerabdruck und Abgleich mit künstlichem Ton (kein ffmpeg, keine Dateien).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SR, fingerprint } from '../src/server/video/fingerprint.js';
import { buildIndex, segmentsFor, proposalFor } from '../src/server/video/match.js';

// Reproduzierbares „Musikstück“: wechselnde Töne mit Obertönen, dazu leises Rauschen
function song(seed, seconds) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = new Float32Array(seconds * SR);
  let f1 = 300;
  let f2 = 900;
  for (let i = 0; i < out.length; i++) {
    if (i % 2000 === 0) {
      f1 = 150 + rnd() * 1200;
      f2 = 400 + rnd() * 2400;
    }
    out[i] = 0.5 * Math.sin((2 * Math.PI * f1 * i) / SR) + 0.3 * Math.sin((2 * Math.PI * f2 * i) / SR) + 0.02 * (rnd() - 0.5);
  }
  return out;
}

function noise(seconds, seed = 99) {
  let s = seed;
  const out = new Float32Array(seconds * SR);
  for (let i = 0; i < out.length; i++) out[i] = 0.1 * (((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5);
  return out;
}

function concat(...parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const A = song(1, 60);
const B = song(2, 60);
const index = buildIndex([fingerprint(A), fingerprint(B)]);

test('Video mit zwei Songs: Abschnitte an der richtigen Stelle, Vorschlag „schneiden“', () => {
  // 10 s Gerede, 40 s aus Song A (ab Sekunde 5), 10 s Pause, 30 s aus Song B, 10 s Ende
  const video = concat(noise(10), A.subarray(5 * SR, 45 * SR), noise(10, 7), B.subarray(20 * SR, 50 * SR), noise(10, 3))
  // leiser und mit Rauschen wie ein Handymikrofon
  for (let i = 0; i < video.length; i++) video[i] = 0.6 * video[i] + 0.03 * Math.sin(i);
  const segs = segmentsFor(fingerprint(video), index).filter((s) => s.hits >= 12);
  assert.deepEqual(segs.map((s) => s.ref), [0, 1]);
  assert.ok(Math.abs(segs[0].start - 10) < 1.5 && Math.abs(segs[0].end - 50) < 1.5, JSON.stringify(segs[0]));
  assert.ok(Math.abs(segs[1].start - 60) < 1.5 && Math.abs(segs[1].end - 90) < 1.5, JSON.stringify(segs[1]));
  const prop = proposalFor(segs, 100);
  assert.equal(prop.action, 'cut');
  assert.equal(prop.parts.length, 2);
  assert.ok(prop.parts[0].start < 10 && prop.parts[1].end > 90, 'außen Puffer');
  assert.equal(prop.parts[0].end, prop.parts[1].start, 'Grenze in der Lücke');
  assert.ok(prop.parts[0].end > 50 && prop.parts[0].end < 60);
  assert.ok(prop.parts.every((p) => p.sure));
});

test('Video mit einem Song über fast die ganze Länge: umbenennen', () => {
  const video = concat(noise(2), A.subarray(0, 50 * SR), noise(2, 5));
  const prop = proposalFor(segmentsFor(fingerprint(video), index), 54);
  assert.equal(prop.action, 'rename');
  assert.equal(prop.parts[0].ref, 0);
});

test('Video ohne passende Musik: kein Treffer', () => {
  // Künstliche Stücke aus reinen Tönen im gleichen Takt ähneln sich zwangsläufig; ein fremdes Stück
  // ist hier deshalb Rauschen mit Tönen in anderem Takt
  const other = noise(40, 1234);
  for (let i = 0; i < other.length; i++) other[i] += 0.4 * Math.sin((2 * Math.PI * (500 + 300 * Math.floor(i / 3100) % 7) * i) / SR);
  const prop = proposalFor(segmentsFor(fingerprint(other), index), 40);
  assert.equal(prop.action, 'none');
});
