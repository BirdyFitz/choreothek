// Tonvergleich im Hintergrund (worker_threads), damit die App währenddessen bedienbar bleibt.
// Eingabe (workerData): { ffmpeg, refs: [Pfade der Musikdateien], videos: [Pfade] }
// Nachrichten: { type: 'progress', done, total, current } | { type: 'video', result } | { type: 'done' }
import { parentPort, workerData } from 'worker_threads';
import { fingerprint } from './fingerprint.js';
import { buildIndex, segmentsFor, proposalFor } from './match.js';
import { decodeAudio, mediaDuration, setFfmpegPath } from './ffmpeg.js';

setFfmpegPath(workerData.ffmpeg);
const { refs, videos } = workerData;
const total = refs.length + videos.length;
let cancelled = false;
parentPort.on('message', (m) => {
  if (m === 'cancel') cancelled = true;
});

const progress = (done, current) => parentPort.postMessage({ type: 'progress', done, total, current });

const prints = [];
for (const [i, ref] of refs.entries()) {
  if (cancelled) break;
  progress(i, ref);
  try {
    prints.push(fingerprint(await decodeAudio(ref)));
  } catch {
    prints.push({ f: new Int32Array(0), t: new Int32Array(0) }); // unlesbare Musikdatei zählt nicht
  }
}
const index = buildIndex(prints);

for (const [i, video] of videos.entries()) {
  if (cancelled) break;
  progress(refs.length + i, video);
  try {
    const duration = await mediaDuration(video);
    const segments = segmentsFor(fingerprint(await decodeAudio(video)), index);
    parentPort.postMessage({ type: 'video', result: { video, duration, segments, ...proposalFor(segments, duration) } });
  } catch (error) {
    parentPort.postMessage({ type: 'video', result: { video, error: String(error.message).slice(-300) } });
  }
}
parentPort.postMessage({ type: 'done', cancelled });
// Der Empfang für „Abbrechen“ hielte den Worker sonst am Leben
parentPort.close();
