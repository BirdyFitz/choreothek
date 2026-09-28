import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { IconFolderOpen, IconX, IconRefresh, IconDeviceFloppy } from '@tabler/icons-react'
import { DATEN_GEAENDERT } from '../lib/events.js'
import { usePersistent } from '../lib/usePersistent.js'
import Help from './Help.jsx'
import { t } from '../../shared/i18n.js'

const baseName = (p) => (p ? p.split(/[\\/]/).pop() : '')
const pickFolder = (start) => window.choreothek?.selectFolder(start || undefined)

function Tag({ kind, children }) {
  return <span className={`tag ${kind || ''}`}>{children}</span>
}

// Zelle mit einem Ordner: Name und Anzahl, „von Hand“-Kennzeichen; leer -> „Zuordnen …“
function FolderCell({ folder, count, assigned, onAssign, onReset }) {
  if (!folder) {
    return (
      <td>
        <button type="button" className="link" onClick={onAssign}>
          <IconFolderOpen size={14} stroke={1.6} /> {t('preview.assign')}
        </button>
      </td>
    )
  }
  return (
    <td title={folder}>
      {t('preview.files', { count })}
      {assigned && (
        <>
          {' '}
          <Tag kind="accent">{t('preview.manual')}</Tag>
          <button type="button" className="icon-btn inline" onClick={onReset} title={t('preview.resetAssign')} aria-label={t('preview.resetAssign')}>
            <IconX size={12} stroke={1.8} />
          </button>
        </>
      )}
    </td>
  )
}

// Gleiche Namen zusammenfassen: „Teilnahme.pdf (36×)“ statt 36-mal derselbe Name
function ignoredSummary(ignored) {
  const counts = new Map()
  for (const i of ignored) counts.set(baseName(i.pdf), (counts.get(baseName(i.pdf)) || 0) + 1)
  return [...counts].map(([name, n]) => (n > 1 ? t('preview.jams.ignoredCount', { name, count: n }) : name)).join(', ')
}

