// KI-Anbieter mit gleicher Schnittstelle:
//   extract({ apiKey, model, pdfs: [{ name, base64 }], prompt }) -> { text, inputTokens, outputTokens }
//   testKey(apiKey) -> Anzahl Modelle (kostenlos: nur die Modellliste wird abgefragt)
// Aufrufformen nach der Dokumentation der Anbieter bzw. den SDK-Typen (Stand 27.09.2026).
// Vorbelegte Modelle nach dem Vergleichstest vom 27.09.2026 (docs/ki-vergleich.md).
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

export class ProviderError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.code = code;
  }
}

const anthropic = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  defaultModel: 'claude-sonnet-5',
  billingUrl: 'https://platform.claude.com/settings/billing',
  keysUrl: 'https://platform.claude.com/settings/keys',
  async testKey(apiKey) {
    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const page = await client.models.list();
    return page.data.length;
  },
  async extract({ apiKey, model, pdfs, prompt }) {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: [
            ...pdfs.map((p) => ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.base64 } })),
            { type: 'text', text: prompt }
          ]
        }
      ]
    });
    if (message.stop_reason === 'refusal') throw new ProviderError('refusal');
    // Antworttext steht in den text-Blöcken (davor können thinking-Blöcke stehen)
    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return { text, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
  }
};

const openai = {
  id: 'openai',
  label: 'OpenAI (ChatGPT)',
  defaultModel: 'gpt-6-luna',
  billingUrl: 'https://platform.openai.com/settings/organization/billing/overview',
  keysUrl: 'https://platform.openai.com/api-keys',
  async testKey(apiKey) {
    const client = new OpenAI({ apiKey, maxRetries: 0 });
    const page = await client.models.list();
    return page.data.length;
  },
  async extract({ apiKey, model, pdfs, prompt }) {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'user',
          content: [
            ...pdfs.map((p) => ({ type: 'input_file', filename: p.name, file_data: `data:application/pdf;base64,${p.base64}` })),
            { type: 'input_text', text: prompt }
          ]
        }
      ]
    });
    return { text: response.output_text, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
  }
};

const google = {
  id: 'google',
  label: 'Google (Gemini)',
  defaultModel: 'gemini-3.8-flash',
  billingUrl: 'https://aistudio.google.com/usage',
  keysUrl: 'https://aistudio.google.com/apikey',
  async testKey(apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    const pager = await ai.models.list();
    return pager.page.length;
  },
  async extract({ apiKey, model, pdfs, prompt }) {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model,
      input: [{ type: 'text', text: prompt }, ...pdfs.map((p) => ({ type: 'document', data: p.base64, mime_type: 'application/pdf' }))]
    });
    const usage = interaction.usage || {};
    // Denk-Tokens werden als Ausgabe abgerechnet
    return {
      text: interaction.output_text,
      inputTokens: usage.total_input_tokens ?? 0,
      outputTokens: (usage.total_output_tokens ?? 0) + (usage.total_thought_tokens ?? 0)
    };
  }
};

const REAL = { anthropic, openai, google };
let override = null;

export function getProvider(id) {
  const provider = (override && override[id]) || REAL[id];
  if (!provider) throw new ProviderError('unknownProvider', id);
  return provider;
}

export function providerIds() {
  return Object.keys(REAL);
}

// Nur für Tests: Anbieter durch Attrappen ersetzen (kein Netzverkehr, keine Kosten)
export function setProviderOverride(map) {
  override = map;
}
