import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import {
  IconArrowUp,
  IconArrowDown,
  IconX,
  IconPlus,
  IconDeviceFloppy,
  IconArrowBackUp,
  IconSparkles,
  IconTrash,
  IconFolderOpen,
  IconUsers,
  IconWaveSine
} from '@tabler/icons-react'
import AiConfirmDialog from '../components/AiConfirmDialog.jsx'
import SongFiles from '../components/SongFiles.jsx'
import VideoAnalysis from '../components/VideoAnalysis.jsx'
import Splitter from '../components/Splitter.jsx'
import { clampPaneWidth } from '../lib/paneWidth.js'
import { meldeDatenGeaendert, DATEN_GEAENDERT, OPEN_IN_LIBRARY } from '../lib/events.js'
import { usePersistent } from '../lib/usePersistent.js'
import { formatUsd } from '../lib/money.js'
import { t } from '../../shared/i18n.js'

const TYPES = ['jam', 'zin', 'megamix']
const HEAD_FIELDS = {
  jam: [
    ['jammer_name', 'text'],
    ['jam_date', 'text'],
    ['location', 'text'],
    ['source_folder', 'folder']
  ],
  zin: [
    ['audio_folder', 'folder'],
    ['live_video_folder', 'folder'],
    ['oneonone_video_folder', 'folder']
  ],
  megamix: [['source_folder', 'folder']]
}
// Songspalten je Art: [Feld, Zahl?]
const SONG_FIELDS = {
  jam: [['song_name'], ['artist'], ['rhythm'], ['page', true]],
  zin: [['song_name'], ['artist'], ['rhythm'], ['live_page', true], ['oneonone_page', true]],
  megamix: [['song_name'], ['rhythm']]
}

// Warm-up-Songs der Volumes stehen mit Position 0 oder kleiner vor den übrigen
const isWarmup = (s) => Number.isInteger(s.position) && 1 > s.position
const labelOf = (type, e) => (type === 'jam' ? e.jammer_name : e.edition_label)
const subOf = (type, e) => (type === 'jam' ? [e.jam_date, e.location].filter(Boolean).join(' · ') : '')
const headOf = (type, item) => Object.fromEntries(HEAD_FIELDS[type].map(([k]) => [k, item[k] ?? '']))
const songsOf = (item) => item.songs.map((s) => ({ ...s }))

