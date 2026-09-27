import { useState } from 'react'
import FolderSettings from '../components/FolderSettings.jsx'
import ImportPreview from '../components/ImportPreview.jsx'
import ImportCard from '../components/ImportCard.jsx'
import AiSettings from '../components/AiSettings.jsx'
import { IconWand } from '@tabler/icons-react'
import { t } from '../../shared/i18n.js'

// Reiter „Datenquellen“: Ordner, Vorschau, Einlesen, KI
export default function Settings({ onOpenWizard }) {
  // Nach einem KI-Einlesen die KI-Karte neu laden (Kosten, Guthaben, „Nachfragen“)
  const [aiRefresh, setAiRefresh] = useState(0)

  return (
    <div className="page">
      <div className="page-inner">
        <FolderSettings />
        <ImportPreview />
        <ImportCard onAiUsed={() => setAiRefresh((n) => n + 1)} />
        <AiSettings key={aiRefresh} />
        <div className="button-row">
          <button type="button" className="link" onClick={onOpenWizard}>
            <IconWand size={14} stroke={1.8} /> {t('wizard.open')}
          </button>
        </div>
      </div>
    </div>
  )
}
