import { useState, useEffect } from 'react'
import axios from 'axios'
import { IconFolderOpen, IconX, IconPlus, IconDeviceFloppy, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { meldeDatenGeaendert } from '../lib/events.js'
import { formatUsd } from '../lib/money.js'
import AiSettings from '../components/AiSettings.jsx'
import AiConfirmDialog from '../components/AiConfirmDialog.jsx'
import ImportPreview from '../components/ImportPreview.jsx'
import { t } from '../../shared/i18n.js'

// Ein Pfad-Feld mit „Durchsuchen“ (Windows-Ordnerdialog)
function PathField({ id, label, hint, value, onChange, onBrowse, onRemove, disabled, placeholder }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="path-field">
        <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
        <button type="button" onClick={onBrowse} disabled={disabled} title={t('sources.browseTitle')}>
          <IconFolderOpen size={16} stroke={1.6} /> {t('sources.browse')}
        </button>
        {onRemove && (
          <button type="button" className="icon-btn" onClick={onRemove} disabled={disabled} title={t('sources.remove')} aria-label={t('sources.remove')}>
            <IconX size={16} stroke={1.6} />
          </button>
        )}
      </div>
      {hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
    </div>
  )
}

export default function Settings() {
  const [jamRoots, setJamRoots] = useState([''])
  const [megamixRoot, setMegamixRoot] = useState('')
  const [zinVolumesMp3Root, setZinVolumesMp3Root] = useState('')
  const [zinVolumesChoreoRoot, setZinVolumesChoreoRoot] = useState('')
  const [zinVolumesVideoRoot, setZinVolumesVideoRoot] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [reimporting, setReimporting] = useState('')
  const [reimportMessage, setReimportMessage] = useState({ type: '', text: '' })
  // Offene Meldung „Jetzt wird die KI genutzt“: { kind, plan }
  const [pending, setPending] = useState(null)
  // Nach einem KI-Einlesen die KI-Karte neu laden (Kosten, Guthaben, „Nachfragen“)
  const [aiRefresh, setAiRefresh] = useState(0)

  // Windows-Ordnerdialog über den Hauptprozess; übernimmt den gewählten Ordner ins Feld
  const browse = async (current, apply) => {
    const chosen = await window.choreothek?.selectFolder(current)
    if (chosen) apply(chosen)
  }

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await axios.get('/api/settings')
        const roots = response.data.media_roots || []
        setJamRoots(roots.length ? roots : [''])
      } catch (error) {
        console.error('Fehler beim Laden der Jam-Session-Ordner:', error)
      }
      try {
        const response = await axios.get('/api/library-settings')
        setMegamixRoot(response.data.megamix_root || '')
        setZinVolumesMp3Root(response.data.zin_volumes_mp3_root || '')
        setZinVolumesChoreoRoot(response.data.zin_volumes_choreo_root || '')
        setZinVolumesVideoRoot(response.data.zin_volumes_video_root || '')
      } catch (error) {
        console.error('Fehler beim Laden der Datenquellen:', error)
      }
    }
    loadSettings()
  }, [])

  const setJamRoot = (idx, value) => setJamRoots((roots) => roots.map((r, i) => (i === idx ? value : r)))
  const removeJamRoot = (idx) => setJamRoots((roots) => (roots.length > 1 ? roots.filter((_, i) => i !== idx) : ['']))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage({ type: '', text: '' })

    const mediaRoots = jamRoots.map((r) => r.trim()).filter(Boolean)
    try {
      const response = await axios.post('/api/settings', { media_roots: mediaRoots })
      await axios.post('/api/library-settings', {
        megamix_root: megamixRoot.trim(),
        zin_volumes_mp3_root: zinVolumesMp3Root.trim(),
        zin_volumes_choreo_root: zinVolumesChoreoRoot.trim(),
        zin_volumes_video_root: zinVolumesVideoRoot.trim()
      })
      setMessage({
        type: 'success',
        text: t('sources.saved', { count: response.data.files_indexed })
      })
      meldeDatenGeaendert()
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || t('sources.saveError')
      })
    } finally {
      setSaving(false)
    }
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
      const { importedEditions, importedSongs, skippedEditions, updatedFolders, errors = [], aiCostUsd } = response.data
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
      if (body) setAiRefresh((n) => n + 1)
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
    <div className="page">
      <div className="page-inner">
        <form className="card" onSubmit={handleSubmit}>
          <div>
            <h2>{t('sources.foldersTitle')}</h2>
            <p className="hint">{t('sources.foldersHint')}</p>
          </div>

          {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}

          <div className="field">
            <span className="field-label">{t('sources.jamRoots')}</span>
            {jamRoots.map((root, idx) => (
              <PathField
                key={idx}
                id={`jam-root-${idx}`}
                value={root}
                onChange={(v) => setJamRoot(idx, v)}
                onBrowse={() => browse(root, (p) => setJamRoot(idx, p))}
                onRemove={jamRoots.length > 1 ? () => removeJamRoot(idx) : null}
                disabled={saving}
                placeholder={t('sources.jamRootPlaceholder')}
              />
            ))}
            <div>
              <button type="button" className="link" onClick={() => setJamRoots((roots) => [...roots, ''])} disabled={saving}>
                <IconPlus size={14} stroke={1.8} /> {t('sources.addJamRoot')}
              </button>
            </div>
          </div>

          <PathField
            id="megamix-root-input"
            label={t('sources.megamixRoot')}
            value={megamixRoot}
            onChange={setMegamixRoot}
            onBrowse={() => browse(megamixRoot, setMegamixRoot)}
            disabled={saving}
            placeholder={t('sources.megamixRootPlaceholder')}
          />

          <PathField
            id="zin-volumes-mp3-root-input"
            label={t('sources.zinMp3Root')}
            value={zinVolumesMp3Root}
            onChange={setZinVolumesMp3Root}
            onBrowse={() => browse(zinVolumesMp3Root, setZinVolumesMp3Root)}
            disabled={saving}
            placeholder={t('sources.zinMp3RootPlaceholder')}
          />

          <PathField
            id="zin-volumes-choreo-root-input"
            label={t('sources.zinChoreoRoot')}
            value={zinVolumesChoreoRoot}
            onChange={setZinVolumesChoreoRoot}
            onBrowse={() => browse(zinVolumesChoreoRoot, setZinVolumesChoreoRoot)}
            disabled={saving}
            placeholder={t('sources.zinChoreoRootPlaceholder')}
          />

          <PathField
            id="zin-volumes-video-root-input"
            label={t('sources.zinVideoRoot')}
            hint={t('sources.zinVideoRootHint')}
            value={zinVolumesVideoRoot}
            onChange={setZinVolumesVideoRoot}
            onBrowse={() => browse(zinVolumesVideoRoot || zinVolumesChoreoRoot, setZinVolumesVideoRoot)}
            disabled={saving}
            placeholder={t('sources.zinVideoRootPlaceholder')}
          />

          <div className="button-row">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? <span className="spinner" /> : <IconDeviceFloppy size={16} stroke={1.6} />}
              {saving ? t('sources.saving') : t('sources.save')}
            </button>
          </div>
        </form>

        <ImportPreview />

        <div className="card">
          <div>
            <h2>{t('sources.importTitle')}</h2>
            <p className="hint">{t('sources.importHint')}</p>
          </div>
          {reimportMessage.text && <div className={`alert ${reimportMessage.type}`}>{reimportMessage.text}</div>}
          <div className="button-row">
            {reimportButton('megamix', t('sources.importMegamix'))}
            {reimportButton('jam-sessions', t('sources.importJams'))}
            {reimportButton('zin-volumes', t('sources.importZin'))}
          </div>
        </div>

        <AiSettings key={aiRefresh} />
      </div>
      {pending && <AiConfirmDialog plan={pending.plan} onConfirm={confirmPending} onCancel={cancelPending} />}
    </div>
  )
}
