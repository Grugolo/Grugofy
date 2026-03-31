// ─── MAIN ─────────────────────────────────────────────────────────────────────
import './controls.js';
import './library.js';
import { updateUI }                      from './ui.js';
import { renderPlaylists }               from './queue.js';
import { setupExpandedSwipe, togglePlayer } from './expandedPlayer.js';
import { scheduleYTSearch }              from './ytApi.js';
import { playTrack }                     from './player.js';

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

// ─── Now-playing title → apri expanded player ────────────────────────────────
const nowTitle = document.getElementById('now-playing-title');
nowTitle.onclick = () => togglePlayer(true);

let sX = 0, sY = 0;
nowTitle.addEventListener('touchstart', e => {
    sX = e.touches[0].clientX;
    sY = e.touches[0].clientY;
}, { passive: true });

nowTitle.addEventListener('touchend', e => {
    const dX = e.changedTouches[0].clientX - sX;
    const dY = e.changedTouches[0].clientY - sY;
    const t  = 50;
    if (Math.abs(dX) > Math.abs(dY)) {
        if (dX < -t) document.getElementById('btn-next').click();
        if (dX >  t) document.getElementById('btn-prev').click();
    } else {
        if (dY < -t) togglePlayer(true);
        if (dY >  t) togglePlayer(false);
    }
}, { passive: true });

// ─── Globali per onclick inline nel DOM ──────────────────────────────────────
window._playTrack    = playTrack;
window.togglePlayer  = togglePlayer;

// ─── BUG FIX: DOMContentLoaded è già garantito con type=module, ma
//     window.onload sovrascriveva handler di altri moduli caricati dopo.
//     Usiamo addEventListener per non perdere handler precedenti.
window.addEventListener('load', () => {
    updateUI();
    renderPlaylists();
    setupExpandedSwipe();
});