function JamPanel({ data, onlyOpen, act }) {
  const [patterns, setPatterns] = useState(data.patterns.join(', '))
  useEffect(() => setPatterns(data.patterns.join(', ')), [data.patterns])

  const rows = data.rows.filter((r) => !onlyOpen || r.status !== 'imported' || (!r.mediaFolder && !r.ownFolder))
  const count = (s) => data.rows.filter((r) => r.status === s).length
  const savePatterns = () =>
    act(() => axios.post('/api/preview/ignore-patterns', { patterns: patterns.split(',') }), t('preview.jams.patternsSaved'))

  return (
    <>
      <p className="muted">{t('preview.jams.summary', { new: count('new'), imported: count('imported'), noSongs: count('noSongs'), ignored: data.ignored.length })}</p>
      {rows.length === 0 ? (
        <p className="muted">{t('preview.nothingOpen')}</p>
      ) : (
        <div className="preview-table">
          <table className="results">
            <thead>
              <tr>
                <th>{t('preview.jams.pdf')}</th>
                <th>{t('preview.jams.folder')}</th>
                <th>{t('preview.jams.media')}</th>
                <th>{t('preview.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pdf}>
                  <td title={r.pdf}>{baseName(r.pdf)}</td>
                  <td title={r.folder}>{baseName(r.folder)}</td>
                  <td title={r.mediaFolder || ''}>
                    {r.mediaAssigned ? (
                      <>
                        {baseName(r.mediaFolder)} <Tag kind="accent">{t('preview.manual')}</Tag>
                        <button
                          type="button"
                          className="icon-btn inline"
                          onClick={() => act(() => axios.post('/api/preview/jam-media', { pdf: r.pdf, folder: null }))}
                          title={t('preview.resetAssign')}
                          aria-label={t('preview.resetAssign')}
                        >
                          <IconX size={12} stroke={1.8} />
                        </button>
                      </>
                    ) : r.ownFolder ? (
                      t('preview.jams.ownFolder')
                    ) : (
                      <>
                        <Tag kind="warning">{t('preview.jams.sharedFolder')}</Tag> <Help id="preview.sharedFolder" topic="vorschau" />{' '}
                        <button
                          type="button"
                          className="link"
                          onClick={async () => {
                            const folder = await pickFolder(r.folder)
                            if (folder) act(() => axios.post('/api/preview/jam-media', { pdf: r.pdf, folder }))
                          }}
                        >
                          <IconFolderOpen size={14} stroke={1.6} /> {t('preview.assign')}
                        </button>
                      </>
                    )}
                  </td>
                  <td>
                    {r.status === 'new' && <Tag kind="accent">{t('preview.statusNew')}</Tag>}
                    {r.status === 'imported' && <Tag>{t('preview.statusImported')}</Tag>}
                    {r.status === 'noSongs' && (
                      <>
                        <Tag kind="warning">{t('preview.jams.noSongs')}</Tag> <Help id="preview.noSongs" topic="vorschau" />{' '}
                        <button
                          type="button"
                          className="link"
                          onClick={() => act(() => axios.post('/api/preview/no-songs/remove', { name: baseName(r.pdf).toLowerCase() }))}
                          title={t('preview.jams.retryHint')}
                        >
                          {t('preview.jams.retry')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="field">
        <label htmlFor="ignore-patterns">
          {t('preview.jams.patterns')} <Help id="preview.patterns" topic="vorschau" />
        </label>
        <div className="path-field">
          <input id="ignore-patterns" value={patterns} onChange={(e) => setPatterns(e.target.value)} placeholder={t('preview.jams.patternsPlaceholder')} />
          <button type="button" onClick={savePatterns}>
            <IconDeviceFloppy size={16} stroke={1.6} /> {t('preview.save')}
          </button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {data.ignored.length ? t('preview.jams.ignoredList', { list: ignoredSummary(data.ignored) }) : t('preview.jams.patternsHint')}
        </span>
      </div>
    </>
  )
}

function Unrecognized({ items, kind, act }) {
  const [numbers, setNumbers] = useState({})
  if (!items.length) return null
  const fieldFor = { music: 'musicFolder', live: 'liveFolder', oneonone: 'oneononeFolder' }
  return (
    <div className="field">
      <span className="field-label">
        {t('preview.unrecognized')} <Help id="preview.unrecognized" topic="vorschau" />
      </span>
      <ul className="unrecognized">
        {items.map((u) => (
          <li key={u.path}>
            <span title={u.path}>
              {t(`preview.kinds.${u.kind}`)}: {baseName(u.path)}
            </span>
            <span className="muted">
              {u.duplicateOf ? t('preview.duplicateOf', { number: u.duplicateOf }) : u.count ? t('preview.files', { count: u.count }) : ''}
            </span>
            {u.kind === 'pdf' ? (
              <span className="muted">{t('preview.pdfNoNumber')}</span>
            ) : (
              <span className="assign-inline">
                <input
                  type="number"
                  min="1"
                  placeholder={t('preview.numberPlaceholder')}
                  value={numbers[u.path] || ''}
                  onChange={(e) => setNumbers({ ...numbers, [u.path]: e.target.value })}
                  aria-label={t('preview.numberPlaceholder')}
                />
                {(u.kind === 'video' ? ['liveFolder', 'oneononeFolder'] : [kind === 'megamix' ? 'musicFolder' : fieldFor[u.kind]]).map((field) => (
                  <button
                    key={field}
                    type="button"
                    disabled={!(Number(numbers[u.path]) > 0)}
                    onClick={() => act(() => axios.post('/api/preview/assign', { kind, number: Number(numbers[u.path]), field, folder: u.path }))}
                  >
                    {t(`preview.assignAs.${field}`)}
                  </button>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ZinPanel({ data, onlyOpen, act }) {
  const missing = (e) => [!e.pdfs.length && 'pdf', !e.musicFolder && 'musicFolder', !e.liveFolder && 'liveFolder', !e.oneononeFolder && 'oneononeFolder'].filter(Boolean)
  const rows = data.editions.filter((e) => !onlyOpen || !e.imported || missing(e).length)
  const assign = (number, field) => async () => {
    const folder = await pickFolder()
    if (folder) act(() => axios.post('/api/preview/assign', { kind: 'zin', number, field, folder }))
  }
  const reset = (number, field) => () => act(() => axios.post('/api/preview/assign', { kind: 'zin', number, field, folder: null }))
  const cell = (e, field, countField) => (
    <FolderCell folder={e[field]} count={e[countField]} assigned={e.assigned.includes(field)} onAssign={assign(e.number, field)} onReset={reset(e.number, field)} />
  )

  return (
    <>
      <p className="muted">
        {t('preview.zin.summary', {
          total: data.editions.length,
          new: data.editions.filter((e) => !e.imported && e.pdfs.length).length,
          incomplete: data.editions.filter((e) => missing(e).length).length
        })}
      </p>
      {rows.length === 0 ? (
        <p className="muted">{t('preview.nothingOpen')}</p>
      ) : (
        <div className="preview-table">
          <table className="results">
            <thead>
              <tr>
                <th>{t('preview.zin.number')}</th>
                <th>{t('preview.zin.pdfs')}</th>
                <th>{t('preview.zin.music')}</th>
                <th>{t('preview.zin.live')}</th>
                <th>{t('preview.zin.oneonone')}</th>
                <th>{t('preview.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.number}>
                  <td>{e.number}</td>
                  <td title={e.pdfs.map((p) => p.file).join('\n')}>
                    {e.pdfs.length ? e.pdfs.map((p) => t(`preview.zin.variants.${p.variant}`)).join(' + ') : <Tag kind="warning">{t('preview.zin.noPdf')}</Tag>}
                  </td>
                  {cell(e, 'musicFolder', 'mp3Count')}
                  {cell(e, 'liveFolder', 'liveCount')}
                  {cell(e, 'oneononeFolder', 'oneononeCount')}
                  <td>
                    {e.imported ? <Tag>{t('preview.statusImported')}</Tag> : e.pdfs.length ? <Tag kind="accent">{t('preview.statusNew')}</Tag> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Unrecognized items={data.unrecognized} kind="zin" act={act} />
    </>
  )
}

function MegaMixPanel({ data, onlyOpen, act }) {
  const rows = data.editions.filter((e) => !onlyOpen || !e.imported)
  return (
    <>
      <p className="muted">{t('preview.megamix.summary', { total: data.editions.length, new: data.editions.filter((e) => !e.imported).length })}</p>
      {rows.length === 0 ? (
        <p className="muted">{t('preview.nothingOpen')}</p>
      ) : (
        <div className="preview-table">
          <table className="results">
            <thead>
              <tr>
                <th>{t('preview.zin.number')}</th>
                <th>{t('preview.megamix.folder')}</th>
                <th>{t('preview.zin.music')}</th>
                <th>{t('preview.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.number}>
                  <td>{e.number}</td>
                  <td title={e.folder}>
                    {baseName(e.folder)} {e.assigned && <Tag kind="accent">{t('preview.manual')}</Tag>}
                  </td>
                  <td>{t('preview.files', { count: e.mp3Count })}</td>
                  <td>{e.imported ? <Tag>{t('preview.statusImported')}</Tag> : <Tag kind="accent">{t('preview.statusNew')}</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Unrecognized items={data.unrecognized} kind="megamix" act={act} />
    </>
  )
}

// Vorschau vor dem Einlesen: was erkannt wird, was schon eingelesen ist, was fehlt
export default function ImportPreview() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = usePersistent('previewTab', 'jams')
  const [onlyOpen, setOnlyOpen] = usePersistent('previewOnlyOpen', true)
  const [message, setMessage] = useState({ type: '', text: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData((await axios.get('/api/preview')).data)
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('preview.loadError') })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(DATEN_GEAENDERT, load)
    return () => window.removeEventListener(DATEN_GEAENDERT, load)
  }, [load])

  // Korrektur ausführen, danach neu erkennen
  const act = async (action, successText) => {
    setMessage({ type: '', text: '' })
    try {
      await action()
      if (successText) setMessage({ type: 'success', text: successText })
      await load()
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('preview.saveError') })
    }
  }

  const TABS = ['jams', 'zin', 'megamix']
  const section = data?.[tab]

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>
            {t('preview.title')} <Help id="preview.title" topic="vorschau" />
          </h2>
          <p className="hint">{t('preview.hint')}</p>
        </div>
        <button type="button" onClick={load} disabled={loading} title={t('preview.reload')}>
          {loading ? <span className="spinner" /> : <IconRefresh size={16} stroke={1.6} />} {t('preview.reload')}
        </button>
      </div>

      <div className="preview-toolbar">
        <div className="segmented segmented-3" role="tablist">
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {t(`preview.tabs.${id}`)}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          <span>
            {t('preview.onlyOpen')} <Help id="preview.onlyOpen" topic="vorschau" />
          </span>
        </label>
      </div>

      {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}

      {section?.error && <p className="muted">{section.error}</p>}
      {section && !section.error && tab === 'jams' && <JamPanel data={section} onlyOpen={onlyOpen} act={act} />}
      {section && !section.error && tab === 'zin' && <ZinPanel data={section} onlyOpen={onlyOpen} act={act} />}
      {section && !section.error && tab === 'megamix' && <MegaMixPanel data={section} onlyOpen={onlyOpen} act={act} />}
    </div>
  )
}
