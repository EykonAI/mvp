@echo off
echo.
echo  ============================================================
echo   GEOINT MVP - Geopolitical Intelligence Platform
echo  ============================================================
echo.

if not exist .env (
  copy .env.example .env
  echo  Created .env from .env.example
  echo  IMPORTANT: Edit .env with your API keys, then re-run this script.
  echo.
  echo  Required keys:
  echo    AISHUB_API_KEY    -^> https://www.aishub.net/
  echo    ACLED_API_KEY     -^> https://acleddata.com/access-data/
  echo    ANTHROPIC_API_KEY -^> https://console.anthropic.com/
  echo.
  pause
  exit /b 0
)

echo  Installing dependencies...
call npm run install:all
echo  Dependencies installed.
echo.

echo  Starting GEOINT MVP...
echo  Backend  -^> http://localhost:3001
echo  Frontend -^> http://localhost:5173
echo.
echo  Open http://localhost:5173 in your browser
echo.
call npm start
