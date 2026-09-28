// KI-Schicht für das Einlesen: Einstellungen, Kostenplan vor dem Senden und der eigentliche
// Aufruf. Jeder Aufruf läuft über eine Erlaubnis aus gate.js (Grundsatz 5).
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { getSetting, setSetting, logAiCall, aiAverages, aiSpentSince } from '../db.js';
import { getProvider, providerIds, ProviderError } from './providers.js';
import { costUsd, knownModels } from './prices.js';
import { getApiKey, hasApiKey } from './secrets.js';
import { createPlan, takeCall, GateError } from './gate.js';
import { jamPrompt, zinPrompt, parseJsonAnswer, validateJam, validateZin, AiAnswerError } from './prompts.js';

const SETTINGS_KEY = 'ai_settings';

// Schätzwerte, solange noch keine eigenen Aufrufe gemessen sind
const DEFAULT_INPUT_PER_PAGE = 2500;
const DEFAULT_OUTPUT_PER_CALL = 1500;
const PROMPT_TOKENS = 1000;
const UNKNOWN_PAGES = 10;

export const DEFAULT_AI_SETTINGS = {
  provider: 'anthropic',
  models: {},
  privacyAck: {},
  askBeforeUse: true,
  costLimitUsd: 1,
  balances: {},
  balanceWarnUsd: 2,
  lastConfirmed: null
};

export class AiError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.code = code;
  }
}

