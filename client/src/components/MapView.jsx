import { useState, useCallback } from 'react'
import DeckGL from '@deck.gl/react'
import { ScatterplotLayer } from '@deck.gl/layers'
import Map from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import './MapView.css'

// Free CartoDB dark basemap — no API key required
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const INITIAL_VIEW = {
  longitude: 20,
  latitude:  20,
  zoom:      2.2,
  pitch:     0,
  bearing:   0
}

// Vessel type codes → label
const VESSEL_TYPES = {
  0:  'Unknown', 20: 'WIG', 30: 'Fishing', 31: 'Towing', 36: 'Sailing',
  37: 'Pleasure', 50: 'Pilot', 51: 'SAR', 52: 'Tug', 55: 'Law Enforcement',
  60: 'Passenger', 70: 'Cargo', 80: 'Tanker', 90: 'Other'
}

function vesselTypeName(type) {
  if (!type) return 'Unknown'
  const t = parseInt(type)
  if (t >= 60 && t < 70) return 'Passenger'
  if (t >= 70 && t < 80) return 'Cargo'
  if (t >= 80 && t < 90) return 'Tanker'
  return VESSEL_TYPES[t] || `Type ${t}`
}

function formatAltitude(alt) {
  if (alt === null || alt === undefined) return 'Ground'
  return `${Math.round(alt).toLocaleString()} m`
}

export default function MapView({ vessels, aircraft, conflicts }) {
  const [tooltip, setTooltip] = useState(null)

  const handleHover = useCallback(({ object, x, y, layer }) => {
    if (!object || !layer) {
      setTooltip(null)
      return
    }

    let lines = []
    const id = layer.id

    if (id === 'vessels') {
      lines = [
        `🚢  ${object.NAME || 'Unknown Vessel'}`,
        `Type: ${vesselTypeName(object.TYPE)}`,
        `MMSI: ${object.MMSI}`,
        `Speed: ${object.SOG != null ? object.SOG + ' kn' : 'N/A'}`,
        `Heading: ${object.HEADING != null ? object.HEADING + '°' : 'N/A'}`,
        object.DEST ? `Destination: ${object.DEST}` : null,
        object.CALLSIGN ? `Callsign: ${object.CALLSIGN}` : null
      ]
    } else if (id === 'aircraft') {
      lines = [
        `✈️  ${object.callsign || object.icao24}`,
        `Country: ${object.country || 'Unknown'}`,
        `Altitude: ${formatAltitude(object.altitude)}`,
        `Speed: ${object.velocity ? Math.round(object.velocity * 1.94384) + ' kn' : 'N/A'}`,
        `Heading: ${object.heading != null ? Math.round(object.heading) + '°' : 'N/A'}`,
        object.on_ground ? '📍 On ground' : null
      ]
    } else if (id === 'conflicts') {
      lines = [
        `⚠️  ${object.event_type}`,
        `${object.country} — ${object.event_date}`,
        `${object.actor1}${object.actor2 ? ' vs ' + object.actor2 : ''}`,
        `Fatalities: ${object.fatalities || 0}`,
        object.notes ? `Note: ${object.notes.slice(0, 80)}${object.notes.length > 80 ? '…' : ''}` : null
      ]
    }

    setTooltip({ lines: lines.filter(Boolean), x, y })
  }, [])

  const layers = [
    new ScatterplotLayer({
      id:              'vessels',
      data:            vessels,
      getPosition:     d => [d.LONGITUDE, d.LATITUDE],
      getFillColor:    [30, 130, 255, 210],
      getLineColor:    [60, 160, 255, 150],
      stroked:         true,
      lineWidthMinPixels: 1,
      getRadius:       35_000,
      radiusMinPixels: 3,
      radiusMaxPixels: 9,
      pickable:        true,
      onHover:         handleHover,
      updateTriggers:  { getPosition: vessels }
    }),

    new ScatterplotLayer({
      id:              'aircraft',
      data:            aircraft,
      getPosition:     d => [d.longitude, d.latitude],
      getFillColor:    d => d.on_ground ? [120, 120, 120, 180] : [255, 210, 0, 220],
      getRadius:       28_000,
      radiusMinPixels: 2,
      radiusMaxPixels: 7,
      pickable:        true,
      onHover:         handleHover,
      updateTriggers:  { getPosition: aircraft }
    }),

    new ScatterplotLayer({
      id:              'conflicts',
      data:            conflicts,
      getPosition:     d => [parseFloat(d.longitude), parseFloat(d.latitude)],
      getFillColor:    d => {
        const f = parseInt(d.fatalities || 0)
        const alpha = Math.min(255, 140 + f * 4)
        return [255, 40, 40, alpha]
      },
      getLineColor:    [255, 100, 100, 100],
      stroked:         true,
      lineWidthMinPixels: 1,
      getRadius:       d => Math.max(55_000, parseInt(d.fatalities || 0) * 9_000 + 55_000),
      radiusMinPixels: 5,
      radiusMaxPixels: 28,
      pickable:        true,
      onHover:         handleHover,
      updateTriggers:  { getPosition: conflicts }
    })
  ]

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DeckGL
        initialViewState={INITIAL_VIEW}
        controller={true}
        layers={layers}
        style={{ width: '100%', height: '100%' }}
        getCursor={({ isDragging, isHovering }) =>
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
        }
      >
        <Map mapStyle={MAP_STYLE} />
      </DeckGL>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="map-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          {tooltip.lines.map((line, i) => (
            <div key={i} className={i === 0 ? 'tooltip-title' : 'tooltip-row'}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="map-legend">
        <div className="legend-row">
          <span className="legend-dot dot-vessel" />
          <span>Vessels (AIS)</span>
        </div>
        <div className="legend-row">
          <span className="legend-dot dot-aircraft" />
          <span>Aircraft</span>
        </div>
        <div className="legend-row">
          <span className="legend-dot dot-conflict" />
          <span>Conflicts (30d)</span>
        </div>
      </div>
    </div>
  )
}
