// ─── PLAYER ───────────────────────────────────────────────────────────────────
import { state }      from './state.js';
import { updateUI }   from './ui.js';
import { formatTime } from './utils.js';
import { updateExpandedView } from './expandedPlayer.js';

const audio       = document.getElementById('main-audio');
const seekSlider  = document.getElementById('seek-slider');
const timeCurrent = document.getElementById('time-current');
const timeTotal   = document.getElementById('time-total');
const nowPlayingTitle = document.getElementById('now-playing-title');

/** Riproduce la traccia locale all'indice `idx` */
export function playTrack(idx, fromQueue = false, isBack = false) {
    if (idx < 0 || idx >= state.playlist.length) return;

    state.currentYTId = null;

    if (!isBack && state.currentPlayingIdx !== -1 && state.currentPlayingIdx !== idx) {
        state.playHistory.push(state.currentPlayingIdx);
    }

    state.currentPlayingIdx = idx;
    if (!fromQueue) state.lastManualLibraryIdx = idx;

    const track = state.playlist[idx];
    audio.src = URL.createObjectURL(track.file);
    audio.play();

    nowPlayingTitle.textContent = track.file.name.replace(/\.[^/.]+$/, '');
    updateUI();
    updateExpandedView(idx);
    setupMediaSession(track, nowPlayingTitle.textContent);
}

function setupMediaSession(track, title) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist:  track.folder.split('/').pop(),
        artwork: [{ src: track.cover || 'https://placehold.co/512x512', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => document.getElementById('btn-prev').click());
    navigator.mediaSession.setActionHandler('nexttrack',     () => document.getElementById('btn-next').click());
    navigator.mediaSession.setActionHandler('play',  () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
}

// ─── Seekbar ──────────────────────────────────────────────────────────────────
audio.ontimeupdate = () => {
    seekSlider.value = (audio.currentTime / audio.duration) * 100 || 0;
    timeCurrent.textContent = formatTime(audio.currentTime);
    if (audio.duration) timeTotal.textContent = formatTime(audio.duration);
};

seekSlider.oninput = () => {
    if (state.currentYTId && state.ytReady && state.ytPlayer) {
        const dur = state.ytPlayer.getDuration() || 0;
        state.ytPlayer.seekTo((seekSlider.value / 100) * dur, true);
    } else {
        audio.currentTime = (seekSlider.value / 100) * audio.duration;
    }
};

// ─── Audio events ─────────────────────────────────────────────────────────────
audio.onplay  = updateUI;
audio.onpause = updateUI;
audio.onended = () => {
    if (state.isLooping) {
        audio.currentTime = 0;
        audio.play();
    } else {
        document.getElementById('btn-next').click();
    }
};
