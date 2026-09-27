# Choreothek

Dein Nachschlagewerk für Songs, Rhythmen und Choreos – eine Windows-App für Tanz-Instruktorinnen und
-Instruktoren, die ihr eigenes Archiv aus Jam Sessions, Mixen und Volumes durchsuchbar machen möchten.

> **Stand:** frühe Entwicklung (Version 0.1). Noch kein Installer – siehe [Entwicklung](#entwicklung).

## Was Choreothek kann (Ziel für Version 1)

- Suche nach Song, Rhythmus (Teil des Namens genügt, z. B. „sal“), Jammer, Ort und Datum
- Choreo-Notes-Seite zum Song anzeigen, Musik und Videos direkt abspielen
- Einlesen der Choreo-Notes-PDFs per KI (Anthropic, OpenAI oder Google – eigener API-Schlüssel)
- Vorschau vor dem Einlesen, Korrekturen in der App, Sicherung und Wiederherstellung
- Videoanalyse: Handy-Videos einer Jam den Songs zuordnen, umbenennen und schneiden

## Grundsätze

- **Deine Daten bleiben auf deinem PC.** Choreothek enthält kein Trainingsmaterial und verteilt keins.
  Du richtest die App auf deine eigenen Ordner ein.
- **Keine KI-Nutzung ohne Meldung.** Nur beim Einlesen gehen PDFs an den von dir gewählten KI-Anbieter;
  vorher zeigt Choreothek an, was gesendet wird und was es voraussichtlich kostet.
- **Kein Tracking.** Die App fragt nur bei GitHub nach neuen Versionen.

## Entwicklung

Voraussetzungen: Windows, Node.js 22 oder neuer.

```bash
npm install
npm run dev     # Oberfläche bauen und App starten
npm test        # Tests (laufen mit der Node-Laufzeit von Electron)
```

Aufbau:

| Ordner | Inhalt |
| :--- | :--- |
| `src/main` | Electron-Hauptprozess (Fenster, Ordnerdialog, Start des lokalen Servers) |
| `src/server` | lokaler Server (Express) mit Suche, Einlesen und Mediendateien; Datenbank SQLite |
| `src/renderer` | Oberfläche (React) |
| `test` | automatische Tests mit erfundenen Beispieldaten |

Daten der App liegen unter `%APPDATA%\Choreothek` (Datenbank `choreothek.sqlite`, PDF-Kopien).
Der lokale Server lauscht nur auf `127.0.0.1`; ändernde Anfragen brauchen einen Sitzungs-Token.

## Lizenz

GPL-3.0 – siehe [LICENSE](LICENSE).

„Zumba“ ist eine eingetragene Marke der Zumba Fitness, LLC. Choreothek ist ein unabhängiges Projekt
und steht in keiner Verbindung zu Zumba Fitness.
