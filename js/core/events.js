// ── events.js ────────────────────────────────────────────────────
// Event bus leggero per disaccoppiare core ↔ ui.

const _bus = new EventTarget();

export function emit(name, detail = {}) {
  _bus.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name, handler) {
  _bus.addEventListener(name, e => handler(e.detail));
}

export const EV = {
  PLAYER_CHANGE: 'player:change',
  VISUAL_UPDATE:  'visual:update',
  YT_PLAYING:     'yt:playing',
  YT_STOPPED:     'yt:stopped',
};
