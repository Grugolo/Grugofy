// ── controls.js ──────────────────────────────────────────────────
// Player bar UI: icone SVG, event listener pulsanti, updateUI.
// Ascolta eventi dal bus invece di importare direttamente player.js
// (evita il ciclo: player → controls → player).

import { store }                              from '../core/store.js';
import { on, EV }                             from '../core/events.js';
import { mediaEl, togglePlay, playNext, playPrev, seek } from '../core/player.js';

/* ── SVG Icons ──────────────────────────────────────────────────── */
// Tutti inline per evitare richieste HTTP extra e semplificare il deploy.
const ICONS = {
  play:  `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#000" d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#000" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  next:  `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#fff" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
  prev:  `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#fff" d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>`,
  loop: (on) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path fill="none" stroke="${on ? '#1db954' : '#888'}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"
      d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>`,
  shuffle: (active) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path fill="none" stroke="${active ? '#1db954' : '#888'}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"
      d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
  </svg>`,
};

/* ── DOM refs ───────────────────────────────────────────────────── */
const btnPlay    = document.getElementById('btnPlay');
const btnNext    = document.getElementById('btnNext');
const btnPrev    = document.getElementById('btnPrev');
const btnLoop    = document.getElementById('btnLoop');
const btnShuffle = document.getElementById('btnShuffle');
const seekSlider = document.getElementById('seekSlider');

/* ── Button listeners ───────────────────────────────────────────── */
btnPlay.onclick    = togglePlay;
btnNext.onclick    = playNext;
btnPrev.onclick    = playPrev;
seekSlider.oninput = () => seek(Number(seekSlider.value));

btnLoop.onclick = () => {
  store.looping = !store.looping;
  updateUI();
};

btnShuffle.onclick = () => {
  store.shuffle = !store.shuffle;
  if (store.shuffle) _buildShuffleOrder();
  if (navigator.vibrate) navigator.vibrate(30);
  updateUI();
};

/* ── Ascolta eventi del bus ─────────────────────────────────────── */
on(EV.PLAYER_CHANGE, () => updateUI());

/* ── updateUI ───────────────────────────────────────────────────── */
export function updateUI() {
  const playing = _isPlaying();

  btnPlay.innerHTML    = playing ? ICONS.pause : ICONS.play;
  btnNext.innerHTML    = ICONS.next;
  btnPrev.innerHTML    = ICONS.prev;
  btnLoop.innerHTML    = ICONS.loop(store.looping);
  btnShuffle.innerHTML = ICONS.shuffle(store.shuffle);

  // Highlight traccia corrente in libreria
  document.querySelectorAll('#library .track-item').forEach(el => {
    const i = parseInt(el.dataset.idx);
    el.classList.toggle('playing',  i === store.currentIdx);
    el.classList.toggle('last-pos', i !== store.currentIdx && i === store.lastManualIdx);
  });
}

/* ── Helpers privati ────────────────────────────────────────────── */
function _isPlaying() {
  if (store.currentYTId && store.ytReady && store.ytPlayer) {
    try { return store.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING; } catch { return false; }
  }
  return !mediaEl.paused;
}

function _buildShuffleOrder() {
  store.shuffleOrder = Array.from({ length: store.playlist.length }, (_, i) => i);
  for (let i = store.shuffleOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [store.shuffleOrder[i], store.shuffleOrder[j]] = [store.shuffleOrder[j], store.shuffleOrder[i]];
  }
}
