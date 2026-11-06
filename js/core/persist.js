// ── persist.js ───────────────────────────────────────────────────
// Salvataggio/ripristino della sessione (coda, brano corrente, posizione).
// La posizione YouTube viene salvata anche periodicamente (poll in
// player.js), in pausa e quando la pagina va in background/si chiude:
// Android può scartare la tab a schermo spento, e al ritorno la
// riproduzione deve riprendere dal minuto in cui era rimasta.

import { store } from './store.js';

const KEY = 'grugofy_state';

// Stati del player YouTube IFrame (valori ufficiali dell'API).
const YT_PLAYING = 1;
const YT_PAUSED  = 2;

/**
 * Salva lo stato corrente.
 * @param {{time?: number, paused?: boolean}} [overrides] - valori da forzare
 *   in `current` (usato da playYT per non salvare il tempo del brano precedente).
 */
export function saveState(overrides = {}) {
  const state = {
    queue: store.queue.map(_serialize),
    current: {
      ytId:   store.currentYTId,
      ytItem: store.currentYTItem,
      title:  document.getElementById('nowPlayingTitle').textContent,
      idx:    store.currentIdx,
      time:   _getTime(),
      paused: _isPaused(),
      ...overrides,
    }
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[persist] salvataggio non riuscito:', err);
  }
}

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

/* ── Salvataggio al cambio di visibilità / chiusura pagina ───────
   Solo se c'è davvero qualcosa in riproduzione: altrimenti
   sovrascriveremmo una sessione salvata con uno stato vuoto (es.
   app aperta e subito chiusa prima del ripristino).               */
function _saveIfActive() {
  if (store.currentYTId || store.currentIdx !== -1) saveState();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') _saveIfActive();
});
window.addEventListener('pagehide', _saveIfActive);

/* helpers */

function _serialize(item) {
  if (item?.type === 'youtube') {
    return {
      yt:       true,
      id:       item.id,
      title:    item.title,
      duration: item.duration || 0,
      uploader: item.uploader || '',
    };
  }
  return { n: item.file.name, f: item.folder };
}

function _ytState() {
  if (!store.ytReady || !store.ytPlayer) return null;
  try { return store.ytPlayer.getPlayerState(); } catch { return null; }
}

function _getTime() {
  const media = document.getElementById('mediaEl');
  if (store.currentYTId) {
    // Il tempo del player è affidabile solo in PLAYING/PAUSED: durante il
    // caricamento (UNSTARTED/BUFFERING/CUED, o player non ancora pronto)
    // getCurrentTime() può restituire il valore del video precedente.
    // Ogni lettura valida aggiorna ytStartAt, usato come ultimo tempo noto.
    const st = _ytState();
    if (st === YT_PLAYING || st === YT_PAUSED) {
      try { store.ytStartAt = store.ytPlayer.getCurrentTime() || 0; } catch { /* usa l'ultimo noto */ }
    }
    return store.ytStartAt || 0;
  }
  return media.currentTime || 0;
}

function _isPaused() {
  const media = document.getElementById('mediaEl');
  if (store.currentYTId) {
    return _ytState() !== YT_PLAYING;
  }
  return media.paused;
}
