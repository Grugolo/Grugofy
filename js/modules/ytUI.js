/**
 * js/modules/ytUI.js (Estratto per integrazione Desktop)
 */

import { enqueue } from '../core/queue.js';
import { playYT } from '../core/player.js';

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

export function makeYTTrackEl(item) {
  const el = document.createElement('div');
  el.className = 'track-item';

  const cover = document.createElement('img');
  cover.className = 'track-cover';
  cover.src = item.thumbnail || '';
  cover.alt = 'Cover';

  const info = document.createElement('div');
  info.className = 'track-info';

  const title = document.createElement('div');
  title.className = 'track-title';
  title.innerText = item.title;

  info.append(title);

  // Pulsanti per Desktop (↑ / ↓)
  const trackObj = { yt: true, id: item.id, title: item.title, duration: item.duration || 0 };
  const actionsEl = createDesktopActions(trackObj);

  el.append(cover, info, actionsEl);

  el.onclick = () => playYT(trackObj);

  return el;
}
