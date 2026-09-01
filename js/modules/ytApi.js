// ── ytApi.js ─────────────────────────────────────────────────────
// Helper condiviso per chiamare le API YouTube Data v3 con fallback
// automatico su più chiavi (usato da youtube.js e da queue.js).

import { YT_API_KEY } from '../config.js';

/* ── Costo in "unità quota" per endpoint (valori ufficiali Google) ─ */
const ENDPOINT_COST = {
  search:        100,
  videos:        1,
  playlistItems: 1,
  playlists:     1,
};

/**
 * Esegue una richiesta alle API YouTube provando in sequenza le
 * chiavi disponibili in YT_API_KEY (stringa singola o array).
 */
export async function fetchYT(endpoint, paramsObj = {}) {
  const keys = Array.isArray(YT_API_KEY) ? YT_API_KEY : [YT_API_KEY];

  for (const key of keys) {
    const params = new URLSearchParams({ ...paramsObj, key });
    const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${params.toString()}`;

    try {
      const res  = await fetch(url);
      const data = await res.json();

      if (data.error) {
        console.warn(`[YT API] Chiave esaurita o non valida (${key.slice(0, 6)}...):`, data.error.message);
        continue; // prova la chiave successiva
      }

      _trackQuotaUsage(endpoint);
      return data; // risposta valida
    } catch (err) {
      console.warn('[YT API] Errore di rete con la chiave corrente:', err);
    }
  }

  return null; // nessuna chiave ha funzionato
}

/* ═══════════════════════════════════════════════════════════════════
   TRACKING QUOTA (solo diagnostico in console, non mostrato in UI)
   ═══════════════════════════════════════════════════════════════════ */

const QUOTA_KEY = 'yt_quota_usage';

function _trackQuotaUsage(endpoint) {
  const cost = ENDPOINT_COST[endpoint] ?? 1;
  const today = new Date().toISOString().slice(0, 10);

  let usage;
  try { usage = JSON.parse(localStorage.getItem(QUOTA_KEY)) || {}; }
  catch { usage = {}; }

  if (usage.date !== today) usage = { date: today, units: 0 };
  usage.units += cost;

  localStorage.setItem(QUOTA_KEY, JSON.stringify(usage));
  console.debug(`[YT API] +${cost} unità (${endpoint}) — totale oggi: ${usage.units}/10000`);
}
