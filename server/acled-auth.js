// acled-auth.js
// ACLED OAuth authentication module for GeoIntel MVP
// Handles token acquisition, caching, refresh, and authenticated API calls.
// Docs: https://acleddata.com/api-documentation/getting-started

const axios = require('axios');

const ACLED_TOKEN_URL = 'https://acleddata.com/oauth/token';
const ACLED_API_URL   = 'https://acleddata.com/api/acled/read';

let accessToken  = null;
let refreshToken = null;
let tokenExpiry  = null; // ms timestamp

// ─── Token Management ──────────────────────────────────────────────────────

async function fetchNewToken() {
  console.log('[ACLED] Fetching new access token...');
  const res = await axios.post(
    ACLED_TOKEN_URL,
    new URLSearchParams({
      username:   process.env.ACLED_EMAIL,
      password:   process.env.ACLED_PASSWORD,
      grant_type: 'password',
      client_id:  'acled'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  accessToken  = res.data.access_token;
  refreshToken = res.data.refresh_token;
  // expires_in is in seconds (86400 = 24h). Cache with 5-min safety buffer.
  tokenExpiry  = Date.now() + (res.data.expires_in * 1000) - 300000;
  console.log('[ACLED] Token acquired. Expires in ~24h.');
  return accessToken;
}

async function refreshAccessToken() {
  console.log('[ACLED] Refreshing access token...');
  const res = await axios.post(
    ACLED_TOKEN_URL,
    new URLSearchParams({
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
      client_id:     'acled'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  accessToken  = res.data.access_token;
  refreshToken = res.data.refresh_token;
  tokenExpiry  = Date.now() + (res.data.expires_in * 1000) - 300000;
  console.log('[ACLED] Token refreshed.');
  return accessToken;
}

async function getToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  // Try refresh token first (valid for 14 days)
  if (refreshToken) {
    try {
      return await refreshAccessToken();
    } catch (err) {
      console.warn('[ACLED] Refresh failed, falling back to full login:', err.message);
    }
  }

  // Full login
  return await fetchNewToken();
}

// ─── Public API Helper ─────────────────────────────────────────────────────

/**
 * Make an authenticated GET request to the ACLED /acled/read endpoint.
 *
 * @param {Object} params - ACLED query params, e.g. { country: 'Syria', limit: 100 }
 * @returns {Promise<Object>} - Parsed JSON response from ACLED
 *
 * Example params:
 *   { country: 'Ukraine', event_date: '2024-01-01', event_date_where: 'BETWEEN', event_date_to: '2024-12-31', limit: 500 }
 */
async function acledGet(params = {}) {
  const token = await getToken();

  const res = await axios.get(ACLED_API_URL, {
    params: {
      _format: 'json',
      ...params
    },
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  return res.data;
}

// ─── Warm up on module load ────────────────────────────────────────────────
// Pre-fetch a token when the server starts so the first API call is instant.
getToken().catch(err =>
  console.error('[ACLED] Startup token fetch failed:', err.message)
);

module.exports = { acledGet };
