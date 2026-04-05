// ── events.js ────────────────────────────────────────────────────
// Event bus leggero per disaccoppiare core ↔ ui.
// I moduli core emettono eventi; i moduli UI li ascoltano.

const _bus = new EventTarget();

export function emit(name, detail = {}) {
  _bus.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name, handler) {
  _bus.addEventListener(name, e => handler(e.detail));
}

// Catalogo eventi
export const EV = {
  // Il player è cambiato (play/pause/traccia): aggiorna controlli UI
  PLAYER_CHANGE: 'player:change',
  // La traccia corrente è cambiata: aggiorna la vista espansa
  VISUAL_UPDATE:  'visual:update',
  // YT ha iniziato a suonare: avvia il polling della seekbar
  YT_PLAYING:     'yt:playing',
  // YT deve fermarsi: ferma il polling
  YT_STOPPED:     'yt:stopped',
};
