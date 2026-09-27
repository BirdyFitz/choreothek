import { useState, useEffect } from 'react'
import axios from 'axios'

// Ein Pfad-Feld mit 📁-Knopf für den Ordner-Browser
function PathField({ id, label, value, onChange, onBrowse, onRemove, disabled, placeholder }) {
  return (
    <div className="form-group">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="path-field">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button type="button" className="secondary" onClick={onBrowse} disabled={disabled} title="Ordner auswählen">
          📁 Durchsuchen
        </button>
        {onRemove && (
          <button type="button" className="secondary" onClick={onRemove} disabled={disabled} title="Ordner entfernen">
            ✕
          </button>
        )}
      </div>
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
        text: `✓ Gespeichert. In den Jam-Session-Ordnern ${response.data.files_indexed} Dateien gefunden.`
      })
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
        text: `✓ ${importedEditions} neue ${was} mit ${importedSongs} Songs importiert, ${skippedEditions} übersprungen${updatedFolders ? `, bei ${updatedFolders} fehlende Ordner nachgetragen` : ''}.${errors.length ? ` Probleme: ${errors.join(' | ')}` : ''}`
      })
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
  const reimportButton = (kind, label, title, locked = false) => (
    <button type="button" onClick={() => handleReimport(kind)} disabled={locked || reimporting !== ''} title={title}>
      {reimporting === kind ? (
        <>
          <span className="loading-spinner"></span>
          {' '}Lese ein...
        </>
      ) : (
        label
      )}
    </button>
  )

  return (
    <div>
      <h2>Datenquellen</h2>
      <p style={{ marginBottom: '30px', color: '#666' }}>
        Ordner auf deinem PC, aus denen Jam Sessions, MegaMixe und ZIN Volumes eingelesen und ihre Musik- und
        Videodateien zugeordnet werden. Mit „📁 Durchsuchen“ einen Ordner auswählen.
      </p>

      {message.text && <div className={`alert show ${message.type}`}>{message.text}</div>}

      <form onSubmit={handleSubmit}>
        <label>Jam-Session-Ordner (inkl. Unterordner, je Jam ein Ordner mit PDF, Musik und Videos)</label>
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
        <button
          type="button"
          className="secondary"
          style={{ marginBottom: '25px' }}
          onClick={() => setJamRoots((roots) => [...roots, ''])}
          disabled={saving}
        >
          ＋ weiteren Jam-Session-Ordner
        </button>

        <PathField
          id="megamix-root-input"
          label="MegaMix-Ordner (MP3s, kein PDF)"
          value={megamixRoot}
          onChange={setMegamixRoot}
          onBrowse={() => browse(megamixRoot, setMegamixRoot)}
          disabled={saving}
          placeholder={String.raw`z. B. D:\Zumba\Musik\MegaMix`}
        />

        <PathField
          id="zin-volumes-mp3-root-input"
          label="ZIN-Volumes-MP3-Ordner (Songs)"
          value={zinVolumesMp3Root}
          onChange={setZinVolumesMp3Root}
          onBrowse={() => browse(zinVolumesMp3Root, setZinVolumesMp3Root)}
          disabled={saving}
          placeholder={String.raw`z. B. D:\Zumba\Musik\ZIN Volumes`}
        />

        <PathField
          id="zin-volumes-choreo-root-input"
          label="ZIN-Volumes-Choreo-Notes-Ordner (PDFs; Videos werden im Ordner darüber gesucht)"
          value={zinVolumesChoreoRoot}
          onChange={setZinVolumesChoreoRoot}
          onBrowse={() => browse(zinVolumesChoreoRoot, setZinVolumesChoreoRoot)}
          disabled={saving}
          placeholder={String.raw`z. B. D:\Zumba\ZIN Volumes\Choreo Notes`}
        />

        <button type="submit" disabled={saving}>
          {saving ? (
            <>
              <span className="loading-spinner"></span>
              {' '}Speichere...
            </>
          ) : (
            '💾 Speichern'
          )}
        </button>
      </form>

      <h3 style={{ marginTop: '40px', marginBottom: '10px' }}>Neu einlesen</h3>
      <p style={{ marginBottom: '15px', color: '#666' }}>
        Liest neue Jams bzw. Editionen aus den gespeicherten Ordnern ein und trägt fehlende Ordner nach. Bereits
        eingelesene werden übersprungen.
      </p>

      {reimportMessage.text && <div className={`alert show ${reimportMessage.type}`}>{reimportMessage.text}</div>}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {reimportButton('jam-sessions', '🔄 Jam Sessions neu einlesen', 'Nutzt die KI – folgt in einer späteren Version', true)}
        {reimportButton('megamix', '🔄 MegaMixe neu einlesen')}
        {reimportButton('zin-volumes', '🔄 ZIN Volumes neu einlesen', 'Nutzt die KI – folgt in einer späteren Version', true)}
      </div>

    </div>
  )
}
