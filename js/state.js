// ─── STATE ────────────────────────────────────────────────────────────────────
export const state = {
    // Libreria locale
    playlist:             [],
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
    ytPlayer:         null,
    ytReady:          false,
    ytPendingVideoId: null,
    currentYTId:      null,
    ytResults:        [],
};
