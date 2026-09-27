import { Fragment, useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { DATEN_GEAENDERT } from '../lib/events.js'
import { sortRows, nextSort } from '../lib/sortRows.js'
import { onMediaContextMenu, onPdfContextMenu } from '../lib/fileMenu.js'

// Spalten der Ergebnistabelle; key passt zu SORT_COLUMNS in lib/sortRows.js
const COLUMNS = [
  { key: 'song', label: 'Song' },
  { key: 'artist', label: 'Interpret' },
  { key: 'rhythm', label: 'Rhythmus' },
  { key: 'source', label: 'Jammer / Edition' },
  { key: 'date', label: 'Datum' },
  { key: 'location', label: 'Ort' }
]

export default function Search() {
  const [song, setSong] = useState('')
  const [rhythm, setRhythm] = useState('')
  const [ort, setOrt] = useState('')
  const [datumVon, setDatumVon] = useState('')
  const [datumBis, setDatumBis] = useState('')
  const [jammer, setJammer] = useState('')
  const [jamId, setJamId] = useState('')
  const [jams, setJams] = useState([])
  const [megamix, setMegamix] = useState('')
  const [zinVolume, setZinVolume] = useState('')
  const [rhythms, setRhythms] = useState([])
  const [jammers, setJammers] = useState([])
  const [megamixes, setMegamixes] = useState([])
  const [zinVolumes, setZinVolumes] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [expanded, setExpanded] = useState(null) // { idx, variant: 'default' | 'live' | 'oneonone' }

  // Auswahllisten laden: beim Start und immer, wenn anderswo Daten eingelesen/gespeichert wurden
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [rhythmsRes, jammersRes, megamixesRes, zinVolumesRes, jamsRes] = await Promise.all([
          axios.get('/api/rhythms'),
          axios.get('/api/jammers'),
          axios.get('/api/megamixes'),
          axios.get('/api/zin-volumes'),
          axios.get('/api/jams')
        ])
        setRhythms(rhythmsRes.data || [])
        setJammers(jammersRes.data || [])
        setMegamixes(megamixesRes.data || [])
        setZinVolumes(zinVolumesRes.data || [])
        setJams(jamsRes.data || [])
      } catch (error) {
        console.error('Fehler beim Laden der Filter:', error)
      }
    }
    loadFilters()
    window.addEventListener(DATEN_GEAENDERT, loadFilters)
    return () => window.removeEventListener(DATEN_GEAENDERT, loadFilters)
  }, [])

  const handleJammerChange = (value) => {
    setJammer(value)
    if (value) {
      setMegamix('')
      setZinVolume('')
    }
  }

  // Ort und Datum gibt es nur bei Jam Sessions -- wie beim Jammer MegaMix/ZIN Volume zurücksetzen
  const handleJamFilterChange = (setter) => (value) => {
    setter(value)
    if (value) {
      setMegamix('')
      setZinVolume('')
    }
  }

  // Jam-Auswahl zeigt nur die Jams, die zu Jammer, Ort und Datum passen
  const filteredJams = useMemo(() => {
    const ortLower = ort.trim().toLowerCase()
    return jams.filter((j) => {
      if (jammer && !(j.jammer_name || '').toLowerCase().includes(jammer.toLowerCase())) return false
      if (ortLower && !(j.location || '').toLowerCase().includes(ortLower)) return false
      if (datumVon && (!j.jam_datum || j.jam_datum < datumVon)) return false
      if (datumBis && (!j.jam_datum || j.jam_datum > datumBis)) return false
      return true
    })
  }, [jams, jammer, ort, datumVon, datumBis])

  // Passt die gewählte Jam nach Änderung der anderen Filter nicht mehr, Auswahl aufheben
  useEffect(() => {
    if (jamId && !filteredJams.some((j) => String(j.id) === jamId)) setJamId('')
  }, [filteredJams, jamId])

  const jamLabel = (j) => {
    const datum = j.jam_datum ? j.jam_datum.split('-').reverse().join('.') : j.jam_date || 'ohne Datum'
    const ortText = j.location ? (j.location.length > 45 ? j.location.slice(0, 44) + '…' : j.location) : ''
    return [datum, j.jammer_name, ortText].filter(Boolean).join(' · ') + ` (${j.song_count} Songs)`
  }

  const clearJamFilters = () => {
    setJammer('')
    setJamId('')
    setOrt('')
    setDatumVon('')
    setDatumBis('')
  }

  const handleMegamixChange = (value) => {
    setMegamix(value)
    if (value) {
      clearJamFilters()
      setZinVolume('')
    }
  }

  const handleZinVolumeChange = (value) => {
    setZinVolume(value)
    if (value) {
      clearJamFilters()
      setMegamix('')
    }
  }

  const hasFilter = Boolean(song.trim() || rhythm.trim() || jammer || jamId || ort.trim() || datumVon || datumBis || megamix || zinVolume)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!hasFilter) {
      return
    }

    setLoading(true)
    setSearched(true)
    setExpanded(null)
    try {
      const params = new URLSearchParams()
      if (song.trim()) params.append('song', song.trim())
      if (rhythm.trim()) params.append('rhythm', rhythm.trim())
      if (jammer) params.append('jammer', jammer)
      if (jamId) params.append('jam_id', jamId)
      if (ort.trim()) params.append('ort', ort.trim())
      if (datumVon) params.append('datum_von', datumVon)
      if (datumBis) params.append('datum_bis', datumBis)
      if (megamix) params.append('megamix', megamix)
      if (zinVolume) params.append('zin_volume', zinVolume)

      const response = await axios.get(`/api/search?${params}`)
      setResults(response.data || [])
    } catch (error) {
      console.error('Fehler bei der Suche:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setSong('')
    setRhythm('')
    clearJamFilters()
    setMegamix('')
    setZinVolume('')
    setResults([])
    setSearched(false)
    setExpanded(null)
  }

  // Sortierung per Klick auf die Spaltenüberschrift (bleibt über neue Suchen erhalten)
  const [sort, setSort] = useState(null)
  const shownResults = useMemo(() => sortRows(results, sort), [results, sort])
  const handleSort = (key) => {
    setSort((current) => nextSort(current, key))
    setExpanded(null)
  }

  const toggleExpand = (idx, variant) => {
    setExpanded((current) =>
      current && current.idx === idx && current.variant === variant ? null : { idx, variant }
    )
  }

  const selectedJam = jams.find((j) => String(j.id) === jamId)
  const unassignedCount = results.filter((r) => r.unassigned).length
  const songCount = results.length - unassignedCount
  const heading = song || rhythm || (selectedJam && jamLabel(selectedJam)) || jammer || megamix || zinVolume || ort || 'Suchergebnisse'

  return (
    <div>
      <h2>Suchen</h2>
      <p style={{ marginBottom: '30px', color: '#666' }}>
        Suche nach Song oder Rhythmus (Teil des Namens genügt, z. B. „sal“) und filtere wahlweise nach
        Jammer, Ort und Datum der Jam, MegaMix oder ZIN Volume.
      </p>

      <form onSubmit={handleSearch}>
        <div className="search-controls">
          <div className="form-group">
            <label htmlFor="song-input">Song</label>
            <input
              id="song-input"
              type="text"
              value={song}
              onChange={(e) => setSong(e.target.value)}
              placeholder="Songtitel oder Teil davon"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="rhythm-input">Rhythmus</label>
            <input
              id="rhythm-input"
              type="text"
              list="rhythm-list"
              value={rhythm}
              onChange={(e) => setRhythm(e.target.value)}
              placeholder="Eintippen (z. B. sal) oder aus Liste wählen"
              disabled={loading}
            />
            <datalist id="rhythm-list">
              {rhythms.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
        </div>

        <hr className="search-divider" />

        <div className="search-controls">

          <div className="form-group">
            <label htmlFor="jammer-select">Jammer</label>
            <select
              id="jammer-select"
              value={jammer}
              onChange={(e) => handleJammerChange(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Alle Jammer --</option>
              {jammers.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="ort-input">Ort der Jam</label>
            <input
              id="ort-input"
              type="text"
              value={ort}
              onChange={(e) => handleJamFilterChange(setOrt)(e.target.value)}
              placeholder="z. B. Heuchelheim oder Leinzell"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="datum-von">Jam von</label>
            <input
              id="datum-von"
              type="date"
              value={datumVon}
              onChange={(e) => handleJamFilterChange(setDatumVon)(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="datum-bis">Jam bis</label>
            <input
              id="datum-bis"
              type="date"
              value={datumBis}
              onChange={(e) => handleJamFilterChange(setDatumBis)(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="jam-select">Jam ({filteredJams.length})</label>
            <select
              id="jam-select"
              value={jamId}
              onChange={(e) => handleJamFilterChange(setJamId)(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Alle Jams --</option>
              {filteredJams.map((j) => (
                <option key={j.id} value={String(j.id)}>
                  {jamLabel(j)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="search-divider" />

        <div className="search-controls">

          <div className="form-group">
            <label htmlFor="megamix-select">MegaMix</label>
            <select
              id="megamix-select"
              value={megamix}
              onChange={(e) => handleMegamixChange(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Alle MegaMixe --</option>
              {megamixes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="zin-volume-select">ZIN Volume</label>
            <select
              id="zin-volume-select"
              value={zinVolume}
              onChange={(e) => handleZinVolumeChange(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Alle ZIN Volumes --</option>
              {zinVolumes.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
          <button type="submit" disabled={loading || !hasFilter}>
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                {' '}Suche läuft...
              </>
            ) : (
              '🔍 Suchen'
            )}
          </button>
          {searched && <button type="button" onClick={handleReset}>Zurücksetzen</button>}
        </div>
      </form>

      {searched && (
        <div>
          <h3 style={{ marginBottom: '5px' }}>
            {song ? '🎵 ' : rhythm ? '🕺 ' : jamId || jammer ? '🎤 ' : megamix ? '💽 ' : zinVolume ? '📅 ' : ''}{heading}
          </h3>
          <p style={{ marginBottom: '20px', color: '#666' }}>
            {songCount} Song{songCount !== 1 ? 's' : ''} gefunden
            {unassignedCount > 0 &&
              `, dazu ${unassignedCount} nicht zugeordnete${unassignedCount !== 1 ? '' : 's'} Video${unassignedCount !== 1 ? 's' : ''}`}
          </p>

          {results.length > 0 ? (
            <table className="results-table">
              <thead>
                <tr>
                  {COLUMNS.map(({ key, label }) => {
                    const dir = sort?.key === key ? sort.dir : null
                    return (
                      <th key={key} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
                        <button
                          type="button"
                          className="sort-header"
                          onClick={() => handleSort(key)}
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
                            {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '↕'}
                          </span>
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {shownResults.map((song, idx) => {
                  // Nicht zugeordnete Videos haben keine Choreo-Seite -> Zeile nicht aufklappbar
                  const isJamSession = song.source_type === 'jam_session' && !song.unassigned
                  const hasLive = song.source_type === 'zin_volume' && song.live_page
                  const hasOneOnOne = song.source_type === 'zin_volume' && song.oneonone_page
                  const isExpanded = (variant) => expanded && expanded.idx === idx && expanded.variant === variant

                  let detail = null
                  if (expanded && expanded.idx === idx) {
                    if (expanded.variant === 'default' && song.page) {
                      detail = { pdf: song.pdf_filename, page: song.page }
                    } else if (expanded.variant === 'live' && song.live_page) {
                      detail = { pdf: song.live_pdf_filename, page: song.live_page }
                    } else if (expanded.variant === 'oneonone' && song.oneonone_page) {
                      detail = { pdf: song.oneonone_pdf_filename, page: song.oneonone_page }
                    }
                  }

                  return (
                    <Fragment key={idx}>
                      <tr
                        className={isJamSession ? `song-row ${isExpanded('default') ? 'expanded' : ''}` : ''}
                        onClick={isJamSession ? () => toggleExpand(idx, 'default') : undefined}
                        onContextMenu={
                          song.unassigned
                            ? onMediaContextMenu(song.video_paths[0]?.url)
                            : isJamSession
                              ? onPdfContextMenu(song.pdf_source_path, song.pdf_filename)
                              : undefined
                        }
                      >
                        <td className={song.unassigned ? 'unassigned-cell' : undefined}>
                          {song.song_name}
                          {song.unassigned && <span className="unassigned-tag">nicht zugeordnet</span>}
                          {(song.audio_paths || []).map((media, mediaIdx) => (
                            <a
                              key={`audio-${mediaIdx}`}
                              href={media.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="media-link"
                              title={media.label}
                              onClick={(e) => e.stopPropagation()}
                              onContextMenu={onMediaContextMenu(media.url)}
                            >
                              🎵
                            </a>
                          ))}
                          {(song.video_paths || []).map((media, mediaIdx) => (
                            <a
                              key={`video-${mediaIdx}`}
                              href={media.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="media-link"
                              title={media.label}
                              onClick={(e) => e.stopPropagation()}
                              onContextMenu={onMediaContextMenu(media.url)}
                            >
                              🎬
                            </a>
                          ))}
                          {hasLive && (
                            <a
                              className="media-link"
                              title="Choreo Notes: Live"
                              onClick={() => toggleExpand(idx, 'live')}
                              onContextMenu={onPdfContextMenu(song.live_pdf_source_path, song.live_pdf_filename)}
                            >
                              📄 Live
                            </a>
                          )}
                          {hasOneOnOne && (
                            <a
                              className="media-link"
                              title="Choreo Notes: 1on1"
                              onClick={() => toggleExpand(idx, 'oneonone')}
                              onContextMenu={onPdfContextMenu(song.oneonone_pdf_source_path, song.oneonone_pdf_filename)}
                            >
                              📄 1on1
                            </a>
                          )}
                        </td>
                        <td>{song.artist || '–'}</td>
                        <td>{song.rhythm || '–'}</td>
                        <td>{song.jammer_name || song.edition_label || '–'}</td>
                        <td>{song.jam_date || '–'}</td>
                        <td>{song.location || '–'}</td>
                      </tr>
                      {expanded && expanded.idx === idx && (
                        <tr className="detail-row">
                          <td colSpan={6}>
                            {detail ? (
                              <iframe
                                className="choreo-frame"
                                src={`/uploads/${detail.pdf}#page=${detail.page}`}
                                title={`Choreo Notes: ${song.song_name}`}
                              />
                            ) : (
                              <p style={{ color: '#666', padding: '10px 0' }}>
                                Keine Seitenreferenz für diesen Song verfügbar.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}>
              Keine Ergebnisse gefunden. Versuche ein anderes Filter zu wählen.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
