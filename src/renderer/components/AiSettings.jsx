import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { IconKey, IconTrash, IconPlugConnected, IconExternalLink, IconDeviceFloppy } from '@tabler/icons-react'
import { formatEur, formatDate } from '../lib/money.js'
import Help from './Help.jsx'
import { t } from '../../shared/i18n.js'

// Beträge in Eingabefeldern: Komma oder Punkt als Dezimaltrenner
const parseAmount = (text) => {
  const n = Number(String(text).replace(',', '.').trim())
  return text !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

// Bereich „KI“ in den Einstellungen: Anbieter, Modell, Schlüssel, Datenschutz, Nachfragen,
// Kostengrenze, Guthaben und Kostenübersicht. Schlüssel werden nur gesendet, nie angezeigt.
export default function AiSettings() {
  const [data, setData] = useState(null)
  const [costs, setCosts] = useState([])
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [limitInput, setLimitInput] = useState('')
  const [warnInput, setWarnInput] = useState('')
  const [balanceInput, setBalanceInput] = useState('')

  const load = useCallback(async () => {
    const [settings, costList] = await Promise.all([axios.get('/api/ai/settings'), axios.get('/api/ai/costs')])
    setData(settings.data)
    setCosts(costList.data.months)
    setLimitInput(String(settings.data.costLimitEur).replace('.', ','))
    setWarnInput(String(settings.data.balanceWarnEur).replace('.', ','))
  }, [])

  useEffect(() => {
    load().catch((error) => setMessage({ type: 'error', text: error.response?.data?.error || t('ai.loadError') }))
  }, [load])

  // Eine Aktion ausführen, Meldung zeigen, danach neu laden
  const run = async (name, action, successText) => {
    setBusy(name)
    setMessage({ type: '', text: '' })
    try {
      const result = await action()
      if (successText) setMessage({ type: 'success', text: typeof successText === 'function' ? successText(result) : successText })
      await load()
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('ai.saveError') })
    } finally {
      setBusy('')
    }
  }

  if (!data) {
    return (
      <div className="card">
        <h2>{t('ai.title')}</h2>
        {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}
      </div>
    )
  }

  const provider = data.providers.find((p) => p.id === data.provider)
  const save = (patch, successText) => run('settings', () => axios.post('/api/ai/settings', patch), successText)

  // Speichern und gleich (kostenlos) prüfen -- ein Schritt, damit kein geprüfter, aber
  // ungespeicherter Schlüssel zurückbleibt
  const saveKey = async () => {
    setBusy('key')
    setMessage({ type: '', text: '' })
    try {
      await axios.post('/api/ai/key', { provider: provider.id, key: keyInput })
      setKeyInput('')
      try {
        const res = await axios.post('/api/ai/test-key', { provider: provider.id })
        setMessage({ type: 'success', text: t('ai.keySavedValid', { count: res.data.models }) })
      } catch (error) {
        setMessage({ type: 'error', text: t('ai.keySavedInvalid', { error: error.response?.data?.error || t('ai.saveError') }) })
      }
      await load()
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('ai.saveError') })
    } finally {
      setBusy('')
    }
  }

  const testKey = () =>
    run('test', () => axios.post('/api/ai/test-key', { provider: provider.id }), (res) => t('ai.keyValid', { count: res.data.models }))

  const saveLimits = () => {
    const costLimitEur = parseAmount(limitInput)
    const balanceWarnEur = parseAmount(warnInput)
    if (costLimitEur === null || balanceWarnEur === null) {
      setMessage({ type: 'error', text: t('errors.ai.invalidAmount') })
      return
    }
    save({ costLimitEur, balanceWarnEur }, t('ai.saved'))
  }

  const saveBalance = () => {
    const amountEur = parseAmount(balanceInput)
    if (amountEur === null) {
      setMessage({ type: 'error', text: t('errors.ai.invalidAmount') })
      return
    }
    run('balance', () => axios.post('/api/ai/balance', { provider: provider.id, amountEur }), t('ai.balanceSaved')).then(() => setBalanceInput(''))
  }

  const providerLabel = (id) => data.providers.find((p) => p.id === id)?.label || id

  return (
    <div className="card">
      <div>
        <h2>{t('ai.title')}</h2>
        <p className="hint">{t('ai.hint')}</p>
      </div>

      {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}

      <div className="field-row">
        <div className="field">
          <label htmlFor="ai-provider">
            {t('ai.provider')} <Help id="ai.provider" topic="ki" />
          </label>
          <select id="ai-provider" value={data.provider} disabled={busy !== ''} onChange={(e) => save({ provider: e.target.value })}>
            {data.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.hasKey ? t('ai.providerWithKey', { provider: p.label }) : p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ai-model">
            {t('ai.model')} <Help id="ai.model" topic="ki" />
          </label>
          <select id="ai-model" value={provider.model} disabled={busy !== ''} onChange={(e) => save({ model: e.target.value })}>
            {provider.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ai-key">
          {t('ai.key')} <Help id="ai.key" topic="ki-schluessel" />
        </label>
        <div className="path-field">
          <input
            id="ai-key"
            type="password"
            autoComplete="off"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={provider.hasKey ? t('ai.keyStoredPlaceholder') : t('ai.keyPlaceholder')}
            disabled={busy !== ''}
          />
          <button type="button" onClick={saveKey} disabled={busy !== '' || !keyInput.trim()}>
            {busy === 'key' ? <span className="spinner" /> : <IconKey size={16} stroke={1.6} />} {t('ai.keySaveTest')}
          </button>
          <button type="button" onClick={testKey} disabled={busy !== '' || !provider.hasKey} title={t('ai.keyTestHint')}>
            {busy === 'test' ? <span className="spinner" /> : <IconPlugConnected size={16} stroke={1.6} />} {t('ai.keyTest')}
          </button>
          {provider.hasKey && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => run('delete', () => axios.delete(`/api/ai/key/${provider.id}`), t('ai.keyDeleted'))}
              disabled={busy !== ''}
              title={t('ai.keyDelete')}
              aria-label={t('ai.keyDelete')}
            >
              <IconTrash size={16} stroke={1.6} />
            </button>
          )}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {provider.hasKey ? t('ai.keyStored') : t('ai.keyMissing')}{' '}
          <a href={provider.keysUrl} target="_blank" rel="noreferrer">
            {t('ai.keyCreate')} <IconExternalLink size={12} stroke={1.8} />
          </a>
        </span>
      </div>

      <label className="check">
        <input type="checkbox" checked={provider.privacyAck} disabled={busy !== ''} onChange={(e) => save({ privacyAck: e.target.checked })} />
        <span>
          {t('ai.privacy', { provider: provider.label })}
          {provider.id === 'google' && <span className="muted"> {t('ai.privacyGoogle')}</span>} <Help id="ai.privacy" topic="ki" />
        </span>
      </label>

      <label className="check">
        <input type="checkbox" checked={data.askBeforeUse} disabled={busy !== ''} onChange={(e) => save({ askBeforeUse: e.target.checked })} />
        <span>
          {t('ai.askBeforeUse')} <Help id="ai.askBeforeUse" topic="kosten" />
        </span>
      </label>

      <div className="field-row">
        <div className="field">
          <label htmlFor="ai-limit">
            {t('ai.costLimit')} <Help id="ai.costLimit" topic="kosten" />
          </label>
          <input id="ai-limit" inputMode="decimal" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} disabled={busy !== ''} />
        </div>
        <div className="field">
          <label htmlFor="ai-warn">
            {t('ai.balanceWarn')} <Help id="ai.balanceWarn" topic="kosten" />
          </label>
          <input id="ai-warn" inputMode="decimal" value={warnInput} onChange={(e) => setWarnInput(e.target.value)} disabled={busy !== ''} />
        </div>
        <div className="field field-end">
          <button type="button" onClick={saveLimits} disabled={busy !== ''}>
            <IconDeviceFloppy size={16} stroke={1.6} /> {t('ai.save')}
          </button>
        </div>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        {t('ai.costLimitHint')}
      </span>

      <div className="field">
        <label htmlFor="ai-balance">
          {t('ai.balance', { provider: provider.label })} <Help id="ai.balance" topic="kosten" />
        </label>
        <div className="path-field">
          <input id="ai-balance" inputMode="decimal" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} placeholder={t('ai.balancePlaceholder')} disabled={busy !== ''} />
          <button type="button" onClick={saveBalance} disabled={busy !== '' || !balanceInput.trim()}>
            {t('ai.balanceSave')}
          </button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {provider.balance
            ? t('ai.balanceState', {
                amount: formatEur(provider.balance.amountEur),
                date: formatDate(provider.balance.since),
                spent: formatEur(provider.balance.spentEur),
                remaining: formatEur(provider.balance.remainingEur)
              })
            : t('ai.balanceNone')}{' '}
          <a href={provider.billingUrl} target="_blank" rel="noreferrer">
            {t('ai.billing')} <IconExternalLink size={12} stroke={1.8} />
          </a>
        </span>
      </div>

      <div className="field">
        <span className="field-label">
          {t('ai.costsTitle')} <Help id="ai.costs" topic="kosten" />
        </span>
        {costs.length === 0 ? (
          <span className="muted">{t('ai.costsNone')}</span>
        ) : (
          <table className="results cost-table">
            <thead>
              <tr>
                <th>{t('ai.costsMonth')}</th>
                <th>{t('ai.provider')}</th>
                <th>{t('ai.costsCalls')}</th>
                <th>{t('ai.costsAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => (
                <tr key={`${c.month}-${c.provider}`}>
                  <td>{c.month}</td>
                  <td>{providerLabel(c.provider)}</td>
                  <td>{c.calls}</td>
                  <td>{formatEur(c.cost_eur ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          {t('ai.costsHint', {
            date: formatDate(data.pricesAsOf),
            rate: data.usdPerEur.toLocaleString(t('meta.dateLocale'), { maximumFractionDigits: 4 }),
            rateDate: formatDate(data.rateAsOf)
          })}
        </span>
      </div>
    </div>
  )
}
