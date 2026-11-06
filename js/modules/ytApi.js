// ── ytApi.js ─────────────────────────────────────────────────────
// Helper condiviso per chiamare le API YouTube Data v3 con fallback
// automatico su più chiavi (usato da youtube.js e da queue.js).

import { YT_API_KEY } from '../config.js';
import { parseISO8601 } from '../utils.js';

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
   DURATE (videos.list) — helper unico, con cache in memoria
   ─────────────────────────────────────────────────────────────────
   Costo: 1 unità quota ogni 50 id (limite API). Gli id già noti non
   vengono richiesti di nuovo. Gli id non restituiti (video rimossi,
   privati) o senza durata (live) risultano 0 e NON vengono messi in
   cache, così un tentativo successivo può riprovare.
   @param {string[]} ids
   @returns {Promise<Record<string, number>>} mappa id → secondi
   ═══════════════════════════════════════════════════════════════════ */
const _durationCache = new Map();

export async function fetchDurations(ids) {
  const unique  = [...new Set((ids || []).filter(Boolean))];
  const missing = unique.filter(id => !_durationCache.has(id));

  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const data  = await fetchYT('videos', { part: 'contentDetails', id: chunk.join(',') });
    if (!data) break; // errore di rete o chiavi esaurite: restituisci quanto già noto

    for (const v of data.items || []) {
      const sec = parseISO8601(v.contentDetails?.duration);
      if (sec > 0) _durationCache.set(v.id, sec);
    }
  }

  return Object.fromEntries(unique.map(id => [id, _durationCache.get(id) || 0]));
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
