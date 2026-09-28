import { useState } from 'react'
import axios from 'axios'
import { IconMusic, IconMovie, IconFileText, IconX, IconArrowBackUp, IconLink } from '@tabler/icons-react'
import MediaPlayer from './MediaPlayer.jsx'
import { onMediaContextMenu } from '../lib/fileMenu.js'
import { t } from '../../shared/i18n.js'

const ICONS = { audio: IconMusic, video: IconMovie, pdf: IconFileText }

// Dateien eines Songs in der Bibliothek: Choreo-Notes-Seite(n), Musik und Videos mit Player,
// Zuordnung von Hand (lösen, wiederherstellen, weitere Datei aus den Ordnern zuordnen).
// song: gespeicherter Song (mit id); item: Jam/Volume/MegaMix; media: Antwort von …/media
export default function SongFiles({ type, item, song, media, onChanged }) {
  const [active, setActive] = useState(0)
  const [choice, setChoice] = useState('')
  const [error, setError] = useState('')

  const pdfs = []
  if (type === 'jam' && item.pdf_filename && song.page) pdfs.push({ kind: 'pdf', label: t('details.choreoNotesPage', { page: song.page }), pdf: item.pdf_filename, page: song.page })
  if (type === 'zin') {
    if (song.live_pdf_filename && song.live_page) pdfs.push({ kind: 'pdf', label: t('details.choreoNotesLivePage', { page: song.live_page }), pdf: song.live_pdf_filename, page: song.live_page })
    if (song.oneonone_pdf_filename && song.oneonone_page) pdfs.push({ kind: 'pdf', label: t('details.choreoNotesOneOnOnePage', { page: song.oneonone_page }), pdf: song.oneonone_pdf_filename, page: song.oneonone_page })
  }
  const own = media?.songs[song.id] || { audio: [], video: [], removed: [] }
  const files = [...pdfs, ...own.audio.map((m) => ({ ...m, kind: 'audio' })), ...own.video.map((m) => ({ ...m, kind: 'video' }))]
  const current = files[Math.min(active, files.length - 1)]
  const assigned = new Set([...own.audio, ...own.video].map((m) => m.path.toLowerCase()))
  const candidates = (media?.files || []).filter((f) => !assigned.has(f.path.toLowerCase()))

  const change = async (action, path) => {
    setError('')
    try {
      await axios.post(`/api/collection/${type}/${item.id}/songs/${song.id}/media`, { action, path })
      await onChanged()
    } catch (e) {
      setError(e.response?.data?.error || t('library.saveError'))
    }
  }

  const songsLabel = (ids) => {
    const names = ids.map((id) => item.songs.find((s) => s.id === id)?.song_name).filter(Boolean)
    return names.length ? t('library.media.usedBy', { list: names.join(', ') }) : t('library.media.unused')
  }

  return (
    <div className="song-files">
      <span className="field-label">{t('library.media.title', { song: song.song_name })}</span>
      {error && <div className="alert error">{error}</div>}

      <div className="file-list">
        {files.map((f, i) => {
          const Icon = ICONS[f.kind]
          return (
            <div key={`${f.kind}-${f.url || f.page}-${i}`} className={`file-item ${f === current ? 'active' : ''}`}>
              <button type="button" className="file-item-main" onClick={() => setActive(i)} onContextMenu={f.url ? onMediaContextMenu(f.url) : undefined} title={f.label}>
                <Icon size={16} stroke={1.6} />
                <span>{f.label}</span>
                {f.manual && <span className="tag accent">{t('preview.manual')}</span>}
              </button>
              {f.kind !== 'pdf' && (
                <button type="button" className="icon-btn inline" onClick={() => change('remove', f.path)} title={t('library.media.unassign')} aria-label={t('library.media.unassign')}>
                  <IconX size={14} stroke={1.8} />
                </button>
              )}
            </div>
          )
        })}
        {files.length === 0 && <span className="muted">{t('details.noFiles')}</span>}
      </div>

      {own.removed.map((r) => (
        <div key={r.path} className="muted removed-file">
          {t('library.media.removed', { file: r.label })}{' '}
          <button type="button" className="link" onClick={() => change('restore', r.path)}>
            <IconArrowBackUp size={14} stroke={1.8} /> {t('library.media.restore')}
          </button>
        </div>
      ))}

      {media && (
        <div className="path-field">
          <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={t('library.media.addLabel')}>
            <option value="">{candidates.length ? t('library.media.choose') : t('library.media.noCandidates')}</option>
            {candidates.map((f) => (
              <option key={f.path} value={f.path}>
                {t('library.media.option', { file: f.label, use: songsLabel(f.songs) })}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!choice}
            onClick={async () => {
              await change('add', choice)
              setChoice('')
            }}
          >
            <IconLink size={16} stroke={1.6} /> {t('library.media.add')}
          </button>
        </div>
      )}

      {current?.kind === 'pdf' && <iframe key={`${current.pdf}-${current.page}`} className="pdf-frame" src={`/uploads/${current.pdf}#page=${current.page}`} title={current.label} />}
      {(current?.kind === 'audio' || current?.kind === 'video') && <MediaPlayer url={current.url} kind={current.kind} />}
    </div>
  )
}
