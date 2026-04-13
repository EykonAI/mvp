# 🌍 GEOINT MVP — Geopolitical Intelligence Platform

Real-time map displaying live maritime vessels (AISHub), live aircraft (OpenSky), and conflict events (ACLED), with an AI analyst chat panel powered by Claude.

---

## Quick Start

### Prerequisites
- Node.js v18+ — https://nodejs.org/

### 1. Run the start script

**Mac / Linux:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
```
Double-click start.bat
```

The script will:
1. Create a `.env` file from `.env.example` on first run
2. Ask you to fill in your API keys
3. Install all dependencies automatically
4. Launch both the backend and frontend

### 2. Fill in API keys (`.env` file)

| Key | Where to get it | Free? |
|-----|----------------|-------|
| `AISHUB_API_KEY` | https://www.aishub.net/ (your username) | ✅ Yes |
| `ACLED_API_KEY` + `ACLED_EMAIL` | https://acleddata.com/access-data/ | ✅ Yes |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/ | Paid (has free tier) |
| `OPENSKY_USERNAME` / `OPENSKY_PASSWORD` | https://opensky-network.org/ | ✅ Optional |

> OpenSky works anonymously without credentials (limited to 400 API calls/day).

### 3. Open the app

Go to **http://localhost:5173**

---

## What You'll See

| Layer | Source | Colour | Refresh |
|-------|--------|--------|---------|
| 🚢 Vessels | AISHub AIS | Blue dots | 60s |
| ✈️ Aircraft | OpenSky Network | Yellow dots | 30s |
| ⚠️ Conflicts | ACLED (last 30 days) | Red dots (size = fatalities) | Static |

Each layer has a toggle button in the header.
Hover over any dot to see details.
The chat panel on the right connects to Claude (claude-sonnet-4-6).

---

## Architecture

```
geoint-mvp/
├── server/          Express backend (proxy for all APIs + CORS)
│   └── index.js
└── client/          React + Vite frontend
    └── src/
        ├── App.jsx
        └── components/
            ├── MapView.jsx     Deck.gl map with 3 layers
            ├── ChatPanel.jsx   Claude AI sidebar
            └── LayerControls.jsx
```

---

## Troubleshooting

**Map is blank** — The dark basemap loads from CartoDB (free, no key needed). Check your internet connection.

**Layer shows "!" badge** — API key is missing or invalid. Check your `.env` file.

**Chat returns error** — Verify `ANTHROPIC_API_KEY` in `.env`.

**Port 3001 already in use** — Change `PORT=3002` in `.env` and update `API_URL` in `client/src/config.js`.
