// js/ui/library.js
import { playLocal } from '../core/player.js';
import { on } from '../core/events.js';
import { formatTime } from '../utils.js';

const libraryContainer = document.getElementById('libraryList');

/**
 * Renderizza la libreria di tracce
 * @param {Array} tracks - array di oggetti Track
 */
export function renderLibrary(tracks) {
  if (!libraryContainer) return;
  libraryContainer.innerHTML = '';

  tracks.forEach((track, index) => {
    const li = document.createElement('li');
    li.classList.add('library-item');
    li.dataset.index = index;

    li.innerHTML = `
      <div class="info" style="padding: 10px; cursor: pointer;">
        <div class="title" style="font-weight: bold;">${track.file ? track.file.name : 'Unknown'}</div>
        <div class="duration" style="font-size: 0.8rem; color: #888;">${track.duration ? formatTime(track.duration) : '--:--'}</div>
      </div>
    `;

    li.addEventListener('click', () => {
      playLocal(index);
    });

    libraryContainer.appendChild(li);
  });
}

on('libraryUpdate', (tracks) => {
  renderLibrary(tracks);
});
