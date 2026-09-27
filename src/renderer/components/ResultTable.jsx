import { IconArrowUp, IconArrowDown, IconArrowsSort, IconMusic, IconMovie, IconFileText, IconMoodEmpty } from '@tabler/icons-react'
import { onMediaContextMenu, onPdfContextMenu } from '../lib/fileMenu.js'

// Spalten der Ergebnisliste; key passt zu SORT_COLUMNS in lib/sortRows.js
const COLUMNS = [
  { key: 'song', label: 'Song', width: '26%' },
  { key: 'artist', label: 'Interpret', width: '15%' },
  { key: 'rhythm', label: 'Rhythmus', width: '15%' },
  { key: 'source', label: 'Jammer / Edition', width: '17%' },
  { key: 'date', label: 'Datum', width: '10%' },
  { key: 'location', label: 'Ort', width: '17%' }
]

export function rowKey(r) {
  return `${r.source_type}|${r.group_id}|${r.position ?? ''}|${r.song_name}|${r.unassigned ? 'u' : ''}`
}

export function hasPdf(r) {
  return Boolean(r.pdf_filename || r.live_pdf_filename || r.oneonone_pdf_filename)
}

// Rechtsklick auf eine Zeile: Menü für die „Hauptdatei“ (Musik, sonst Video, sonst Choreo Notes)
function rowContextMenu(r) {
  if (r.audio_paths?.length) return onMediaContextMenu(r.audio_paths[0].url)
  if (r.video_paths?.length) return onMediaContextMenu(r.video_paths[0].url)
  if (r.pdf_filename) return onPdfContextMenu(r.pdf_source_path, r.pdf_filename)
  if (r.live_pdf_filename) return onPdfContextMenu(r.live_pdf_source_path, r.live_pdf_filename)
  return undefined
}

function SortIcon({ dir }) {
  if (dir === 'asc') return <IconArrowUp size={13} stroke={2} />
  if (dir === 'desc') return <IconArrowDown size={13} stroke={2} />
  return <IconArrowsSort size={13} stroke={1.6} />
}

export default function ResultTable({ rows, sort, onSort, selectedKey, onSelect, loading }) {
  return (
    <div className="table-wrap">
      <table className="results">
        <colgroup>
          {COLUMNS.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
          <col style={{ width: '82px' }} />
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map(({ key, label }) => {
              const dir = sort?.key === key ? sort.dir : null
              return (
                <th key={key} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
                  <button
                    className="sort-header"
                    onClick={() => onSort(key)}
                    title={
                      dir === 'asc'
                        ? 'Aufsteigend sortiert – klicken für absteigend'
                        : dir === 'desc'
                          ? 'Absteigend sortiert – klicken für ohne Sortierung'
                          : 'Klicken, um aufsteigend zu sortieren'
                    }
                  >
                    {label}
                    <span className={`sort-indicator ${dir ? 'active' : ''}`}>
                      <SortIcon dir={dir} />
                    </span>
                  </button>
                </th>
              )
            })}
            <th>
              <span style={{ padding: '0 10px' }}>Medien</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = rowKey(r)
            return (
              <tr
                key={key}
                className={`${key === selectedKey ? 'selected' : ''} ${r.unassigned ? 'unassigned' : ''}`}
                onClick={() => onSelect(key)}
                onContextMenu={(e) => {
                  onSelect(key)
                  rowContextMenu(r)?.(e)
                }}
                aria-selected={key === selectedKey}
              >
                <td title={r.song_name}>
                  {r.song_name}
                  {r.unassigned && (
                    <>
                      {' '}
                      <span className="tag">nicht zugeordnet</span>
                    </>
                  )}
                </td>
                <td title={r.artist || ''}>{r.artist || <span className="muted">–</span>}</td>
                <td title={r.rhythm || ''}>{r.rhythm || <span className="muted">–</span>}</td>
                <td title={r.jammer_name || r.edition_label || ''}>{r.jammer_name || r.edition_label}</td>
                <td>{r.jam_datum ? r.jam_datum.split('-').reverse().join('.') : r.jam_date || <span className="muted">–</span>}</td>
                <td title={r.location || ''}>{r.location || <span className="muted">–</span>}</td>
                <td>
                  <span className="media-icons">
                    <IconMusic size={15} stroke={1.6} className={r.audio_paths?.length ? 'has' : ''} style={{ opacity: r.audio_paths?.length ? 1 : 0.25 }} />
                    <IconMovie size={15} stroke={1.6} className={r.video_paths?.length ? 'has' : ''} style={{ opacity: r.video_paths?.length ? 1 : 0.25 }} />
                    <IconFileText size={15} stroke={1.6} className={hasPdf(r) ? 'has' : ''} style={{ opacity: hasPdf(r) ? 1 : 0.25 }} />
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!loading && rows.length === 0 && (
        <div className="empty">
          <IconMoodEmpty size={32} stroke={1.4} />
          <div>Keine Songs gefunden.</div>
          <div className="muted">Filter lockern oder in „Datenquellen“ Ordner einlesen.</div>
        </div>
      )}
    </div>
  )
}
