import { useState, useEffect, useRef, useCallback } from 'react'
import { IconPlayerPlay, IconPlayerPause, IconRepeat, IconExternalLink, IconPlayerSkipBack, IconX, IconMaximize } from '@tabler/icons-react'
import { parseTime, formatTime, loopJump, SPEEDS } from '../lib/player.js'
import { usePersistent } from '../lib/usePersistent.js'
import { openInDefaultApp } from '../lib/fileMenu.js'
import { t } from '../../shared/i18n.js'

// Player für Musik und Videos: Tempo 0,5–1× (Tonhöhe bleibt), Abschnitt A–B wiederholen,
// Sprung zu einer Zeit, Tastatur. Kann das Format nicht abgespielt werden (z. B. HEVC-Handyvideos),
// öffnet sich die Datei automatisch im Windows-Standardprogramm.
// seekTo: { time, n } -- von außen an eine Stelle springen und abspielen (n macht wiederholte Sprünge eindeutig)
export default function MediaPlayer({ url, kind, seekTo }) {
  const media = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = usePersistent('playerSpeed', 1)
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const [loop, setLoop] = useState(false)
  const [jumpText, setJumpText] = useState('')
  const [failed, setFailed] = useState(null)
  // Videohöhe: begrenzt, damit bei Hochkant-Videos die Bedienelemente sichtbar bleiben
  const [videoSize, setVideoSize] = usePersistent('playerVideoSize', 'm')

  const fullscreen = () => {
    media.current?.requestFullscreen?.().catch(() => {})
  }

  // Neue Datei: Abschnitt und Fehler zurücksetzen (Tempo bleibt über Dateien hinweg)
  useEffect(() => {
    setA(null)
    setB(null)
    setLoop(false)
    setFailed(null)
    setTime(0)
    setDuration(0)
    setPlaying(false)
  }, [url])

  useEffect(() => {
    if (media.current) media.current.playbackRate = speed
  }, [speed, url])

  useEffect(() => {
    const el = media.current
    if (!el || !seekTo) return
    const go = () => {
      el.currentTime = seekTo.time
      el.play().catch(() => {})
    }
    if (el.readyState >= 1) go()
    else el.addEventListener('loadedmetadata', go, { once: true })
  }, [seekTo])

  const openExternally = useCallback(async () => {
    const error = await openInDefaultApp(url)
    return !error
  }, [url])

  const fallback = useCallback(
    async (reason) => {
      media.current?.pause()
      const opened = await openExternally()
      setFailed({ reason, opened })
    },
    [openExternally]
  )

  // Schleife: zurück zu A, sobald B erreicht ist
  const checkLoop = useCallback(() => {
    const el = media.current
    if (!el || !loop) return
    const target = loopJump(el.currentTime, a, b, el.duration)
    if (target != null) el.currentTime = target
  }, [loop, a, b])

  // Genauer als timeupdate (nur ~4× je Sekunde). Bewusst ein Zeitgeber statt requestAnimationFrame:
  // der ruht, wenn das Fenster verdeckt oder minimiert ist -- gerade beim Üben zur Musik
  useEffect(() => {
    if (!playing || !loop) return
    const timer = setInterval(checkLoop, 50)
    return () => clearInterval(timer)
  }, [playing, loop, checkLoop])

  const toggle = () => {
    const el = media.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }
  // Bewusster Sprung aus dem Abschnitt heraus beendet die Wiederholung (A und B bleiben gesetzt)
  const seek = (seconds) => {
    const el = media.current
    if (!el) return
    const target = Math.max(0, Math.min(seconds, el.duration || seconds))
    if (loop && loopJump(target, a, b, el.duration) != null) setLoop(false)
    el.currentTime = target
  }
  const jump = () => {
    const target = parseTime(jumpText)
    if (target != null) seek(target)
  }
  const setPoint = (which) => {
    const now = media.current?.currentTime ?? 0
    if (which === 'a') setA(now)
    else setB(now)
    setLoop(true)
  }
  const clearLoop = () => {
    setA(null)
    setB(null)
    setLoop(false)
  }

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
    const keys = {
      ' ': toggle,
      ArrowLeft: () => seek((media.current?.currentTime ?? 0) - 5),
      ArrowRight: () => seek((media.current?.currentTime ?? 0) + 5),
      a: () => setPoint('a'),
      b: () => setPoint('b'),
      l: () => setLoop((v) => !v),
      f: () => kind === 'video' && fullscreen()
    }
    const action = keys[e.key]
    if (action) {
      e.preventDefault()
      action()
    }
  }

  const Tag = kind === 'video' ? 'video' : 'audio'
  const pct = (v) => (duration ? `${(v / duration) * 100}%` : '0%')

  return (
    <div className="player" tabIndex={0} onKeyDown={onKeyDown} aria-label={t('player.label')}>
      <Tag
        ref={media}
        key={url}
        className={kind === 'video' ? `viewer video-size-${videoSize}` : 'player-audio'}
        src={url}
        preload="metadata"
        onClick={toggle}
        onDoubleClick={kind === 'video' ? fullscreen : undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime)
          checkLoop()
        }}
        onEnded={() => {
          // Schleife ohne B: am Ende wieder bei A beginnen
          if (loop && a != null) {
            media.current.currentTime = Math.min(a, b ?? a)
            media.current.play().catch(() => {})
          }
        }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget
          setDuration(el.duration)
          el.playbackRate = speed
          // Video ohne Bild: Bildformat wird nicht unterstützt (Ton allein läuft oft trotzdem)
          if (kind === 'video' && el.videoWidth === 0) fallback('noPicture')
        }}
        onError={() => fallback('unsupported')}
      />

      {failed ? (
        <div className="alert warning">
          {t(failed.opened ? 'player.openedExternally' : 'player.cannotPlay')}
        </div>
      ) : (
        <>
          <div className="player-bar">
            <button type="button" className="icon-btn" onClick={toggle} title={t(playing ? 'player.pause' : 'player.play')} aria-label={t(playing ? 'player.pause' : 'player.play')}>
              {playing ? <IconPlayerPause size={18} stroke={1.6} /> : <IconPlayerPlay size={18} stroke={1.6} />}
            </button>
            <div className="player-track">
              {a != null && <span className="player-range" style={{ left: pct(Math.min(a, b ?? duration)), width: pct(Math.abs((b ?? duration) - a)) }} />}
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={time}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label={t('player.position')}
              />
            </div>
            <span className="player-time">
              {formatTime(time)} / {formatTime(duration)}
            </span>
          </div>

          <div className="player-controls">
            <label className="player-speed">
              <span>{t('player.speed')}</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {t('player.speedValue', { value: s.toLocaleString(t('meta.dateLocale')) })}
                  </option>
                ))}
              </select>
            </label>

            <div className="player-loop">
              <button type="button" onClick={() => setPoint('a')} title={t('player.setAHint')}>
                {a != null ? t('player.pointAt', { point: 'A', time: formatTime(a) }) : t('player.setA')}
              </button>
              <button type="button" onClick={() => setPoint('b')} title={t('player.setBHint')}>
                {b != null ? t('player.pointAt', { point: 'B', time: formatTime(b) }) : t('player.setB')}
              </button>
              <button
                type="button"
                className={loop ? 'active' : ''}
                onClick={() => setLoop((v) => !v)}
                disabled={a == null}
                aria-pressed={loop}
                title={t('player.loopHint')}
              >
                <IconRepeat size={16} stroke={1.6} /> {t('player.loop')}
              </button>
              {a != null && (
                <>
                  <button type="button" className="icon-btn" onClick={() => seek(Math.min(a, b ?? a))} title={t('player.toA')} aria-label={t('player.toA')}>
                    <IconPlayerSkipBack size={16} stroke={1.6} />
                  </button>
                  <button type="button" className="icon-btn" onClick={clearLoop} title={t('player.clearLoop')} aria-label={t('player.clearLoop')}>
                    <IconX size={16} stroke={1.6} />
                  </button>
                </>
              )}
            </div>

            {kind === 'video' && (
              <div className="player-size" role="group" aria-label={t('player.size')}>
                {['s', 'm', 'l'].map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={videoSize === size ? 'active' : ''}
                    aria-pressed={videoSize === size}
                    onClick={() => setVideoSize(size)}
                    title={t(`player.sizes.${size}`)}
                  >
                    {t(`player.sizeShort.${size}`)}
                  </button>
                ))}
                <button type="button" className="icon-btn" onClick={fullscreen} title={t('player.fullscreen')} aria-label={t('player.fullscreen')}>
                  <IconMaximize size={16} stroke={1.6} />
                </button>
              </div>
            )}

            <form
              className="player-jump"
              onSubmit={(e) => {
                e.preventDefault()
                jump()
              }}
            >
              <input value={jumpText} onChange={(e) => setJumpText(e.target.value)} placeholder={t('player.jumpPlaceholder')} aria-label={t('player.jump')} />
              <button type="submit" disabled={parseTime(jumpText) == null}>
                {t('player.jump')}
              </button>
            </form>
          </div>
        </>
      )}

      <div>
        <button type="button" className="link" onClick={openExternally}>
          <IconExternalLink size={14} stroke={1.8} /> {t('player.openExternal')}
        </button>
      </div>
    </div>
  )
}
