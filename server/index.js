// server/index.js
// GeoIntel MVP — Express backend
// Proxies: ACLED (conflict data), AISHub (vessel tracking), Anthropic (AI chat)

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const axios      = require('axios');const path = require('path');
const { acledGet } = require('./acled-auth');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ─── Health check ──────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── ACLED — Conflict & Security Events ───────────────────────────────────
// Uses OAuth token-based auth via acled-auth.js
// Docs: https://acleddata.com/api-documentation/getting-started
//
// Query params (all optional):
//   country     e.g. "Syria" or "Ukraine:OR:country=Syria"
//   event_date  e.g. "2024-01-01"
//   limit       default 100, max 5000
//
// Example: GET /api/conflicts?country=Ukraine&limit=200

app.get('/api/conflicts', async (req, res) => {
  try {
    const { country, event_date, event_date_where, limit } = req.query;

    const params = {
      limit: limit || 100
    };
    if (country)           params.country            = country;
    if (event_date)        params.event_date         = event_date;
    if (event_date_where)  params.event_date_where   = event_date_where;

    const data = await acledGet(params);
    res.json(data);
  } catch (err) {
    console.error('[/api/conflicts]', err.message);
    res.status(500).json({ error: 'ACLED request failed', detail: err.message });
  }
});

// ─── AISHub — Live Vessel Tracking ────────────────────────────────────────
// AISHub uses your registered USERNAME as the API credential.
// Docs: https://www.aishub.net/api
//
// Query params (all optional):
//   mmsi        filter by single vessel MMSI
//   imo         filter by IMO number
//   latmin/latmax/lonmin/lonmax  bounding box
//
// Example: GET /api/vessels?latmin=36&latmax=43&lonmin=28&lonmax=42

app.get('/api/vessels', async (req, res) => {
  try {
    const { mmsi, imo, latmin, latmax, lonmin, lonmax } = req.query;

    const params = {
      username: process.env.AISHUB_API_KEY,  // AISHub uses username as key
      format:   1,                            // 1 = JSON
      output:   'json'
    };

    if (mmsi)   params.mmsi   = mmsi;
    if (imo)    params.imo    = imo;
    if (latmin) params.latmin = latmin;
    if (latmax) params.latmax = latmax;
    if (lonmin) params.lonmin = lonmin;
    if (lonmax) params.lonmax = lonmax;

    const response = await axios.get('https://data.aishub.net/ws.php', { params });
    res.json(response.data);
  } catch (err) {
    console.error('[/api/vessels]', err.message);
    res.status(500).json({ error: 'AISHub request failed', detail: err.message });
  }
});
// Aircraft — adsb.lol (free, no key, cloud-friendly)
app.get('/api/aircraft', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.adsb.lol/v2/lat/48.0/lon/10.0/dist/2000',
      { timeout: 10000 }
    );
    const states = (response.data.ac || []).map(a => ({
      icao24: a.hex,
      callsign: a.flight?.trim() || null,
      longitude: a.lon,
      latitude: a.lat,
      altitude: a.alt_baro,
      velocity: a.gs,
      heading: a.track,
      on_ground: a.alt_baro === 'ground',
      country: a.r || null
    }));
   res.json(states);
  } catch (err) {
    console.error('[/api/aircraft] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
// ─── Anthropic — AI Chat (Geopolitical Analysis) ──────────────────────────
// Accepts a user message + optional conversation history.
// Returns a Claude-generated geopolitical briefing.
//
// POST /api/chat
// Body: { message: "What happened near the Red Sea in the last 48 hours?", history: [] }

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const messages = [
      ...history,
      { role: 'user', content: message }
    ];

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are a geopolitical intelligence analyst. You have access to live data on 
vessel movements (AIS), conflict events (ACLED), and global infrastructure. 
Provide concise, factual, and analytical responses. When referencing events, 
note the source and date if known. Avoid speculation beyond the available data.`,
        messages
      },
      {
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type':      'application/json'
        }
      }
    );

    const reply = response.data.content[0].text;
    res.json({ reply, usage: response.data.usage });
  } catch (err) {
    console.error('[/api/chat]', err.message);
    res.status(500).json({ error: 'Anthropic request failed', detail: err.message });
  }
});
// ─── Serve React frontend ──────────────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});
// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[GeoIntel] Backend running on port ${PORT}`);
  console.log(`[GeoIntel] Health: http://localhost:${PORT}/health`);
  console.log(`[GeoIntel] Endpoints: /api/conflicts  /api/vessels  /api/chat`);
});
