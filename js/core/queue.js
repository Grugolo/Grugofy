import { store } from './store.js';
import { showToast } from '../utils.js';
import { saveState } from './persist.js';
import { emit, EV } from './events.js';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const LS_KEY = 'f_p';

function _queueChanged() {
  import('../ui/queueUI.js').then(m => m.renderQueue());
  saveState();
  emit(EV.QUEUE_CHANGE);
}

export function enqueue(item, top = false) {
  top ? store.queue.unshift(item) : store.queue.push(item);
  showToast(top ? 'In cima ↑' : 'In fondo ↓');
  if (navigator.vibrate) navigator.vibrate(30);
  _queueChanged();
}

export function dequeueNext() {
  if (!store.queue.length) return false;
  const item = store.queue.shift();
  _queueChanged();
  import('./player.js').then(({ playLocal, playYT }) => {
    if (item.type === 'youtube' || item.yt) {
      playYT(item);
    } else {
      const idx = store.playlist.indexOf(item);
      if (idx !== -1) playLocal(idx);
    }
  });
  return true;
}

export function removeFromQueue(i) {
  store.queue.splice(i, 1);
  _queueChanged();
}

export function clearQueue() {
  store.queue = [];
  _queueChanged();
}

export function reorderQueue(from, to) {
  if (from === to) return;
  const [item] = store.queue.splice(from, 1);
  store.queue.splice(to, 0, item);
  _queueChanged();
}

export function loadPlaylists() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

export function savePlaylists(playlistsObj) {
  localStorage.setItem(LS_KEY, JSON.stringify(playlistsObj));
}

export function saveQueueAsPlaylist(name) {
  if (!name?.trim() || !store.queue.length) return;
  const all = loadPlaylists();
  all[name] = store.queue.map(_serialize);
  savePlaylists(all);
  import('../ui/queueUI.js').then(m => m.renderPlaylists());
}

export function saveHistoryAsPlaylist(name) {
  if (!name?.trim()) return;

  const entries = store.playHistory
    .map(entry => {
      if (entry && typeof entry === 'object' && entry.yt) {
        return { yt: true, id: entry.id, title: entry.title, duration: entry.duration || 0 };
      }
      const track = store.playlist[entry];
      return track ? { n: track.file.name, f: track.folder } : null;
    })
    .filter(Boolean);

  if (store.currentYTId && store.currentYTItem) {
    entries.push({ yt: true, id: store.currentYTId, title: store.currentYTItem.title, duration: store.currentYTItem.duration || 0 });
  } else if (store.currentIdx !== -1 && store.playlist[store.currentIdx]) {
    const cur = store.playlist[store.currentIdx];
    entries.push({ n: cur.file.name, f: cur.folder });
  }

  if (!entries.length) { showToast('Cronologia vuota!'); return; }

  const all = loadPlaylists();
  all[name] = entries;
  savePlaylists(all);
  import('../ui/queueUI.js').then(m => m.renderPlaylists());
  showToast('Cronologia salvata');
}

export function loadPlaylistIntoQueue(name) {
  const all = loadPlaylists();
  if (!all[name]) return;
  all[name].forEach(s => {
    if (s.yt) {
      store.queue.push({
        type: 'youtube',
        yt: true,
        id: s.id,
        title: s.title,
        thumb: `https://img.youtube.com/vi/${s.id}/mqdefault.jpg`,
        duration: s.duration || 0,
      });
    } else {
      const match = store.playlist.find(x => x.file.name === s.n && x.folder === s.f);
      if (match) store.queue.push(match);
    }
  });
  _queueChanged();
  showToast('Caricata in coda!');
}

function _serialize(item) {
  if (item?.type === 'youtube' || item?.yt) return { yt: true, id: item.id, title: item.title, duration: item.duration || 0 };
  return { n: item.file.name, f: item.folder };
}
