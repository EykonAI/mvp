import { useState, useEffect, useCallback } from 'react'
import MapView from './components/MapView'
import ChatPanel from './components/ChatPanel'
import LayerControls from './components/LayerControls'
import { API_URL } from './config'
import './App.css'

const REFRESH_MS = {
  vessels:   60_000,   // AIS: every 60s
  aircraft:  30_000,   // OpenSky: every 30s
  conflicts: null      // ACLED: once (static for session)
}

const initialStatus = (visible = true) => ({
  visible,
  loading: false,
  error: null,
  count: 0,
  lastFetch: null
})

export default function App() {
  const [vessels,   setVessels]   = useState([])
  const [aircraft,  setAircraft]  = useState([])
  const [conflicts, setConflicts] = useState([])

  const [status, setStatus] = useState({
    vessels:   initialStatus(true),
    aircraft:  initialStatus(true),
    conflicts: initialStatus(true)
  })

  const fetchLayer = useCallback(async (name, url, setter) => {
    setStatus(s => ({ ...s, [name]: { ...s[name], loading: true, error: null } }))
    try {
      const res  = await fetch(url)
      const json = await res.json()

      if (json.error && (!json.data || json.data.length === 0)) {
        setStatus(s => ({
          ...s,
          [name]: { ...s[name], loading: false, error: json.error, lastFetch: new Date() }
        }))
        return
      }

   const data = Array.isArray(json) ? json : (json.data || json.states || []);
      setter(data)
      setStatus(s => ({
        ...s,
        [name]: { ...s[name], loading: false, error: null, count: data.length, lastFetch: new Date() }
      }))
    } catch (err) {
      setStatus(s => ({
        ...s,
        [name]: { ...s[name], loading: false, error: err.message, lastFetch: new Date() }
      }))
    }
  }, [])

  // Initial load + polling
  useEffect(() => {
    fetchLayer('vessels',   `${API_URL}/api/ais`,       setVessels)
    fetchLayer('aircraft',  `${API_URL}/api/aircraft`,  setAircraft)
    fetchLayer('conflicts', `${API_URL}/api/conflicts`, setConflicts)

    const iv = setInterval(
      () => fetchLayer('vessels', `${API_URL}/api/ais`, setVessels),
      REFRESH_MS.vessels
    )
    const ia = setInterval(
      () => fetchLayer('aircraft', `${API_URL}/api/aircraft`, setAircraft),
      REFRESH_MS.aircraft
    )

    return () => { clearInterval(iv); clearInterval(ia) }
  }, [fetchLayer])

  const toggleLayer = name =>
    setStatus(s => ({ ...s, [name]: { ...s[name], visible: !s[name].visible } }))

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-globe">🌍</span>
          <span className="brand-name">GEOINT</span>
          <span className="brand-tag">Intelligence Platform</span>
        </div>
        <LayerControls status={status} onToggle={toggleLayer} />
        <div className="header-version">MVP v1.0</div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="app-body">
        <div className="map-wrapper">
          <MapView
            vessels={   status.vessels.visible   ? vessels   : []}
            aircraft={  status.aircraft.visible  ? aircraft  : []}
            conflicts={ status.conflicts.visible ? conflicts : []}
          />
        </div>
        <ChatPanel />
      </div>
    </div>
  )
}
