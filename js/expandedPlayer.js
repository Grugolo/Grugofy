// ─── EXPANDED PLAYER ─────────────────────────────────────────────────────────
import { state }                  from './state.js';
import { showToast, formatTime }  from './utils.js';

const audio = document.getElementById('main-audio');
let lastTap        = 0;
let longPressTimer = null;
let isLongPress    = false;

// ─── Seekbar polling per YT ───────────────────────────────────────────────────
let ytSeekInterval = null;

export function startYTSeekPolling() {
    stopYTSeekPolling();
    const seekSlider  = document.getElementById('seek-slider');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal   = document.getElementById('time-total');

    ytSeekInterval = setInterval(() => {
        if (!state.ytPlayer || !state.currentYTId) { stopYTSeekPolling(); return; }
        try {
            const cur = state.ytPlayer.getCurrentTime() || 0;
            const dur = state.ytPlayer.getDuration()    || 0;
            if (dur > 0) {
                seekSlider.value        = (cur / dur) * 100;
                timeCurrent.textContent = formatTime(cur);
                timeTotal.textContent   = formatTime(dur);
            }
        } catch (_) {}
    }, 500);
}

export function stopYTSeekPolling() {
    clearInterval(ytSeekInterval);
    ytSeekInterval = null;
}

/** Apre o chiude il player espanso */
export function togglePlayer(open) {
    const p = document.getElementById('expanded-player');
    const ytWrapper = document.getElementById('yt-wrapper');

    if (!p) return;

    const hasYT    = !!state.currentYTId;
    const hasLocal = state.currentPlayingIdx !== -1;

    if (open && (hasYT || hasLocal)) {
        updateExpandedView();
        p.classList.add('open');

        if (hasYT && ytWrapper) {
            ytWrapper.classList.add('active');
        }

    } else {
        p.classList.remove('open');
        stopYTSeekPolling();

        if (ytWrapper) {
            ytWrapper.classList.remove('active');
        }
    }
}

/** Aggiorna il contenuto visivo */
export function updateExpandedView(idx) {
    const vContainer = document.getElementById('visual-container');
    if (!vContainer) return;

    const ytEl = document.getElementById('yt-player');

    // ── Caso YT ───────────────────────────────────────────────────────────────
const ytWrapper = document.getElementById('yt-wrapper');

if (state.currentYTId) {
    stopYTSeekPolling();

    // Pulisci container SENZA toccare YT
    vContainer.innerHTML = '';

    if (ytWrapper) {
        ytWrapper.classList.add('active');
    }

    return;
}

    // ── Caso locale ───────────────────────────────────────────────────────────
if (ytWrapper) {
    ytWrapper.classList.remove('active');
}

    vContainer.innerHTML = '';

    const resolvedIdx = (idx !== undefined) ? idx : state.currentPlayingIdx;
    if (resolvedIdx === -1) return;

    const track = state.playlist[resolvedIdx];
    if (!track) return;

    if (track.file.type.startsWith('video/')) {
        vContainer.appendChild(audio);
        audio.style.display   = 'block';
        audio.style.width     = '100%';
        audio.style.maxHeight = '100%';
    } else {
        const img = document.createElement('img');
        img.src = track.cover || 'https://placehold.co/512x512';
        img.style.cssText = 'width:85%;border-radius:15px;';
        vContainer.appendChild(img);

        audio.style.display = 'none';
    }
}

/** Inizializza swipe e gesture sull'expanded player */
export function setupExpandedSwipe() {
    const el         = document.getElementById('expanded-player');
    const vContainer = document.getElementById('visual-container');
    if (!el) return;

    let sX = 0, sY = 0;
    const threshold = 60;

    // ── Long press → 2x speed ─────────────────────────────────────────────────
    vContainer.addEventListener('touchstart', (e) => {
        if (state.currentYTId) return;
        const rect  = vContainer.getBoundingClientRect();
        const x     = e.touches[0].clientX - rect.left;
        const width = rect.width;
        if (x < width * 2 / 3) return;

        isLongPress    = false;
        longPressTimer = setTimeout(() => {
            isLongPress           = true;
            audio.playbackRate    = 2.0;
            showToast('⏩ 2x');
            if (navigator.vibrate) navigator.vibrate(20);
        }, 300);
    }, { passive: true });

    vContainer.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
        if (isLongPress) {
            audio.playbackRate = 1.0;
            isLongPress        = false;
        }
    }, { passive: true });

    // ── Double-tap / single-tap ───────────────────────────────────────────────
    vContainer.onclick = (e) => {
        if (isLongPress) return;
        const now   = Date.now();
        const DELAY = 300;
        const rect  = vContainer.getBoundingClientRect();
        const x     = e.clientX - rect.left;
        const width = rect.width;

        if (now - lastTap < DELAY) {
            if      (x > width * 2 / 3) { audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); showToast('+10s ⏩'); }
            else if (x < width / 3)     { audio.currentTime = Math.max(0, audio.currentTime - 5);               showToast('⏪ -5s'); }
            lastTap = 0;
        } else {
            lastTap = now;
            setTimeout(() => {
                if (Date.now() - lastTap >= DELAY && lastTap !== 0) {
                    audio.paused ? audio.play() : audio.pause();
                }
            }, DELAY);
        }
    };

    // ── Swipe verticale → chiudi; orizzontale → prev/next ────────────────────
    el.addEventListener('touchstart', e => {
        sX = e.touches[0].clientX;
        sY = e.touches[0].clientY;
    }, { passive: true });

    el.addEventListener('touchend', e => {
        const dX = e.changedTouches[0].clientX - sX;
        const dY = e.changedTouches[0].clientY - sY;

        if (Math.abs(dY) > Math.abs(dX) && dY > threshold) {
            togglePlayer(false);
        } else if (Math.abs(dX) > Math.abs(dY)) {
            if      (dX >  threshold) document.getElementById('btn-prev').click();
            else if (dX < -threshold) document.getElementById('btn-next').click();
        }
    }, { passive: true });
}
