// server/index.js
// GeoIntel MVP — Express backend
// Proxies: ACLED (conflict data), AISHub (vessel tracking), Anthropic (AI chat)

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const axios        = require('axios');
const path         = require('path');
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

// ─── ACLED helpers ─────────────────────────────────────────────────────────

// Fields requested from ACLED — matches exactly what MapView.jsx accesses
const ACLED_FIELDS = [
  'event_id_cnty', 'event_date',
  'event_type', 'sub_event_type', 'disorder_type',
  'country', 'admin1', 'admin2', 'location',
  'actor1', 'assoc_actor_1', 'actor2', 'assoc_actor_2',
  'latitude', 'longitude',
  'fatalities', 'notes', 'source',
].join('|');

// Paginate through all ACLED results for a given param set
async function fetchAllPages(baseParams) {
  const PAGE_SIZE = 5000;
  let page      = 1;
  let allEvents = [];

  while (true) {
    const data = await acledGet({ ...baseParams, limit: PAGE_SIZE, page });
    const rows = data.data || [];
    allEvents  = allEvents.concat(rows);
    console.log(`[ACLED] Page ${page}: ${rows.length} rows (total: ${allEvents.length})`);
    if (rows.length < PAGE_SIZE) break;
    page++;
  }
  return allEvents;
}

// Simple in-process cache (replace with Redis in production)
let _cache      = null;
let _cachedAt   = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ─── ACLED — Conflict & Security Events ───────────────────────────────────
//
// GET /api/conflicts
//
// Query params (all optional):
//   days     int   — lookback window in days, default 30
//   country  str   — pipe-separated filter e.g. "Yemen|Sudan"
//   refresh  bool  — bypass cache and force fresh fetch
//
// Returns: { data: [...events], count: N, metadata: {...} }
// Response shape is identical to raw ACLED — App.jsx needs no changes.

app.get('/api/conflicts', async (req, res) => {
  try {
    const days    = parseInt(req.query.days, 10) || 30;
    const country = req.query.country || null;
    const refresh = req.query.refresh === 'true';

    if (refresh) _cachedAt = 0;

    // Serve from cache if still fresh
    if (_cache && (Date.now() - _cachedAt) < CACHE_TTL) {
      let events = _cache.data;
      if (country) {
        const allowed = new Set(country.toLowerCase().split('|').map(s => s.trim()));
        events = events.filter(e => allowed.has((e.country || '').toLowerCase()));
      }
      return res.json({ data: events, count: events.length, metadata: _cache.metadata });
    }

    // Build date range
    const fmt  = d => d.toISOString().slice(0, 10);
    const now  = new Date();
    const from = new Date();
    from.setDate(now.getDate() - days);

    const params = {
      event_date:       fmt(from),
      event_date_where: 'BETWEEN',
      event_date2:      fmt(now),
      fields:           ACLED_FIELDS,
    };

    const events = await fetchAllPages(params);

    const metadata = {
      count:       events.length,
      date_from:   fmt(from),
      date_to:     fmt(now),
      source:      'ACLED – Armed Conflict Location & Event Data',
      attribution: '© ACLED (acleddata.com)',
      generated:   new Date().toISOString(),
    };

    // Cache the full global result
    _cache    = { data: events, metadata };
    _cachedAt = Date.now();

    // Apply optional country filter post-cache
    let result = events;
    if (country) {
      const allowed = new Set(country.toLowerCase().split('|').map(s => s.trim()));
      result = events.filter(e => allowed.has((e.country || '').toLowerCase()));
    }

    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data: result, count: result.length, metadata });

  } catch (err) {
    console.error('[/api/conflicts]', err.message);
    res.status(500).json({ error: 'ACLED request failed', detail: err.message });
  }
});

// GET /api/conflicts/stats — summary for the nav badge
app.get('/api/conflicts/stats', async (req, res) => {
  try {
    if (!_cache) return res.json({ total: 0, total_fatalities: 0, by_type: {} });

    const byType = {};
    let total_fatalities = 0;
    _cache.data.forEach(e => {
      const t = e.event_type || 'Unknown';
      byType[t] = (byType[t] || 0) + 1;
      total_fatalities += parseInt(e.fatalities || 0, 10);
    });

    res.json({
      total:            _cache.data.length,
      total_fatalities,
      by_type:          byType,
      last_updated:     _cache.metadata?.generated || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AISHub — Live Vessel Tracking ────────────────────────────────────────

app.get('/api/vessels', async (req, res) => {
  try {
    const { mmsi, imo, latmin, latmax, lonmin, lonmax } = req.query;

    const params = {
      username: process.env.AISHUB_API_KEY,
      format:   1,
      output:   'json',
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

// ─── Aircraft — adsb.lol ──────────────────────────────────────────────────

app.get('/api/aircraft', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.adsb.lol/v2/lat/48.0/lon/10.0/dist/2000',
      { timeout: 10000 }
    );
    const states = (response.data.ac || []).map(a => ({
      icao24:    a.hex,
      callsign:  a.flight?.trim() || null,
      longitude: a.lon,
      latitude:  a.lat,
      altitude:  a.alt_baro,
      velocity:  a.gs,
      heading:   a.track,
      on_ground: a.alt_baro === 'ground',
      country:   a.r || null,
    }));
    res.json(states);
  } catch (err) {
    console.error('[/api/aircraft]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Anthropic — AI Chat ──────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const messages = [...history, { role: 'user', content: message }];

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are a geopolitical intelligence analyst. You have access to live data on 
vessel movements (AIS), conflict events (ACLED), and global infrastructure. 
Provide concise, factual, and analytical responses. When referencing events, 
note the source and date if known. Avoid speculation beyond the available data.`,
        messages,
      },
      {
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type':      'application/json',
        },
      }
    );

    res.json({ reply: response.data.content[0].text, usage: response.data.usage });
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
  console.log(`[GeoIntel] Health:    http://localhost:${PORT}/health`);
  console.log(`[GeoIntel] Conflicts: http://localhost:${PORT}/api/conflicts`);
  console.log(`[GeoIntel] Vessels:   http://localhost:${PORT}/api/vessels`);
  console.log(`[GeoIntel] Aircraft:  http://localhost:${PORT}/api/aircraft`);
});
