// ── player.js ────────────────────────────────────────────────────
// Motore di riproduzione unificato (locale + YouTube).
// NON importa nulla dalla UI — comunica tramite event bus.

import { store }       from './store.js';
import { formatTime }  from '../utils.js';
import { emit, EV }    from './events.js';
import { saveState }   from './persist.js';

export const mediaEl = document.getElementById('mediaEl');

const seekSlider  = document.getElementById('seekSlider');
const timeCurrent = document.getElementById('timeCurrent');
const timeTotal   = document.getElementById('timeTotal');
const titleEl     = document.getElementById('nowPlayingTitle');

let _currentObjectURL = null;

/* ═══════════════════════════════════════════════════════════════════
   LOCALE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Riproduce la traccia locale all'indice `idx`.
 * @param {number} idx
 * @param {{ addHistory?: boolean, fromBack?: boolean }} opts
 */
export function playLocal(idx, { addHistory = true, fromBack = false } = {}) {
  if (idx < 0 || idx >= store.playlist.length) return;

  if (addHistory && !fromBack && store.currentIdx !== -1 && store.currentIdx !== idx) {
    store.playHistory.push(store.currentIdx);
  }

  store.currentYTId   = null;
  store.currentIdx    = idx;
  store.lastManualIdx = idx;

  // Ferma YT
  _ytStop();
  emit(EV.YT_STOPPED);
  _ytWrapperVisible(false);

  const track = store.playlist[idx];

  if (_currentObjectURL) URL.revokeObjectURL(_currentObjectURL);
  _currentObjectURL = URL.createObjectURL(track.file);
  mediaEl.src = _currentObjectURL;
  mediaEl.play();

  titleEl.textContent         = _fileTitle(track.file);
  seekSlider.value            = 0;
  timeCurrent.textContent     = '0:00';
  timeTotal.textContent       = '0:00';

  emit(EV.PLAYER_CHANGE);
  emit(EV.VISUAL_UPDATE);
  _mediaSessionLocal(track, titleEl.textContent);
}

/* ═══════════════════════════════════════════════════════════════════
   YOUTUBE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Riproduce un item YouTube.
 * @param {{ id: string, title: string, thumb?: string, uploader?: string }} item
 */
export function playYT(item) {
  // Ferma locale e libera URL
  mediaEl.pause();
  if (_currentObjectURL) {
    URL.revokeObjectURL(_currentObjectURL);
    _currentObjectURL = null;
  }
  mediaEl.removeAttribute('src');
  mediaEl.load();

  emit(EV.YT_STOPPED); // ferma poll seekbar

  store.currentYTId = item.id;
  titleEl.textContent = item.title;

  _ytWrapperVisible(true);

  if (store.ytReady && store.ytPlayer) {
    store.ytPlayer.loadVideoById(item.id);
  } else {
    store.ytPending = item.id;
    _ensureYTScript();
  }

  emit(EV.PLAYER_CHANGE);
  emit(EV.VISUAL_UPDATE);
  _mediaSessionYT(item);
}

/* ═══════════════════════════════════════════════════════════════════
   CONTROLLI
   ═══════════════════════════════════════════════════════════════════ */

saveState();

export function togglePlay() {
  if (store.currentYTId) {
    if (!store.ytReady || !store.ytPlayer) return;
    try {
      store.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING
        ? store.ytPlayer.pauseVideo()
        : store.ytPlayer.playVideo();
    } catch (_) {}
  } else {
    mediaEl.paused ? mediaEl.play() : mediaEl.pause();
  }
}

export function seek(pct) {
  if (store.currentYTId && store.ytReady && store.ytPlayer) {
    store.ytPlayer.seekTo((pct / 100) * (store.ytPlayer.getDuration() || 0), true);
  } else if (mediaEl.duration) {
    mediaEl.currentTime = (pct / 100) * mediaEl.duration;
  }
}

