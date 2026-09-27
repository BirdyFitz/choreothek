import { useState } from 'react'
import Search from './pages/Search.jsx'
import Settings from './pages/Settings.jsx'

function App() {
  const [activeTab, setActiveTab] = useState('search')

  return (
    <div className="container">
      <div className="header">
        <h1>🎵 Choreothek</h1>
        <p>Dein Nachschlagewerk für Songs, Rhythmen und Choreos</p>
      </div>

      <div className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          🔍 Suchen
        </button>
        <button
          className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Einstellungen
        </button>
      </div>

      <div className="content">
        <div className={`tab-content ${activeTab === 'search' ? 'active' : ''}`}>
          <Search />
        </div>
        <div className={`tab-content ${activeTab === 'settings' ? 'active' : ''}`}>
          <Settings />
        </div>
      </div>
    </div>
  )
}

export default App
