import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'

// Sitzungs-Token vom Hauptprozess: ohne ihn nimmt der lokale Server keine ändernden Anfragen an
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
