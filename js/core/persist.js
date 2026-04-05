// ── persist.js ───────────────────────────────────────────

import { store } from './store.js';

const KEY = 'grugofy_state';

export function saveState() {
  const state = {
    queue: store.queue.map(_serialize),
    current: {
      ytId: store.currentYTId,
      idx: store.currentIdx,
      time: _getTime(),
      paused: _isPaused(),
    }
  };

  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

/* helpers */

function _serialize(item) {
  if (item?.type === 'youtube') {
    return { yt: true, id: item.id, title: item.title };
  }
  return { n: item.file.name, f: item.folder };
}

function _getTime() {
  const media = document.getElementById('mediaEl');
  if (store.currentYTId && store.ytPlayer) {
    try { return store.ytPlayer.getCurrentTime(); } catch { return 0; }
  }
  return media.currentTime || 0;
}

function _isPaused() {
  const media = document.getElementById('mediaEl');
  if (store.currentYTId && store.ytPlayer) {
    try {
      return store.ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING;
    } catch { return true; }
  }
  return media.paused;
}