export async function getAiSettings() {
  const raw = await getSetting(SETTINGS_KEY);
  return { ...DEFAULT_AI_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
}

export async function saveAiSettings(patch) {
  const settings = { ...(await getAiSettings()), ...patch };
  await setSetting(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export function modelFor(settings, provider) {
  const chosen = settings.models[provider];
  return chosen && knownModels(provider).includes(chosen) ? chosen : getProvider(provider).defaultModel;
}

async function pageCount(file) {
  try {
    const doc = await PDFDocument.load(await fs.promises.readFile(file), { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return null;
  }
}

// Geschätztes Restguthaben: selbst eingetragenes Guthaben minus seitdem protokollierte Kosten
export async function balanceInfo(settings, provider) {
  const balance = settings.balances[provider];
  if (!balance) return null;
  const spent = await aiSpentSince(provider, balance.since);
  return { amountUsd: balance.amountUsd, since: balance.since, spentUsd: spent, remainingUsd: balance.amountUsd - spent };
}

// Plan für einen Einlese-Vorgang. items: [{ label, files: [pdfPfade], ... }] -- was genau
// gesendet würde. Ergebnis enthält Schätzung, Gründe für die Meldung und ggf. eine Sperre.
// target: { type, id } beim Neu-Auslesen eines einzelnen Eintrags (Plan gilt nur dafür).
export async function buildPlan(kind, items, { target = null } = {}) {
  const settings = await getAiSettings();
  const provider = settings.provider;
  const model = modelFor(settings, provider);

  const measured = await aiAverages(provider, kind);
  const inputPerPage = measured?.input_per_page || DEFAULT_INPUT_PER_PAGE;
  const outputPerCall = measured?.output_per_call || DEFAULT_OUTPUT_PER_CALL;

  let pages = 0;
  let pdfCount = 0;
  let inputTokens = 0;
  const planItems = [];
  for (const item of items) {
    let itemPages = 0;
    for (const file of item.files) {
      itemPages += (await pageCount(file)) ?? UNKNOWN_PAGES;
      pdfCount++;
    }
    pages += itemPages;
    inputTokens += Math.round(itemPages * inputPerPage) + PROMPT_TOKENS;
    planItems.push({ ...item, pages: itemPages });
  }
  const outputTokens = Math.round(outputPerCall * items.length);
  const estimateUsd = items.length ? costUsd(provider, model, inputTokens, outputTokens) : 0;

  const balance = await balanceInfo(settings, provider);
  const afterUsd = balance && estimateUsd != null ? balance.remainingUsd - estimateUsd : null;

  const reasons = [];
  let blocked = null;
  if (items.length) {
    if (!hasApiKey(provider)) blocked = 'noKey';
    else if (!settings.privacyAck[provider]) blocked = 'privacyAck';
    if (settings.askBeforeUse) reasons.push('ask');
    if (estimateUsd == null) reasons.push('unknownPrice');
    else if (estimateUsd > settings.costLimitUsd) reasons.push('overLimit');
    if (afterUsd != null && afterUsd < settings.balanceWarnUsd) reasons.push('lowBalance');
    const last = settings.lastConfirmed;
    if (!last) reasons.push('firstUse');
    else if (last.provider !== provider || last.model !== model) reasons.push('modelChanged');
  }

  const details = {
    kind,
    target,
    provider,
    providerLabel: getProvider(provider).label,
    model,
    items: planItems,
    pdfCount,
    pages,
    estimate: { inputTokens, outputTokens, costUsd: estimateUsd, measured: Boolean(measured?.input_per_page) },
    balance: balance ? { ...balance, afterUsd } : null,
    costLimitUsd: settings.costLimitUsd,
    reasons,
    mustConfirm: reasons.length > 0,
    blocked
  };
  const id = createPlan(kind, details);
  return { id, ...details };
}

// Nach dem Einlösen: Bestätigung merken (Wechsel von Anbieter/Modell erkennen), ggf. „nicht mehr fragen“
export async function rememberConfirmation(permit, { confirmed, dontAskAgain }) {
  if (!confirmed || !permit.plan.items.length) return;
  const patch = { lastConfirmed: { provider: permit.plan.provider, model: permit.plan.model } };
  if (dontAskAgain) patch.askBeforeUse = false;
  await saveAiSettings(patch);
}

// Fehler der Anbieter in eigene Codes übersetzen (Texte: errors.ai.<code>)
export function aiErrorCode(error) {
  if (error instanceof AiError || error instanceof GateError || error instanceof ProviderError) return error.code;
  if (error instanceof AiAnswerError) return 'invalidAnswer';
  const status = error?.status;
  const text = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
  if (/credit|quota|billing|balance|insufficient/.test(text) || status === 402) return 'noCredit';
  if (status === 401 || status === 403) return 'keyInvalid';
  if (status === 404) return 'modelNotFound';
  if (status === 429) return 'rateLimit';
  if (status === 413) return 'tooLarge';
  if (typeof status === 'number' && status >= 500) return 'providerDown';
  if (!status || /fetch|network|econn|enotfound|timeout/.test(text)) return 'network';
  return 'unknown';
}

// Diese Fehler betreffen alle weiteren Aufrufe -- Stapel abbrechen statt jede PDF einzeln scheitern lassen
export function isFatalAiError(code) {
  return ['noKey', 'keyInvalid', 'noCredit', 'modelNotFound', 'noPermit', 'noCallsLeft'].includes(code);
}

// Ein KI-Aufruf: PDFs + Anweisung -> geprüfte Daten. Nur mit Erlaubnis; jeder Aufruf wird
// mit Tokens und geschätzten Kosten protokolliert (auch fehlgeschlagene).
export async function extractWithAi(permit, kind, pdfPaths) {
  takeCall(permit);
  const { provider: providerId, model } = permit.plan;
  const provider = getProvider(providerId);
  const apiKey = getApiKey(providerId);
  const files = pdfPaths.map((p) => path.basename(p)).join(', ');
  const pageCounts = await Promise.all(pdfPaths.map(pageCount));
  const pages = pageCounts.reduce((sum, n) => sum + (n || 0), 0);

  let usage = null;
  try {
    if (!apiKey) throw new AiError('noKey');
    const pdfs = pdfPaths.map((p) => ({ name: path.basename(p), base64: fs.readFileSync(p).toString('base64') }));
    const prompt = kind === 'jam' ? jamPrompt() : zinPrompt(pdfPaths.length);
    usage = await provider.extract({ apiKey, model, pdfs, prompt });
    const cost = costUsd(providerId, model, usage.inputTokens, usage.outputTokens);
    permit.costUsd += cost || 0;
    const data = parseJsonAnswer(usage.text);
    const result =
      kind === 'jam'
        ? validateJam(data, { pageCount: pageCounts[0] })
        : validateZin(data, { documentCount: pdfPaths.length, pageCounts });
    await logAiCall({ provider: providerId, model, kind, files, pages, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: cost, ok: true });
    return result;
  } catch (error) {
    const code = aiErrorCode(error);
    // Auch eine unbrauchbare Antwort hat Tokens verbraucht
    await logAiCall({
      provider: providerId,
      model,
      kind,
      files,
      pages,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      costUsd: usage ? costUsd(providerId, model, usage.inputTokens, usage.outputTokens) : null,
      ok: false,
      error: code
    });
    throw new AiError(code, error.message);
  }
}

// „Schlüssel testen“: fragt nur die kostenlose Modellliste ab
export async function testApiKey(providerId, key) {
  const apiKey = key || getApiKey(providerId);
  if (!apiKey) throw new AiError('noKey');
  try {
    return await getProvider(providerId).testKey(apiKey);
  } catch (error) {
    throw new AiError(aiErrorCode(error), error.message);
  }
}

export function isKnownProvider(id) {
  return providerIds().includes(id);
}
