import { useState, useEffect } from 'react'
import axios from 'axios'
import { IconRefresh, IconSparkles } from '@tabler/icons-react'
import { meldeDatenGeaendert } from '../lib/events.js'
import { formatUsd } from '../lib/money.js'
import AiConfirmDialog from './AiConfirmDialog.jsx'
import Help from './Help.jsx'
import { t } from '../../shared/i18n.js'

// Karte „Einlesen“: MegaMix direkt, Jams/ZIN Volumes über die KI (Plan, Meldung, Fortschritt).
// onAiUsed wird nach jedem KI-Einlesen aufgerufen (KI-Karte zeigt dann neue Kosten).
export default function ImportCard({ onAiUsed }) {
  const [reimporting, setReimporting] = useState('')
  const [reimportMessage, setReimportMessage] = useState({ type: '', text: '' })
  // Offene Meldung „Jetzt wird die KI genutzt“: { kind, plan }
  const [pending, setPending] = useState(null)
  // Fortschritt eines laufenden KI-Einlesens (vom Server abgefragt): { done, total, current, cancelRequested }
  const [progress, setProgress] = useState(null)

  const aiRunning = reimporting === 'jam-sessions' || reimporting === 'zin-volumes'
  useEffect(() => {
    if (!aiRunning) {
      setProgress(null)
      return
    }
    const poll = async () => {
      try {
        setProgress((await axios.get('/api/import-progress')).data)
      } catch {
        // nächste Abfrage versucht es wieder
      }
    }
    const timer = setInterval(poll, 1000)
    poll()
    return () => clearInterval(timer)
  }, [aiRunning])

  const cancelImport = async () => {
    await axios.post('/api/import-cancel')
    setProgress((p) => (p ? { ...p, cancelRequested: true } : p))
  }

  // KI-Einlesen: erst Plan holen (was wird gesendet, was kostet es), dann ggf. Meldung zeigen
  const AI_KIND = { 'jam-sessions': 'jam', 'zin-volumes': 'zin' }

  const handleReimport = async (kind) => {
    if (!AI_KIND[kind]) return runReimport(kind)
    setReimporting(kind)
    setReimportMessage({ type: '', text: '' })
    try {
      const { data: plan } = await axios.post('/api/ai/plan', { kind: AI_KIND[kind] })
      if (plan.blocked) {
        setReimportMessage({ type: 'error', text: t(`errors.ai.${plan.blocked}`) })
        setReimporting('')
      } else if (plan.mustConfirm) {
        setPending({ kind, plan })
      } else {
        await runReimport(kind, { planId: plan.id })
      }
    } catch (error) {
      setReimportMessage({ type: 'error', text: error.response?.data?.error || t('sources.importError') })
      setReimporting('')
    }
  }

  const confirmPending = ({ dontAskAgain }) => {
    const { kind, plan } = pending
    setPending(null)
    runReimport(kind, { planId: plan.id, confirmed: true, dontAskAgain })
  }

  const cancelPending = () => {
    setPending(null)
    setReimporting('')
  }

  const runReimport = async (kind, body) => {
    setReimporting(kind)
    setReimportMessage({ type: '', text: '' })

    try {
      const response = await axios.post(`/api/reimport/${kind}`, body)
      const { importedEditions, importedSongs, skippedEditions, updatedFolders, errors = [], aiCostUsd, cancelled } = response.data
      setReimportMessage({
        type: errors.length ? 'error' : 'success',
        text:
          t(kind === 'jam-sessions' ? 'sources.importResultJams' : 'sources.importResultEditions', {
            imported: importedEditions,
            songs: importedSongs,
            skipped: skippedEditions
          }) +
          (updatedFolders ? t('sources.importFoldersAdded', { count: updatedFolders }) : '') +
          '.' +
          (aiCostUsd ? t('sources.importAiCost', { amount: formatUsd(aiCostUsd) }) : '') +
          (cancelled ? t('sources.importCancelled') : '') +
          (errors.length ? t('sources.importProblems', { list: errors.join(' | ') }) : '')
      })
      meldeDatenGeaendert()
    } catch (error) {
      setReimportMessage({
        type: 'error',
        text: error.response?.data?.error || t('sources.importError')
      })
    } finally {
      setReimporting('')
      if (body) onAiUsed?.()
    }
  }

  // Knöpfe, die die KI nutzen, tragen das Funken-Symbol
  const reimportButton = (kind, label) => (
    <button type="button" onClick={() => handleReimport(kind)} disabled={reimporting !== ''} title={AI_KIND[kind] ? t('sources.importUsesAi') : undefined}>
      {reimporting === kind ? <span className="spinner" /> : AI_KIND[kind] ? <IconSparkles size={16} stroke={1.6} /> : <IconRefresh size={16} stroke={1.6} />}
      {reimporting === kind ? t('sources.importing') : label}
    </button>
  )

  return (
    <>
      <div className="card">
        <div>
          <h2>
            {t('sources.importTitle')} <Help id="import.title" topic="einlesen" />
          </h2>
          <p className="hint">{t('sources.importHint')}</p>
        </div>
        {reimportMessage.text && <div className={`alert ${reimportMessage.type}`}>{reimportMessage.text}</div>}
        {aiRunning && !pending && (
          <div className="progress">
            <progress max={progress?.total || 1} value={progress?.done || 0} />
            <span className="muted">
              {progress?.cancelRequested
                ? t('sources.cancelling')
                : progress?.total
                  ? t('sources.progress', { done: progress.done, total: progress.total, current: progress.current || '' })
                  : t('sources.progressStart')}
            </span>
            <button type="button" onClick={cancelImport} disabled={Boolean(progress?.cancelRequested)}>
              {t('sources.cancel')}
            </button>
          </div>
        )}
        <div className="button-row">
          {reimportButton('megamix', t('sources.importMegamix'))}
          {reimportButton('jam-sessions', t('sources.importJams'))}
          {reimportButton('zin-volumes', t('sources.importZin'))}
        </div>
      </div>
      {pending && <AiConfirmDialog plan={pending.plan} onConfirm={confirmPending} onCancel={cancelPending} />}
    </>
  )
}
