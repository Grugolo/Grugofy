// ── store.js ─────────────────────────────────────────────────────
// Stato globale dell'app. Solo dati, zero logica.

export const store = {
  // Libreria locale
  playlist:       [],   // Array<{ file: File, folder: string, cover: string|null }>
  currentIdx:     -1,
  lastManualIdx:  -1,
  playHistory:    [],   // Array<number> — indici delle tracce precedenti
  sessionStart:   null, // Date — usata per il nome della playlist cronologia

  // Coda
  queue: [],            // Array<TrackItem|YTItem>

  // Modalità
  looping:      false,
  shuffle:      false,
  shuffleOrder: [],

  // YouTube
  ytPlayer:    null,
  ytReady:     false,
  ytPending:   null,    // videoId da caricare quando ytPlayer è pronto
  currentYTId: null,
  ytResults:   [],
};
