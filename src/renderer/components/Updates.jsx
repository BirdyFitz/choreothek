import { useState, useEffect } from 'react'
import axios from 'axios'
import { IconRefresh, IconDownload, IconX } from '@tabler/icons-react'
import Help from './Help.jsx'
import { t } from '../../shared/i18n.js'

const bridge = () => window.choreothek

// Hinweisleiste: neue Version verfügbar -> auf Wunsch herunterladen -> neu starten und installieren
export function UpdateBar() {
  const [state, setState] = useState(null) // { version, phase: 'available' | 'downloading' | 'ready' | 'error', percent, message }

  useEffect(() => {
    const b = bridge()
    if (!b?.onUpdate) return
    const offs = [
      b.onUpdate('available', (info) => setState({ version: info.version, phase: 'available' })),
      b.onUpdate('progress', (p) => setState((s) => (s ? { ...s, phase: 'downloading', percent: p.percent } : s))),
      b.onUpdate('downloaded', () => setState((s) => (s ? { ...s, phase: 'ready' } : s))),
      b.onUpdate('error', (e) => setState((s) => (s ? { ...s, phase: 'error', message: e.message } : s)))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  if (!state) return null
  return (
    <div className="reminder-bar update-bar" role="status">
      <IconDownload size={16} stroke={1.6} />
      <span>
        {state.phase === 'available' && t('updates.available', { version: state.version })}
        {state.phase === 'downloading' && t('updates.downloading', { percent: state.percent ?? 0 })}
        {state.phase === 'ready' && t('updates.ready', { version: state.version })}
        {state.phase === 'error' && t('updates.error', { message: state.message })}
      </span>
      {state.phase === 'available' && (
        <button
          type="button"
          className="primary"
          onClick={() => {
            setState({ ...state, phase: 'downloading', percent: 0 })
            bridge().downloadUpdate()
          }}
        >
          {t('updates.install')}
        </button>
      )}
      {state.phase === 'ready' && (
        <button type="button" className="primary" onClick={() => bridge().installUpdate()}>
          {t('updates.restart')}
        </button>
      )}
      {state.phase !== 'downloading' && (
        <button type="button" className="icon-btn" onClick={() => setState(null)} title={t('backup.dueLater')} aria-label={t('backup.dueLater')}>
          <IconX size={16} stroke={1.6} />
        </button>
      )}
    </div>
  )
}

// Bereich „Updates“ in den Einstellungen
export default function UpdatesCard() {
  const [prerelease, setPrerelease] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    axios.get('/api/updates/settings').then((res) => setPrerelease(res.data.prerelease)).catch(() => {})
  }, [])

  const check = async () => {
    setBusy(true)
    setResult(null)
    try {
      setResult(bridge()?.checkUpdate ? await bridge().checkUpdate() : { status: 'dev', current: (await axios.get('/api/about')).data.version })
    } finally {
      setBusy(false)
    }
  }

  const togglePrerelease = async (on) => {
    setPrerelease(on)
    await axios.post('/api/updates/settings', { prerelease: on })
  }

  return (
    <div className="card">
      <div>
        <h2>
          {t('updates.title')} <Help id="updates.title" topic="updates" />
        </h2>
        <p className="hint">{t('updates.hint')}</p>
      </div>
      {result && (
        <div className={`alert ${result.status === 'error' ? 'error' : result.status === 'available' ? 'warning' : 'success'}`}>
          {t(`updates.result.${result.status}`, { current: result.current || '', version: result.version || '', message: result.message || '' })}
        </div>
      )}
      <div className="button-row">
        <button type="button" onClick={check} disabled={busy}>
          {busy ? <span className="spinner" /> : <IconRefresh size={16} stroke={1.6} />} {t('updates.check')}
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={prerelease} onChange={(e) => togglePrerelease(e.target.checked)} />
        <span>
          {t('updates.prerelease')} <Help id="updates.prerelease" topic="updates" />
        </span>
      </label>
    </div>
  )
}
