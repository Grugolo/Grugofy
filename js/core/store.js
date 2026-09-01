// ── store.js ─────────────────────────────────────────────────────
// Stato globale dell'app. Mutazioni centralizzate tramite setState().
// Zero logica di dominio qui: solo dati + notifica di cambiamento generica.

import { emit, EV } from './events.js';

export const store = {
  // Libreria locale
  playlist:       [],   // Array<{ file: File, folder: string, cover: string|null }>
  currentIdx:     -1,
  lastManualIdx:  -1,
  playHistory:    [],   // Array<number|{yt:true,id,title,thumb,duration,uploader}>
  sessionStart:   null, // Date — usata per il nome della playlist cronologia

  // Coda
  queue: [],            // Array<TrackItem|YTItem>

  // Modalità
  looping:     false,
  shuffleMode: 0,     // 0 = spento, 1 = shuffle libreria/playlist, 2 = shuffle libreria + coda
  shuffleOrder: [],   // ordine casuale precalcolato per stadio 1 e 2 (brani fuori coda)

  // YouTube
  ytPlayer:      null,
  ytReady:       false,
  ytPending:     null,  // videoId da caricare quando ytPlayer è pronto
  currentYTId:   null,
  currentYTItem: null,  // oggetto YT corrente (per cronologia e shuffle)
  ytResults:     [],
};

/**
 * Aggiorna una o più chiavi dello store ed emette STATE_CHANGE.
 * Usare al posto di scrivere direttamente su `store.x = y` quando la
 * modifica deve essere visibile ad altri moduli (persistenza, UI).
 * Per mutazioni puramente interne ai moduli "core" è comunque
 * accettabile scrivere sullo store direttamente.
 */
export function setState(patch) {
  Object.assign(store, patch);
  emit(EV.STATE_CHANGE, patch);
}
