// js/ui/library.js
import { play } from '../core/player.js';
import { on } from '../core/events.js';

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
      <img class="cover" src="${track.cover || ''}" alt="cover">
      <div class="info">
        <div class="title">${track.title || 'Unknown'}</div>
        <div class="duration">${track.duration ? formatTime(track.duration) : '--:--'}</div>
      </div>
    `;

    li.addEventListener('click', () => {
      play(track);
    });

    libraryContainer.appendChild(li);
  });
}

/**
 * Helper per convertire secondi in mm:ss
 */
function formatTime(sec) {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// --- OPZIONALE: ascolta eventi per aggiornare libreria dinamicamente ---
on('libraryUpdate', (tracks) => {
  renderLibrary(tracks);
});