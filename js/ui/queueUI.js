/**
 * js/ui/queueUI.js
 */

import { store } from '../core/store.js';
import { removeFromQueue, reorderQueue, loadPlaylists, deletePlaylist, loadPlaylistIntoQueue } from '../core/queue.js';
import { playLocal, playYT } from '../core/player.js';

const queueListEl = document.getElementById('queueList');
const queueSection = document.getElementById('queueSection');
const playlistsListEl = document.getElementById('playlistsList');

let dragSrcIndex = null;

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function iconX() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
}

export function renderQueue() {
  if (!queueListEl || !queueSection) return;

  queueListEl.innerHTML = '';
  queueSection.hidden = store.queue.length === 0;

  store.queue.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.draggable = true;
    div.dataset.index = i;

    const title = (item.yt || item.type === 'youtube') ? item.title : (item.file?.name || 'Traccia');

    div.innerHTML = `
      <span class="queue-item-title" style="flex:1; cursor:pointer;">${escHtml(title)}</span>
      <div class="queue-item-actions">
        <button class="btn-remove" data-rem="${i}" aria-label="Rimuovi">${iconX()}</button>
        <span class="drag-handle" aria-label="Trascina per riordinare">☰</span>
      </div>
    `;

    div.addEventListener('dragstart', (e) => {
      dragSrcIndex = i;
      e.dataTransfer.effectAllowed = 'move';
      div.classList.add('dragging');
    });

    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    div.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcIndex !== null && dragSrcIndex !== i) {
        reorderQueue(dragSrcIndex, i);
      }
    });

    div.addEventListener('dragend', () => {
      dragSrcIndex = null;
      div.classList.remove('dragging');
    });

    div.onclick = (e) => {
      if (e.target.closest('button') || e.target.closest('.drag-handle')) return;
      if (item.yt || item.type === 'youtube') {
        playYT(item);
      } else {
        const idx = store.playlist.indexOf(item);
        if (idx !== -1) playLocal(idx);
      }
    };

    div.querySelector('[data-rem]').onclick = (e) => {
      e.stopPropagation();
      removeFromQueue(i);
    };

    queueListEl.appendChild(div);
  });
}

export function renderPlaylists() {
  if (!playlistsListEl) return;
  playlistsListEl.innerHTML = '';
  const playlists = loadPlaylists();

  Object.keys(playlists).forEach(name => {
    const li = document.createElement('li');
    li.className = 'playlist-entry';
    li.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--card2); margin-bottom:5px; border-radius:8px; cursor:pointer;';
    
    li.innerHTML = `
      <span>🎵 ${escHtml(name)} (${playlists[name].length})</span>
      <button data-del="${escHtml(name)}" class="btn-remove">${iconX()}</button>
    `;

    li.onclick = (e) => {
      if (e.target.closest('[data-del]')) return;
      loadPlaylistIntoQueue(name);
    };

    li.querySelector('[data-del]').onclick = (e) => {
      e.stopPropagation();
      deletePlaylist(name);
    };

    playlistsListEl.appendChild(li);
  });
}
