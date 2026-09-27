import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { DATEN_GEAENDERT } from '../lib/events.js'
import { sortRows, nextSort } from '../lib/sortRows.js'
import FilterPanel from '../components/FilterPanel.jsx'
import ResultTable, { rowKey } from '../components/ResultTable.jsx'
import DetailsPanel from '../components/DetailsPanel.jsx'
import Splitter from '../components/Splitter.jsx'
import { usePersistent } from '../lib/usePersistent.js'
import { clampPaneWidth } from '../lib/paneWidth.js'
import { t } from '../../shared/i18n.js'

const FILTER_WIDTH = { standard: 260, min: 200, max: 480 }
const DETAILS_WIDTH = { standard: 400, min: 280, max: 800 }

const EMPTY_FILTERS = {
  song: '',
  rhythm: '',
  quelle: '',
  jammer: '',
  ort: '',
  datumVon: '',
  datumBis: '',
  jamId: '',
  megamix: '',
  zinVolume: ''
}

const JAM_FILTERS = ['jammer', 'ort', 'datumVon', 'datumBis', 'jamId']

function toParams(f) {
  const p = new URLSearchParams()
  const add = (key, value) => value && p.append(key, value)
  add('song', f.song.trim())
  add('rhythm', f.rhythm.trim())
  add('quelle', f.quelle)
  add('jammer', f.jammer)
  add('jam_id', f.jamId)
  add('ort', f.ort.trim())
  add('datum_von', f.datumVon)
  add('datum_bis', f.datumBis)
  add('megamix', f.megamix)
  add('zin_volume', f.zinVolume)
  return p
}

function jamLabel(j) {
  const datum = j.jam_datum ? j.jam_datum.split('-').reverse().join('.') : j.jam_date || t('filter.jamNoDate')
  const ort = j.location ? (j.location.length > 40 ? j.location.slice(0, 39) + '…' : j.location) : ''
  return [datum, j.jammer_name, ort].filter(Boolean).join(' · ') + ` (${j.song_count})`
}

