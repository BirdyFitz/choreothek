import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './styles.css'

// Sitzungs-Token vom Hauptprozess: ohne ihn nimmt der lokale Server keine ändernden Anfragen an
// Fehler der Oberfläche ins Protokoll für „Problem melden“ (bereinigt auf dem Server)
function reportError(message) {
  axios.post('/api/client-error', { message: String(message).slice(0, 1000) }).catch(() => {})
}
window.addEventListener('error', (e) => reportError(e.error?.stack || e.message))
window.addEventListener('unhandledrejection', (e) => reportError(e.reason?.stack || e.reason))

async function start() {
  if (window.choreothek) {
    axios.defaults.headers.common['X-Choreothek-Token'] = await window.choreothek.getToken()
  }
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

start()
