// Kleine Merker der Oberfläche (z. B. ob der Detailbereich offen ist). localStorage kann in
// Sonderfällen fehlen oder Fehler werfen -- dann gilt einfach die Vorgabe.
export function readSetting(key, fallback) {
  try {
    const raw = window.localStorage.getItem(`choreothek.${key}`)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeSetting(key, value) {
  try {
    window.localStorage.setItem(`choreothek.${key}`, JSON.stringify(value))
  } catch {
    // ohne Speicher geht der Wert beim nächsten Start verloren -- kein Fehler
  }
}