// Suche wie im Explorer: Filter links, Ergebnisliste Mitte, Details rechts.
// Die Liste aktualisiert sich beim Tippen (kurz verzögert), ohne Knopf „Suchen“.
export default function Search({ showFilters, showDetails }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [lists, setLists] = useState({ rhythms: [], jammers: [], megamixes: [], zinVolumes: [], jams: [] })
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [reloadCounter, setReloadCounter] = useState(0)
  const [sort, setSort] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)

  // Breiten der Seitenbereiche (per Trennlinie verschiebbar, gemerkt). Beim Verkleinern des
  // Fensters werden sie so begrenzt, dass die Ergebnisliste genug Platz behält.
  const [filterWidth, setFilterWidth] = usePersistent('filterWidth', FILTER_WIDTH.standard)
  const [detailsWidth, setDetailsWidth] = usePersistent('detailsWidth', DETAILS_WIDTH.standard)
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    // ResizeObserver statt resize-Ereignis: erfasst jede Größenänderung zuverlässig
    const observer = new ResizeObserver(() => setWindowWidth(document.documentElement.clientWidth))
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])
  const effDetails = showDetails ? clampPaneWidth(detailsWidth, { ...DETAILS_WIDTH, windowWidth, otherPaneWidth: showFilters ? FILTER_WIDTH.min : 0 }) : 0
  const effFilter = showFilters ? clampPaneWidth(filterWidth, { ...FILTER_WIDTH, windowWidth, otherPaneWidth: effDetails }) : 0
  const resizeFilter = (w) => setFilterWidth(clampPaneWidth(w, { ...FILTER_WIDTH, windowWidth, otherPaneWidth: effDetails }))
  const resizeDetails = (w) => setDetailsWidth(clampPaneWidth(w, { ...DETAILS_WIDTH, windowWidth, otherPaneWidth: effFilter }))

  // Auswahllisten laden: beim Start und immer, wenn anderswo Daten eingelesen/gespeichert wurden
  useEffect(() => {
    const load = async () => {
      try {
        const [rhythms, jammers, megamixes, zinVolumes, jams] = await Promise.all(
          ['rhythms', 'jammers', 'megamixes', 'zin-volumes', 'jams'].map((p) => axios.get(`/api/${p}`).then((r) => r.data || []))
        )
        setLists({ rhythms, jammers, megamixes, zinVolumes, jams })
      } catch (error) {
        console.error('Fehler beim Laden der Filter:', error)
      }
    }
    const onChanged = () => {
      load()
      setReloadCounter((n) => n + 1)
    }
    load()
    window.addEventListener(DATEN_GEAENDERT, onChanged)
    return () => window.removeEventListener(DATEN_GEAENDERT, onChanged)
  }, [])

  // Suche beim Tippen: 250 ms nach der letzten Änderung
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await axios.get(`/api/search?${toParams(filters)}`)
        if (!cancelled) setResults(res.data || [])
      } catch (error) {
        console.error('Fehler bei der Suche:', error)
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [filters, reloadCounter])

  const set = (key, value) =>
    setFilters((f) => {
      const next = { ...f, [key]: value }
      // Die Gruppen schließen sich gegenseitig aus: Jam-Filter, MegaMix-Edition, ZIN-Volume.
      // Wer in einer Gruppe etwas wählt, leert die anderen (sonst gäbe es keine Treffer).
      if (JAM_FILTERS.includes(key) && value) {
        next.megamix = ''
        next.zinVolume = ''
        if (next.quelle !== 'jam') next.quelle = next.quelle === '' ? '' : 'jam'
      }
      if (key === 'megamix' && value) {
        for (const k of JAM_FILTERS) next[k] = ''
        next.zinVolume = ''
      }
      if (key === 'zinVolume' && value) {
        for (const k of JAM_FILTERS) next[k] = ''
        next.megamix = ''
      }
      return next
    })

  const setQuelle = (quelle) =>
    setFilters((f) => {
      const next = { ...f, quelle }
      if (quelle !== 'megamix') next.megamix = ''
      if (quelle !== 'zin') next.zinVolume = ''
      if (quelle === 'megamix' || quelle === 'zin') for (const k of JAM_FILTERS) next[k] = ''
      return next
    })

  // Jam-Auswahl zeigt nur die Jams, die zu Jammer, Ort und Datum passen
  const filteredJams = useMemo(() => {
    const ortLower = filters.ort.trim().toLowerCase()
    return lists.jams.filter((j) => {
      if (filters.jammer && j.jammer_name !== filters.jammer) return false
      if (ortLower && !(j.location || '').toLowerCase().includes(ortLower)) return false
      if (filters.datumVon && (!j.jam_datum || j.jam_datum < filters.datumVon)) return false
      if (filters.datumBis && (!j.jam_datum || j.jam_datum > filters.datumBis)) return false
      return true
    })
  }, [lists.jams, filters.jammer, filters.ort, filters.datumVon, filters.datumBis])

  useEffect(() => {
    if (filters.jamId && !filteredJams.some((j) => String(j.id) === filters.jamId)) set('jamId', '')
  }, [filteredJams, filters.jamId])

  const shownResults = useMemo(() => sortRows(results, sort), [results, sort])
  const selectedRow = useMemo(() => shownResults.find((r) => rowKey(r) === selectedKey) || null, [shownResults, selectedKey])

  const hasFilter = Object.entries(filters).some(([, v]) => v)
  const unassignedCount = results.filter((r) => r.unassigned).length
  const songCount = results.length - unassignedCount

  return (
    <>
      {showFilters && (
        <FilterPanel
          width={effFilter}
          filters={filters}
          set={set}
          setQuelle={setQuelle}
          lists={lists}
          filteredJams={filteredJams}
          jamLabel={jamLabel}
          onReset={() => setFilters(EMPTY_FILTERS)}
          hasFilter={hasFilter}
        />
      )}
      {showFilters && (
        <Splitter side="left" width={effFilter} onChange={resizeFilter} onReset={() => setFilterWidth(FILTER_WIDTH.standard)} label={t('app.splitter.filterWidth')} />
      )}
      <section className="pane pane-list" aria-label={t('results.songs', { count: songCount })}>
        <div className="pane-header">
          <span className="pane-title">{t('results.songs', { count: songCount })}</span>
          {unassignedCount > 0 && (
            <span>{t('results.unassigned', { count: unassignedCount })}</span>
          )}
          {loading && <span className="spinner" style={{ marginLeft: 'auto' }} aria-label={t('results.searching')} />}
        </div>
        <ResultTable
          rows={shownResults}
          sort={sort}
          onSort={(key) => setSort((s) => nextSort(s, key))}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          loading={loading}
        />
      </section>
      {showDetails && (
        <Splitter side="right" width={effDetails} onChange={resizeDetails} onReset={() => setDetailsWidth(DETAILS_WIDTH.standard)} label={t('app.splitter.detailsWidth')} />
      )}
      {showDetails && <DetailsPanel row={selectedRow} width={effDetails} />}
    </>
  )
}
