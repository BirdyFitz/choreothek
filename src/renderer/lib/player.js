// Hilfsfunktionen des Players (ohne Oberfläche, damit testbar)

export const SPEEDS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1]

// "1:23", "01:02:03", "83" oder "83,5" -> Sekunden; ungültig -> null
export function parseTime(text) {
  const s = String(text ?? '').trim().replace(',', '.')
  if (!s) return null
  const parts = s.split(':')
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.slice(1).some((n) => n >= 60)) return null
  return nums.reduce((total, n) => total * 60 + n, 0)
}

// Sekunden -> "m:ss" bzw. "h:mm:ss"
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// A–B-Schleife: Zeitpunkt, zu dem gesprungen werden muss, oder null. Ist nur A gesetzt,
// läuft die Schleife von A bis zum Ende; B vor A wird als vertauscht behandelt.
export function loopJump(current, a, b, duration) {
  if (a == null) return null
  const start = b != null ? Math.min(a, b) : a
  const end = b != null ? Math.max(a, b) : duration
  if (!Number.isFinite(end) || end - start < 0.2) return null
  return current >= end || current < start - 0.5 ? start : null
}
