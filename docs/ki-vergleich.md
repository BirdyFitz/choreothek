# Vergleich der KI-Anbieter beim Auslesen von Choreo Notes

**Stand:** 27.09.2026 · Grundlage für die vorbelegten Modelle in Choreothek.

## Vorgehen

- Stichprobe aus einem privaten Archiv: 6 Jam-Session-PDFs (4–7 Seiten, 2–5 Songs, verschiedene
  Jahrgänge und Datumsformate) und 2 Choreo-Notes-PDFs von Trainings-Volumes (je 21 Seiten, 10 Songs).
  Die PDFs selbst sind nicht Teil des Repositorys.
- Jedes Modell hat jede PDF einmal mit den Anweisungen aus `src/server/ai/prompts.js` ausgelesen
  (48 Aufrufe).
- Vergleichsmaßstab: bereits vorhandene, geprüfte Auslesungen derselben PDFs (ursprünglich mit
  claude-sonnet-5 erstellt, von Hand nachgesehen). Verglichen wurden Songtitel, Interpret, Rhythmus,
  Seitenzahlen sowie Kopfdaten (Jammer, Datum, Ort bzw. Volume-Nummer).
- Kosten geschätzt aus den Token-Angaben der Anbieter und der Preistabelle (`src/server/ai/prices.js`).

## Ergebnis

| Modell | Songs gefunden | zusätzlich | Rhythmus | Interpret | Seiten | Kopfdaten | Ø Zeit | Kosten (8 PDFs) |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: |
| claude-sonnet-5 | 100 % | 0 | 100 % | 100 % | 100 % | 80 % | 6 s | 0,38 $ |
| claude-haiku-4-5 | 100 % | 2 | 100 % | 95 % | 100 % | 90 % | 5 s | 0,18 $ |
| gpt-6-astra | 100 % | 0 | 100 % | 98 % | 100 % | 70 % | 10 s | 2,44 $ |
| gpt-6-luna | 100 % | 0 | 100 % | 98 % | 100 % | 75 % | 7 s | 0,03 $ |
| gemini-3.8-flash | 100 % | 0 | 100 % | 98 % | 100 % | 70 % | 23 s | 0,07 $ |
| gemini-3.5-flash-lite | 98 % | 1 | 98 % | 93 % | 100 % | 70 % | 5 s | 0,02 $ |

Beobachtungen:

- Abweichungen bei den Kopfdaten sind überwiegend Schreibweisen (Postleitzahl vor/nach dem Ort,
  Datum als „May 10, 2025“ statt „2025-05-10“) oder bei Jams mit zwei Leitenden die vollständigere
  Angabe beider Namen.
- claude-haiku-4-5 hat bei beiden Volumes das Warm-up-Medley als eigenen Song ausgegeben, obwohl
  die Anweisung es ausschließt (Warm-up stünde dadurch doppelt in der Liste).
- gemini-3.5-flash-lite hat einmal einen Song ausgelassen und beim Ort den Namen der Halle weggelassen.
- Kleine Stichprobe, ein Durchlauf je Modell – geringe Unterschiede sind nicht belastbar.

## Vorbelegung

| Anbieter | Modell |
| :-- | :-- |
| Anthropic | claude-sonnet-5 |
| OpenAI | gpt-6-luna |
| Google | gemini-3.8-flash |

Die übrigen Modelle bleiben in den Einstellungen wählbar.
