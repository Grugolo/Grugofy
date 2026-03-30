// ─── CONTROLS ─────────────────────────────────────────────────────────────────
import { state }     from './state.js';
import { updateUI }  from './ui.js';
import { playTrack } from './player.js';
import { playItem }  from './ytApi.js';
import { renderQueue } from './queue.js';

const audio   = document.getElementById('main-audio');
const playBtn = document.getElementById('btn-play');

// ─── Play / Pause ─────────────────────────────────────────────────────────────
playBtn.onclick = () => {
    // Se c'è un video YT attivo, delega sempre al ytPlayer
    if (state.currentYTId && state.ytReady && state.ytPlayer) {
        const s = state.ytPlayer.getPlayerState();
        if (s === YT.PlayerState.PLAYING)   { state.ytPlayer.pauseVideo(); return; }
        // Unstarted (-1), cued (5), paused (2), buffering (3) → forza play
        state.ytPlayer.playVideo();
        return;
    }
    // Altrimenti gestisci l'audio locale
    audio.paused ? audio.play() : audio.pause();
};

// ─── Shuffle ──────────────────────────────────────────────────────────────────
document.getElementById('btn-shuffle').onclick = () => {
    state.isShuffle = !state.isShuffle;
    if (state.isShuffle) {
        state.shuffleOrder = Array.from({ length: state.playlist.length }, (_, i) => i);
        for (let i = state.shuffleOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state.shuffleOrder[i], state.shuffleOrder[j]] = [state.shuffleOrder[j], state.shuffleOrder[i]];
        }
    }
    if (navigator.vibrate) navigator.vibrate(30);
    updateUI();
};

// ─── Loop ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-loop').onclick = () => {
    state.isLooping = !state.isLooping;
    updateUI();
};

// ─── Next ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-next').onclick = () => {
    if (state.queue.length > 0) {
        const next = state.queue.shift();
        renderQueue();
        playItem(next);
        return;
    }
    let nextIdx = state.currentPlayingIdx + 1;
    if (state.isShuffle) nextIdx = Math.floor(Math.random() * state.playlist.length);
    if (nextIdx < state.playlist.length) playTrack(nextIdx);
};

// ─── Prev ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-prev').onclick = () => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (state.playHistory.length) {
        playTrack(state.playHistory.pop(), false, true);
        return;
    }
    if (state.currentPlayingIdx > 0) playTrack(state.currentPlayingIdx - 1);
};
