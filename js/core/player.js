// ── player.js ────────────────────────────────────────────────────
// Motore di riproduzione unificato (locale + YouTube).

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
   SILENT ANCHOR — Brave/Android MediaSession
   ─────────────────────────────────────────────────────────────────
   Brave su Android mostra prev/next SOLO se un <audio> nativo è
   in stato "playing". Usiamo un WAV silenzioso in loop.
   REGOLA: non fermare mai _silentEl mentre YT è attivo.
   ═══════════════════════════════════════════════════════════════════ */
const _SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAA'
  + 'ZGF0YQAAAAA=';

const _silentEl = new Audio();
_silentEl.src    = _SILENT_WAV;
_silentEl.loop   = true;
_silentEl.volume = 0;

// Avvia il silent anchor e ri-registra SEMPRE i MediaSession handler.
// Brave annulla i handler ogni volta che lo stato audio cambia,
// quindi ri-registriamo su ogni evento rilevante.
function _silentActivate() {
  if (_silentEl.paused) {
    _silentEl.play().catch(() => {});
  }
  _bindMediaSession();
}

function _silentDeactivate() {
  _silentEl.pause();
  _silentEl.currentTime = 0;
}

/* ═══════════════════════════════════════════════════════════════════
   SEEKBAR POLL per YouTube (250ms, molto piu reattivo)
   ═══════════════════════════════════════════════════════════════════ */
let _ytPollTimer = null;

export function startYTSeekPoll() {
  stopYTSeekPoll();
  _ytPollTimer = setInterval(() => {
    if (!store.ytPlayer || !store.currentYTId) { stopYTSeekPoll(); return; }
    try {
      const cur = store.ytPlayer.getCurrentTime() || 0;
      const dur = store.ytPlayer.getDuration()    || 0;
      if (dur > 0 && cur >= 0) {
        seekSlider.value        = (cur / dur) * 100;
        timeCurrent.textContent = formatTime(cur);
        timeTotal.textContent   = formatTime(dur);
        // Aggiorna la barra di avanzamento nella notifica di sistema (Brave/Android)
        if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.setPositionState({
              duration:     dur,
              playbackRate: 1,
              position:     cur,
            });
          } catch (_) {}
        }
      }
    } catch (_) {}
  }, 250);
}

export function stopYTSeekPoll() {
  if (_ytPollTimer) { clearInterval(_ytPollTimer); _ytPollTimer = null; }
}

/* ═══════════════════════════════════════════════════════════════════
   LOCALE
   ═══════════════════════════════════════════════════════════════════ */

export function playLocal(idx, { addHistory = true, fromBack = false } = {}) {
  if (idx < 0 || idx >= store.playlist.length) return;

  // Salva in cronologia il brano corrente PRIMA di cambiare
  if (addHistory && !fromBack) {
    if (store.currentYTId && store.currentYTItem) {
      store.playHistory.push({ yt: true, ...store.currentYTItem });
    } else if (store.currentIdx !== -1 && store.currentIdx !== idx) {
      store.playHistory.push(store.currentIdx);
    }
  }

  store.currentYTId   = null;
  store.currentYTItem = null;
  store.currentIdx    = idx;
  store.lastManualIdx = idx;

  _ytStop();
  stopYTSeekPoll();
  _silentDeactivate();
  emit(EV.YT_STOPPED);
  _ytWrapperVisible(false);

  const track = store.playlist[idx];
  if (_currentObjectURL) URL.revokeObjectURL(_currentObjectURL);
  _currentObjectURL = URL.createObjectURL(track.file);
  mediaEl.src = _currentObjectURL;
  mediaEl.play();

  titleEl.textContent     = _fileTitle(track.file);
  seekSlider.value        = 0;
  timeCurrent.textContent = '0:00';
  timeTotal.textContent   = '0:00';

  emit(EV.PLAYER_CHANGE);
  saveState();
  emit(EV.VISUAL_UPDATE);
  _mediaSessionLocal(track, titleEl.textContent);
}

/* ═══════════════════════════════════════════════════════════════════
   YOUTUBE
   ═══════════════════════════════════════════════════════════════════ */

export function playYT(item) {
  // Salva in cronologia il brano corrente PRIMA di cambiare
  // (solo se stiamo gia riproducendo qualcosa di diverso)
  if (store.currentYTId && store.currentYTItem && store.currentYTId !== item.id) {
    store.playHistory.push({ yt: true, ...store.currentYTItem });
  } else if (!store.currentYTId && store.currentIdx !== -1) {
    store.playHistory.push(store.currentIdx);
  }
  // Caso primo avvio (currentYTId=null, currentIdx=-1): non pushare nulla

  // Ferma locale
  mediaEl.pause();
  if (_currentObjectURL) {
    URL.revokeObjectURL(_currentObjectURL);
    _currentObjectURL = null;
  }
  mediaEl.removeAttribute('src');
  // NON chiamare mediaEl.load() qui: resetta i MediaSession handler su alcuni browser

  stopYTSeekPoll();
  emit(EV.YT_STOPPED);

  store.currentYTId   = item.id;
  store.currentYTItem = { ...item };
  store.currentIdx    = -1;

  titleEl.textContent     = item.title;
  seekSlider.value        = 0;
  timeCurrent.textContent = '0:00';
  timeTotal.textContent   = '0:00';

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

  // Attiva subito il silent anchor e i MediaSession handler.
  _mediaSessionYT(item);
  _silentActivate();
}

/* ═══════════════════════════════════════════════════════════════════
   CONTROLLI
   ═══════════════════════════════════════════════════════════════════ */

