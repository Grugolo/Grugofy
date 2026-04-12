// ── queue.js ─────────────────────────────────────────────────────
import { store }     from './store.js';
import { showToast } from '../utils.js';
import { saveState } from './persist.js';

const LS_KEY = 'f_p';

export function enqueue(item, top = false) {
  top ? store.queue.unshift(item) : store.queue.push(item);
  showToast(top ? 'In cima ↑' : 'In fondo ↓');
  if (navigator.vibrate) navigator.vibrate(30);
  _refreshQueueUI();
  saveState();
}

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

  // FIX: costruisce la lista includendo sia entry numeriche (locale)
  // che oggetti YT {yt, id, title} presenti in playHistory
  const entries = store.playHistory
    .map(entry => {
      if (entry && typeof entry === 'object' && entry.yt) {
        return { yt: true, id: entry.id, title: entry.title };
      }
      const track = store.playlist[entry];
      return track ? { n: track.file.name, f: track.folder } : null;
    })
    .filter(Boolean);

  // Aggiunge anche il brano corrente
  if (store.currentYTId && store.currentYTItem) {
    entries.push({ yt: true, id: store.currentYTId, title: store.currentYTItem.title });
  } else if (store.currentIdx !== -1 && store.playlist[store.currentIdx]) {
    const cur = store.playlist[store.currentIdx];
    entries.push({ n: cur.file.name, f: cur.folder });
  }

  if (!entries.length) { showToast('Vuota!'); return; }

  const all = loadPlaylists();
  all[name] = entries;
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

function _serialize(item) {
  if (item?.type === 'youtube') return { yt: true, id: item.id, title: item.title };
  return { n: item.file.name, f: item.folder };
}

function _refreshQueueUI()    { import('../ui/queueUI.js').then(m => m.renderQueue()); }
function _refreshPlaylistUI() { import('../ui/queueUI.js').then(m => m.renderPlaylists()); }
