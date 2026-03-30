// ─── MAIN ─────────────────────────────────────────────────────────────────────
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

    document.querySelectorAll('.folder-group').forEach(g => {
        let has = false;
        g.querySelectorAll('.track-item').forEach(tr => {
            const match = tr.textContent.toLowerCase().includes(val);
            tr.style.display = match ? 'flex' : 'none';
            if (match) has = true;
        });
        g.style.display = has ? 'block' : 'none';
    });

    scheduleYTSearch(val, 500);
};

// ─── Now-playing title: click → apri; swipe → prev/next/open/close ───────────
// PUNTO 4
(function setupNowPlayingSwipe() {
    const el = document.getElementById('now-playing-title');
    if (!el) return;

    let sX = 0, sY = 0;
    const H_THRESH = 50;   // px orizzontale
    const V_THRESH = 40;   // px verticale

    el.addEventListener('touchstart', e => {
        sX = e.touches[0].clientX;
        sY = e.touches[0].clientY;
    }, { passive: true });

    el.addEventListener('touchend', e => {
        const dX = e.changedTouches[0].clientX - sX;
        const dY = e.changedTouches[0].clientY - sY;
        const aX = Math.abs(dX), aY = Math.abs(dY);

        if (aX < 10 && aY < 10) {
            // Tap semplice → apri expanded player (comportamento originale)
            togglePlayer(true);
            return;
        }

        if (aY > aX) {
            // Gesto verticale prevalente
            if (dY < -V_THRESH) togglePlayer(true);   // su → apri
            if (dY >  V_THRESH) togglePlayer(false);  // giù → chiudi
        } else {
            // Gesto orizzontale prevalente
            if (dX >  H_THRESH) document.getElementById('btn-prev').click(); // destra → prev
            if (dX < -H_THRESH) document.getElementById('btn-next').click(); // sinistra → next
        }
    }, { passive: true });
})();

// ─── Globali per compatibilità onclick inline nel DOM ────────────────────────
window._playTrack = playTrack;
window.togglePlayer = togglePlayer;

// ─── Init ────────────────────────────────────────────────────────────────────
window.onload = () => {
    updateUI();
    renderPlaylists();
    setupExpandedSwipe();
};

