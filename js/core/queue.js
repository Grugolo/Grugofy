// ── queue.js ─────────────────────────────────────────────────────
// Logica pura della coda e delle playlist (localStorage).
// Non tocca il DOM — delega a ui/queueUI.js tramite import dinamico.

import { store }     from './store.js';
import { showToast } from '../utils.js';
import { saveState } from './persist.js';

const LS_KEY = 'f_p';

/* ═══════════════════════════════════════════════════════════════════
   CODA
   ═══════════════════════════════════════════════════════════════════ */

/** Aggiunge un item in cima (top=true) o in fondo alla coda */
export function enqueue(item, top = false) {
  top ? store.queue.unshift(item) : store.queue.push(item);
  showToast(top ? 'In cima ↑' : 'In fondo ↓');
  if (navigator.vibrate) navigator.vibrate(30);
  _refreshQueueUI();
   saveState();
}

/**
 * Preleva il primo item della coda e lo riproduce.
 * @returns {boolean} true se ha trovato un item, false se coda vuota
 */
export function dequeueNext() {
  if (!store.queue.length) return false;
  const item = store.queue.shift();
  _refreshQueueUI();
  import('./player.js').then(({ playLocal, playYT }) => {
    if (item.type === 'youtube') {
      playYT(item);
    } else {
      const idx = store.playlist.indexOf(item);
      if (idx !== -1) playLocal(idx);
    }
  });
   saveState();
   return true;
}

export function removeFromQueue(i) {
  store.queue.splice(i, 1);
  _refreshQueueUI();
   saveState();
}

export function reorderQueue(from, to) {
  if (from === to) return;
  const [item] = store.queue.splice(from, 1);
  store.queue.splice(to, 0, item);
  _refreshQueueUI();
   saveState();
}

/* ═══════════════════════════════════════════════════════════════════
   PLAYLIST (localStorage)
   ═══════════════════════════════════════════════════════════════════ */

export function loadPlaylists() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

export function saveQueueAsPlaylist(name) {
  if (!name?.trim() || !store.queue.length) return;
  const all = loadPlaylists();
  all[name] = store.queue.map(_serialize);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  _refreshPlaylistUI();
}

export function saveHistoryAsPlaylist(name) {
  if (!name?.trim()) return;
  if (!store.playHistory.length) { showToast('Vuota!'); return; }
  const all = loadPlaylists();
  all[name] = store.playHistory
    .map(idx => store.playlist[idx])
    .filter(Boolean)
    .map(_serialize);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  _refreshPlaylistUI();
  showToast('Cronologia salvata');
}

export function loadPlaylistIntoQueue(name) {
  const all = loadPlaylists();
  if (!all[name]) return;
  all[name].forEach(s => {
    if (s.yt) {
      store.queue.push({
        type:  'youtube',
        id:    s.id,
        title: s.title,
        thumb: `https://img.youtube.com/vi/${s.id}/mqdefault.jpg`,
      });
    } else {
      const match = store.playlist.find(x => x.file.name === s.n && x.folder === s.f);
      if (match) store.queue.push(match);
    }
  });
  _refreshQueueUI();
  showToast('Caricata!');
}

export function deletePlaylist(name) {
  const all = loadPlaylists();
  delete all[name];
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  _refreshPlaylistUI();
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS PRIVATI
   ═══════════════════════════════════════════════════════════════════ */

function _serialize(item) {
  if (item?.type === 'youtube') return { yt: true, id: item.id, title: item.title };
  return { n: item.file.name, f: item.folder };
}

// Import dinamici per evitare circolari (queue ↔ player ↔ queue)
function _refreshQueueUI()    { import('../ui/queueUI.js').then(m => m.renderQueue()); }
function _refreshPlaylistUI() { import('../ui/queueUI.js').then(m => m.renderPlaylists()); }
