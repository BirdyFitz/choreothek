// Sortierung der Suchergebnisse nach einer Spalte: aufsteigend, absteigend oder ohne
// (dann gilt die Reihenfolge vom Server). Leere Werte stehen immer am Ende. Gleiche Werte
// behalten ihre bisherige Reihenfolge (Array.sort ist stabil).

export const SORT_COLUMNS = {
  song: (r) => r.song_name,
  artist: (r) => r.artist,
  rhythm: (r) => r.rhythm,
  source: (r) => r.jammer_name || r.edition_label,
  // Datum der Jam als ISO-Datum (jam_datum); der Anzeigetext steht in jam_date
  date: (r) => r.jam_datum,
  location: (r) => r.location
}

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

// nächster Zustand beim Klick auf eine Spaltenüberschrift: ohne → auf → ab → ohne
export function nextSort(current, key) {
  if (!current || current.key !== key) return { key, dir: 'asc' }
  if (current.dir === 'asc') return { key, dir: 'desc' }
  return null
}

export function sortRows(rows, sort) {
  if (!sort || !SORT_COLUMNS[sort.key]) return rows
  const value = SORT_COLUMNS[sort.key]
  const factor = sort.dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    const emptyA = va === null || va === undefined || va === ''
    const emptyB = vb === null || vb === undefined || vb === ''
    if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1
    return factor * collator.compare(String(va), String(vb))
  })
}
