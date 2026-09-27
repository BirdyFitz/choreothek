import { useState, useEffect } from 'react'
import axios from 'axios'
import { IconFolderOpen, IconX, IconPlus, IconDeviceFloppy, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { meldeDatenGeaendert } from '../lib/events.js'

// Ein Pfad-Feld mit „Durchsuchen“ (Windows-Ordnerdialog)
function PathField({ id, label, hint, value, onChange, onBrowse, onRemove, disabled, placeholder }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="path-field">
        <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
        <button type="button" onClick={onBrowse} disabled={disabled} title="Ordner auswählen">
          <IconFolderOpen size={16} stroke={1.6} /> Durchsuchen
        </button>
        {onRemove && (
          <button type="button" className="icon-btn" onClick={onRemove} disabled={disabled} title="Ordner entfernen" aria-label="Ordner entfernen">
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
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [reimporting, setReimporting] = useState('')
  const [reimportMessage, setReimportMessage] = useState({ type: '', text: '' })

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
        zin_volumes_choreo_root: zinVolumesChoreoRoot.trim()
      })
      setMessage({
        type: 'success',
        text: `Gespeichert. In den Jam-Session-Ordnern ${response.data.files_indexed} Dateien gefunden.`
      })
      meldeDatenGeaendert()
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fehler beim Speichern'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReimport = async (kind) => {
    setReimporting(kind)
    setReimportMessage({ type: '', text: '' })

    try {
      const response = await axios.post(`/api/reimport/${kind}`)
      const { importedEditions, importedSongs, skippedEditions, updatedFolders, errors = [] } = response.data
      const was = kind === 'jam-sessions' ? 'Jam(s)' : 'Edition(en)'
      setReimportMessage({
        type: errors.length ? 'error' : 'success',
        text: `${importedEditions} neue ${was} mit ${importedSongs} Songs eingelesen, ${skippedEditions} übersprungen${updatedFolders ? `, bei ${updatedFolders} fehlende Ordner nachgetragen` : ''}.${errors.length ? ` Probleme: ${errors.join(' | ')}` : ''}`
      })
      meldeDatenGeaendert()
    } catch (error) {
      setReimportMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fehler beim Einlesen'
      })
    } finally {
      setReimporting('')
    }
  }

  // locked: nutzt die KI -- gesperrt, bis die KI-Schicht mit Bestätigungsmeldung fertig ist
  const reimportButton = (kind, label, locked = false) => (
    <button type="button" onClick={() => handleReimport(kind)} disabled={locked || reimporting !== ''} title={locked ? 'Nutzt die KI – folgt in einer späteren Version' : undefined}>
      {reimporting === kind ? <span className="spinner" /> : locked ? <IconSparkles size={16} stroke={1.6} /> : <IconRefresh size={16} stroke={1.6} />}
      {reimporting === kind ? 'Lese ein …' : label}
    </button>
  )

  return (
    <div className="page">
      <div className="page-inner">
        <form className="card" onSubmit={handleSubmit}>
          <div>
            <h2>Ordner</h2>
            <p className="hint">Ordner auf deinem PC, aus denen Choreothek Songs einliest und Musik, Videos und Choreo Notes zuordnet.</p>
          </div>

          {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}

          <div className="field">
            <span className="field-label">Jam Sessions (inkl. Unterordner, je Jam ein Ordner mit PDF, Musik und Videos)</span>
            {jamRoots.map((root, idx) => (
              <PathField
                key={idx}
                id={`jam-root-${idx}`}
                value={root}
                onChange={(v) => setJamRoot(idx, v)}
                onBrowse={() => browse(root, (p) => setJamRoot(idx, p))}
                onRemove={jamRoots.length > 1 ? () => removeJamRoot(idx) : null}
                disabled={saving}
                placeholder={String.raw`z. B. D:\Zumba\Jam Sessions`}
              />
            ))}
            <div>
              <button type="button" className="link" onClick={() => setJamRoots((roots) => [...roots, ''])} disabled={saving}>
                <IconPlus size={14} stroke={1.8} /> weiteren Jam-Session-Ordner
              </button>
            </div>
          </div>

          <PathField
            id="megamix-root-input"
            label="MegaMix (MP3s)"
            value={megamixRoot}
            onChange={setMegamixRoot}
            onBrowse={() => browse(megamixRoot, setMegamixRoot)}
            disabled={saving}
            placeholder={String.raw`z. B. D:\Zumba\Musik\MegaMix`}
          />

          <PathField
            id="zin-volumes-mp3-root-input"
            label="ZIN Volumes – Musik"
            value={zinVolumesMp3Root}
            onChange={setZinVolumesMp3Root}
            onBrowse={() => browse(zinVolumesMp3Root, setZinVolumesMp3Root)}
            disabled={saving}
            placeholder={String.raw`z. B. D:\Zumba\Musik\ZIN Volumes`}
          />

          <PathField
            id="zin-volumes-choreo-root-input"
            label="ZIN Volumes – Choreo Notes (PDFs)"
            hint="Die Videos der ZIN Volumes werden im Ordner darüber gesucht."
            value={zinVolumesChoreoRoot}
            onChange={setZinVolumesChoreoRoot}
            onBrowse={() => browse(zinVolumesChoreoRoot, setZinVolumesChoreoRoot)}
            disabled={saving}
            placeholder={String.raw`z. B. D:\Zumba\ZIN Volumes\Choreo Notes`}
          />

          <div className="button-row">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? <span className="spinner" /> : <IconDeviceFloppy size={16} stroke={1.6} />}
              {saving ? 'Speichere …' : 'Speichern'}
            </button>
          </div>
        </form>

        <div className="card">
          <div>
            <h2>Einlesen</h2>
            <p className="hint">
              Liest neue Jams bzw. Editionen aus den gespeicherten Ordnern ein und trägt fehlende Ordner nach. Bereits eingelesene werden
              übersprungen.
            </p>
          </div>
          {reimportMessage.text && <div className={`alert ${reimportMessage.type}`}>{reimportMessage.text}</div>}
          <div className="button-row">
            {reimportButton('megamix', 'MegaMixe einlesen')}
            {reimportButton('jam-sessions', 'Jam Sessions einlesen', true)}
            {reimportButton('zin-volumes', 'ZIN Volumes einlesen', true)}
          </div>
        </div>
      </div>
    </div>
  )
}
