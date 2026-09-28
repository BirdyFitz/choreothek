import { useState, useEffect } from 'react'
import axios from 'axios'
import { IconMusic, IconLayoutSidebar, IconLayoutSidebarRight } from '@tabler/icons-react'
import Search from './pages/Search.jsx'
import Settings from './pages/Settings.jsx'
import Library from './pages/Library.jsx'
import { OPEN_IN_LIBRARY } from './lib/events.js'
import SetupWizard from './pages/SetupWizard.jsx'
import { usePersistent } from './lib/usePersistent.js'
import { t } from '../shared/i18n.js'

// Kopfleiste mit Reitern; auf „Suchen“ rechts die Schalter für Filter- und Detailbereich
// (wie „Details“ im Windows-Explorer), gemerkt über Neustarts hinweg.
export default function App() {
  const [activeTab, setActiveTab] = useState('search')
  const [showFilters, setShowFilters] = usePersistent('showFilters', true)
  const [showDetails, setShowDetails] = usePersistent('showDetails', true)
  // Einrichtungsassistent beim ersten Start (oder auf Wunsch aus „Datenquellen“)
  const [wizard, setWizard] = useState(false)

  // „Bearbeiten“ im Detailbereich wechselt in die Bibliothek (die den Eintrag selbst öffnet)
  useEffect(() => {
    const open = () => setActiveTab('library')
    window.addEventListener(OPEN_IN_LIBRARY, open)
    return () => window.removeEventListener(OPEN_IN_LIBRARY, open)
  }, [])

  useEffect(() => {
    axios
      .get('/api/setup')
      .then((res) => setWizard(!res.data.done))
      .catch(() => setWizard(false))
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <IconMusic size={20} stroke={1.8} />
          {t('app.name')}
        </div>
        {!wizard && (
        <nav className="tabs">
          <button className={`tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>
            {t('app.tabs.search')}
          </button>
          <button className={`tab ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>
            {t('app.tabs.library')}
          </button>
          <button className={`tab ${activeTab === 'sources' ? 'active' : ''}`} onClick={() => setActiveTab('sources')}>
            {t('app.tabs.sources')}
          </button>
        </nav>
        )}
        {wizard && <span className="topbar-title">{t('wizard.title')}</span>}
        {!wizard && activeTab === 'search' && (
          <div className="topbar-right">
            <button
              className={`ghost ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              title={showFilters ? t('app.toggle.filterHide') : t('app.toggle.filterShow')}
              aria-pressed={showFilters}
            >
              <IconLayoutSidebar size={18} stroke={1.6} />
              {t('app.toggle.filter')}
            </button>
            <button
              className={`ghost ${showDetails ? 'active' : ''}`}
              onClick={() => setShowDetails(!showDetails)}
              title={showDetails ? t('app.toggle.detailsHide') : t('app.toggle.detailsShow')}
              aria-pressed={showDetails}
            >
              <IconLayoutSidebarRight size={18} stroke={1.6} />
              {t('app.toggle.details')}
            </button>
          </div>
        )}
      </header>

      {wizard && (
        <div className="main">
          <SetupWizard
            onFinish={() => {
              setWizard(false)
              setActiveTab('search')
            }}
          />
        </div>
      )}
      <div className="main" style={{ display: !wizard && activeTab === 'search' ? 'flex' : 'none' }}>
        <Search showFilters={showFilters} showDetails={showDetails} />
      </div>
      <div className="main" style={{ display: !wizard && activeTab === 'library' ? 'flex' : 'none' }}>
        <Library />
      </div>
      <div className="main" style={{ display: !wizard && activeTab === 'sources' ? 'flex' : 'none' }}>
        <Settings onOpenWizard={() => setWizard(true)} />
      </div>
    </div>
  )
}
