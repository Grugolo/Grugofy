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

/* ── Wiring con queue.js (evita import ciclico) ─────────────────── */
let _dequeueNext = () => false;

/** Chiamata una volta da main.js per collegare la logica di coda. */
export function wireQueue({ dequeueNext }) {
  _dequeueNext = dequeueNext || _dequeueNext;
}

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

_silentEl.onplay = () => _bindMediaSession();

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
   SEEKBAR POLL per YouTube (1000ms)
   ═══════════════════════════════════════════════════════════════════ */
let _ytPollTimer = null;
let _pollTick    = 0;

export function startYTSeekPoll() {
  stopYTSeekPoll();
  _pollTick = 0;
  _ytPollTimer = setInterval(() => {
    if (!store.ytPlayer || !store.currentYTId) { stopYTSeekPoll(); return; }
    try {
      const cur = store.ytPlayer.getCurrentTime() || 0;
      const dur = store.ytPlayer.getDuration()    || 0;
      if (dur > 0 && cur >= 0) {
        seekSlider.value        = (cur / dur) * 100;
        timeCurrent.textContent = formatTime(cur);
        timeTotal.textContent   = formatTime(dur);

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

    // Ri-registra i handler ogni ~5s (Brave li azzera spesso)
    if (++_pollTick % 20 === 0) _bindMediaSession();

  }, 1000);
}

export function stopYTSeekPoll() {
  if (_ytPollTimer) { clearInterval(_ytPollTimer); _ytPollTimer = null; }
}

/* ═══════════════════════════════════════════════════════════════════
   LOCALE
   ═══════════════════════════════════════════════════════════════════ */

export function playLocal(idx, { addHistory = true, fromBack = false } = {}) {
  if (idx < 0 || idx >= store.playlist.length) return;

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

  mediaEl.play().then(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    _bindMediaSession();
  }).catch(() => {});

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
  if (store.currentYTId && store.currentYTItem && store.currentYTId !== item.id) {
    store.playHistory.push({ yt: true, ...store.currentYTItem });
  } else if (!store.currentYTId && store.currentIdx !== -1) {
    store.playHistory.push(store.currentIdx);
  }

  mediaEl.pause();
  if (_currentObjectURL) {
    URL.revokeObjectURL(_currentObjectURL);
    _currentObjectURL = null;
  }
  mediaEl.removeAttribute('src');

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
  _hideYTStuckMessage();

  // Mantiene sveglio il Media Thread per il cambio in background
  _silentActivate();

  if (store.ytReady && store.ytPlayer) {
    try {
      store.ytPlayer.loadVideoById(item.id);
      _watchdogStart(item.id);
    } catch (_) {}
  } else {
    store.ytPending = item.id;
    _ensureYTScript();
  }

  emit(EV.PLAYER_CHANGE);
  saveState();
  emit(EV.VISUAL_UPDATE);

  _mediaSessionYT(item);
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setPositionState({
        duration:     0.1,
        playbackRate: 1,
        position:     0,
      });
    } catch (_) {}
  }
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
        _silentActivate();
        store.ytPlayer.playVideo();
      }
    } catch (_) {}
  } else {
    if (mediaEl.paused) {
      mediaEl.play().catch(() => {});
    } else {
      mediaEl.pause();
    }
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
  if (_dequeueNext()) return;

  if (store.currentYTId) {
    if (store.looping && store.ytReady && store.ytPlayer) {
      try { store.ytPlayer.seekTo(0); store.ytPlayer.playVideo(); } catch (_) {}
      return;
    }
    if (store.shuffleMode > 0 && store.ytResults.length > 1) {
      const curIdx = store.ytResults.findIndex(r => r.id === store.currentYTId);
      let rndIdx;
      do { rndIdx = Math.floor(Math.random() * store.ytResults.length); }
      while (rndIdx === curIdx);
      playYT(store.ytResults[rndIdx]);
      return;
    }
    const curIdx = store.ytResults.findIndex(r => r.id === store.currentYTId);
    if (curIdx !== -1 && curIdx + 1 < store.ytResults.length) {
      playYT(store.ytResults[curIdx + 1]);
    }
    return;
  }

  let next = store.currentIdx + 1;
  if (store.shuffleMode > 0 && store.shuffleOrder.length) {
    const curPos = store.shuffleOrder.indexOf(store.currentIdx);
    const nxtPos = (curPos + 1) % store.shuffleOrder.length;
    next = store.shuffleOrder[nxtPos];
  }
  if (next < store.playlist.length) playLocal(next);
}

