// ── player.js ────────────────────────────────────────────────────
// Motore di riproduzione unificato (locale + YouTube).

import { store }                from './store.js';
import { formatTime }           from '../utils.js';
import { emit, EV }             from './events.js';
import { saveState }            from './persist.js';

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
   SILENT ANCHOR — mantiene viva la sessione media della pagina
   ─────────────────────────────────────────────────────────────────
   L'audio di YouTube vive in un iframe cross-origin: da solo non
   garantisce che la notifica/lockscreen usi la MediaSession di questa
   pagina (con i suoi handler prev/next) né che la tab resti "viva"
   con lo schermo spento. L'ancora è un <audio> della PAGINA in loop,
   con un segnale a livello bassissimo (≈ -54 dBFS, ~15 Hz,
   volume 0.001: fisicamente inascoltabile ma non digitalmente nullo).

   NOTA: il vecchio WAV inline aveva 0 campioni (chunk "data" di
   lunghezza 0): un loop su durata zero termina subito, quindi
   l'ancora di fatto non restava mai in riproduzione. Ora il WAV è
   generato a runtime e dura 10 s (Chrome ignora i media troppo brevi
   per la MediaSession).

   REGOLA: l'ancora resta accesa anche quando l'utente mette in
   PAUSA. Se la fermassimo subito, Android toglierebbe la notifica e
   potrebbe scartare la tab a schermo spento (→ ripartenza da zero).
   Viene fermata solo dopo _PAUSE_GRACE_MS di pausa ininterrotta.
   ═══════════════════════════════════════════════════════════════════ */
const _PAUSE_GRACE_MS = 30 * 60 * 1000; // 30 min di pausa → l'ancora si ferma

function _makeSilentWavURL() {
  const rate = 8000, seconds = 10, n = rate * seconds;
  const buf  = new ArrayBuffer(44 + n * 2);
  const v    = new DataView(buf);
  const tag  = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };

  tag(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true);
  tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true);       // dimensione chunk fmt
  v.setUint16(20, 1, true);        // PCM
  v.setUint16(22, 1, true);        // mono
  v.setUint32(24, rate, true);     // sample rate
  v.setUint32(28, rate * 2, true); // byte rate
  v.setUint16(32, 2, true);        // block align
  v.setUint16(34, 16, true);       // bit per campione
  tag(36, 'data'); v.setUint32(40, n * 2, true);

  const half = Math.round(rate / 15 / 2); // onda quadra ~15 Hz, ampiezza ±64/32768
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 2, (Math.floor(i / half) % 2) ? 64 : -64, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const _silentEl = new Audio();
_silentEl.src    = _makeSilentWavURL();
_silentEl.loop   = true;
_silentEl.volume = 0.001;

_silentEl.onplay = () => _bindMediaSession();

let _graceTimer = null;

function _silentActivate() {
  clearTimeout(_graceTimer);
  _graceTimer = null;
  if (_silentEl.paused) _silentEl.play().catch(() => {});
  _bindMediaSession();
}

function _silentDeactivate() {
  clearTimeout(_graceTimer);
  _graceTimer = null;
  _silentEl.pause();
  _silentEl.currentTime = 0;
}

/** Ferma l'ancora solo se né il locale né YouTube stanno effettivamente suonando. */
function _silentDeactivateIfFullyPaused() {
  if (!_isPlayingNow()) _silentDeactivate();
}

/** Chiamata quando locale/YT vanno in pausa: avvia il conto alla rovescia, senza fermare subito l'ancora. */
function _silentOnPause() {
  if (_isPlayingNow()) return;
  clearTimeout(_graceTimer);
  _graceTimer = setTimeout(_silentDeactivateIfFullyPaused, _PAUSE_GRACE_MS);
}

/* ═══════════════════════════════════════════════════════════════════
   STATO / POSIZIONE (helper)
   ═══════════════════════════════════════════════════════════════════ */

function _ytState() {
  if (!store.ytReady || !store.ytPlayer) return null;
  try { return store.ytPlayer.getPlayerState(); } catch { return null; }
}

