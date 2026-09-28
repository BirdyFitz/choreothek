import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { IconArchive, IconRestore, IconKey } from '@tabler/icons-react'
import { meldeDatenGeaendert, SICHERUNG_ERSTELLT } from '../lib/events.js'
import { formatDate } from '../lib/money.js'
import Help from './Help.jsx'
import { t } from '../../shared/i18n.js'

const REMINDER_DAYS = 30

const sizeText = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

// Sicherung erstellen: Windows-Dialog „Speichern unter“, dann auf dem Server packen
export async function createBackupInteractive() {
  const { data: status } = await axios.get('/api/backup/status')
  const target = await window.choreothek?.chooseBackupTarget(status.defaultName)
  if (!target) return null
  const { data } = await axios.post('/api/backup/create', { target })
  window.dispatchEvent(new Event(SICHERUNG_ERSTELLT))
  return data
}

// Bereich „Sicherung“ in den Einstellungen
export default function BackupCard() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [missing, setMissing] = useState(null)

  const load = useCallback(async () => {
    try {
      setStatus((await axios.get('/api/backup/status')).data)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    setBusy('create')
    setMessage({ type: '', text: '' })
    try {
      const r = await createBackupInteractive()
      if (r) {
        setMessage({
          type: 'success',
          text: t('backup.created', { file: r.file, size: sizeText(r.bytes), jams: r.counts.jams, volumes: r.counts.zinVolumes, megamixes: r.counts.megamixes })
        })
        await load()
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.message })
    } finally {
      setBusy('')
    }
  }

  const restore = async () => {
    setMessage({ type: '', text: '' })
    setMissing(null)
    const source = await window.choreothek?.chooseBackupSource()
    if (!source) return
    setBusy('restore')
    try {
      const { data: info } = await axios.post('/api/backup/inspect', { source })
      const confirmed = window.confirm(
        t('backup.restoreConfirm', { date: formatDate(info.created), jams: info.counts.jams, volumes: info.counts.zinVolumes, megamixes: info.counts.megamixes })
      )
      if (!confirmed) return
      const { data } = await axios.post('/api/backup/restore', { source })
      setMissing(data.missing)
      setMessage({ type: 'success', text: t('backup.restored') })
      meldeDatenGeaendert()
      await load()
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.message })
    } finally {
      setBusy('')
    }
  }

  const setReminder = async (on) => {
    await axios.post('/api/backup/settings', { reminder: on })
    await load()
  }

  return (
    <div className="card">
      <div>
        <h2>
          {t('backup.title')} <Help id="backup.title" topic="sicherung" />
        </h2>
        <p className="hint">{t('backup.hint')}</p>
      </div>
      {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}
      {missing && (missing.folders.length > 0 || missing.overrides > 0) && (
        <div className="alert warning">
          {missing.folders.length > 0 && (
            <>
              {t('backup.missingTitle')}
              <ul>
                {missing.folders.map((f) => (
                  <li key={f.kind + f.path}>
                    {t(`backup.kinds.${f.kind}`)}: {f.path}
                  </li>
                ))}
              </ul>
            </>
          )}
          {missing.overrides > 0 && <div>{t('backup.missingOverrides', { count: missing.overrides })}</div>}
        </div>
      )}
      {missing && (
        <div className="alert warning">
          <IconKey size={14} stroke={1.8} /> {t('backup.keysAgain')}
        </div>
      )}
      <div className="button-row">
        <button type="button" className="primary" onClick={create} disabled={busy !== ''}>
          {busy === 'create' ? <span className="spinner" /> : <IconArchive size={16} stroke={1.6} />} {busy === 'create' ? t('backup.creating') : t('backup.create')}
        </button>
        <button type="button" onClick={restore} disabled={busy !== ''}>
          {busy === 'restore' ? <span className="spinner" /> : <IconRestore size={16} stroke={1.6} />} {busy === 'restore' ? t('backup.restoring') : t('backup.restore')}
        </button>
      </div>
      {status && (
        <span className="muted" style={{ fontSize: 12 }}>
          {status.lastBackupAt ? t('backup.last', { date: formatDate(status.lastBackupAt) }) : t('backup.never')} {t('backup.keysHint')}
        </span>
      )}
      {status && (
        <label className="check">
          <input type="checkbox" checked={status.reminder} onChange={(e) => setReminder(e.target.checked)} />
          <span>
            {t('backup.reminder', { days: REMINDER_DAYS })} <Help id="backup.reminder" topic="sicherung" />
          </span>
        </label>
      )}
    </div>
  )
}
