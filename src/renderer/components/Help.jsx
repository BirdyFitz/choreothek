import { useState, useRef, useEffect, useId } from 'react'
import { IconExternalLink } from '@tabler/icons-react'
import { t } from '../../shared/i18n.js'

export const GUIDE_URL = 'https://choreothek.eu/anleitung'

// „?“ an einem Feld, einer Spalte oder Funktion. Zeigen blendet den Hilfetext ein, Klick heftet
// ihn an (bis Klick daneben oder Esc); per Tastatur: Tab zum „?“, Enter/Leertaste, Esc.
// id: Schlüssel unter help.* in der Sprachdatei; topic: Abschnitt der Anleitung für „Mehr erfahren“
export default function Help({ id, topic }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState(null)
  const button = useRef(null)
  const bubble = useRef(null)
  const hoverTimer = useRef(null)
  const bubbleId = useId()

  // Platz neben dem „?“ suchen, ohne über den Fensterrand zu ragen
  useEffect(() => {
    if (!open || !button.current) return
    const b = button.current.getBoundingClientRect()
    const width = 300
    const left = Math.max(8, Math.min(b.left - 12, window.innerWidth - width - 8))
    const below = b.bottom + 6
    const height = bubble.current?.offsetHeight || 120
    const top = below + height > window.innerHeight - 8 ? Math.max(8, b.top - height - 6) : below
    setPos({ left, top, width })
  }, [open])

  useEffect(() => {
    if (!pinned) return
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return
      if (e.type === 'mousedown' && (button.current?.contains(e.target) || bubble.current?.contains(e.target))) return
      setPinned(false)
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [pinned])

  const show = () => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setOpen(true), 350)
  }
  const hide = () => {
    clearTimeout(hoverTimer.current)
    if (!pinned) setOpen(false)
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="help-btn"
        aria-label={t('help.label')}
        aria-expanded={open}
        aria-describedby={open ? bubbleId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const next = !pinned
          setPinned(next)
          setOpen(next)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setPinned(false)
            setOpen(false)
          }
        }}
      >
        ?
      </button>
      {open && (
        <div
          ref={bubble}
          id={bubbleId}
          role="tooltip"
          className="help-bubble"
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: 'hidden' }}
          onMouseEnter={() => clearTimeout(hoverTimer.current)}
          onMouseLeave={hide}
        >
          <p>{t(`help.${id}`)}</p>
          <a href={`${GUIDE_URL}${topic ? `#${topic}` : ''}`} target="_blank" rel="noreferrer">
            {t('help.more')} <IconExternalLink size={12} stroke={1.8} />
          </a>
        </div>
      )}
    </>
  )
}
