// client/src/config.js
// API base URL — reads from environment variable in production,
// falls back to localhost for local development.
//
// Local dev:  set VITE_API_URL=http://localhost:3001 in client/.env
// Production: set VITE_API_URL=https://mvp.eykon.ai in Railway variables

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
