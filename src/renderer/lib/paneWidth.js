// Breite eines Seitenbereichs beim Ziehen der Trennlinie begrenzen: eigene Grenzen (min/max)
// und genug Platz für die Ergebnisliste in der Mitte.
export const LIST_MIN_WIDTH = 360

export function clampPaneWidth(width, { min, max, windowWidth, otherPaneWidth = 0 }) {
  const roomLeft = windowWidth - otherPaneWidth - LIST_MIN_WIDTH
  const upper = Math.max(min, Math.min(max, roomLeft))
  return Math.round(Math.min(upper, Math.max(min, width)))
}
