import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return client;
}

export async function extractJamData(pdfPath) {
  try {
    // Read PDF as base64
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64Pdf = pdfBuffer.toString('base64');

    // Call Claude with the PDF
    const message = await getClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Pdf
              }
            },
            {
              type: 'text',
              text: `Du bist ein PDF-Parser für Zumba Jam Sessions. Lies die folgende PDF und extrahiere:
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
    {"name": "Songname", "artist": "Interpret", "rhythm": "Rhythmus", "page": 1},
    ...
  ]
}

Wenn das Jam-Datum nicht vorhanden ist, nutze null. Wenn keine Location angegeben ist, nutze ebenfalls null. Wenn kein Interpret angegeben ist, nutze ebenfalls null. Wenn die Seitenzahl für einen Song nicht eindeutig bestimmbar ist, nutze ebenfalls null. Wenn der Rhythmus für einen Song nicht eindeutig bestimmbar ist, nutze ebenfalls null (nicht raten).`
            }
          ]
        }
      ]
    });

    // Extract JSON from response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON - try to find JSON in the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Konnte keine JSON in Claude-Response finden');
    }

    const data = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!data.jammer_name || !data.songs || !Array.isArray(data.songs)) {
      throw new Error('Ungültige Datenstruktur von Claude');
    }

    // Add position to songs
    data.songs = data.songs.map((song, index) => ({
      ...song,
      position: index + 1
    }));

    return data;
  } catch (error) {
    console.error('Fehler beim Extrahieren von PDF:', error);
    throw error;
  }
}
