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

/* ── Audio silenzioso: ancora MediaSession per Android/Brave ────────
   Android mostra prev/next solo se un <audio> nativo sta suonando.
   Usiamo un file WAV inline (44 byte, silenzio) in loop continuo
   mentre YT è attivo, così il browser "vede" un media element vivo.  */
const _SILENT_WAV = 'data:audio/wav;base64,'
  + 'UklGRiQAAABXQVZFZm10IBAAAA'
  + 'EAAQAAgD4AAAB9AAACABAA'
  + 'ZGF0YQAAAAA=';

const _silentEl = new Audio();
_silentEl.src    = _SILENT_WAV;
_silentEl.loop   = true;
_silentEl.volume = 0;

function _silentPlay()  { _silentEl.play().catch(() => {}); }
function _silentStop()  { _silentEl.pause(); _silentEl.currentTime = 0; }

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

  // Ferma YT e silent anchor
  _ytStop();
  _silentStop();
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
  saveState();
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
  // FIX BUG 2: load() può resettare i MediaSession handlers su alcuni browser;
  // rebindiamo DOPO il load tramite _mediaSessionYT chiamato più in basso
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
  saveState();
  emit(EV.VISUAL_UPDATE);
  // FIX BUG 2: chiama DOPO mediaEl.load() così i handler sono sempre registrati
  _mediaSessionYT(item);
  // Avvia il silent anchor subito; verrà ripetuto anche su onStateChange
  _silentPlay();
}

/* ═══════════════════════════════════════════════════════════════════
   CONTROLLI
   ═══════════════════════════════════════════════════════════════════ */

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
  import('./queue.js').then(({ dequeueNext }) => {
    if (dequeueNext()) return;
    if (store.currentYTId) return;

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
        if (e.data === YT.PlayerState.PLAYING) {
          emit(EV.YT_PLAYING);
          _silentPlay(); // mantieni l'anchor attivo su Android
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
        }
        if (e.data === YT.PlayerState.PAUSED) {
          emit(EV.YT_STOPPED);
          _silentStop();
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
          }
        }
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
  return file.name.replace(/\.[^/.]+$/, '');
}

function _mediaSessionLocal(track, title) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist:  track.folder.split('/').pop(),
    artwork: [{ src: track.cover || 'https://placehold.co/512x512', sizes: '512x512', type: 'image/png' }],
  });
  navigator.mediaSession.playbackState = 'playing';
  _bindMediaSession();
}

function _mediaSessionYT(item) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title:   item.title,
    artist:  item.uploader || 'YouTube',
    artwork: [{ src: item.thumb || '', sizes: '512x512', type: 'image/jpeg' }],
  });
  // FIX BUG 2: imposta playbackState esplicitamente — alcuni browser (Safari/iOS)
  // resettano i controlli di sistema se lo stato non è dichiarato
  navigator.mediaSession.playbackState = 'playing';
  _bindMediaSession();
}

function _bindMediaSession() {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play',          () => togglePlay());
  ms.setActionHandler('pause',         () => togglePlay());
  ms.setActionHandler('previoustrack', () => playPrev());
  ms.setActionHandler('nexttrack',     () => playNext());
}