export function playPrev() {
  if (!store.currentYTId && mediaEl.currentTime > 3) {
    mediaEl.currentTime = 0;
    return;
  }

  if (store.playHistory.length) {
    const prev = store.playHistory.pop();
    if (prev && typeof prev === 'object' && prev.yt) {
      store.currentYTId   = null;
      store.currentYTItem = null;
      store.currentIdx    = -1;
      playYT({ id: prev.id, title: prev.title, thumb: prev.thumb, uploader: prev.uploader });
      return;
    }
    playLocal(prev, { addHistory: false, fromBack: true });
    return;
  }

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

  if ('mediaSession' in navigator && mediaEl.duration > 0) {
    try {
      navigator.mediaSession.setPositionState({
        duration:     mediaEl.duration,
        playbackRate: mediaEl.playbackRate || 1,
        position:     mediaEl.currentTime,
      });
    } catch (_) {}
  }

  if (!_saveTimer) {
    _saveTimer = setTimeout(() => { saveState(); _saveTimer = null; }, 1000);
  }
};

mediaEl.onplay = () => {
  emit(EV.PLAYER_CHANGE, { playing: true });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  _bindMediaSession();
};

mediaEl.onpause = () => {
  emit(EV.PLAYER_CHANGE, { playing: false });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  _bindMediaSession();
};

mediaEl.onended = () => {
  if (store.looping) { mediaEl.currentTime = 0; mediaEl.play(); }
  else playNext();
};

/* ═══════════════════════════════════════════════════════════════════
   WATCHDOG AVVIO YOUTUBE — sostituisce il vecchio "singolo setTimeout"
   ─────────────────────────────────────────────────────────────────
   Perché serve: in background (schermo spento), Android/Chrome
   rallentano e infine sospendono i setTimeout/setInterval. Un solo
   tentativo isolato a 300ms può semplicemente non scattare mai.
   Strategia:
   1. Retry con backoff crescente (300ms, 800ms, 2000ms, 4000ms) finché
      il player risulta PLAYING o si esauriscono i tentativi.
   2. Un listener su `visibilitychange` forza subito un controllo/retry
      non appena schermo o tab tornano attivi — è uno degli eventi che
      il browser garantisce di consegnare anche dopo il throttling.
   3. Se tutti i tentativi falliscono, mostra un messaggio "Riprova"
      invece di lasciare il caricamento infinito silenzioso.
   ═══════════════════════════════════════════════════════════════════ */

const _WATCHDOG_DELAYS = [300, 800, 2000, 4000]; // ms, crescenti

let _watchdogVideoId = null;   // video per cui il watchdog è attivo
let _watchdogTimer    = null;
let _watchdogAttempt  = 0;

function _watchdogStart(videoId) {
  _watchdogStop();
  _watchdogVideoId  = videoId;
  _watchdogAttempt  = 0;
  _watchdogScheduleNext();
}

function _watchdogStop() {
  if (_watchdogTimer) { clearTimeout(_watchdogTimer); _watchdogTimer = null; }
  _watchdogVideoId = null;
  _watchdogAttempt = 0;
}

function _watchdogScheduleNext() {
  if (_watchdogAttempt >= _WATCHDOG_DELAYS.length) {
    _showYTStuckMessage();
    return;
  }
  const delay = _WATCHDOG_DELAYS[_watchdogAttempt];
  _watchdogTimer = setTimeout(() => _watchdogCheck(), delay);
}

/** Verifica se il video è partito; se no, ritenta play e pianifica il prossimo controllo. */
function _watchdogCheck() {
  // Il brano è cambiato nel frattempo (utente ha skippato): niente da fare.
  if (store.currentYTId !== _watchdogVideoId) { _watchdogStop(); return; }
  if (!store.ytPlayer) { _watchdogScheduleNext(); return; }

  let state;
  try { state = store.ytPlayer.getPlayerState(); } catch { state = null; }

  if (state === YT.PlayerState.PLAYING) {
    _watchdogStop(); // partito correttamente, nessun altro tentativo necessario
    return;
  }

  _watchdogAttempt++;
  try { store.ytPlayer.playVideo(); } catch (_) {}
  _watchdogScheduleNext();
}

/** Forza un controllo immediato quando schermo/tab tornano visibili. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _watchdogVideoId) {
    _watchdogCheck();
  }
});

/* ── Messaggio "video bloccato" con pulsante di ripristino manuale ── */
let _ytStuckEl = null;