const YT_STATE_PLAYING = 1; // YT.PlayerState.PLAYING (costante: `YT` può non essere ancora caricato)

function _isPlayingNow() {
  if (store.currentYTId) return _ytState() === YT_STATE_PLAYING;
  return !mediaEl.paused && !mediaEl.ended;
}

/** Posizione corrente (s) del brano attivo, locale o YT. */
function _currentPosition() {
  if (store.currentYTId) {
    if (store.ytReady && store.ytPlayer) {
      try { return store.ytPlayer.getCurrentTime() || 0; } catch (_) { /* fallback */ }
    }
    return store.ytStartAt || 0;
  }
  return mediaEl.currentTime || 0;
}

function _seekToSeconds(sec) {
  if (store.currentYTId) {
    if (store.ytReady && store.ytPlayer) {
      try { store.ytPlayer.seekTo(Math.max(0, sec), true); } catch (_) {}
    }
  } else if (store.currentIdx !== -1) {
    const max = mediaEl.duration || Infinity;
    mediaEl.currentTime = Math.min(max, Math.max(0, sec));
  }
}

function _hasContent() {
  return !!store.currentYTId || store.currentIdx !== -1;
}

/* ═══════════════════════════════════════════════════════════════════
   MEDIA SESSION (notifica / lockscreen / tasti cuffie e volante)
   ═══════════════════════════════════════════════════════════════════ */

function _setSessionState(playing) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }
}

/** Aggiorna barra/posizione della notifica. duration non valida → azzera (niente barra finta). */
function _setPosition(duration, position, rate = 1) {
  if (!('mediaSession' in navigator)) return;
  try {
    if (!(duration > 0)) { navigator.mediaSession.setPositionState(); return; }
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: rate,
      position: Math.min(Math.max(position || 0, 0), duration),
    });
  } catch (_) {}
}

/** Allinea la posizione della notifica al player attivo (da usare a pause/resume). */
function _syncPosition() {
  if (store.currentYTId) {
    if (!store.ytReady || !store.ytPlayer) return;
    try { _setPosition(store.ytPlayer.getDuration(), store.ytPlayer.getCurrentTime()); } catch (_) {}
  } else if (mediaEl.duration > 0) {
    _setPosition(mediaEl.duration, mediaEl.currentTime, mediaEl.playbackRate || 1);
  }
}

/**
 * Registra gli handler. Richiamata spesso (Brave tende ad azzerarli):
 * è idempotente ed economica.
 * seekbackward/seekforward NON sono registrati di proposito: su Android
 * possono occupare gli slot compatti della notifica al posto di
 * precedente/successivo. Lo scrub dalla notifica passa da `seekto`.
 */
function _bindMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const ms  = navigator.mediaSession;
  const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch (_) {} };

  set('play',          () => play());
  set('pause',         () => pause());
  set('stop',          () => pause());
  set('previoustrack', () => playPrev());
  set('nexttrack',     () => { playNext(); });
  set('seekto',        d => { if (d && isFinite(d.seekTime)) _seekToSeconds(d.seekTime); });
}

function _mediaSessionLocal(track, title) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist:  track.folder.split('/').pop(),
    artwork: [{ src: track.cover || 'https://placehold.co/512x512', sizes: '512x512', type: 'image/png' }],
  });
  _setSessionState(true);
  _bindMediaSession();
}

