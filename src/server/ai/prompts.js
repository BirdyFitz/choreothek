// Anweisungen an die KI und Prüfung der Antworten – einmal für alle Anbieter.

export function jamPrompt() {
  return `Du bist ein PDF-Parser für Zumba Jam Sessions. Lies die folgende PDF und extrahiere:
1. Jammer-Name (Person, die die Session leitet)
2. Jam-Datum (falls vorhanden)
3. Location/Ort der Jam (Name des Studios/der Location plus Adresse/Ort, z.B. "Fit mit Nicole, 74348 Lauffen am Neckar")
4. Die Songs mit ihrem Rhythmus (z.B. "Reggaeton", "Salsa", "Cumbia", "Merengue", etc.), dem Interpreten (steht meist unter "Artist" oder "Interpret") und der PDF-Seitenzahl, auf der die Choreo-Notes/Schrittfolge für diesen Song stehen (meist eine Seite pro Song)

Gib das Ergebnis als JSON zurück (nichts anderes, nur valides JSON):
{
  "jammer_name": "...",
  "jam_date": "...",
  "location": "...",
  "songs": [
    {"name": "Songname", "artist": "Interpret", "rhythm": "Rhythmus", "page": 1}
  ]
}

Wenn das Jam-Datum nicht vorhanden ist, nutze null. Wenn keine Location angegeben ist, nutze ebenfalls null. Wenn kein Interpret angegeben ist, nutze ebenfalls null. Wenn die Seitenzahl für einen Song nicht eindeutig bestimmbar ist, nutze ebenfalls null. Wenn der Rhythmus für einen Song nicht eindeutig bestimmbar ist, nutze ebenfalls null (nicht raten).`;
}

export function zinPrompt(documentCount) {
  const documentList = Array.from({ length: documentCount }, (_, i) => `Dokument ${i + 1}`).join(', ');
  return `Du bist ein PDF-Parser für ZIN-Volume-Choreo-Notes (Zumba-Instructor-Trainingsmaterial). Dir liegen ${documentCount} PDF(s) vor (${documentList}).

Diese Choreo-Notes enthalten pro Song üblicherweise zwei Abschnitte:
- Einen "LIVE"-Abschnitt (volle Kursversion): beginnt mit einer Warm-up-Medley aus mehreren Songs in einem Track, gefolgt von den Kern-Songs, endet mit einem einzelnen Cooldown-Song.
- Einen "1ON1"-Abschnitt (Personal-Training-Kurzversion): nur die Kern-Songs, kein Warm-up und kein Cooldown.

Diese beiden Abschnitte können entweder hintereinander in einer gemeinsamen PDF stehen, oder auf zwei separate PDFs verteilt sein (in der Reihenfolge, in der sie dir hier übergeben wurden).

Extrahiere:
1. Die Volume-Nummer (steht z.B. als "ZIN 100" im Dokument).
2. Für jeden Kern-Song (NICHT die Warm-up-Medley, die mehrere Songnamen in einem Track kombiniert): Songname, Interpret ("ARTIST"), Rhythmus ("GENRE"), die Seitenzahl im LIVE-Abschnitt und die Seitenzahl im 1ON1-Abschnitt (falls vorhanden).
3. Den Cooldown-Song NUR mit LIVE-Seite (er hat normalerweise keinen 1ON1-Abschnitt).
4. Gib für jede Seitenzahl auch an, aus welchem der ${documentCount} Dokument(e) sie stammt (1-indiziert, "live_source"/"oneonone_source").

Gib das Ergebnis als JSON zurück (nichts anderes, nur valides JSON):
{
  "volume_number": 100,
  "songs": [
    {"name": "Songname", "artist": "Interpret", "rhythm": "Rhythmus", "live_page": 3, "live_source": 1, "oneonone_page": 14, "oneonone_source": 1}
  ]
}

Wenn ein Interpret oder Rhythmus nicht eindeutig bestimmbar ist, nutze null (nicht raten). Wenn ein Song keinen 1ON1-Abschnitt hat (z.B. Cooldown), nutze für "oneonone_page" und "oneonone_source" null.`;
}

export class AiAnswerError extends Error {}

// Erstes JSON-Objekt aus der Antwort (Modelle umrahmen es manchmal mit Text oder ```json)
export function parseJsonAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new AiAnswerError('noJson');
  try {
    return JSON.parse(match[0]);
  } catch {
    throw new AiAnswerError('invalidJson');
  }
}

const positiveInt = (v) => (Number.isInteger(v) && v > 0 ? v : null);
const textOrNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// Seitenzahlen außerhalb der PDF gelten als unbekannt (null) statt falsch
function page(v, maxPage) {
  const p = positiveInt(v);
  return p && (!maxPage || p <= maxPage) ? p : null;
}

export function validateJam(data, { pageCount } = {}) {
  if (!data || !textOrNull(data.jammer_name) || !Array.isArray(data.songs)) throw new AiAnswerError('invalidStructure');
  const songs = data.songs
    .filter((s) => s && textOrNull(s.name))
    .map((s, i) => ({
      name: textOrNull(s.name),
      artist: textOrNull(s.artist),
      rhythm: textOrNull(s.rhythm),
      page: page(s.page, pageCount),
      position: i + 1
    }));
  return { jammer_name: textOrNull(data.jammer_name), jam_date: textOrNull(data.jam_date), location: textOrNull(data.location), songs };
}

export function validateZin(data, { documentCount, pageCounts = [] } = {}) {
  if (!data || !positiveInt(Number(data.volume_number)) || !Array.isArray(data.songs)) throw new AiAnswerError('invalidStructure');
  const source = (v) => {
    const s = positiveInt(v);
    return s && s <= documentCount ? s : null;
  };
  const songs = data.songs
    .filter((s) => s && textOrNull(s.name))
    .map((s) => {
      const liveSource = source(s.live_source);
      const oneSource = source(s.oneonone_source);
      const livePage = liveSource ? page(s.live_page, pageCounts[liveSource - 1]) : null;
      const onePage = oneSource ? page(s.oneonone_page, pageCounts[oneSource - 1]) : null;
      return {
        name: textOrNull(s.name),
        artist: textOrNull(s.artist),
        rhythm: textOrNull(s.rhythm),
        live_page: livePage,
        live_source: livePage ? liveSource : null,
        oneonone_page: onePage,
        oneonone_source: onePage ? oneSource : null
      };
    });
  return { volume_number: Number(data.volume_number), songs };
}
