// KI-Schicht: zentrale Sperre (Grundsatz 5), Plan, Sicherheitsnetz, Kostenprotokoll, Prüfung
// der Antworten. Anbieter sind Attrappen -- kein Netzverkehr, keine Kosten. Erfundene Daten.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { startServer } from '../src/server/server.js';
import { initDB, closeDB, aiCostsByMonth, getAllJams } from '../src/server/db.js';
import { setProviderOverride } from '../src/server/ai/providers.js';
import { extractWithAi, saveAiSettings, DEFAULT_AI_SETTINGS } from '../src/server/ai/aiService.js';
import { createPlan, redeemPlan, takeCall } from '../src/server/ai/gate.js';

let session;
let dataDir;
let jamRoot;
let pdfCounter = 0;
let calls = [];
let answer;

const fakeAnthropic = {
  id: 'anthropic',
  label: 'Attrappe',
  defaultModel: 'claude-sonnet-5',
  billingUrl: 'https://example.invalid/billing',
  keysUrl: 'https://example.invalid/keys',
  async testKey() {
    return 3;
  },
  async extract(args) {
    calls.push(args);
    return answer(args);
  }
};

const jamAnswer = (pages = 2) => ({
  text: JSON.stringify({
    jammer_name: 'Erika Beispiel',
    jam_date: '1. Juni 2025',
    location: 'Turnhalle Musterstadt',
    songs: [
      { name: 'Sonnenschein', artist: 'Die Testband', rhythm: 'Salsa', page: 1 },
      { name: 'Nachtzug', artist: null, rhythm: 'Cumbia', page: pages + 5 }
    ]
  }),
  inputTokens: 5000,
  outputTokens: 400
});

async function addJamPdf(pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  const folder = path.join(jamRoot, `Jam ${++pdfCounter}`);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `Choreo Notes ${pdfCounter}.pdf`);
  fs.writeFileSync(file, await doc.save());
  return file;
}

const headers = () => ({ 'Content-Type': 'application/json', 'X-Choreothek-Token': session.token });
const post = (p, body) => fetch(`${session.url}api/${p}`, { method: 'POST', headers: headers(), body: JSON.stringify(body || {}) });
const plan = async () => (await post('ai/plan', { kind: 'jam' })).json();

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'choreothek-ai-'));
  jamRoot = path.join(dataDir, 'Jams');
  fs.mkdirSync(jamRoot);
  session = await startServer({ dataDir });
  setProviderOverride({ anthropic: fakeAnthropic });
  assert.equal((await post('settings', { media_roots: [jamRoot] })).status, 200);
});

after(() => {
  setProviderOverride(null);
  session.server.close();
  closeDB();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  calls = [];
  answer = () => jamAnswer();
  await saveAiSettings({ ...DEFAULT_AI_SETTINGS });
});

test('ohne Erlaubnis kein KI-Aufruf', async () => {
  const file = await addJamPdf();
  await assert.rejects(extractWithAi(null, 'jam', [file]), { code: 'noPermit' });
  await assert.rejects(extractWithAi({ plan: {}, active: true, callsLeft: 5 }, 'jam', [file]), { code: 'noPermit' }, 'nachgebaute Erlaubnis zählt nicht');
  assert.equal(calls.length, 0);
});

test('Einlesen ohne Plan wird abgewiesen', async () => {
  for (const kind of ['jam-sessions', 'zin-volumes']) {
    const res = await post(`reimport/${kind}`, {});
    assert.equal(res.status, 409, kind);
    assert.equal((await res.json()).code, 'planInvalid');
  }
  assert.equal(calls.length, 0);
});

test('ohne Schlüssel bzw. ohne Datenschutz-Häkchen ist der Plan gesperrt', async () => {
  await addJamPdf();
  let p = await plan();
  assert.equal(p.blocked, 'noKey');
  let res = await post('reimport/jam-sessions', { planId: p.id, confirmed: true });
  assert.equal((await res.json()).code, 'noKey');

  await post('ai/key', { provider: 'anthropic', key: 'sk-test-geheim' });
  p = await plan();
  assert.equal(p.blocked, 'privacyAck');
  res = await post('reimport/jam-sessions', { planId: p.id, confirmed: true });
  assert.equal((await res.json()).code, 'privacyAck');
  assert.equal(calls.length, 0);
});

test('Schlüssel wird nie an die Oberfläche zurückgegeben', async () => {
  await post('ai/key', { provider: 'anthropic', key: 'sk-test-geheim' });
  const text = await (await fetch(`${session.url}api/ai/settings`)).text();
  assert.ok(!text.includes('sk-test-geheim'));
  assert.equal(JSON.parse(text).providers.find((p) => p.id === 'anthropic').hasKey, true);
});

test('Plan beschreibt, was gesendet wird; ohne Bestätigung kein Aufruf', async () => {
  await post('ai/settings', { privacyAck: true });
  const p = await plan();
  assert.equal(p.blocked, null);
  assert.ok(p.pdfCount >= 1 && p.pages >= 2);
  assert.ok(p.estimate.costUsd > 0);
  assert.ok(p.mustConfirm);
  assert.ok(p.reasons.includes('ask') && p.reasons.includes('firstUse'));
  assert.ok(p.items.every((i) => !('files' in i)), 'keine vollständigen Pfade an die Oberfläche');

  const res = await post('reimport/jam-sessions', { planId: p.id });
  assert.equal((await res.json()).code, 'confirmationRequired');
  assert.equal(calls.length, 0);
});

