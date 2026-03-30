// ─── MAIN ─────────────────────────────────────────────────────────────────────
// Entry point: importa tutto e inizializza al caricamento.
import './controls.js';
import './library.js';
import { updateUI }           from './ui.js';
import { renderPlaylists }    from './queue.js';
import { setupExpandedSwipe, togglePlayer } from './expandedPlayer.js';
import { scheduleYTSearch }   from './ytApi.js';
import { playTrack }          from './player.js';

// ─── Search ───────────────────────────────────────────────────────────────────
document.getElementById('search-input').oninput = (e) => {
    const val = e.target.value.toLowerCase();

    // Filtra libreria locale
    document.querySelectorAll('.folder-group').forEach(g => {
        let has = false;
        g.querySelectorAll('.track-item').forEach(tr => {
            const match = tr.textContent.toLowerCase().includes(val);
            tr.style.display = match ? 'flex' : 'none';
            if (match) has = true;
        });
        g.style.display = has ? 'block' : 'none';
    });

    // Ricerca YT con debounce
    scheduleYTSearch(val, 500);
};

// ─── Now-playing → apri player espanso ───────────────────────────────────────
document.getElementById('now-playing-title').onclick = () => togglePlayer(true);

const nowTitle = document.getElementById('now-playing-title');

let sX=0, sY=0;

nowTitle.addEventListener('touchstart', e => {
    sX = e.touches[0].clientX;
    sY = e.touches[0].clientY;
}, { passive: true });

nowTitle.addEventListener('touchend', e => {
    const dX = e.changedTouches[0].clientX - sX;
    const dY = e.changedTouches[0].clientY - sY;
    const t = 50;

    if (Math.abs(dX) > Math.abs(dY)) {
        if (dX < -t) document.getElementById('btn-next').click();
        if (dX >  t) document.getElementById('btn-prev').click();
    } else {
        if (dY < -t) togglePlayer(true);
        if (dY >  t) togglePlayer(false);
    }
}, { passive: true });


// ─── Globali per compatibilità onclick inline nel DOM ────────────────────────
window._playTrack = playTrack;
window.togglePlayer = togglePlayer;

// ─── Init ────────────────────────────────────────────────────────────────────
window.onload = () => {
    updateUI();
    renderPlaylists();
    setupExpandedSwipe();
};
