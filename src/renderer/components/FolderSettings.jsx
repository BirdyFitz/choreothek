import { useState, useEffect } from 'react'
import axios from 'axios'
import { IconFolderOpen, IconX, IconPlus, IconDeviceFloppy } from '@tabler/icons-react'
import { meldeDatenGeaendert } from '../lib/events.js'
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

// Karte „Ordner“: Jam-Ordner, MegaMix, ZIN Volumes (Musik, Choreo Notes, Videos).
// onSaved wird nach erfolgreichem Speichern aufgerufen (z. B. „weiter“ im Assistenten).
export default function FolderSettings({ onSaved, saveLabel }) {
  const [jamRoots, setJamRoots] = useState([''])
  const [megamixRoot, setMegamixRoot] = useState('')
  const [zinVolumesMp3Root, setZinVolumesMp3Root] = useState('')
  const [zinVolumesChoreoRoot, setZinVolumesChoreoRoot] = useState('')
  const [zinVolumesVideoRoot, setZinVolumesVideoRoot] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
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
      onSaved?.()
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || t('sources.saveError')
      })
    } finally {
      setSaving(false)
    }
  }

  return (
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
          {saving ? t('sources.saving') : saveLabel || t('sources.save')}
        </button>
      </div>
    </form>
  )
}
