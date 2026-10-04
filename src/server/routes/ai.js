// KI-Einstellungen, Schlüssel, Kosten und Plan vor dem Einlesen. Schlüssel gehen nur in den
// Server hinein, nie zurück zur Oberfläche (dort nur „vorhanden ja/nein“).
import express from 'express';
import { getProvider, providerIds } from '../ai/providers.js';
import { knownModels, PRICES_AS_OF, USD_PER_EUR, RATE_AS_OF, usdToEur } from '../ai/prices.js';
import { setApiKey, deleteApiKey, hasApiKey } from '../ai/secrets.js';
import { getAiSettings, saveAiSettings, modelFor, balanceInfo, buildPlan, testApiKey, isKnownProvider, AiError } from '../ai/aiService.js';
import { aiCostsByMonth } from '../db.js';
import { findJamCandidates } from '../importJamSessions.js';
import { findZinCandidates } from '../importZinVolumes.js';
import { t } from '../../shared/i18n.js';

const router = express.Router();

// Oberfläche bekommt Plan ohne vollständige Pfade der Dateien (nur Bezeichnungen)
function publicPlan(plan) {
  const { items, ...rest } = plan;
  return { ...rest, items: items.map((i) => ({ label: i.label, pdfs: i.files.length, pages: i.pages })) };
}

function sendAiError(res, error) {
  if (error instanceof AiError) return res.status(400).json({ error: t(`errors.ai.${error.code}`), code: error.code });
  console.error('KI-Fehler:', error);
  return res.status(500).json({ error: error.message });
}

const nonNegative = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

router.get('/ai/settings', async (req, res) => {
  try {
    const settings = await getAiSettings();
    const providers = [];
    for (const id of providerIds()) {
      const p = getProvider(id);
      providers.push({
        id,
        label: p.label,
        model: modelFor(settings, id),
        models: knownModels(id),
        hasKey: hasApiKey(id),
        privacyAck: Boolean(settings.privacyAck[id]),
        billingUrl: p.billingUrl,
        keysUrl: p.keysUrl,
        balance: await balanceInfo(settings, id)
      });
    }
    res.json({
      provider: settings.provider,
      askBeforeUse: settings.askBeforeUse,
      costLimitEur: settings.costLimitEur,
      balanceWarnEur: settings.balanceWarnEur,
      pricesAsOf: PRICES_AS_OF,
      usdPerEur: USD_PER_EUR,
      rateAsOf: RATE_AS_OF,
      providers
    });
  } catch (error) {
    sendAiError(res, error);
  }
});

router.post('/ai/settings', async (req, res) => {
  try {
    const settings = await getAiSettings();
    const patch = {};
    const { provider, model, privacyAck, askBeforeUse, costLimitEur, balanceWarnEur } = req.body;
    if (provider !== undefined) {
      if (!isKnownProvider(provider)) return res.status(400).json({ error: t('errors.ai.unknownProvider') });
      patch.provider = provider;
    }
    const target = patch.provider || settings.provider;
    if (model !== undefined) {
      if (!knownModels(target).includes(model)) return res.status(400).json({ error: t('errors.ai.unknownModel') });
      patch.models = { ...settings.models, [target]: model };
    }
    if (privacyAck !== undefined) {
      patch.privacyAck = { ...settings.privacyAck, [target]: privacyAck ? new Date().toISOString() : null };
    }
    if (askBeforeUse !== undefined) patch.askBeforeUse = Boolean(askBeforeUse);
    if (costLimitEur !== undefined) {
      if (nonNegative(costLimitEur) === null) return res.status(400).json({ error: t('errors.ai.invalidAmount') });
      patch.costLimitEur = costLimitEur;
    }
    if (balanceWarnEur !== undefined) {
      if (nonNegative(balanceWarnEur) === null) return res.status(400).json({ error: t('errors.ai.invalidAmount') });
      patch.balanceWarnEur = balanceWarnEur;
    }
    await saveAiSettings(patch);
    res.json({ success: true });
  } catch (error) {
    sendAiError(res, error);
  }
});

router.post('/ai/key', (req, res) => {
  const { provider, key } = req.body;
  if (!isKnownProvider(provider)) return res.status(400).json({ error: t('errors.ai.unknownProvider') });
  const clean = typeof key === 'string' ? key.trim() : '';
  if (!clean) return res.status(400).json({ error: t('errors.ai.noKey') });
  setApiKey(provider, clean);
  res.json({ success: true });
});

router.delete('/ai/key/:provider', (req, res) => {
  if (!isKnownProvider(req.params.provider)) return res.status(400).json({ error: t('errors.ai.unknownProvider') });
  deleteApiKey(req.params.provider);
  res.json({ success: true });
});

// Kostenlos: fragt nur die Modellliste des Anbieters ab
router.post('/ai/test-key', async (req, res) => {
  try {
    const { provider, key } = req.body;
    if (!isKnownProvider(provider)) return res.status(400).json({ error: t('errors.ai.unknownProvider') });
    const models = await testApiKey(provider, typeof key === 'string' ? key.trim() : undefined);
    res.json({ success: true, models });
  } catch (error) {
    sendAiError(res, error);
  }
});

// Guthaben selbst eintragen („aufgeladen: 5 €“) -- ab jetzt werden die Kosten abgezogen
router.post('/ai/balance', async (req, res) => {
  try {
    const { provider, amountEur } = req.body;
    if (!isKnownProvider(provider)) return res.status(400).json({ error: t('errors.ai.unknownProvider') });
    const settings = await getAiSettings();
    const balances = { ...settings.balances };
    if (amountEur === null) delete balances[provider];
    else if (nonNegative(amountEur) === null) return res.status(400).json({ error: t('errors.ai.invalidAmount') });
    else balances[provider] = { amountEur, since: new Date().toISOString() };
    await saveAiSettings({ balances });
    res.json({ success: true });
  } catch (error) {
    sendAiError(res, error);
  }
});

router.get('/ai/costs', async (req, res) => {
  try {
    // Protokoll in US-Dollar, Anzeige in Euro
    const months = (await aiCostsByMonth()).map(({ cost_usd, ...m }) => ({ ...m, cost_eur: usdToEur(cost_usd) }));
    res.json({ pricesAsOf: PRICES_AS_OF, months });
  } catch (error) {
    sendAiError(res, error);
  }
});

// Plan vor dem Einlesen: was würde gesendet, was kostet es voraussichtlich, muss gefragt werden?
router.post('/ai/plan', async (req, res) => {
  try {
    const { kind } = req.body;
    let items;
    if (kind === 'jam') items = await findJamCandidates();
    else if (kind === 'zin') items = await findZinCandidates();
    else return res.status(400).json({ error: t('errors.ai.unknownKind') });
    res.json(publicPlan(await buildPlan(kind, items)));
  } catch (error) {
    sendAiError(res, error);
  }
});

export default router;
