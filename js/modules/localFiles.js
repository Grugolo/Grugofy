/**
 * js/modules/localFiles.js
 * Rendering della lista file locali con supporto ai comandi Desktop
 */

import { store } from '../core/store.js';
import { enqueue } from '../core/queue.js';
import { playLocal } from '../core/player.js';

/**
 * Crea i pulsanti d'azione rapida desktop per ogni traccia (Cima / Fondo Coda)
 */
function createDesktopActions(trackObj) {
  const container = document.createElement('div');
  container.className = 'track-actions-desktop';

  const btnTop = document.createElement('button');
  btnTop.className = 'btn-q-add';
  btnTop.title = 'Aggiungi in cima alla coda';
  btnTop.innerText = '↑';
  btnTop.onclick = (e) => {
    e.stopPropagation();
    enqueue(trackObj, true);
  };

  const btnBottom = document.createElement('button');
  btnBottom.className = 'btn-q-add';
  btnBottom.title = 'Aggiungi in fondo alla coda';
  btnBottom.innerText = '↓';
  btnBottom.onclick = (e) => {
    e.stopPropagation();
    enqueue(trackObj, false);
  };

  container.append(btnTop, btnBottom);
  return container;
}

export function makeTrackEl(item, path, idx) {
  const el = document.createElement('div');
  el.className = 'track-item';

  const cover = document.createElement('div');
  cover.className = 'track-cover';
  cover.innerText = '🎵';

  const info = document.createElement('div');
  info.className = 'track-info';
  
  const title = document.createElement('div');
  title.className = 'track-title';
  title.innerText = item.file.name;

  const sub = document.createElement('div');
  sub.className = 'track-sub';
  sub.innerText = path || 'File Locale';

  info.append(title, sub);

  // Azioni Rapide per Desktop (Pulsanti Freccia In Cima / In Fondo)
  const actionsEl = createDesktopActions(item);

  el.append(cover, info, actionsEl);

  // Evento di riproduzione al click
  el.onclick = () => playLocal(idx);

  return el;
}

export function renderLocalTrackList(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  
  store.playlist.forEach((item, idx) => {
    const el = makeTrackEl(item, item.path || '', idx);
    containerEl.appendChild(el);
  });
}
