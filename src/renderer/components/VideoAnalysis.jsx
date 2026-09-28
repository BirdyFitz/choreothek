import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { IconWaveSine, IconPlayerPlay, IconArrowBackUp, IconX, IconCheck } from '@tabler/icons-react'
import MediaPlayer from './MediaPlayer.jsx'
import { parseTime, formatTime, formatTimePrecise } from '../lib/player.js'
import { meldeDatenGeaendert } from '../lib/events.js'
import { t } from '../../shared/i18n.js'

const ACTIONS = ['rename', 'cut', 'skip']

// Vorschlag aus der Analyse -> bearbeitbarer Zustand je Video
function toDraft(result) {
  return {
    video: result.video,
    label: result.label,
    duration: result.duration,
    error: result.error,
    action: result.error || result.action === 'none' ? 'skip' : result.action,
    parts: (result.parts || []).map((p) => ({ ...p, use: true, startText: formatTimePrecise(p.start), endText: formatTimePrecise(p.end) }))
  }
}

const timeValue = (text) => parseTime(text)

// Videoanalyse einer Jam: Videos wählen, Tonvergleich, Prüfansicht, ausführen, rückgängig
export default function VideoAnalysis({ jamId, onClose }) {
  const [cand, setCand] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [job, setJob] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [runs, setRuns] = useState([])
  const [message, setMessage] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  const [player, setPlayer] = useState(null) // { url, seekTo }

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/video/${jamId}/candidates`)
      setCand(data)
      setSelected(new Set(data.videos.filter((v) => v.songs.length === 0).map((v) => v.path)))
      setRuns((await axios.get(`/api/video/${jamId}/runs`)).data)
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('video.loadError') })
    }
  }, [jamId])

  useEffect(() => {
    load()
  }, [load])

  // Fortschritt abfragen, solange die Analyse läuft
  useEffect(() => {
    if (job?.state !== 'running') return
    const timer = setInterval(async () => {
      const { data } = await axios.get('/api/video/job')
      setJob(data)
      if (data?.state !== 'running') setDrafts((data?.results || []).map(toDraft))
    }, 700)
    return () => clearInterval(timer)
  }, [job?.state])

  const urlOf = (video) => cand?.videos.find((v) => v.path === video)?.url

  const analyze = async () => {
    setMessage({ type: '', text: '' })
    setDrafts([])
    try {
      await axios.post(`/api/video/${jamId}/analyze`, { videos: [...selected] })
      setJob({ state: 'running', done: 0, total: 0 })
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('video.analyzeError') })
    }
  }

  const setDraft = (i, patch) => setDrafts((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const setPart = (i, k, patch) => setDrafts((list) => list.map((d, j) => (j === i ? { ...d, parts: d.parts.map((p, m) => (m === k ? { ...p, ...patch } : p)) } : d)))

  // Was ausgeführt würde (nur gültige, gewählte Teile)
  const planned = drafts
    .filter((d) => d.action !== 'skip')
    .map((d) => {
      const parts = d.parts
        .filter((p) => p.use)
        .map((p) => ({ song: p.song.trim(), start: timeValue(p.startText), end: timeValue(p.endText) }))
      return { video: d.video, label: d.label, action: d.action, parts: d.action === 'rename' ? parts.slice(0, 1) : parts }
    })
    .filter((d) => d.parts.length)
  const invalid = planned.some((d) => d.parts.some((p) => !p.song || p.start == null || p.end == null || p.end <= p.start))

  const execute = async () => {
    const summary = planned.map((d) => `${d.label}: ${t(`video.actions.${d.action}`)} (${d.parts.map((p) => p.song).join(', ')})`).join('\n')
    if (!window.confirm(t('video.confirm', { list: summary }))) return
    setBusy(true)
    setMessage({ type: '', text: '' })
    try {
      const { data } = await axios.post(`/api/video/${jamId}/execute`, { items: planned.map(({ label, ...rest }) => rest) })
      const done = data.log.filter((l) => l.status.startsWith('done')).length
      const problems = data.log.filter((l) => !l.status.startsWith('done'))
      setMessage({
        type: problems.length ? 'warning' : 'success',
        text:
          t('video.executed', { count: done }) +
          (problems.length ? t('video.problems', { list: problems.map((p) => `${p.video.split(/[\\/]/).pop()}: ${t(`video.status.${p.status}`)}`).join(' | ') }) : '')
      })
      setDrafts([])
      setJob(null)
      setPlayer(null)
      await load()
      meldeDatenGeaendert()
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('video.executeError') })
    } finally {
      setBusy(false)
    }
  }

  const undo = async (run) => {
    if (!window.confirm(t('video.undoConfirm'))) return
    try {
      const { data } = await axios.post(`/api/video/runs/${run.id}/undo`)
      const skipped = data.result.filter((r) => r.status !== 'undone').length
      setMessage({ type: skipped ? 'warning' : 'success', text: t('video.undone') + (skipped ? t('video.undoSkipped', { count: skipped }) : '') })
      await load()
      meldeDatenGeaendert()
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('video.executeError') })
    }
  }

  const running = job?.state === 'running'

  return (
    <div className="video-analysis">
      <div className="editor-head">
        <h2>
          <IconWaveSine size={18} stroke={1.8} /> {t('video.title')}
        </h2>
        <button type="button" className="icon-btn" onClick={onClose} title={t('video.close')} aria-label={t('video.close')}>
          <IconX size={16} stroke={1.6} />
        </button>
      </div>
      <p className="hint">{t('video.hint')}</p>
      {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}

      {cand && !drafts.length && !running && (
        <>
          <span className="field-label">{t('video.choose', { music: cand.audioCount })}</span>
          <div className="video-list">
            {cand.videos.map((v) => (
              <label className="check" key={v.path}>
                <input
                  type="checkbox"
                  checked={selected.has(v.path)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(v.path)
                    else next.delete(v.path)
                    setSelected(next)
                  }}
                />
                <span>
                  {v.label} <span className="muted">{v.songs.length ? t('video.usedBy', { list: v.songs.join(', ') }) : t('video.unassigned')}</span>
                </span>
              </label>
            ))}
            {cand.videos.length === 0 && <span className="muted">{t('video.noVideos')}</span>}
          </div>
          <div className="button-row">
            <button type="button" className="primary" onClick={analyze} disabled={!selected.size || !cand.audioCount}>
              <IconWaveSine size={16} stroke={1.6} /> {t('video.analyze', { count: selected.size })}
            </button>
          </div>
        </>
      )}

      {running && (
        <div className="progress">
          <progress max={job.total || 1} value={job.done || 0} />
          <span className="muted">{job.total ? t('video.progress', { done: job.done, total: job.total, current: job.current || '' }) : t('sources.progressStart')}</span>
          <button type="button" onClick={() => axios.post('/api/video/cancel')}>
            {t('sources.cancel')}
          </button>
        </div>
      )}

      {drafts.length > 0 && (
        <>
          <p className="hint">{t('video.reviewHint')}</p>
          {drafts.map((d, i) => (
            <div className="video-card" key={d.video}>
              <div className="video-card-head">
                <strong title={d.video}>{d.label}</strong>
                <span className="muted">{formatTime(d.duration)}</span>
                {d.error ? (
                  <span className="tag warning">{t('video.error', { error: d.error })}</span>
                ) : d.parts.length === 0 ? (
                  <span className="muted">{t('video.noMatch')}</span>
                ) : (
                  <select value={d.action} onChange={(e) => setDraft(i, { action: e.target.value })} aria-label={t('video.action')}>
                    {ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {t(`video.actions.${a}`)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {d.parts.length > 0 && d.action !== 'skip' && (
                <table className="results video-parts">
                  <thead>
                    <tr>
                      <th />
                      <th>{t('video.song')}</th>
                      <th>{t('video.start')}</th>
                      <th>{t('video.end')}</th>
                      <th>{t('video.hits')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.parts.map((p, k) => (
                      <tr key={k} className={d.action === 'rename' && k > 0 ? 'muted' : ''}>
                        <td>
                          <input type="checkbox" checked={p.use} onChange={(e) => setPart(i, k, { use: e.target.checked })} aria-label={t('video.use')} />
                        </td>
                        <td>
                          <input list={`songs-${jamId}`} value={p.song} onChange={(e) => setPart(i, k, { song: e.target.value })} title={p.refLabel} aria-label={t('video.song')} />
                        </td>
                        <td>
                          <input className="num" value={p.startText} onChange={(e) => setPart(i, k, { startText: e.target.value })} disabled={d.action === 'rename'} aria-label={t('video.start')} />
                        </td>
                        <td>
                          <input className="num" value={p.endText} onChange={(e) => setPart(i, k, { endText: e.target.value })} disabled={d.action === 'rename'} aria-label={t('video.end')} />
                        </td>
                        <td>
                          {p.hits} {p.sure ? <span className="tag">{t('video.sure')}</span> : <span className="tag warning">{t('video.unsure')}</span>}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-btn inline"
                            onClick={() => setPlayer({ url: urlOf(d.video), seekTo: { time: timeValue(p.startText) ?? p.start, n: Date.now() } })}
                            title={t('video.playFrom')}
                            aria-label={t('video.playFrom')}
                          >
                            <IconPlayerPlay size={14} stroke={1.8} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          <datalist id={`songs-${jamId}`}>
            {(cand?.songs || []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          {player?.url && <MediaPlayer url={player.url} kind="video" seekTo={player.seekTo} />}

          <div className="button-row">
            <button type="button" onClick={() => setDrafts([])}>
              {t('video.discard')}
            </button>
            <span className="spacer" />
            <button type="button" className="primary" onClick={execute} disabled={busy || !planned.length || invalid}>
              {busy ? <span className="spinner" /> : <IconCheck size={16} stroke={1.6} />} {t('video.execute', { count: planned.length })}
            </button>
          </div>
          {invalid && <p className="muted">{t('video.invalid')}</p>}
        </>
      )}

      {runs.length > 0 && (
        <div className="field">
          <span className="field-label">{t('video.runs')}</span>
          <ul className="video-runs">
            {runs.map((r) => (
              <li key={r.id}>
                <span>
                  {t('video.runLabel', {
                    date: new Date(`${r.created_at.replace(' ', 'T')}Z`).toLocaleString(t('meta.dateLocale')),
                    count: r.log.filter((l) => l.status.startsWith('done')).length
                  })}
                </span>
                {r.undone_at ? (
                  <span className="muted">{t('video.runUndone')}</span>
                ) : (
                  <button type="button" className="link" onClick={() => undo(r)}>
                    <IconArrowBackUp size={14} stroke={1.8} /> {t('video.undo')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
