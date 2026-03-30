// ─── STATE ────────────────────────────────────────────────────────────────────
// Unico oggetto mutabile condiviso tra tutti i moduli.
// Importare `state` e modificarne le proprietà direttamente.

export const state = {
    // Libreria locale
    playlist:             [],   // { file, folder, cover }
    currentPlayingIdx:    -1,
    lastManualLibraryIdx: -1,
    playHistory:          [],
    startTime:            null,

    // Queue
    queue: [],

    // Modalità
    isLooping:    false,
    isShuffle:    false,
    shuffleOrder: [],

    // YouTube
    ytPlayer:        null,
    ytReady:         false,
    ytPendingVideoId: null,
    currentYTId:     null,   // id video YT in riproduzione
    ytResults:       [],     // risultati ultima ricerca
};
