// ── queueUI.js ───────────────────────────────────────────────────
// Rendering DOM di coda e playlist salvate.
// Logica pura in core/queue.js; questo modulo gestisce solo il DOM.

import { store }       from '../core/store.js';
import { escHtml, showToast } from '../utils.js';
import {
  removeFromQueue, reorderQueue,
  loadPlaylists,
  saveQueueAsPlaylist,
  saveHistoryAsPlaylist,
  loadPlaylistIntoQueue,
  deletePlaylist,
} from '../core/queue.js';

/* ── DOM refs ───────────────────────────────────────────────────── */
const queueListEl    = document.getElementById('queueList');
const playlistListEl = document.getElementById('playlistList');
const queueSection   = document.getElementById('queueSection');

/* ═══════════════════════════════════════════════════════════════════
   CODA
   ═══════════════════════════════════════════════════════════════════ */

export function renderQueue() {
  queueListEl.innerHTML = '';
  queueSection.hidden   = store.queue.length === 0;

  store.queue.forEach((item, i) => {
    const div   = document.createElement('div');
    const title = item.type === 'youtube' ? item.title : item.file.name;

    div.dataset.dragItem = i;
    div.innerHTML = `
      <span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:.85rem;">
        ${escHtml(title)}
      </span>
      <div style="display:flex;gap:12px;margin-left:10px;align-items:center;">
        <button data-rem="${i}" aria-label="Rimuovi">${_iconX()}</button>
        <span class="drag-handle" data-drag="${i}" aria-label="Trascina per riordinare">☰</span>
      </div>`;

    div.querySelector('[data-rem]').onclick = () => removeFromQueue(i);
    queueListEl.appendChild(div);
  });
}

/* ── Drag & drop touch — listener delegati, registrati una sola volta */
let _dragIdx = null;

queueListEl.addEventListener('touchstart', e => {
  const handle = e.target.closest('[data-drag]');
  if (!handle) return;
  _dragIdx = parseInt(handle.dataset.drag);
  e.stopPropagation();
}, { passive: false });

queueListEl.addEventListener('touchmove', e => {
  if (_dragIdx === null) return;
  e.preventDefault();
  const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)
               ?.closest('[data-drag-item]');
  if (!el) return;
  const overIdx = parseInt(el.dataset.dragItem);
  if (overIdx !== _dragIdx) {
    reorderQueue(_dragIdx, overIdx);
    _dragIdx = overIdx;
  }
}, { passive: false });

queueListEl.addEventListener('touchend', () => { _dragIdx = null; });

/* ═══════════════════════════════════════════════════════════════════
   SALVA CODA / CRONOLOGIA
   ═══════════════════════════════════════════════════════════════════ */

document.getElementById('saveQueueBtn').onclick = () => {
  const name = prompt('Nome Playlist:', 'Playlist ' + new Date().toLocaleDateString());
  if (name) saveQueueAsPlaylist(name);
};

document.getElementById('saveHistoryBtn').onclick = () => {
  if (!store.playHistory.length || !store.sessionStart) return showToast('Vuota!');
  const start = store.sessionStart;
  const now   = new Date();
  const _fmt  = d => `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  const date  = `${start.getDate()}/${start.getMonth()+1}/${String(start.getFullYear()).slice(-2)}`;
  const name  = prompt(`Nome playlist: ${date} ${_fmt(start)} - ${_fmt(now)}`);
  if (name) saveHistoryAsPlaylist(name);
};

/* ═══════════════════════════════════════════════════════════════════
   PLAYLIST SALVATE
   ═══════════════════════════════════════════════════════════════════ */

export function renderPlaylists() {
  playlistListEl.innerHTML = '';
  const all = loadPlaylists();

  Object.keys(all).forEach(name => {
    const div = document.createElement('div');
    div.innerHTML = `
      <span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:.85rem;">
        ${escHtml(name)}
      </span>
      <div style="display:flex;gap:12px;margin-left:10px;align-items:center;">
        <button data-del aria-label="Elimina">${_iconX()}</button>
        <button data-load style="color:var(--accent);font-weight:700;font-size:.7rem;">CARICA</button>
      </div>`;

    div.querySelector('[data-load]').onclick = () => loadPlaylistIntoQueue(name);
    div.querySelector('[data-del]').onclick  = () => {
      if (confirm(`Eliminare "${name}"?`)) deletePlaylist(name);
    };
    playlistListEl.appendChild(div);
  });
}

/* ── Icona X SVG ────────────────────────────────────────────────── */
function _iconX() {
  return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <line x1="2" y1="2" x2="14" y2="14" stroke="#ff4444" stroke-width="2" stroke-linecap="round"/>
    <line x1="14" y1="2" x2="2"  y2="14" stroke="#ff4444" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}