function Editor({ type, id, onChanged }) {
  const [item, setItem] = useState(null)
  const [head, setHead] = useState({})
  const [songs, setSongs] = useState([])
  const [dirty, setDirty] = useState({ head: false, songs: false })
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [pendingPlan, setPendingPlan] = useState(null)
  // Dateien je Song (Musik/Videos, Zuordnung von Hand) und der Song, dessen Dateien gezeigt werden
  const [media, setMedia] = useState(null)
  const [selectedSong, setSelectedSong] = useState(null)
  // Videoanalyse (nur Jams) statt Songtabelle anzeigen
  const [videoMode, setVideoMode] = useState(false)

  const loadMedia = useCallback(async () => {
    try {
      setMedia((await axios.get(`/api/collection/${type}/${id}/media`)).data)
    } catch {
      setMedia(null)
    }
  }, [type, id])

  const load = useCallback(async () => {
    const { data } = await axios.get(`/api/collection/${type}/${id}`)
    setItem(data)
    setHead(headOf(type, data))
    setSongs(songsOf(data))
    setDirty({ head: false, songs: false })
    loadMedia()
  }, [type, id, loadMedia])

  useEffect(() => {
    setMessage({ type: '', text: '' })
    load().catch((error) => setMessage({ type: 'error', text: error.response?.data?.error || t('library.loadError') }))
  }, [load])

  if (!item) return message.text ? <div className={`alert ${message.type}`}>{message.text}</div> : null

  const run = async (name, action) => {
    setBusy(name)
    setMessage({ type: '', text: '' })
    try {
      await action()
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('library.saveError') })
    } finally {
      setBusy('')
    }
  }

  const setHeadField = (k, v) => {
    setHead((h) => ({ ...h, [k]: v }))
    setDirty((d) => ({ ...d, head: true }))
  }
  const setSong = (i, k, v) => {
    setSongs((list) => list.map((s, j) => (j === i ? { ...s, [k]: v } : s)))
    setDirty((d) => ({ ...d, songs: true }))
  }
  const moveSong = (i, delta) => {
    setSongs((list) => {
      const next = [...list]
      const [s] = next.splice(i, 1)
      next.splice(i + delta, 0, s)
      return next
    })
    setDirty((d) => ({ ...d, songs: true }))
  }
  const removeSong = (i) => {
    setSongs((list) => list.filter((_, j) => j !== i))
    setDirty((d) => ({ ...d, songs: true }))
  }
  const addSong = () => {
    setSongs((list) => [...list, { song_name: '' }])
    setDirty((d) => ({ ...d, songs: true }))
  }

  const save = () =>
    run('save', async () => {
      if (dirty.head) await axios.put(`/api/collection/${type}/${id}`, head)
      if (dirty.songs) {
        // Warm-up-Songs (Position ≤ 0) behalten ihre Position, die übrigen werden 1, 2, 3 … in Listenfolge
        let n = 0
        const payload = songs.map((s) => ({ ...s, position: isWarmup(s) ? s.position : ++n }))
        await axios.put(`/api/collection/${type}/${id}/songs`, { songs: payload })
      }
      await load()
      setMessage({ type: 'success', text: t('library.saved') })
      meldeDatenGeaendert()
      onChanged()
    })

  const discard = () => {
    setHead(headOf(type, item))
    setSongs(songsOf(item))
    setDirty({ head: false, songs: false })
    setMessage({ type: '', text: '' })
  }

  const remove = () => {
    if (!window.confirm(t(type === 'jam' ? 'library.deleteConfirmJam' : 'library.deleteConfirm', { label: labelOf(type, item) }))) return
    run('delete', async () => {
      await axios.delete(`/api/collection/${type}/${id}`)
      meldeDatenGeaendert()
      onChanged({ deleted: true })
    })
  }

  // Neu auslesen: Plan -> ggf. Meldung -> Vorschlag in die Felder (noch nicht gespeichert)
  const reextract = (plan, confirm = {}) =>
    run('ai', async () => {
      const { data } = await axios.post(`/api/collection/${type}/${id}/reextract`, { planId: plan.id, ...confirm })
      if (data.proposal.head) {
        setHead((h) => ({ ...h, ...Object.fromEntries(Object.entries(data.proposal.head).map(([k, v]) => [k, v ?? ''])) }))
      }
      setSongs(data.proposal.songs)
      setDirty({ head: Boolean(data.proposal.head), songs: true })
      setMessage({ type: 'warning', text: t('library.proposal', { amount: formatUsd(data.aiCostUsd) }) })
    })

  const startReextract = () =>
    run('ai', async () => {
      const { data: plan } = await axios.post(`/api/collection/${type}/${id}/plan`)
      if (plan.blocked) setMessage({ type: 'error', text: t(`errors.ai.${plan.blocked}`) })
      else if (plan.mustConfirm) setPendingPlan(plan)
      else await reextract(plan)
    })

  const browse = async (k) => {
    const folder = await window.choreothek?.selectFolder(head[k] || undefined)
    if (folder) setHeadField(k, folder)
  }

  const isDirty = dirty.head || dirty.songs
  const warmupCount = songs.filter((x) => isWarmup(x)).length

  if (videoMode) {
    return (
      <div className="editor">
        <VideoAnalysis
          jamId={id}
          onClose={() => {
            setVideoMode(false)
            loadMedia()
          }}
        />
      </div>
    )
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <h2>{labelOf(type, item)}</h2>
        <div className="button-row">
          {type === 'jam' && (
            <button type="button" onClick={() => setVideoMode(true)} disabled={busy !== '' || isDirty} title={t('video.openHint')}>
              <IconWaveSine size={16} stroke={1.6} /> {t('video.open')}
            </button>
          )}
          {type !== 'megamix' && (
            <button type="button" onClick={startReextract} disabled={busy !== ''} title={t('library.reextractHint')}>
              {busy === 'ai' ? <span className="spinner" /> : <IconSparkles size={16} stroke={1.6} />} {t('library.reextract')}
            </button>
          )}
          <button type="button" onClick={remove} disabled={busy !== ''}>
            <IconTrash size={16} stroke={1.6} /> {t('library.delete')}
          </button>
        </div>
      </div>

      {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}

      <div className="editor-fields">
        {HEAD_FIELDS[type].map(([k, kind]) => (
          <div className={`field ${kind === 'folder' ? 'field-wide' : ''}`} key={k}>
            <label htmlFor={`head-${k}`}>{t(`library.fields.${k}`)}</label>
            <div className="path-field">
              <input id={`head-${k}`} value={head[k] ?? ''} onChange={(e) => setHeadField(k, e.target.value)} />
              {kind === 'folder' && (
                <button type="button" onClick={() => browse(k)} title={t('sources.browseTitle')}>
                  <IconFolderOpen size={16} stroke={1.6} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="preview-table editor-songs">
        <table className="results">
          <thead>
            <tr>
              <th>#</th>
              {SONG_FIELDS[type].map(([k]) => (
                <th key={k}>{t(`library.fields.${k}`)}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {songs.map((s, i) => (
              <tr key={i} className={`${isWarmup(s) ? 'warmup' : ''} ${selectedSong === i ? 'selected' : ''}`} onClick={() => setSelectedSong(i)}>
                <td className="muted">{isWarmup(s) ? t('library.warmup') : i + 1 - warmupCount}</td>
                {SONG_FIELDS[type].map(([k, isNumber]) => (
                  <td key={k}>
                    <input
                      className={isNumber ? 'num' : ''}
                      type={isNumber ? 'number' : 'text'}
                      min={isNumber ? 1 : undefined}
                      value={s[k] ?? ''}
                      onChange={(e) => setSong(i, k, e.target.value)}
                      aria-label={t(`library.fields.${k}`)}
                    />
                  </td>
                ))}
                <td className="row-actions">
                  <button type="button" className="icon-btn inline" onClick={() => moveSong(i, -1)} disabled={i === 0} title={t('library.up')} aria-label={t('library.up')}>
                    <IconArrowUp size={14} stroke={1.8} />
                  </button>
                  <button type="button" className="icon-btn inline" onClick={() => moveSong(i, 1)} disabled={i === songs.length - 1} title={t('library.down')} aria-label={t('library.down')}>
                    <IconArrowDown size={14} stroke={1.8} />
                  </button>
                  <button type="button" className="icon-btn inline" onClick={() => removeSong(i)} title={t('library.removeSong')} aria-label={t('library.removeSong')}>
                    <IconX size={14} stroke={1.8} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="button-row">
        <button type="button" className="link" onClick={addSong}>
          <IconPlus size={14} stroke={1.8} /> {t('library.addSong')}
        </button>
        <span className="spacer" />
        <button type="button" onClick={discard} disabled={!isDirty || busy !== ''}>
          <IconArrowBackUp size={16} stroke={1.6} /> {t('library.discard')}
        </button>
        <button type="button" className="primary" onClick={save} disabled={!isDirty || busy !== ''}>
          {busy === 'save' ? <span className="spinner" /> : <IconDeviceFloppy size={16} stroke={1.6} />} {t('library.save')}
        </button>
      </div>

      {selectedSong != null && songs[selectedSong] && (
        songs[selectedSong].id && !dirty.songs ? (
          <SongFiles type={type} item={item} song={songs[selectedSong]} media={media} onChanged={loadMedia} />
        ) : (
          <p className="muted">{t('library.media.saveFirst')}</p>
        )
      )}

      {pendingPlan && (
        <AiConfirmDialog
          plan={pendingPlan}
          onCancel={() => setPendingPlan(null)}
          onConfirm={({ dontAskAgain }) => {
            const plan = pendingPlan
            setPendingPlan(null)
            reextract(plan, { confirmed: true, dontAskAgain })
          }}
        />
      )}
    </div>
  )
}

// Jammer-Schreibweisen: ähnliche Namen zusammenführen, jeden Namen umbenennen
function JammerNames({ onChanged }) {
  const [data, setData] = useState(null)
  const [targets, setTargets] = useState({})
  const [message, setMessage] = useState({ type: '', text: '' })

  const load = useCallback(async () => setData((await axios.get('/api/jammers/variants')).data), [])
  useEffect(() => {
    load()
  }, [load])

  const rename = async (from, to) => {
    setMessage({ type: '', text: '' })
    try {
      const { data: res } = await axios.post('/api/jammers/rename', { from, to })
      setMessage({ type: 'success', text: t('library.jammers.renamed', { count: res.changed }) })
      await load()
      meldeDatenGeaendert()
      onChanged()
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('library.saveError') })
    }
  }

  if (!data) return null
  return (
    <div className="editor">
      <h2>{t('library.jammers.title')}</h2>
      <p className="hint">{t('library.jammers.hint')}</p>
      {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}

      <span className="field-label">{t('library.jammers.similar')}</span>
      {data.similar.length === 0 && <p className="muted">{t('library.jammers.noSimilar')}</p>}
      {data.similar.map((group) => {
        const key = group.map((n) => n.jammer_name).join('|')
        const target = targets[key] ?? group[0].jammer_name
        return (
          <div className="jammer-group" key={key}>
            {group.map((n) => (
              <label className="check" key={n.jammer_name}>
                <input type="radio" name={key} checked={target === n.jammer_name} onChange={() => setTargets({ ...targets, [key]: n.jammer_name })} />
                <span>{t('library.jammers.nameCount', { name: n.jammer_name, count: n.jams })}</span>
              </label>
            ))}
            <button type="button" onClick={() => rename(group.map((n) => n.jammer_name).filter((n) => n !== target), target)}>
              {t('library.jammers.merge')}
            </button>
          </div>
        )
      })}

      <span className="field-label">{t('library.jammers.all')}</span>
      <div className="preview-table">
        <table className="results">
          <tbody>
            {data.names.map((n) => (
              <JammerRow key={n.jammer_name} entry={n} onRename={(to) => rename([n.jammer_name], to)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function JammerRow({ entry, onRename }) {
  const [value, setValue] = useState(entry.jammer_name)
  return (
    <tr>
      <td>
        <input value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('library.fields.jammer_name')} />
      </td>
      <td className="muted">{t('library.jammers.jams', { count: entry.jams })}</td>
      <td>
        <button type="button" disabled={!value.trim() || value === entry.jammer_name} onClick={() => onRename(value.trim())}>
          {t('library.jammers.rename')}
        </button>
      </td>
    </tr>
  )
}

// Reiter „Bibliothek“: links alle Einträge einer Art, rechts Bearbeiten
const LIST_WIDTH = { min: 200, max: 600, standard: 300 }

export default function Library() {
  const [listWidth, setListWidth] = usePersistent('libraryListWidth', LIST_WIDTH.standard)
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const observer = new ResizeObserver(() => setWindowWidth(document.documentElement.clientWidth))
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])
  const effList = clampPaneWidth(listWidth, { ...LIST_WIDTH, windowWidth })
  const [type, setType] = usePersistent('libraryType', 'jam')
  const [list, setList] = useState([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(null)

  const loadList = useCallback(async () => {
    try {
      setList((await axios.get(`/api/collection/${type}`)).data)
    } catch {
      setList([])
    }
  }, [type])

  useEffect(() => {
    loadList()
    window.addEventListener(DATEN_GEAENDERT, loadList)
    return () => window.removeEventListener(DATEN_GEAENDERT, loadList)
  }, [loadList])

  // Sprung aus der Suche: „Bearbeiten“ im Detailbereich
  useEffect(() => {
    const open = (e) => {
      setType(e.detail.type)
      setSelected(e.detail.id)
    }
    window.addEventListener(OPEN_IN_LIBRARY, open)
    return () => window.removeEventListener(OPEN_IN_LIBRARY, open)
  }, [setType])

  const shown = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase('de')
    return q ? list.filter((e) => `${labelOf(type, e)} ${subOf(type, e)}`.toLocaleLowerCase('de').includes(q)) : list
  }, [list, filter, type])

  const changed = ({ deleted } = {}) => {
    if (deleted) setSelected(null)
    loadList()
  }

  return (
    <div className="library">
      <div className="pane library-list" style={{ width: effList }}>
        <div className="segmented segmented-3" role="tablist">
          {TYPES.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={type === id}
              className={type === id ? 'active' : ''}
              onClick={() => {
                setType(id)
                setSelected(null)
              }}
            >
              {t(`library.types.${id}`)}
            </button>
          ))}
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('library.filter')} aria-label={t('library.filter')} />
        {type === 'jam' && (
          <button type="button" className={`link ${selected === 'jammers' ? 'active' : ''}`} onClick={() => setSelected('jammers')}>
            <IconUsers size={14} stroke={1.8} /> {t('library.jammers.open')}
          </button>
        )}
        <ul className="library-items">
          {shown.map((e) => (
            <li key={e.id}>
              <button type="button" className={selected === e.id ? 'selected' : ''} onClick={() => setSelected(e.id)}>
                <span>{labelOf(type, e)}</span>
                <span className="muted">
                  {[subOf(type, e), t('results.songs', { count: e.song_count })].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Splitter
        side="left"
        width={effList}
        onChange={(w) => setListWidth(clampPaneWidth(w, { ...LIST_WIDTH, windowWidth }))}
        onReset={() => setListWidth(LIST_WIDTH.standard)}
        label={t('library.listWidth')}
      />
      <div className="pane library-editor" key={`${type}-${selected}`}>
        {selected === 'jammers' ? (
          <JammerNames onChanged={() => loadList()} />
        ) : selected ? (
          <Editor type={type} id={selected} onChanged={changed} />
        ) : (
          <p className="muted empty-hint">{t('library.empty')}</p>
        )}
      </div>
    </div>
  )
}
