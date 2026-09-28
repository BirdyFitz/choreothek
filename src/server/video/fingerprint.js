// Ton-Fingerabdruck nach dem Landmarken-Prinzip (wie Shazam): markante Spitzen im Spektrogramm,
// je zwei nahe Spitzen ergeben einen Hash (Frequenz 1, Frequenz 2, Zeitabstand). Stimmen in einem
// Handy-Video viele Hashes mit gleichem Zeitversatz zu einer Musikdatei überein, läuft dort dieser Song.
// Übertragen aus der Python-Fassung (scipy.signal.stft, scipy.ndimage.maximum_filter), gleiche Werte.

export const SR = 8000;
export const NFFT = 512;
export const HOP = 256;
export const FPS = SR / HOP; // 31,25 Frames je Sekunde
const F_LO = 5; // ~80 Hz
const F_HI = 200; // ~3,1 kHz
export const BANDS = F_HI - F_LO;
const FILTER = 15; // Nachbarschaft für lokale Maxima (Frequenz × Zeit)
const FAN = 5;
const MAX_DT = 64;

// ---------- FFT (radix 2, reelle Eingabe der Länge NFFT) ----------

const LOG2 = Math.log2(NFFT);
const bitrev = new Uint32Array(NFFT);
for (let i = 0; i < NFFT; i++) {
  let r = 0;
  for (let b = 0; b < LOG2; b++) r |= ((i >> b) & 1) << (LOG2 - 1 - b);
  bitrev[i] = r;
}
const cos = new Float64Array(NFFT / 2);
const sin = new Float64Array(NFFT / 2);
for (let i = 0; i < NFFT / 2; i++) {
  cos[i] = Math.cos((2 * Math.PI * i) / NFFT);
  sin[i] = -Math.sin((2 * Math.PI * i) / NFFT);
}
// periodisches Hann-Fenster wie scipy get_window('hann', NFFT)
const WINDOW = new Float64Array(NFFT);
let windowSum = 0;
for (let i = 0; i < NFFT; i++) {
  WINDOW[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NFFT);
  windowSum += WINDOW[i];
}

function fftMagnitudes(re, im, out) {
  for (let i = 0; i < NFFT; i++) {
    const j = bitrev[i];
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= NFFT; size <<= 1) {
    const half = size >> 1;
    const step = NFFT / size;
    for (let start = 0; start < NFFT; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sin[k * step];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  for (let f = F_LO; f < F_HI; f++) out[f - F_LO] = Math.log1p(Math.hypot(re[f], im[f]) / windowSum);
}

// Spektrogramm log(1+|STFT|), Bänder F_LO..F_HI; wie scipy.signal.stft mit boundary='zeros',
// padded=True, scaling='spectrum'. Ergebnis: Float32Array [Band * frames + Frame]
export function spectrogram(signal) {
  const pad = NFFT / 2;
  let length = signal.length + 2 * pad;
  length += (((-(length - NFFT)) % HOP) + HOP) % HOP;
  const frames = Math.max(0, Math.floor((length - NFFT) / HOP) + 1);
  const spec = new Float32Array(BANDS * frames);
  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  const col = new Float64Array(BANDS);
  for (let t = 0; t < frames; t++) {
    const offset = t * HOP - pad;
    for (let i = 0; i < NFFT; i++) {
      const idx = offset + i;
      re[i] = idx >= 0 && idx < signal.length ? signal[idx] * WINDOW[i] : 0;
      im[i] = 0;
    }
    fftMagnitudes(re, im, col);
    for (let f = 0; f < BANDS; f++) spec[f * frames + t] = col[f];
  }
  return { spec, frames };
}

// Maximum in einem Fenster entlang einer Achse, Randbehandlung „reflect“ wie scipy.ndimage (d c b a | a b c d)
function maxFilter1d(src, dst, count, stride, lines, lineStride) {
  const r = (FILTER - 1) / 2;
  const reflect = (i) => (i < 0 ? -i - 1 : i >= count ? 2 * count - i - 1 : i);
  for (let l = 0; l < lines; l++) {
    const base = l * lineStride;
    for (let i = 0; i < count; i++) {
      let m = -Infinity;
      for (let k = i - r; k <= i + r; k++) {
        const v = src[base + reflect(k) * stride];
        if (v > m) m = v;
      }
      dst[base + i * stride] = m;
    }
  }
}

// Markante Spitzen: lokales Maximum (15×15) und über Mittelwert + Standardabweichung
export function peaks({ spec, frames }) {
  if (!frames) return { f: new Int32Array(0), t: new Int32Array(0) };
  const tmp = new Float32Array(spec.length);
  const max = new Float32Array(spec.length);
  maxFilter1d(spec, tmp, frames, 1, BANDS, frames); // entlang der Zeit
  maxFilter1d(tmp, max, BANDS, frames, frames, 1); // entlang der Frequenz
  let sum = 0;
  for (let i = 0; i < spec.length; i++) sum += spec[i];
  const mean = sum / spec.length;
  let sq = 0;
  for (let i = 0; i < spec.length; i++) sq += (spec[i] - mean) ** 2;
  const threshold = mean + Math.sqrt(sq / spec.length);
  const found = [];
  for (let t = 0; t < frames; t++) {
    for (let f = 0; f < BANDS; f++) {
      const v = spec[f * frames + t];
      if (v > threshold && v === max[f * frames + t]) found.push(f, t);
    }
  }
  const n = found.length / 2;
  const f = new Int32Array(n);
  const t = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    f[i] = found[2 * i];
    t[i] = found[2 * i + 1];
  }
  return { f, t };
}

// Hash-Paare: je Spitze bis zu FAN folgende Spitzen innerhalb von MAX_DT Frames.
// callback(hash, zeitDerErstenSpitze)
export function forEachHash({ f, t }, callback) {
  for (let i = 0; i < t.length; i++) {
    let n = 0;
    for (let j = i + 1; j < t.length; j++) {
      const dt = t[j] - t[i];
      if (dt === 0) continue;
      if (dt > MAX_DT) break;
      callback((f[i] * BANDS + f[j]) * (MAX_DT + 1) + dt, t[i]);
      if (++n >= FAN) break;
    }
  }
}

export function fingerprint(signal) {
  return peaks(spectrogram(signal));
}
