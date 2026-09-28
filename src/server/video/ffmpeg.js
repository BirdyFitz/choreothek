// ffmpeg: Ton dekodieren, Länge bestimmen, ohne Neukodieren schneiden.
// Gesucht wird (in dieser Reihenfolge): Einstellung/Umgebung CHOREOTHEK_FFMPEG, mitgelieferte Kopie
// neben der App (resources/ffmpeg), winget-Installation, ffmpeg im PATH.
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { SR } from './fingerprint.js';

let configured = null;

export function setFfmpegPath(p) {
  configured = p;
}

function wingetCandidates() {
  const base = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
  if (!base || !fs.existsSync(base)) return [];
  const found = [];
  for (const pkg of fs.readdirSync(base).filter((d) => /ffmpeg/i.test(d))) {
    const dir = path.join(base, pkg);
    for (const sub of fs.readdirSync(dir)) found.push(path.join(dir, sub, 'bin', 'ffmpeg.exe'));
  }
  return found;
}

export function ffmpegPath() {
  const candidates = [
    configured,
    process.env.CHOREOTHEK_FFMPEG,
    process.resourcesPath && path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe'),
    ...wingetCandidates()
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) || 'ffmpeg';
}

export const ffprobePath = () => {
  const ff = ffmpegPath();
  return ff === 'ffmpeg' ? 'ffprobe' : path.join(path.dirname(ff), path.basename(ff).replace(/ffmpeg/i, 'ffprobe'));
};

function run(bin, args, { binary = false, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, signal });
    const out = [];
    let err = '';
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.slice(-400) || `ffmpeg Exit ${code}`));
      const buf = Buffer.concat(out);
      resolve(binary ? buf : buf.toString('utf8'));
    });
  });
}

// Ton als Mono-Float32 mit SR Hz
export async function decodeAudio(file, { signal } = {}) {
  const buf = await run(ffmpegPath(), ['-v', 'error', '-nostdin', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {
    binary: true,
    signal
  });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

export async function mediaDuration(file) {
  const out = await run(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(out.trim()) || 0;
}

// Teil ohne Neukodieren herausschneiden (beginnt am nächsten Schlüsselbild, also bis 1–2 s früher)
export async function cutCopy(src, dst, start, end) {
  await run(ffmpegPath(), [
    '-v', 'error', '-nostdin', '-ss', String(start), '-i', src, '-t', String(Math.round((end - start) * 10) / 10),
    '-c', 'copy', '-map', '0', '-avoid_negative_ts', 'make_zero', '-n', dst
  ]);
}
