import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return client;
}

export async function extractZinVolumeSongs(pdfPaths) {
  const documentBlocks = pdfPaths.map((pdfPath) => ({
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: fs.readFileSync(pdfPath).toString('base64')
    }
  }));

  const documentList = pdfPaths.map((_, i) => `Dokument ${i + 1}`).join(', ');

  const message = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          ...documentBlocks,
          {
            type: 'text',
            text: `Du bist ein PDF-Parser für ZIN-Volume-Choreo-Notes (Zumba-Instructor-Trainingsmaterial). Dir liegen ${pdfPaths.length} PDF(s) vor (${documentList}).

Diese Choreo-Notes enthalten pro Song üblicherweise zwei Abschnitte:
- Einen "LIVE"-Abschnitt (volle Kursversion): beginnt mit einer Warm-up-Medley aus mehreren Songs in einem Track, gefolgt von den Kern-Songs, endet mit einem einzelnen Cooldown-Song.
- Einen "1ON1"-Abschnitt (Personal-Training-Kurzversion): nur die Kern-Songs, kein Warm-up und kein Cooldown.

Diese beiden Abschnitte können entweder hintereinander in einer gemeinsamen PDF stehen, oder auf zwei separate PDFs verteilt sein (in der Reihenfolge, in der sie dir hier übergeben wurden).

Extrahiere:
1. Die Volume-Nummer (steht z.B. als "ZIN 100" im Dokument).
2. Für jeden Kern-Song (NICHT die Warm-up-Medley, die mehrere Songnamen in einem Track kombiniert): Songname, Interpret ("ARTIST"), Rhythmus ("GENRE"), die Seitenzahl im LIVE-Abschnitt und die Seitenzahl im 1ON1-Abschnitt (falls vorhanden).
3. Den Cooldown-Song NUR mit LIVE-Seite (er hat normalerweise keinen 1ON1-Abschnitt).
4. Gib für jede Seitenzahl auch an, aus welchem der ${pdfPaths.length} Dokument(e) sie stammt (1-indiziert, "live_source"/"oneonone_source").

Gib das Ergebnis als JSON zurück (nichts anderes, nur valides JSON):
{
  "volume_number": 100,
  "songs": [
    {"name": "Songname", "artist": "Interpret", "rhythm": "Rhythmus", "live_page": 3, "live_source": 1, "oneonone_page": 14, "oneonone_source": 1},
    ...
  ]
}

Wenn ein Interpret oder Rhythmus nicht eindeutig bestimmbar ist, nutze null (nicht raten). Wenn ein Song keinen 1ON1-Abschnitt hat (z.B. Cooldown), nutze für "oneonone_page" und "oneonone_source" null.`
          }
        ]
      }
    ]
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  const responseText = textBlock ? textBlock.text : '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Konnte keine JSON in Claude-Response finden');
  }

  const data = JSON.parse(jsonMatch[0]);
  if (!data.volume_number || !data.songs || !Array.isArray(data.songs)) {
    throw new Error('Ungültige Datenstruktur von Claude');
  }

  return data;
}
