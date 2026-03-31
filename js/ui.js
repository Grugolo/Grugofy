// ─── UI ───────────────────────────────────────────────────────────────────────
import { DRAW }  from './draw.js';
import { state } from './state.js';

const audio   = document.getElementById('main-audio');
const playBtn = document.getElementById('btn-play');

/** Ridisegna pulsanti e highlight libreria */
export function updateUI() {
    let isYTPlaying = false;
    // BUG FIX: check typeof YT prima di usare YT.PlayerState
    try {
        if (state.currentYTId && state.ytReady && state.ytPlayer &&
            typeof YT !== 'undefined' && typeof state.ytPlayer.getPlayerState === 'function') {
            isYTPlaying = state.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
        }
    } catch (_) {}

    const isPlaying = state.currentYTId ? isYTPlaying : !audio.paused;

    playBtn.innerHTML = isPlaying ? DRAW.pause : DRAW.play;
    document.getElementById('btn-next').innerHTML    = DRAW.next;
    document.getElementById('btn-prev').innerHTML    = DRAW.prev;
    document.getElementById('btn-loop').innerHTML    = DRAW.loop(state.isLooping);
    document.getElementById('btn-shuffle').innerHTML = DRAW.shuffle(state.isShuffle);

    document.querySelectorAll('#library .track-item').forEach(el => {
        const i = parseInt(el.dataset.idx);
        el.classList.remove('playing', 'last-pos');
        if (i === state.currentPlayingIdx)        el.classList.add('playing');
        else if (i === state.lastManualLibraryIdx) el.classList.add('last-pos');
    });
}
