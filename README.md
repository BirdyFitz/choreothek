# Choreothek

Dein Nachschlagewerk für Songs, Rhythmen und Choreos – eine Windows-App für Tanz-Instruktorinnen und
-Instruktoren, die ihr eigenes Archiv aus Jam Sessions, Mixen und Volumes durchsuchbar machen möchten.

> **Stand:** Vorabversion 0.9 für den Pilotbetrieb. Webseite und Anleitung: [choreothek.eu](https://choreothek.eu) ·
> [Schritt für Schritt](https://choreothek.eu/anleitung)

## Installation

1. Den neuesten Installer `Choreothek-Setup-….exe` unter [Releases](https://github.com/BirdyFitz/choreothek/releases)
   herunterladen.
2. Starten. Windows zeigt eventuell „Der Computer wurde durch Windows geschützt“ (SmartScreen), weil der
   Installer nicht kostenpflichtig signiert ist: **Weitere Informationen → Trotzdem ausführen**.
3. Installiert wird nur für dein Windows-Konto, ohne Administratorrechte. Beim ersten Start führt ein
   Assistent durch die Einrichtung.

Updates: Choreothek sieht beim Start nach neuen Versionen und fragt, bevor etwas installiert wird.

## Was Choreothek kann

- Suche nach Song, Rhythmus (Teil des Namens genügt, z. B. „sal“), Jammer, Ort und Datum
- Choreo-Notes-Seite zum Song anzeigen, Musik und Videos abspielen – mit Tempo 0,5–1× und Abschnitt-Wiederholung
- Einlesen der Choreo-Notes-PDFs per KI (Anthropic, OpenAI oder Google – eigener API-Schlüssel), mit
  Vorschau vorher und Kostenanzeige
- Bibliothek: Angaben und Songs korrigieren, Musik und Videos von Hand zuordnen, Schreibweisen vereinheitlichen
- Videoanalyse: Handy-Videos einer Jam per Tonvergleich den Songs zuordnen, umbenennen oder schneiden –
  mit Prüfansicht und „Rückgängig“
- Sicherung und Wiederherstellung, Hilfe an jedem Feld

## Grundsätze

- **Deine Daten bleiben auf deinem PC.** Choreothek enthält kein Trainingsmaterial und verteilt keins.
  Du richtest die App auf deine eigenen Ordner ein.
- **Keine KI-Nutzung ohne Meldung.** Nur beim Einlesen gehen PDFs an den von dir gewählten KI-Anbieter;
  vorher zeigt Choreothek an, was gesendet wird und was es voraussichtlich kostet.
- **Kein Tracking.** Die App fragt nur bei GitHub nach neuen Versionen.

## Entwicklung

Voraussetzungen: Windows, Node.js 24, npm 11.

```bash
npm install
npm run dev            # Oberfläche bauen und App starten
npm test               # Tests (laufen mit der Node-Laufzeit von Electron)
npm run ffmpeg:local   # vorhandenes ffmpeg für den Installer bereitstellen (build/ffmpeg)
npm run dist           # Installer bauen (out/)
```

Veröffentlichung: Version in `package.json` setzen, committen, Tag `v<Version>` pushen. GitHub Actions
testet, lädt ffmpeg (LGPL, Prüfsumme geprüft), baut den Installer und legt ein Release an – Versionen 0.x
als „Pre-release“.

Aufbau:

| Ordner | Inhalt |
| :--- | :--- |
| `src/main` | Electron-Hauptprozess (Fenster, Dialoge, Schlüsselablage, Updates, Start des lokalen Servers) |
| `src/server` | lokaler Server (Express): Suche, Einlesen, KI, Bibliothek, Videoanalyse, Sicherung; SQLite |
| `src/renderer` | Oberfläche (React) |
| `scripts` | Hilfsskripte für den Build |
| `test` | automatische Tests mit erfundenen Beispieldaten |

Daten der App liegen unter `%APPDATA%\Choreothek` (Datenbank `choreothek.sqlite`, PDF-Kopien).
Der lokale Server lauscht nur auf `127.0.0.1`; ändernde Anfragen brauchen einen Sitzungs-Token.

## Lizenz

GPL-3.0 – siehe [LICENSE](LICENSE). Der Installer enthält ffmpeg (LGPL).

„Zumba“ ist eine eingetragene Marke der Zumba Fitness, LLC. Choreothek ist ein unabhängiges Projekt
und steht in keiner Verbindung zu Zumba Fitness.