function _mediaSessionYT(item, startSeconds, playing) {
  if (!('mediaSession' in navigator)) return;

  // Artwork sempre presente (anche dopo un ripristino senza thumb): serve
  // per far comparire il widget grande dell'OS.
  const thumb = item.thumb || `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`;

  navigator.mediaSession.metadata = new MediaMetadata({
    title:   item.title,
    artist:  item.uploader || 'YouTube',
    album:   'YouTube Stream',
    artwork: [
      { src: thumb, sizes: '96x96',   type: 'image/jpeg' },
      { src: thumb, sizes: '128x128', type: 'image/jpeg' },
      { src: thumb, sizes: '192x192', type: 'image/jpeg' },
      { src: thumb, sizes: '512x512', type: 'image/jpeg' },
    ],
  });

  _setSessionState(playing);
  _setPosition(item.duration, startSeconds); // durata reale da videos.list (se nota)
  _bindMediaSession();
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
        _setPosition(dur, cur);

        // Durata non nota all'avvio: ora la conosciamo (serve a cronologia/persistenza).
        if (store.currentYTItem && !store.currentYTItem.duration) {
          store.currentYTItem.duration = Math.round(dur);
        }
      }
    } catch (_) {}

    // Ogni ~5s: ri-registra gli handler (Brave li azzera spesso) e salva
    // la posizione, così un'eventuale tab scartata riparte dal punto giusto.
    if (++_pollTick % 5 === 0) {
      _bindMediaSession();
      saveState();
    }
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
  store.ytPending     = null; // un eventuale video YT in attesa dell'API non deve partire dopo
  store.ytStartAt     = 0;
  store.currentIdx    = idx;
  store.lastManualIdx = idx;

  _ytStop();
  stopYTSeekPoll();
  emit(EV.YT_STOPPED);
  _ytWrapperVisible(false);

  const track = store.playlist[idx];
  if (_currentObjectURL) URL.revokeObjectURL(_currentObjectURL);
  _currentObjectURL = URL.createObjectURL(track.file);
  mediaEl.src = _currentObjectURL;

  // Ancora silenziosa sempre attiva durante la riproduzione (anche locale).
  _silentActivate();

  mediaEl.play().then(() => {
    _setSessionState(true);
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

/**
 * @param {object} item - { id, title, thumb?, uploader?, duration? }
 * @param {{startSeconds?: number, cue?: boolean}} [opts]
 *   startSeconds: da che secondo partire (ripristino sessione).
 *   cue: carica il video SENZA avviarlo (l'autoplay dopo un reload è
 *        comunque bloccato dal browser; l'utente preme play).
 */
export function playYT(item, { startSeconds = 0, cue = false } = {}) {
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
  store.ytStartAt     = startSeconds;

  const dur = item.duration || 0;
  titleEl.textContent     = item.title;
  seekSlider.value        = dur > 0 ? Math.min(100, (startSeconds / dur) * 100) : 0;
  timeCurrent.textContent = formatTime(startSeconds);
  timeTotal.textContent   = dur > 0 ? formatTime(dur) : '0:00';

  _ytWrapperVisible(true);
  _hideYTStuckMessage();

  // Mantiene viva la sessione media (non in cue: l'autoplay sarebbe bloccato).
  if (cue) _bindMediaSession(); else _silentActivate();

  _loadYT({ id: item.id, startSeconds, cue });

  emit(EV.PLAYER_CHANGE);
  // Tempo/stato espliciti: getCurrentTime() qui è ancora quello del video precedente.
  saveState({ time: startSeconds, paused: cue });
  emit(EV.VISUAL_UPDATE);

  _mediaSessionYT(item, startSeconds, !cue);
}

/** Carica (o mette in cue) un video nel player YT; se l'API non è pronta lo accoda. */
function _loadYT({ id, startSeconds = 0, cue = false }) {
  if (store.ytReady && store.ytPlayer) {
    try {
      const args = { videoId: id, startSeconds };
      if (cue) {
        _watchdogStop();
        store.ytPlayer.cueVideoById(args);
      } else {
        store.ytPlayer.loadVideoById(args);
        _watchdogStart(id);
      }
    } catch (_) {}
  } else {
    store.ytPending = { id, startSeconds, cue };
    _ensureYTScript();
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CONTROLLI
   ═══════════════════════════════════════════════════════════════════ */

/** Avvia/riprende la riproduzione (esplicito: usato anche dalla MediaSession). */
export function play() {
  if (!_hasContent()) return;
  _silentActivate();
  if (store.currentYTId) {
    if (!store.ytReady || !store.ytPlayer) return;
    try { store.ytPlayer.playVideo(); } catch (_) {}
  } else {
    mediaEl.play().catch(() => {});
  }
}

/** Mette in pausa (esplicito: usato anche dalla MediaSession). */
export function pause() {
  if (store.currentYTId) {
    if (!store.ytReady || !store.ytPlayer) return;
    try { store.ytPlayer.pauseVideo(); } catch (_) {}
  } else {
    mediaEl.pause();
  }
}

export function togglePlay() {
  if (_isPlayingNow()) pause(); else play();
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

/** @returns {boolean} true se è partito un altro brano. */
export function playNext() {
  if (_dequeueNext()) return true;

  if (store.currentYTId) {
    if (store.shuffleMode > 0 && store.ytResults.length > 1) {
      const curIdx = store.ytResults.findIndex(r => r.id === store.currentYTId);
      let rndIdx;
      do { rndIdx = Math.floor(Math.random() * store.ytResults.length); }
      while (rndIdx === curIdx);
      playYT(store.ytResults[rndIdx]);
      return true;
    }
    const curIdx = store.ytResults.findIndex(r => r.id === store.currentYTId);
    if (curIdx !== -1 && curIdx + 1 < store.ytResults.length) {
      playYT(store.ytResults[curIdx + 1]);
      return true;
    }
    return false;
  }

  let next = store.currentIdx + 1;
  if (store.shuffleMode > 0 && store.shuffleOrder.length) {
    const curPos = store.shuffleOrder.indexOf(store.currentIdx);
    const nxtPos = (curPos + 1) % store.shuffleOrder.length;
    next = store.shuffleOrder[nxtPos];
  }
  if (next >= 0 && next < store.playlist.length) {
    playLocal(next);
    return true;
  }
  return false;
}

export function playPrev() {
  if (!_hasContent()) return;

  // Oltre i 3 s: "precedente" riparte dall'inizio (locale e YouTube).
  if (_currentPosition() > 3) {
    _seekToSeconds(0);
    return;
  }

  if (store.playHistory.length) {
    const prev = store.playHistory.pop();
    if (prev && typeof prev === 'object' && prev.yt) {
      store.currentYTId   = null;
      store.currentYTItem = null;
      store.currentIdx    = -1;
      playYT({
        type:     'youtube',
        id:       prev.id,
        title:    prev.title,
        thumb:    prev.thumb,
        uploader: prev.uploader,
        duration: prev.duration,
      });
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
    if (curIdx > 0) {
      playYT(store.ytResults[curIdx - 1]);
      return;
    }
  }

  // Niente da cui tornare: riparti almeno dall'inizio del brano.
  _seekToSeconds(0);
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

  _setPosition(mediaEl.duration, mediaEl.currentTime, mediaEl.playbackRate || 1);

  if (!_saveTimer) {
    _saveTimer = setTimeout(() => { saveState(); _saveTimer = null; }, 1000);
  }
};

// Se è attivo YouTube, play/pause del <video> nascosto sono effetti
// collaterali del cambio brano (playYT fa mediaEl.pause()): non devono
// toccare UI, sessione media o ancora.
mediaEl.onplay = () => {
  if (store.currentYTId) return;
  emit(EV.PLAYER_CHANGE, { playing: true });
  _setSessionState(true);
  _silentActivate();
};

mediaEl.onpause = () => {
  if (store.currentYTId) return;
  emit(EV.PLAYER_CHANGE, { playing: false });
  _setSessionState(false);
  _syncPosition();
  _bindMediaSession();
  _silentOnPause(); // l'ancora resta accesa per il periodo di grazia
};

mediaEl.onended = () => {
  if (store.looping) { mediaEl.currentTime = 0; mediaEl.play(); }
  else playNext();
};

/* ═══════════════════════════════════════════════════════════════════
   WATCHDOG AVVIO YOUTUBE
   ─────────────────────────────────────────────────────────────────
   In background (schermo spento) Android/Chrome rallentano e infine
   sospendono i setTimeout/setInterval: un solo tentativo isolato può
   non scattare mai.
   1. Retry con backoff crescente (300ms, 800ms, 2000ms, 4000ms) finché
      il player risulta PLAYING o si esauriscono i tentativi.
   2. `visibilitychange` forza subito un controllo non appena
      schermo/tab tornano attivi.
   3. Se tutto fallisce, mostra "Riprova" invece di un caricamento
      infinito silenzioso.
   ═══════════════════════════════════════════════════════════════════ */

const _WATCHDOG_DELAYS = [300, 800, 2000, 4000];
const _BUFFERING_TIMEOUT_MS = 15000; // tempo massimo tollerato in BUFFERING continuo

let _watchdogVideoId  = null;
let _watchdogTimer     = null;
let _watchdogAttempt   = 0;
let _watchdogStartTime = 0;

function _watchdogStart(videoId) {
  _watchdogStop();
  _watchdogVideoId   = videoId;
  _watchdogAttempt   = 0;
  _watchdogStartTime = Date.now();
  _watchdogScheduleNext();
}

function _watchdogStop() {
  if (_watchdogTimer) { clearTimeout(_watchdogTimer); _watchdogTimer = null; }
  _watchdogVideoId   = null;
  _watchdogAttempt   = 0;
  _watchdogStartTime = 0;
}

function _watchdogScheduleNext() {
  if (_watchdogAttempt >= _WATCHDOG_DELAYS.length) {
    _showYTStuckMessage();
    return;
  }
  _watchdogTimer = setTimeout(() => _watchdogCheck(), _WATCHDOG_DELAYS[_watchdogAttempt]);
}

/** Verifica se il video è partito; se no, ritenta play e pianifica il prossimo controllo. */
function _watchdogCheck() {
  // Il brano è cambiato nel frattempo (utente ha skippato): niente da fare.
  if (store.currentYTId !== _watchdogVideoId) { _watchdogStop(); return; }
  if (!store.ytPlayer) { _watchdogScheduleNext(); return; }

  let state;
  try { state = store.ytPlayer.getPlayerState(); } catch { state = null; }

  if (state === YT.PlayerState.PLAYING) {
    _watchdogStop();
    return;
  }

  // BUFFERING: caricamento normale — richiamare playVideo() rischia di
  // riavviare il buffering. Non consumiamo tentativi, ma c'è un tetto
  // massimo di tempo, oltre il quale avvisiamo l'utente.
  if (state === YT.PlayerState.BUFFERING) {
    if (Date.now() - _watchdogStartTime > _BUFFERING_TIMEOUT_MS) {
      _showYTStuckMessage();
      return;
    }
    _watchdogTimer = setTimeout(() => _watchdogCheck(), 1000);
    return;
  }

  // Solo per stati realmente "fermi" ha senso forzare di nuovo playVideo().
  _watchdogAttempt++;
  try { store.ytPlayer.playVideo(); } catch (_) {}
  _watchdogScheduleNext();
}

/** Schermo/tab tornano visibili: ri-registra la sessione media e riallinea il watchdog. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  _bindMediaSession();
  if (_watchdogVideoId) {
    _watchdogCheck();
  } else if (_hasContent()) {
    _setSessionState(_isPlayingNow());
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
          store.ytPlayer.loadVideoById({ videoId: id, startSeconds: store.ytStartAt || 0 });
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
        const pending = store.ytPending;
        store.ytPending = null;
        if (pending) _loadYT(pending);
      },
      onError: (e) => {
        // Video non disponibile / limitazioni: passa al successivo
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
          _setSessionState(true);
          _syncPosition();
          _bindMediaSession();
        }

        if (e.data === YT.PlayerState.PAUSED && store.currentYTId) {
          stopYTSeekPoll();
          _setSessionState(false);
          _syncPosition();
          _bindMediaSession();
          saveState();      // posizione esatta al momento della pausa
          _silentOnPause(); // l'ancora resta accesa per il periodo di grazia
        }

        // CUED: ripristino sessione (o stop): in pausa, pronto a ripartire.
        if (e.data === YT.PlayerState.CUED && store.currentYTId) {
          _setSessionState(false);
          _bindMediaSession();
        }

        if (e.data === YT.PlayerState.ENDED) {
          stopYTSeekPoll();
          if (store.looping && store.ytReady && store.ytPlayer) {
            try { store.ytPlayer.seekTo(0); store.ytPlayer.playVideo(); } catch (_) {}
          } else {
            // Delay minimo per permettere alla MediaSession di sincronizzarsi
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