function _showYTStuckMessage() {
  if (!_ytStuckEl) {
    _ytStuckEl = document.createElement('div');
    _ytStuckEl.id = 'ytStuckMessage';
    _ytStuckEl.innerHTML = `
      <span>Il video non parte. Il browser potrebbe averlo sospeso in background.</span>
      <button type="button">Riprova</button>`;
    _ytStuckEl.querySelector('button').addEventListener('click', () => {
      const id = store.currentYTId;
      _hideYTStuckMessage();
      if (id && store.ytPlayer) {
        try {
          store.ytPlayer.loadVideoById(id);
          _watchdogStart(id);
        } catch (_) {}
      }
    });
    document.getElementById('ytWrapper').appendChild(_ytStuckEl);
  }
  _ytStuckEl.classList.add('visible');
}

function _hideYTStuckMessage() {
  if (_ytStuckEl) _ytStuckEl.classList.remove('visible');
}

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
          _watchdogStart(store.ytPending);
          store.ytPending = null;
        }
      },
      onError: (e) => {
        // Se un video YT fallisce (es. non disponibile o limitazione age), passa al successivo
        console.warn('YouTube Player error:', e.data);
        _watchdogStop();
        _hideYTStuckMessage();
        playNext();
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          emit(EV.YT_PLAYING);
          startYTSeekPoll();
          _silentActivate();
          _watchdogStop();
          _hideYTStuckMessage();
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
            _bindMediaSession();
          }
        }

        if (e.data === YT.PlayerState.PAUSED) {
          stopYTSeekPoll();
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
            _bindMediaSession();
          }
        }

        if (e.data === YT.PlayerState.ENDED) {
          stopYTSeekPoll();
          if (store.looping && store.ytReady && store.ytPlayer) {
            try { store.ytPlayer.seekTo(0); store.ytPlayer.playVideo(); } catch (_) {}
          } else {
            // Delay minimo prima di chiamare la traccia successiva
            // per permettere alla MediaSession di sincronizzarsi
            setTimeout(() => playNext(), 50);
          }
        }

        if (e.data === YT.PlayerState.BUFFERING) {
          _silentActivate();
        }

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

/* ═══════════════════════════════════════════════════════════════════
   MEDIA SESSION FORZATA (Notifiche & Lockscreen)
   ═══════════════════════════════════════════════════════════════════ */

function _mediaSessionYT(item) {
  if (!('mediaSession' in navigator)) return;

  // 1. Forza la presenza dell'Artwork per far attivare il widget grande dell'OS
  navigator.mediaSession.metadata = new MediaMetadata({
    title:   item.title,
    artist:  item.uploader || 'YouTube',
    album:   'YouTube Stream',
    artwork: item.thumb
      ? [
          { src: item.thumb, sizes: '96x96',   type: 'image/jpeg' },
          { src: item.thumb, sizes: '128x128', type: 'image/jpeg' },
          { src: item.thumb, sizes: '192x192', type: 'image/jpeg' },
          { src: item.thumb, sizes: '512x512', type: 'image/jpeg' },
        ]
      : []
  });

  // 2. Forza lo stato a PLAYING (sblocca l'interfaccia notifica)
  navigator.mediaSession.playbackState = 'playing';

  // 3. Imposta una posizione iniziale fittizia per obbligare Chrome/Brave
  // a mostrare la barra di avanzamento e i pulsanti prev/next
  try {
    navigator.mediaSession.setPositionState({
      duration:     item.duration || 180, // Se non c'è durata, usa un placeholder di 3 min
      playbackRate: 1,
      position:     0,
    });
  } catch (_) {}

  _bindMediaSession();
}

function _bindMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;

  ms.setActionHandler('play',          () => togglePlay());
  ms.setActionHandler('pause',         () => togglePlay());
  ms.setActionHandler('previoustrack', () => playPrev());
  ms.setActionHandler('nexttrack',     () => playNext());

  // seekforward/seekbackward: su Android/Brave abilitare questi due handler
  // costringe l'OS a mostrare i controlli estesi.
  ms.setActionHandler('seekbackward', () => {
    if (store.currentYTId && store.ytPlayer) {
      try {
        const cur = store.ytPlayer.getCurrentTime() || 0;
        store.ytPlayer.seekTo(Math.max(0, cur - 10), true);
      } catch (_) {}
    } else {
      mediaEl.currentTime = Math.max(0, mediaEl.currentTime - 10);
    }
  });

  ms.setActionHandler('seekforward', () => {
    if (store.currentYTId && store.ytPlayer) {
      try {
        const cur = store.ytPlayer.getCurrentTime() || 0;
        store.ytPlayer.seekTo(cur + 10, true);
      } catch (_) {}
    } else {
      mediaEl.currentTime = Math.min(mediaEl.duration || 0, mediaEl.currentTime + 10);
    }
  });

  try { ms.setActionHandler('stop', () => togglePlay()); } catch (_) {}
}
