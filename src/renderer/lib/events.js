// App-interne Benachrichtigung: Daten wurden eingelesen oder Datenquellen gespeichert.
// Die Suchseite lädt daraufhin ihre Auswahllisten (Jammer, MegaMixe, Rhythmen …) neu.
export const DATEN_GEAENDERT = 'choreothek:daten-geaendert'

export function meldeDatenGeaendert() {
  window.dispatchEvent(new Event(DATEN_GEAENDERT))
}
