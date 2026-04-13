const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().split('T')[0];
}

function missingKey(name) {
  return !process.env[name] || process.env[name].startsWith('YOUR_');
}

// ─── AIS — AISHub ─────────────────────────────────────────────────────────────

app.get('/api/ais', async (req, res) => {
  if (missingKey('AISHUB_API_KEY')) {
    return res.json({ error: 'AISHub API key not configured. Add AISHUB_API_KEY to .env', data: [] });
  }
  try {
    const response = await axios.get('http://data.aishub.net/ws.php', {
      params: {
        username: process.env.AISHUB_API_KEY,
        format: 1,
        output: 'json',
        compress: 0
      },
      timeout: 12000
    });

    // AISHub returns: [ {status_object}, vessel1, vessel2, ... ]
    let raw = response.data;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { raw = []; }
    }
    const vessels = Array.isArray(raw) ? raw.slice(1) : [];
    const data = vessels.filter(v => v.LONGITUDE !== undefined && v.LATITUDE !== undefined);

    console.log(`[AIS] ${data.length} vessels`);
    res.json({ data });
  } catch (err) {
    console.error('[AIS] Error:', err.message);
    res.status(500).json({ error: err.message, data: [] });
  }
});

// ─── Aircraft — OpenSky ────────────────────────────────────────────────────────

app.get('/api/aircraft', async (req, res) => {
  try {
    const config = { timeout: 15000 };

    if (!missingKey('OPENSKY_USERNAME') && process.env.OPENSKY_USERNAME) {
      config.auth = {
        username: process.env.OPENSKY_USERNAME,
        password: process.env.OPENSKY_PASSWORD || ''
      };
    }

    const response = await axios.get(
      'https://opensky-network.org/api/states/all',
      config
    );

    // OpenSky states: array of [icao24, callsign, origin_country, time_position,
    //   last_contact, longitude, latitude, baro_altitude, on_ground, velocity,
    //   true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source]
    const states = (response.data.states || [])
      .filter(s => s[5] !== null && s[6] !== null)   // must have a position
      .slice(0, 3000);                                 // cap for performance

    const data = states.map(s => ({
      icao24:    s[0],
      callsign:  (s[1] || '').trim() || s[0],
      country:   s[2],
      longitude: s[5],
      latitude:  s[6],
      altitude:  s[7],
      on_ground: s[8],
      velocity:  s[9],
      heading:   s[10]
    }));

    console.log(`[Aircraft] ${data.length} aircraft`);
    res.json({ data });
  } catch (err) {
    console.error('[Aircraft] Error:', err.message);
    // OpenSky sometimes 429s — return empty gracefully
    res.status(err.response?.status || 500).json({ error: err.message, data: [] });
  }
});

// ─── Conflicts — ACLED ────────────────────────────────────────────────────────

app.get('/api/conflicts', async (req, res) => {
  if (missingKey('ACLED_API_KEY') || missingKey('ACLED_EMAIL')) {
    return res.json({ error: 'ACLED credentials not configured. Add ACLED_API_KEY and ACLED_EMAIL to .env', data: [] });
  }

  const today        = new Date();
  const thirtyAgo    = new Date(today - 30 * 24 * 60 * 60 * 1000);

  try {
    const response = await axios.get('https://api.acleddata.com/acled/read', {
      params: {
        key:              process.env.ACLED_API_KEY,
        email:            process.env.ACLED_EMAIL,
        limit:            500,
        fields:           'event_date|event_type|country|latitude|longitude|fatalities|actor1|actor2|notes',
        event_date:       isoDate(thirtyAgo),
        event_date_where: 'BETWEEN',
        event_date_to:    isoDate(today)
      },
      timeout: 20000
    });

    const data = response.data.data || [];
    console.log(`[Conflicts] ${data.length} events`);
    res.json({ data });
  } catch (err) {
    console.error('[Conflicts] Error:', err.message);
    res.status(500).json({ error: err.message, data: [] });
  }
});

// ─── Claude Chat ──────────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  if (missingKey('ANTHROPIC_API_KEY')) {
    return res.status(400).json({
      error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to .env'
    });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      'claude-sonnet-4-6',
        max_tokens: 1024,
        system:     'You are a geopolitical intelligence analyst assistant embedded in a real-time situational awareness platform. The map shows live vessel positions (AIS via AISHub), live aircraft (OpenSky Network), and recent armed conflict events (ACLED — last 30 days). Help users understand maritime activity, aviation patterns, and conflict dynamics. Be concise but substantive. Use specific geographic and geopolitical context when relevant.',
        messages
      },
      {
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json'
        },
        timeout: 30000
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error('[Chat] Error:', err.response?.data || err.message);
    res.status(500).json({
      error: err.response?.data?.error?.message || err.message
    });
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    keys: {
      aishub:     !missingKey('AISHUB_API_KEY'),
      opensky:    !missingKey('OPENSKY_USERNAME'),
      acled:      !missingKey('ACLED_API_KEY'),
      anthropic:  !missingKey('ANTHROPIC_API_KEY')
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌍 GEOINT backend running on http://localhost:${PORT}`);
  console.log(`   /api/ais        — AISHub maritime vessels`);
  console.log(`   /api/aircraft   — OpenSky live aircraft`);
  console.log(`   /api/conflicts  — ACLED conflict events`);
  console.log(`   /api/chat       — Claude AI chat proxy\n`);
});
