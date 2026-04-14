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

// Conflict event type → RGBA fill colour
function conflictColour(eventType, fatalities) {
  const f     = parseInt(fatalities || 0)
  const alpha = Math.min(230, 160 + f * 3)
  const map = {
    'Battles':                    [255,  50,  50, alpha],
    'Explosions/Remote violence': [255, 130,   0, alpha],
    'Violence against civilians': [210,  30,  60, alpha],
    'Protests':                   [ 79, 195, 247, alpha],
    'Riots':                      [255, 210,   0, alpha],
    'Strategic developments':     [150, 170, 180, alpha],
  }
  return map[eventType] || [255, 50, 50, alpha]
}

// ── Props ──────────────────────────────────────────────────────────────────
// vessels   — array from /api/vessels  (AISHub raw objects)
// aircraft  — array from /api/aircraft (adsb.lol normalised objects)
// conflicts — array from /api/conflicts → result.data  (ACLED raw events)
// visible   — { vessels, aircraft, conflicts } boolean map (from LayerControls)

export default function MapView({ vessels, aircraft, conflicts, visible = {} }) {
  const [tooltip, setTooltip] = useState(null)

  const handleHover = useCallback(({ object, x, y, layer }) => {
    if (!object || !layer) {
      setTooltip(null)
      return
    }

    let lines = []
    const id  = layer.id

    if (id === 'vessels') {
      lines = [
        `🚢  ${object.NAME || 'Unknown Vessel'}`,
        `Type: ${vesselTypeName(object.TYPE)}`,
        `MMSI: ${object.MMSI}`,
        `Speed: ${object.SOG != null ? object.SOG + ' kn' : 'N/A'}`,
        `Heading: ${object.HEADING != null ? object.HEADING + '°' : 'N/A'}`,
        object.DEST      ? `Destination: ${object.DEST}`    : null,
        object.CALLSIGN  ? `Callsign: ${object.CALLSIGN}`   : null,
      ]
    } else if (id === 'aircraft') {
      lines = [
        `✈️  ${object.callsign || object.icao24}`,
        `Country: ${object.country || 'Unknown'}`,
        `Altitude: ${formatAltitude(object.altitude)}`,
        `Speed: ${object.velocity ? Math.round(object.velocity * 1.94384) + ' kn' : 'N/A'}`,
        `Heading: ${object.heading != null ? Math.round(object.heading) + '°' : 'N/A'}`,
        object.on_ground ? '📍 On ground' : null,
      ]
    } else if (id === 'conflicts') {
      // ACLED fields: event_type, event_date, country, admin1, actor1, actor2, fatalities, notes, sub_event_type
      const loc = [object.location, object.admin1, object.country].filter(Boolean).join(', ')
      lines = [
        `⚠️  ${object.event_type}`,
        `📍 ${loc}  ·  ${object.event_date}`,
        `${object.actor1}${object.actor2 ? ' vs ' + object.actor2 : ''}`,
        parseInt(object.fatalities || 0) > 0
          ? `Fatalities: ${object.fatalities}`
          : null,
        object.sub_event_type
          ? `Subtype: ${object.sub_event_type}`
          : null,
        object.notes
          ? `Note: ${object.notes.slice(0, 100)}${object.notes.length > 100 ? '…' : ''}`
          : null,
        `Source: ${object.source || 'ACLED'}`,
      ]
    }

    setTooltip({ lines: lines.filter(Boolean), x, y })
  }, [])

  const layers = [
    new ScatterplotLayer({
      id:                  'vessels',
      data:                vessels,
      visible:             visible.vessels !== false,
      getPosition:         d => [d.LONGITUDE, d.LATITUDE],
      getFillColor:        [30, 130, 255, 210],
      getLineColor:        [60, 160, 255, 150],
      stroked:             true,
      lineWidthMinPixels:  1,
      getRadius:           35_000,
      radiusMinPixels:     3,
      radiusMaxPixels:     9,
      pickable:            true,
      onHover:             handleHover,
      updateTriggers:      { getPosition: vessels },
    }),

    new ScatterplotLayer({
      id:              'aircraft',
      data:            aircraft,
      visible:         visible.aircraft !== false,
      getPosition:     d => [d.longitude, d.latitude],
      getFillColor:    d => d.on_ground ? [120, 120, 120, 180] : [255, 210, 0, 220],
      getRadius:       28_000,
      radiusMinPixels: 2,
      radiusMaxPixels: 7,
      pickable:        true,
      onHover:         handleHover,
      updateTriggers:  { getPosition: aircraft },
    }),

    new ScatterplotLayer({
      id:              'conflicts',
      // conflicts prop is now result.data — array of raw ACLED event objects
      data:            conflicts,
      visible:         visible.conflicts !== false,
      getPosition:     d => [parseFloat(d.longitude), parseFloat(d.latitude)],
      // Colour by event type with alpha scaled by fatality count
      getFillColor:    d => conflictColour(d.event_type, d.fatalities),
      getLineColor:    [255, 100, 100, 80],
      stroked:         true,
      lineWidthMinPixels: 1,
      // Radius in metres: baseline 55km + 9km per fatality, capped at 200km
      getRadius:       d => Math.min(55_000 + parseInt(d.fatalities || 0) * 9_000, 200_000),
      radiusMinPixels: 4,
      radiusMaxPixels: 28,
      pickable:        true,
      onHover:         handleHover,
      updateTriggers:  { getPosition: conflicts, getFillColor: conflicts },
    }),
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