export function togglePlay() {
  if (store.currentYTId) {
    if (!store.ytReady || !store.ytPlayer) return;
    try {
      const state = store.ytPlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING) {
        store.ytPlayer.pauseVideo();
      } else {
        store.ytPlayer.playVideo();
      }
    } catch (_) {}
  } else {
    mediaEl.paused ? mediaEl.play() : mediaEl.pause();
  }
}

export function seek(pct) {
  if (store.currentYTId && store.ytReady && store.ytPlayer) {
    try {
      const dur = store.ytPlayer.getDuration() || 0;
      if (dur > 0) store.ytPlayer.seekTo((pct / 100) * dur, true);
    } catch (_) {}
  } else if (mediaEl.duration) {
    mediaEl.currentTime = (pct / 100) * mediaEl.duration;
  }
}

export function playNext() {
  import('./queue.js').then(({ dequeueNext }) => {
    if (dequeueNext()) return;

    if (store.currentYTId) {
      // Loop YT
      if (store.looping && store.ytReady && store.ytPlayer) {
        try { store.ytPlayer.seekTo(0); store.ytPlayer.playVideo(); } catch (_) {}
        return;
      }
      // Shuffle YT: random tra risultati visibili
      if (store.shuffle && store.ytResults.length > 1) {
        const curIdx = store.ytResults.findIndex(r => r.id === store.currentYTId);
        let rndIdx;
        do { rndIdx = Math.floor(Math.random() * store.ytResults.length); }
        while (rndIdx === curIdx);
        playYT(store.ytResults[rndIdx]);
        return;
      }
      // Avanza in sequenza nei risultati YT
      const curIdx = store.ytResults.findIndex(r => r.id === store.currentYTId);
      if (curIdx !== -1 && curIdx + 1 < store.ytResults.length) {
        playYT(store.ytResults[curIdx + 1]);
      }
      return;
    }

    // Locale
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
  // Locale: se oltre 3s riparti dall'inizio
  if (!store.currentYTId && mediaEl.currentTime > 3) {
    mediaEl.currentTime = 0;
    return;
  }

  if (store.playHistory.length) {
    const prev = store.playHistory.pop();
    if (prev && typeof prev === 'object' && prev.yt) {
      // Entry YT nella cronologia: azzera stato per evitare push duplicato
      store.currentYTId   = null;
      store.currentYTItem = null;
      store.currentIdx    = -1;
      playYT({ id: prev.id, title: prev.title, thumb: prev.thumb, uploader: prev.uploader });
      return;
    }
    playLocal(prev, { addHistory: false, fromBack: true });
    return;
  }

  // Senza cronologia
  if (!store.currentYTId && store.currentIdx > 0) {
    playLocal(store.currentIdx - 1);
    return;
  }
  if (store.currentYTId && store.ytResults.length > 1) {
    const curIdx = store.ytResults.findIndex(r => r.id === store.currentYTId);
    if (curIdx > 0) playYT(store.ytResults[curIdx - 1]);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   EVENTI MEDIA ELEMENT (locale)
   ═══════════════════════════════════════════════════════════════════ */

let _saveTimer = null;
mediaEl.ontimeupdate = () => {
  if (!mediaEl.duration) return;
  seekSlider.value        = (mediaEl.currentTime / mediaEl.duration) * 100;
  timeCurrent.textContent = formatTime(mediaEl.currentTime);
  timeTotal.textContent   = formatTime(mediaEl.duration);
  if (!_saveTimer) {
    _saveTimer = setTimeout(() => { saveState(); _saveTimer = null; }, 1000);
  }
};

mediaEl.onplay  = () => emit(EV.PLAYER_CHANGE);
mediaEl.onpause = () => emit(EV.PLAYER_CHANGE);
mediaEl.onended = () => {
  if (store.looping) { mediaEl.currentTime = 0; mediaEl.play(); }
  else playNext();
};

/* ═══════════════════════════════════════════════════════════════════
   YT IFrame API
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
          startYTSeekPoll();
          // Brave annulla i handler di sistema dopo ogni cambio di stato:
          // ri-registriamo qui, che e il momento piu affidabile.
          _silentActivate();
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
            _bindMediaSession();
          }
        }
        if (e.data === YT.PlayerState.PAUSED) {
          stopYTSeekPoll();
          // NON emettere YT_STOPPED qui: usato solo per altri scopi
          // NON fermare _silentEl: Brave rimuoverebbe i controlli di sistema
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
            _bindMediaSession(); // ri-registra anche su pausa
          }
        }
        if (e.data === YT.PlayerState.ENDED) {
          stopYTSeekPoll();
          if (store.looping && store.ytReady && store.ytPlayer) {
            try { store.ytPlayer.seekTo(0); store.ytPlayer.playVideo(); } catch (_) {}
          } else {
            playNext();
          }
        }
        if (e.data === YT.PlayerState.BUFFERING) {
          _silentActivate();
        }
        // Passa stato esplicito per evitare race condition con getPlayerState()
        emit(EV.PLAYER_CHANGE, { playing: e.data === YT.PlayerState.PLAYING });
      },
    },
  });
};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS PRIVATI
   ═══════════════════════════════════════════════════════════════════ */

function _ytStop() {
  stopYTSeekPoll();
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
    artwork: item.thumb
      ? [{ src: item.thumb, sizes: '320x180', type: 'image/jpeg' }]
      : [],
  });
  navigator.mediaSession.playbackState = 'playing';
  _bindMediaSession();
}

function _bindMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler('play',          () => togglePlay());
  ms.setActionHandler('pause',         () => togglePlay());
  ms.setActionHandler('previoustrack', () => playPrev());
  ms.setActionHandler('nexttrack',     () => playNext());
}
