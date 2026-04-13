#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   🌍  GEOINT MVP — Geopolitical Intelligence    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Create .env from example if not present
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📋  Created .env from .env.example"
  echo "⚠️   Edit .env with your API keys, then re-run this script."
  echo ""
  echo "    Required keys:"
  echo "    • AISHUB_API_KEY    → https://www.aishub.net/"
  echo "    • ACLED_API_KEY     → https://acleddata.com/access-data/"
  echo "    • ANTHROPIC_API_KEY → https://console.anthropic.com/"
  echo ""
  exit 0
fi

# Install all dependencies
echo "📦  Installing dependencies (first run may take ~1 min)..."
npm run install:all --silent
echo "✅  All dependencies installed"
echo ""

# Launch
echo "🚀  Starting GEOINT MVP..."
echo "    Backend  → http://localhost:3001"
echo "    Frontend → http://localhost:5173"
echo ""
echo "    Open http://localhost:5173 in your browser"
echo "    Press Ctrl+C to stop"
echo ""
npm start
