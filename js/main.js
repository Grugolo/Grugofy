// ── main.js ──────────────────────────────────────────────────────
// Entry point. Importa i moduli e collega le interazioni globali
// che non appartengono a nessun modulo specifico.

// Side-effect imports (registrano event listener all'import)
import './modules/localFiles.js';
import './ui/controls.js';

// Funzioni da usare in questo modulo
import { updateUI }                         from './ui/controls.js';
import { renderPlaylists, renderQueue }     from './ui/queueUI.js';
import { setupExpandedSwipe, togglePlayer } from './ui/expandedPlayer.js';
import { scheduleYTSearch }                 from './modules/youtube.js';
import { loadState }                        from './core/persist.js';
import { playLocal, playYT }                from './core/player.js';
import { store }                            from './core/store.js';

/* ── Barra di ricerca ───────────────────────────────────────────── */
const searchInput = document.getElementById('searchInput');
const clearBtn    = document.getElementById('clearSearchBtn');

searchInput.addEventListener('input', e => {
  const val = e.target.value.toLowerCase();

  clearBtn.classList.toggle('active', val.length > 0);

  // Filtra tracce in libreria
  document.querySelectorAll('.folder-group').forEach(group => {
    let visible = false;
    group.querySelectorAll('.track-item').forEach(item => {
      const match = item.textContent.toLowerCase().includes(val);
      item.style.display = match ? 'flex' : 'none';
      if (match) visible = true;
    });
    group.style.display = visible ? '' : 'none';
  });

  // Ricerca YouTube (con debounce interno)
  scheduleYTSearch(val);
});

clearBtn.onclick = () => {
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input'));
  searchInput.focus();
};

/* ── Now-playing title: click → espandi; swipe → prev/next ─────── */
const titleEl = document.getElementById('nowPlayingTitle');
titleEl.addEventListener('click', () => togglePlayer(true));

let _sx = 0, _sy = 0;
titleEl.addEventListener('touchstart', e => {
  _sx = e.touches[0].clientX;
  _sy = e.touches[0].clientY;
}, { passive: true });

titleEl.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - _sx;
  const dy = e.changedTouches[0].clientY - _sy;
  const T  = 50;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx < -T) document.getElementById('btnNext').click();
    if (dx >  T) document.getElementById('btnPrev').click();
  } else {
    if (dy < -T) togglePlayer(true);
    if (dy >  T) togglePlayer(false);
  }
}, { passive: true });

/* ── Globali per eventuale uso futuro da console / estensioni ────── */
window._playLocal   = playLocal;
window.togglePlayer = togglePlayer;

/* ── Inizializzazione ───────────────────────────────────────────── */
// type=module garantisce esecuzione dopo il parsing del DOM,
// ma window.load assicura che tutte le risorse siano pronte.
window.addEventListener('load', () => {
  updateUI();
  renderQueue();
  renderPlaylists();
  setupExpandedSwipe();


  const state = loadState();

if (state) {
  // ripristina coda
  state.queue.forEach(item => {
    if (item.yt) {
      store.queue.push({
        type: 'youtube',
        id: item.id,
        title: item.title,
        thumb: `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`,
      });
    }
  });

  // ripristina YT
  if (state.current?.ytId) {
    playYT({
      id: state.current.ytId,
      title: state.current.title || 'YouTube'
    });

    setTimeout(() => {
      try {
        store.ytPlayer.seekTo(state.current.time || 0);
        if (state.current.paused) store.ytPlayer.pauseVideo();
      } catch {}
    }, 1000);
  }

  renderQueue();
}

  
});

