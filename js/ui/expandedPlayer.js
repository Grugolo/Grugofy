// ── expandedPlayer.js ────────────────────────────────────────────
// Player espanso: vista visuale, swipe gestures, long-press 2x speed,
// seekbar polling per YouTube.
// Ascolta eventi dal bus (EV.VISUAL_UPDATE, EV.YT_PLAYING, EV.YT_STOPPED).

import { store }               from '../core/store.js';
import { on, EV }              from '../core/events.js';
import { mediaEl }             from '../core/player.js';
import { formatTime, showToast } from '../utils.js';

/* ── DOM refs ───────────────────────────────────────────────────── */
const expandedEl  = document.getElementById('expandedPlayer');
const visualEl    = document.getElementById('visualContainer');
const ytWrapperEl = document.getElementById('ytWrapper');
const seekSlider  = document.getElementById('seekSlider');
const timeCurrent = document.getElementById('timeCurrent');
const timeTotal   = document.getElementById('timeTotal');

/* ── YT seekbar polling ─────────────────────────────────────────── */
let _pollTimer = null;

export function startYTSeekPoll() {
  stopYTSeekPoll();
  _pollTimer = setInterval(() => {
    if (!store.ytPlayer || !store.currentYTId) { stopYTSeekPoll(); return; }
    try {
      const cur = store.ytPlayer.getCurrentTime() || 0;
      const dur = store.ytPlayer.getDuration()    || 0;
      if (dur > 0) {
        seekSlider.value        = (cur / dur) * 100;
        timeCurrent.textContent = formatTime(cur);
        timeTotal.textContent   = formatTime(dur);
      }
    } catch (_) {}
  }, 1000);
}

export function stopYTSeekPoll() {
  clearInterval(_pollTimer);
  _pollTimer = null;
}

/* ── Ascolta eventi del bus ─────────────────────────────────────── */
on(EV.VISUAL_UPDATE, () => updateVisual());
on(EV.YT_PLAYING,   () => startYTSeekPoll());
on(EV.YT_STOPPED,   () => stopYTSeekPoll());

/* ── Apri / chiudi ──────────────────────────────────────────────── */
export function togglePlayer(open) {
  const hasContent = store.currentYTId || store.currentIdx !== -1;
  if (open && hasContent) {
    updateVisual();
    expandedEl.classList.add('open');
  } else {
    expandedEl.classList.remove('open');
    // Non fermiamo il poll quando si chiude: l'audio YT continua in background
  }
}

/* ── Aggiorna visual ────────────────────────────────────────────── */
export function updateVisual() {
  if (store.currentYTId) {
    // YT attivo: mostra wrapper YT, pulisci visual
    visualEl.innerHTML = '';
    ytWrapperEl.classList.add('active');
    return;
  }

  ytWrapperEl.classList.remove('active');
  visualEl.innerHTML = '';

  const idx = store.currentIdx;
  if (idx === -1) return;

  const track = store.playlist[idx];
  if (!track) return;

  if (track.file.type.startsWith('video/')) {
    // Video locale: mostra l'elemento <video> dentro il container
    mediaEl.style.display   = 'block';
    mediaEl.style.width     = '100%';
    mediaEl.style.maxHeight = '100%';
    visualEl.appendChild(mediaEl);
  } else {
    // Audio: mostra copertina
    mediaEl.style.display = 'none';
    const img = document.createElement('img');
    img.src = track.cover || 'https://placehold.co/512x512';
    img.alt = '';
    visualEl.appendChild(img);
  }
}

/* ── Setup gesture sull'expanded player (chiamato una volta all'init) */
export function setupExpandedSwipe() {
  _setupSwipeNavigation();
  _setupVisualGestures();
}

/* ── Swipe verticale → chiudi; orizzontale → prev/next ─────────── */
function _setupSwipeNavigation() {
  let startX = 0, startY = 0;
  const THRESHOLD = 60;

  expandedEl.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  expandedEl.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    if (Math.abs(dy) > Math.abs(dx) && dy > THRESHOLD) {
      togglePlayer(false);
    } else if (Math.abs(dx) > Math.abs(dy)) {
      if (dx >  THRESHOLD) document.getElementById('btnPrev').click();
      if (dx < -THRESHOLD) document.getElementById('btnNext').click();
    }
  }, { passive: true });
}

/* ── Long-press 2x speed + double-tap seek ──────────────────────── */
function _setupVisualGestures() {
  let longPressTimer = null;
  let isLongPress    = false;
  let lastTapTime    = 0;
  const TAP_DELAY    = 300;
  const LONG_PRESS   = 300;

  visualEl.addEventListener('touchstart', e => {
    if (store.currentYTId) return; // gesture solo per locale

    // Long-press solo sul terzo destro dello schermo
    const x = e.touches[0].clientX - visualEl.getBoundingClientRect().left;
    if (x < visualEl.offsetWidth * 2 / 3) return;

    isLongPress    = false;
    longPressTimer = setTimeout(() => {
      isLongPress          = true;
      mediaEl.playbackRate = 2.0;
      showToast('⏩ 2x');
      if (navigator.vibrate) navigator.vibrate(20);
    }, LONG_PRESS);
  }, { passive: true });

  visualEl.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
    if (isLongPress) {
      mediaEl.playbackRate = 1.0;
      isLongPress = false;
    }
  }, { passive: true });

  // Double-tap seek / single-tap play-pause
  visualEl.addEventListener('click', e => {
    if (isLongPress || store.currentYTId) return;

    const now = Date.now();
    const x   = e.clientX - visualEl.getBoundingClientRect().left;
    const w   = visualEl.offsetWidth;

    if (now - lastTapTime < TAP_DELAY) {
      // Double-tap
      if      (x > w * 2 / 3) { mediaEl.currentTime = Math.min(mediaEl.duration, mediaEl.currentTime + 10); showToast('+10s ⏩'); }
      else if (x < w / 3)     { mediaEl.currentTime = Math.max(0, mediaEl.currentTime - 5);                showToast('⏪ -5s'); }
      lastTapTime = 0;
    } else {
      lastTapTime = now;
      setTimeout(() => {
        // Se nessun secondo tap arriva → play/pause
        if (Date.now() - lastTapTime >= TAP_DELAY && lastTapTime !== 0) {
          mediaEl.paused ? mediaEl.play() : mediaEl.pause();
        }
      }, TAP_DELAY);
    }
  });
}
