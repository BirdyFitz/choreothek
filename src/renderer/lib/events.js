// App-interne Benachrichtigung: Daten wurden eingelesen oder Datenquellen gespeichert.
// Die Suchseite lädt daraufhin ihre Auswahllisten (Jammer, MegaMixe, Rhythmen …) neu.
export const DATEN_GEAENDERT = 'choreothek:daten-geaendert'

export function meldeDatenGeaendert() {
  window.dispatchEvent(new Event(DATEN_GEAENDERT))
}

// Eintrag in der Bibliothek öffnen (z. B. „Bearbeiten“ im Detailbereich der Suche): detail { type, id }
export const OPEN_IN_LIBRARY = 'choreothek:open-in-library'

export function oeffneInBibliothek(type, id) {
  window.dispatchEvent(new CustomEvent(OPEN_IN_LIBRARY, { detail: { type, id } }))
}