test('bestätigtes Einlesen: Aufruf, Jam gespeichert, Kosten protokolliert; Plan nur einmal gültig', async () => {
  await post('ai/settings', { privacyAck: true });
  const p = await plan();
  const before = (await getAllJams()).length;
  const res = await post('reimport/jam-sessions', { planId: p.id, confirmed: true });
  const result = await res.json();
  assert.equal(res.status, 200);
  assert.equal(calls.length, p.items.length);
  assert.equal(calls[0].apiKey, 'sk-test-geheim');
  assert.equal(calls[0].model, 'claude-sonnet-5');
  assert.equal(result.importedEditions, p.items.length);
  assert.equal((await getAllJams()).length, before + p.items.length);
  // 5000 Eingabe × 2 $ + 400 Ausgabe × 10 $ je Mio. = 0,014 $ je Aufruf
  assert.ok(Math.abs(result.aiCostUsd - 0.014 * p.items.length) < 1e-9);
  const [month] = await aiCostsByMonth();
  assert.ok(month.cost_usd > 0);

  const again = await post('reimport/jam-sessions', { planId: p.id, confirmed: true });
  assert.equal((await again.json()).code, 'planInvalid');
});

test('Seitenzahlen außerhalb der PDF werden verworfen', async () => {
  const jam = (await getAllJams()).at(-1);
  const conn = await initDB();
  assert.equal(conn.prepare('SELECT jammer_name FROM jams WHERE id = ?').get(jam.id).jammer_name, 'Erika Beispiel');
  const pages = conn.prepare('SELECT song_name, page FROM songs WHERE jam_id = ? ORDER BY position').all(jam.id);
  assert.deepEqual(pages, [
    { song_name: 'Sonnenschein', page: 1 },
    { song_name: 'Nachtzug', page: null }
  ]);
});

test('„Nicht mehr fragen“ gilt, bis das Sicherheitsnetz greift', async () => {
  await post('ai/settings', { privacyAck: true });
  await addJamPdf();
  let p = await plan();
  await post('reimport/jam-sessions', { planId: p.id, confirmed: true, dontAskAgain: true });

  await addJamPdf();
  p = await plan();
  assert.equal(p.mustConfirm, false, JSON.stringify(p.reasons));
  let res = await post('reimport/jam-sessions', { planId: p.id });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);

  // Kostengrenze
  await addJamPdf();
  await post('ai/settings', { costLimitUsd: 0 });
  p = await plan();
  assert.deepEqual(p.reasons, ['overLimit']);
  res = await post('reimport/jam-sessions', { planId: p.id });
  assert.equal((await res.json()).code, 'confirmationRequired');

  // Guthaben knapp
  await post('ai/settings', { costLimitUsd: 1 });
  await post('ai/balance', { provider: 'anthropic', amountUsd: 0.5 });
  p = await plan();
  assert.deepEqual(p.reasons, ['lowBalance']);
  assert.ok(p.balance.afterUsd < 0.5);

  // Modellwechsel
  await post('ai/balance', { provider: 'anthropic', amountUsd: null });
  await post('ai/settings', { model: 'claude-haiku-4-5' });
  p = await plan();
  assert.deepEqual(p.reasons, ['modelChanged']);
  assert.equal(calls.length, 2, 'keine weiteren Aufrufe ohne Bestätigung');
});

test('Erlaubnis reicht nur für so viele Aufrufe, wie der Plan Einträge hat', () => {
  const id = createPlan('jam', { items: [{ label: 'a', files: [] }], mustConfirm: false });
  const permit = redeemPlan(id, 'jam', { confirmed: false });
  takeCall(permit);
  assert.throws(() => takeCall(permit), { code: 'noCallsLeft' });
});

test('abgelehnter Schlüssel bricht den Stapel ab und wird protokolliert', async () => {
  await post('ai/settings', { privacyAck: true });
  await addJamPdf();
  await addJamPdf();
  answer = () => {
    throw Object.assign(new Error('invalid x-api-key'), { status: 401 });
  };
  const p = await plan();
  assert.ok(p.items.length >= 2);
  const result = await (await post('reimport/jam-sessions', { planId: p.id, confirmed: true })).json();
  assert.equal(calls.length, 1, 'nach 401 keine weiteren Aufrufe');
  assert.equal(result.importedEditions, 0);
  assert.match(result.errors[0], /Schlüssel wurde vom Anbieter abgelehnt/);
});

test('unbrauchbare Antwort: Fehler gemeldet, verbrauchte Tokens trotzdem gezählt', async () => {
  await post('ai/settings', { privacyAck: true });
  answer = () => ({ text: 'Tut mir leid, keine Daten.', inputTokens: 1000, outputTokens: 10 });
  const p = await plan();
  const result = await (await post('reimport/jam-sessions', { planId: p.id, confirmed: true })).json();
  assert.equal(result.importedEditions, 0);
  assert.match(result.errors[0], /unbrauchbar/);
  assert.ok(result.aiCostUsd > 0);
});

test('Schlüssel testen nutzt nur die Modellliste', async () => {
  const res = await post('ai/test-key', { provider: 'anthropic' });
  assert.deepEqual(await res.json(), { success: true, models: 3 });
  assert.equal(calls.length, 0);
});
