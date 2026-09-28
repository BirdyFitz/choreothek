import { useState, useEffect } from 'react'
import axios from 'axios'
import { IconArchive, IconX } from '@tabler/icons-react'
import { createBackupInteractive } from './BackupCard.jsx'
import { SICHERUNG_ERSTELLT } from '../lib/events.js'
import { t } from '../../shared/i18n.js'

// Hinweisleiste beim Start, wenn eine Sicherung fällig ist (abschaltbar unter Einstellungen → Sicherung).
// „Später“ blendet sie bis zum nächsten Start aus.
export default function BackupReminder() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get('/api/backup/status')
      .then((res) => setStatus(res.data))
      .catch(() => setStatus(null))
    const hide = () => setStatus(null)
    window.addEventListener(SICHERUNG_ERSTELLT, hide)
    return () => window.removeEventListener(SICHERUNG_ERSTELLT, hide)
  }, [])

  if (!status?.due) return null

  const backup = async () => {
    setBusy(true)
    setError('')
    try {
      if (await createBackupInteractive()) setStatus(null)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="reminder-bar" role="status">
      <IconArchive size={16} stroke={1.6} />
      <span>{status.lastBackupAt ? t('backup.due', { days: status.daysSince }) : t('backup.dueNever')}</span>
      {error && <span className="reminder-error">{error}</span>}
      <button type="button" className="primary" onClick={backup} disabled={busy}>
        {busy ? <span className="spinner" /> : null} {t('backup.dueAction')}
      </button>
      <button type="button" className="icon-btn" onClick={() => setStatus(null)} title={t('backup.dueLater')} aria-label={t('backup.dueLater')}>
        <IconX size={16} stroke={1.6} />
      </button>
    </div>
  )
}
