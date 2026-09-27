import { useRef } from 'react'
import { t } from '../../shared/i18n.js'

// Verschiebbare Trennlinie zwischen zwei Bereichen (wie im Windows-Explorer).
// side: 'left' = Bereich links der Linie wird breiter beim Ziehen nach rechts,
//       'right' = Bereich rechts der Linie wird breiter beim Ziehen nach links.
// Doppelklick: Standardbreite. Tastatur: Pfeil links/rechts (mit Umschalt größere Schritte).
export default function Splitter({ side, width, onChange, onReset, label }) {
  const start = useRef(null)

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, width }
    document.body.classList.add('resizing')
  }

  const onPointerMove = (e) => {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    onChange(side === 'left' ? start.current.width + dx : start.current.width - dx)
  }

  const onPointerUp = (e) => {
    if (!start.current) return
    start.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.classList.remove('resizing')
  }

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 40 : 10
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
    if (e.key === grow) onChange(width + step)
    else if (e.key === shrink) onChange(width - step)
    else if (e.key === 'Home' || e.key === 'Enter') onReset()
    else return
    e.preventDefault()
  }

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      tabIndex={0}
      title={t('app.splitter.hint', { label })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  )
}
