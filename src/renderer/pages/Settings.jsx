import { useState } from 'react'
import { IconWand, IconFolders, IconEye, IconDownload, IconSparkles, IconArchive } from '@tabler/icons-react'
import FolderSettings from '../components/FolderSettings.jsx'
import ImportPreview from '../components/ImportPreview.jsx'
import ImportCard from '../components/ImportCard.jsx'
import AiSettings from '../components/AiSettings.jsx'
import BackupCard from '../components/BackupCard.jsx'
import { usePersistent } from '../lib/usePersistent.js'
import { t } from '../../shared/i18n.js'

// Menü links: Gruppe „Datenquellen“ mit Ordner, Vorschau, Einlesen; dazu KI und Sicherung
const MENU = [
  { group: 'sources', items: [['folders', IconFolders], ['preview', IconEye], ['import', IconDownload]] },
  { items: [['ai', IconSparkles]] },
  { items: [['backup', IconArchive]] }
]

// Reiter „Einstellungen“
export default function Settings({ onOpenWizard }) {
  const [section, setSection] = usePersistent('settingsSection', 'folders')
  // Nach einem KI-Einlesen die KI-Einstellungen neu laden (Kosten, Guthaben, „Nachfragen“)
  const [aiRefresh, setAiRefresh] = useState(0)

  return (
    <div className="settings">
      <nav className="settings-menu" aria-label={t('settings.menu')}>
        {MENU.map((block, i) => (
          <div className="settings-menu-block" key={i}>
            {block.group && <span className="settings-menu-group">{t(`settings.groups.${block.group}`)}</span>}
            {block.items.map(([id, Icon]) => (
              <button
                key={id}
                type="button"
                className={`${section === id ? 'active' : ''} ${block.group ? 'sub' : ''}`}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => setSection(id)}
              >
                <Icon size={16} stroke={1.6} /> {t(`settings.sections.${id}`)}
              </button>
            ))}
          </div>
        ))}
        <span className="spacer" />
        <button type="button" className="link" onClick={onOpenWizard}>
          <IconWand size={14} stroke={1.8} /> {t('wizard.open')}
        </button>
      </nav>

      <div className="page">
        <div className="page-inner">
          {/* Nur ausgeblendet statt entfernt: ein laufendes Einlesen behält Fortschritt und Ergebnis */}
          <div hidden={section !== 'folders'}>
            <FolderSettings />
          </div>
          <div hidden={section !== 'preview'}>
            <ImportPreview />
          </div>
          <div hidden={section !== 'import'}>
            <ImportCard onAiUsed={() => setAiRefresh((n) => n + 1)} />
          </div>
          <div hidden={section !== 'ai'}>
            <AiSettings key={aiRefresh} />
          </div>
          <div hidden={section !== 'backup'}>
            <BackupCard />
          </div>
        </div>
      </div>
    </div>
  )
}
