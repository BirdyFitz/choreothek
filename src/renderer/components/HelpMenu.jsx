import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { IconHelpCircle, IconBook, IconBug, IconInfoCircle, IconMail, IconCopy, IconBrandGithub, IconCoffee, IconX } from '@tabler/icons-react'
import { GUIDE_URL } from './Help.jsx'
import { t } from '../../shared/i18n.js'

export const SUPPORT_MAIL = 'support@choreothek.eu'
export const REPO_URL = 'https://github.com/BirdyFitz/choreothek'
export const DONATE_URL = 'https://paypal.me/ZumbaHadde'
const SITE_URL = 'https://choreothek.eu'
// mailto-Links werden von Windows/Mailprogrammen bei zu langer Länge abgeschnitten
const MAIL_MAX = 1800

function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="editor-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} title={t('about.close')} aria-label={t('about.close')}>
            <IconX size={16} stroke={1.6} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ProblemDialog({ onClose }) {
  const [description, setDescription] = useState('')
  const [report, setReport] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setReport((await axios.post('/api/problem-report', { description })).data.text)
      } catch {
        setReport('')
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [description])

  const subject = t('problem.subject')
  const mailBody = report.length > MAIL_MAX ? `${report.slice(0, MAIL_MAX)}\n…` : report
  const mailto = `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`
  const issue = `${REPO_URL}/issues/new?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(report.slice(0, 5000))}`

  const copy = async () => {
    await navigator.clipboard.writeText(report)
    setCopied(true)
  }

  return (
    <Dialog title={t('problem.title')} onClose={onClose}>
      <p className="hint">{t('problem.hint')}</p>
      <div className="field">
        <label htmlFor="problem-text">{t('problem.describe')}</label>
        <textarea id="problem-text" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('problem.placeholder')} />
      </div>
      <div className="field">
        <span className="field-label">{t('problem.report')}</span>
        <pre className="problem-report">{report}</pre>
      </div>
      <div className="button-row">
        <a className="button primary" href={mailto} target="_blank" rel="noreferrer">
          <IconMail size={16} stroke={1.6} /> {t('problem.mail')}
        </a>
        <button type="button" onClick={copy}>
          <IconCopy size={16} stroke={1.6} /> {copied ? t('problem.copied') : t('problem.copy')}
        </button>
        <a className="button" href={issue} target="_blank" rel="noreferrer" title={t('problem.githubHint')}>
          <IconBrandGithub size={16} stroke={1.6} /> {t('problem.github')}
        </a>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        {t('problem.privacy', { mail: SUPPORT_MAIL })}
      </p>
    </Dialog>
  )
}

function AboutDialog({ onClose }) {
  const [info, setInfo] = useState(null)
  useEffect(() => {
    axios.get('/api/about').then((res) => setInfo(res.data)).catch(() => setInfo(null))
  }, [])
  return (
    <Dialog title={t('about.title')} onClose={onClose}>
      <p>{t('about.description')}</p>
      {info && (
        <dl className="props about-props">
          <dt>{t('about.version')}</dt>
          <dd>{info.version}</dd>
          <dt>{t('about.license')}</dt>
          <dd>
            <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
              {t('about.licenseName')}
            </a>
          </dd>
          <dt>{t('about.source')}</dt>
          <dd>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              {t('about.repoLabel')}
            </a>
          </dd>
          <dt>{t('about.website')}</dt>
          <dd>
            <a href={SITE_URL} target="_blank" rel="noreferrer">
              {t('about.siteLabel')}
            </a>
          </dd>
          <dt>{t('about.system')}</dt>
          <dd>{t('about.systemValue', { os: info.os, electron: info.electron || '–' })}</dd>
        </dl>
      )}
      <div className="about-donate">
        <p>{t('about.donateText')}</p>
        <a className="button primary" href={DONATE_URL} target="_blank" rel="noreferrer">
          <IconCoffee size={16} stroke={1.6} /> {t('about.donate')}
        </a>
      </div>
      {info && (
        <details>
          <summary>{t('about.thirdParty')}</summary>
          <ul className="license-list">
            {info.licenses.map((l) => (
              <li key={l.name}>{t('about.licenseItem', { name: l.name, version: l.version || '', license: l.license })}</li>
            ))}
            <li>{t('about.ffmpeg')}</li>
          </ul>
        </details>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        {t('about.trademark')}
      </p>
    </Dialog>
  )
}

// „?“ in der Kopfleiste: Anleitung, Problem melden, Über Choreothek
export default function HelpMenu() {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const choose = (d) => {
    setOpen(false)
    setDialog(d)
  }

  return (
    <div className="help-menu" ref={ref}>
      <button type="button" className="ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title={t('helpMenu.title')}>
        <IconHelpCircle size={18} stroke={1.6} />
      </button>
      {open && (
        <div className="help-menu-list" role="menu">
          <a role="menuitem" href={GUIDE_URL} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <IconBook size={16} stroke={1.6} /> {t('helpMenu.guide')}
          </a>
          <button type="button" role="menuitem" onClick={() => choose('problem')}>
            <IconBug size={16} stroke={1.6} /> {t('helpMenu.problem')}
          </button>
          <button type="button" role="menuitem" onClick={() => choose('about')}>
            <IconInfoCircle size={16} stroke={1.6} /> {t('helpMenu.about')}
          </button>
        </div>
      )}
      {dialog === 'problem' && <ProblemDialog onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
    </div>
  )
}
