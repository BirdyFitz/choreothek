// Preise je 1 Mio. Tokens in US-Dollar (Standardtarif, ohne Batch/Priority).
// Quellen, Stand 27.09.2026:
//   Anthropic: Modelltabelle der Claude-API-Referenz
//   OpenAI:    developers.openai.com/api/docs/pricing
//   Google:    ai.google.dev/gemini-api/docs/pricing (Gemini 3.8 Flash: Preis steigt am 01.01.2027)
// Die Anzeige in der App ist immer „geschätzt“; maßgeblich ist die Abrechnung des Anbieters.
export const PRICES_AS_OF = '2026-09-27';

const TABLE = {
  anthropic: {
    'claude-sonnet-5': [{ input: 2, output: 10 }],
    'claude-haiku-4-5': [{ input: 1, output: 5 }],
    'claude-opus-5': [{ input: 5, output: 25 }]
  },
  openai: {
    'gpt-6-astra': [{ input: 10, output: 50 }],
    'gpt-6-luna': [{ input: 0.1, output: 0.5 }]
  },
  google: {
    'gemini-3.8-flash': [
      { until: '2026-12-31', input: 0.75, output: 3.75 },
      { from: '2027-01-01', input: 1.5, output: 7.5 }
    ],
    'gemini-3.5-flash-lite': [{ input: 0.3, output: 2.5 }]
  }
};

export function priceFor(provider, model, date = new Date().toISOString().slice(0, 10)) {
  const entries = TABLE[provider]?.[model];
  if (!entries) return null;
  return entries.find((e) => (!e.from || date >= e.from) && (!e.until || date <= e.until)) || null;
}

// Kosten in US-Dollar oder null (Modell ohne bekannten Preis)
export function costUsd(provider, model, inputTokens, outputTokens, date) {
  const price = priceFor(provider, model, date);
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// Die App zeigt alle Beträge in Euro (Grenzen, Guthaben, Kosten). Die Preise oben und das Protokoll
// der Aufrufe bleiben in US-Dollar, wie die Anbieter sie nennen; umgerechnet wird mit einem festen Kurs.
// Google rechnet in Deutschland in Euro ab, Anthropic und OpenAI in Dollar.
// EZB-Referenzkurs vom 02.10.2026: 1 € = 1,1225 $.
export const USD_PER_EUR = 1.1225;
export const RATE_AS_OF = '2026-10-02';

export function usdToEur(usd) {
  return usd == null ? null : usd / USD_PER_EUR;
}

export function knownModels(provider) {
  return Object.keys(TABLE[provider] || {});
}