export function playNext() {
  // Prima controlla la coda (import dinamico per evitare circolare queue→player→queue)
  import('./queue.js').then(({ dequeueNext }) => {
    if (dequeueNext()) return;
    if (store.currentYTId) return; // YT: gestito da onStateChange

    let next = store.currentIdx + 1;
    if (store.shuffle && store.shuffleOrder.length) {
      const curPos = store.shuffleOrder.indexOf(store.currentIdx);
      const nxtPos = (curPos + 1) % store.shuffleOrder.length;
      next = store.shuffleOrder[nxtPos];
    }
    if (next < store.playlist.length) playLocal(next);
  });
}

export function playPrev() {
  if (!store.currentYTId && mediaEl.currentTime > 3) {
    mediaEl.currentTime = 0;
    return;
  }
  if (store.playHistory.length) {
    playLocal(store.playHistory.pop(), { addHistory: false, fromBack: true });
    return;
  }
  if (!store.currentYTId && store.currentIdx > 0) {
    playLocal(store.currentIdx - 1);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   EVENTI MEDIA ELEMENT
   ═══════════════════════════════════════════════════════════════════ */


let _saveTimer = null;
mediaEl.ontimeupdate = () => {
  if (!mediaEl.duration) return;
  seekSlider.value        = (mediaEl.currentTime / mediaEl.duration) * 100;
  timeCurrent.textContent = formatTime(mediaEl.currentTime);
  timeTotal.textContent   = formatTime(mediaEl.duration);
  if (!_saveTimer) {
    _saveTimer = setTimeout(() => {
      saveState();
      _saveTimer = null;
    }, 1000);
  }
};

mediaEl.onplay  = () => emit(EV.PLAYER_CHANGE);
mediaEl.onpause = () => emit(EV.PLAYER_CHANGE);
mediaEl.onended = () => {
  if (store.looping) { mediaEl.currentTime = 0; mediaEl.play(); }
  else playNext();
};

/* ═══════════════════════════════════════════════════════════════════
   YT IFrame API (callback globale richiesta dall'API)
   ═══════════════════════════════════════════════════════════════════ */

window.onYouTubeIframeAPIReady = () => {
  store.ytPlayer = new YT.Player('ytPlayerEl', {
    height: '100%',
    width:  '100%',
    videoId: '',
    playerVars: { playsinline: 1, autoplay: 1 },
    events: {
      onReady: () => {
        store.ytReady = true;
        if (store.ytPending) {
          store.ytPlayer.loadVideoById(store.ytPending);
          store.ytPending = null;
        }
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) emit(EV.YT_PLAYING);
        if (e.data === YT.PlayerState.PAUSED)  emit(EV.YT_STOPPED);
        if (e.data === YT.PlayerState.ENDED)   playNext();
        emit(EV.PLAYER_CHANGE);
      },
    },
  });
};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS PRIVATI
   ═══════════════════════════════════════════════════════════════════ */

function _ytStop() {
  if (store.ytReady && store.ytPlayer) {
    try { store.ytPlayer.stopVideo(); } catch (_) {}
  }
}

function _ytWrapperVisible(show) {
  document.getElementById('ytWrapper').classList.toggle('active', show);
}

function _ensureYTScript() {
  if (window.YT || document.getElementById('yt-iframe-api')) return;
  const s  = document.createElement('script');
  s.id  = 'yt-iframe-api';
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
}

function _fileTitle(file) {
  return file.name.replace(/\.[^/.]+$_/, '');
}

function _mediaSessionLocal(track, title) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist:  track.folder.split('/').pop(),
    artwork: [{ src: track.cover || 'https://placehold.co/512x512', sizes: '512x512', type: 'image/png' }],
  });
  _bindMediaSession();
}

function _mediaSessionYT(item) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title:   item.title,
    artist:  item.uploader || 'YouTube',
    artwork: [{ src: item.thumb || '', sizes: '512x512', type: 'image/jpeg' }],
  });
  _bindMediaSession();
}

function _bindMediaSession() {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play',          () => togglePlay());
  ms.setActionHandler('pause',         () => togglePlay());
  ms.setActionHandler('previoustrack', () => playPrev());
  ms.setActionHandler('nexttrack',     () => playNext());
}
