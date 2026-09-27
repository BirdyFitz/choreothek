import { useState } from 'react'
import { IconMusic, IconLayoutSidebar, IconLayoutSidebarRight } from '@tabler/icons-react'
import Search from './pages/Search.jsx'
import Settings from './pages/Settings.jsx'
import { usePersistent } from './lib/usePersistent.js'
import { t } from '../shared/i18n.js'

// Kopfleiste mit Reitern; auf „Suchen“ rechts die Schalter für Filter- und Detailbereich
// (wie „Details“ im Windows-Explorer), gemerkt über Neustarts hinweg.
export default function App() {
  const [activeTab, setActiveTab] = useState('search')
  const [showFilters, setShowFilters] = usePersistent('showFilters', true)
  const [showDetails, setShowDetails] = usePersistent('showDetails', true)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <IconMusic size={20} stroke={1.8} />
          {t('app.name')}
        </div>
        <nav className="tabs">
          <button className={`tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>
            {t('app.tabs.search')}
          </button>
          <button className={`tab ${activeTab === 'sources' ? 'active' : ''}`} onClick={() => setActiveTab('sources')}>
            {t('app.tabs.sources')}
          </button>
        </nav>
        {activeTab === 'search' && (
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

      <div className="main" style={{ display: activeTab === 'search' ? 'flex' : 'none' }}>
        <Search showFilters={showFilters} showDetails={showDetails} />
      </div>
      <div className="main" style={{ display: activeTab === 'sources' ? 'flex' : 'none' }}>
        <Settings />
      </div>
    </div>
  )
}
