import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { IconMusic, IconMovie, IconFileText, IconInfoCircle, IconDisc } from '@tabler/icons-react'
import { onMediaContextMenu, onPdfContextMenu } from '../lib/fileMenu.js'

// Alle Dateien eines Songs als Liste: Musik, Videos, Choreo Notes
function filesOf(row) {
  const files = []
  for (const m of row.audio_paths || []) files.push({ kind: 'audio', label: m.label, url: m.url })
  for (const m of row.video_paths || []) files.push({ kind: 'video', label: m.label, url: m.url })
  if (row.pdf_filename && row.page) {
    files.push({ kind: 'pdf', label: `Choreo Notes, Seite ${row.page}`, pdf: row.pdf_filename, page: row.page, source: row.pdf_source_path })
  } else if (row.pdf_filename) {
    files.push({ kind: 'pdf', label: 'Choreo Notes', pdf: row.pdf_filename, page: 1, source: row.pdf_source_path })
  }
  if (row.live_pdf_filename && row.live_page) {
    files.push({ kind: 'pdf', label: `Choreo Notes Live, Seite ${row.live_page}`, pdf: row.live_pdf_filename, page: row.live_page, source: row.live_pdf_source_path })
  }
  if (row.oneonone_pdf_filename && row.oneonone_page) {
    files.push({ kind: 'pdf', label: `Choreo Notes 1on1, Seite ${row.oneonone_page}`, pdf: row.oneonone_pdf_filename, page: row.oneonone_page, source: row.oneonone_pdf_source_path })
  }
  return files
}

const ICONS = { audio: IconMusic, video: IconMovie, pdf: IconFileText }

function formatDuration(sec) {
  if (!sec && sec !== 0) return null
  const m = Math.floor(sec / 60)
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

function formatSize(bytes) {
  if (!bytes) return null
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(bytes / 1024)} KB`
}

// Angaben aus der Datei (Tags, Cover) wie im Explorer-Detailbereich
function MediaInfo({ file }) {
  const [info, setInfo] = useState(null)
  const params = useMemo(() => new URL(file.url, window.location.origin).searchParams, [file.url])

  useEffect(() => {
    let cancelled = false
    setInfo(null)
    axios
      .get(`/api/media-info?${params}`)
      .then((res) => !cancelled && setInfo(res.data))
      .catch(() => !cancelled && setInfo({ error: true }))
    return () => {
      cancelled = true
    }
  }, [params])

  if (!info) return <div className="muted">Lade Angaben …</div>
  if (info.error) return null

  const rows = [
    ['Titel', info.title],
    ['Interpret', info.artist],
    ['Album', info.album],
    ['Genre', info.genre],
    ['Titelnummer', info.track],
    ['Jahr', info.year],
    ['Länge', formatDuration(info.duration)],
    ['Auflösung', info.width && info.height ? `${info.width} × ${info.height}` : null],
    ['Bitrate', info.bitrate ? `${info.bitrate} kBit/s` : null],
    ['Größe', formatSize(info.size)],
    ['Geändert', info.modified ? new Date(info.modified).toLocaleDateString('de-DE') : null],
    ['Ordner', info.folder]
  ].filter(([, v]) => v !== null && v !== undefined && v !== '')

  return (
    <>
      {file.kind === 'audio' &&
        (info.hasCover ? (
          <img className="cover" src={`/api/media-cover?${params}`} alt="Cover" />
        ) : (
          <div className="cover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconDisc size={64} stroke={1} className="muted" />
          </div>
        ))}
      <div>
        <div className="section-title">Details</div>
        <dl className="props">
          {rows.map(([k, v]) => (
            <FragmentRow key={k} label={k} value={v} />
          ))}
        </dl>
      </div>
    </>
  )
}

function FragmentRow({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd title={String(value)}>{value}</dd>
    </>
  )
}

export default function DetailsPanel({ row }) {
  const files = useMemo(() => (row ? filesOf(row) : []), [row])
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    setActiveIdx(0)
  }, [row])

  if (!row) {
    return (
      <aside className="pane pane-details" aria-label="Details">
        <div className="pane-header">
          <span className="pane-title">Details</span>
        </div>
        <div className="empty">
          <IconInfoCircle size={32} stroke={1.4} />
          <div>Song in der Liste auswählen, um Musik, Videos und Choreo Notes zu sehen.</div>
        </div>
      </aside>
    )
  }

  const active = files[activeIdx]
  const source = row.jammer_name
    ? [row.jammer_name, row.jam_datum ? row.jam_datum.split('-').reverse().join('.') : row.jam_date, row.location].filter(Boolean).join(' · ')
    : row.edition_label

  return (
    <aside className="pane pane-details" aria-label="Details">
      <div className="pane-header">
        <span className="pane-title">Details</span>
      </div>
      <div className="details">
        <div>
          <h2>{row.song_name}</h2>
          {row.artist && <div className="sub">{row.artist}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {row.rhythm && <span className="tag accent">{row.rhythm}</span>}
            {source && <span className="tag">{source}</span>}
            {row.unassigned && <span className="tag">nicht zugeordnet</span>}
          </div>
        </div>

        {files.length > 0 ? (
          <div>
            <div className="section-title">Dateien</div>
            <div className="file-list">
              {files.map((f, i) => {
                const Icon = ICONS[f.kind]
                return (
                  <button
                    key={`${f.kind}-${i}`}
                    className={`file-item ${i === activeIdx ? 'active' : ''}`}
                    onClick={() => setActiveIdx(i)}
                    onContextMenu={f.kind === 'pdf' ? onPdfContextMenu(f.source, f.pdf) : onMediaContextMenu(f.url)}
                    title={f.label}
                  >
                    <Icon size={16} stroke={1.6} />
                    <span>{f.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="muted">Zu diesem Song gibt es keine Dateien.</div>
        )}

        {active?.kind === 'audio' && (
          <>
            <audio key={active.url} className="viewer" style={{ background: 'none', border: 'none' }} controls src={active.url} />
            <MediaInfo file={active} />
          </>
        )}
        {active?.kind === 'video' && (
          <>
            <video key={active.url} className="viewer" controls src={active.url} />
            <MediaInfo file={active} />
          </>
        )}
        {active?.kind === 'pdf' && (
          <iframe key={`${active.pdf}-${active.page}`} className="pdf-frame" src={`/uploads/${active.pdf}#page=${active.page}`} title={active.label} />
        )}
      </div>
    </aside>
  )
}
