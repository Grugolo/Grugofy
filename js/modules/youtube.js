// ── youtube.js ───────────────────────────────────────────────────
// Ricerca YouTube e avvio riproduzione YT.

import { YT_API_KEY }                        from '../config.js';
import { store }                             from '../core/store.js';
import { playYT }                            from '../core/player.js';
import { makeTrackEl }                       from './localFiles.js';
import { parseISO8601, escHtml, decodeHtml } from '../utils.js';
  
const ytSection = document.getElementById('ytSection');
const ytResults = document.getElementById('ytResults');

/* ── Ricerca con debounce ───────────────────────────────────────── */
let _debounce = null;

export function scheduleYTSearch(query, delayMs = 600) {
  clearTimeout(_debounce);
  _debounce = setTimeout(() => _search(query), delayMs);
}

/* ── Avvia riproduzione e aggiorna highlight ────────────────────── */
export function playYTItem(item) {
  playYT(item);
  _highlight(item.id);
}

/* ═══════════════════════════════════════════════════════════════════
   RICERCA
   ═══════════════════════════════════════════════════════════════════ */

async function _search(q) {
  if (!q || q.length < 2 { 
    if (ytGroup) {
      ytTracksEl.innerHTML = '';
      ytTracksEl.hidden = true;
    }
    store.ytResults    = [];
    return;
  }

  _ensureYTFolder();
  ytTracksEl.hidden = false;
  ytTracksEl.innerHTML = _skeletonHTML();
  
  try {
    // 1. Search
    const searchRes  = await fetch(
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&type=video&maxResults=6` +
      `&q=${encodeURIComponent(q)}&key=${YT_API_KEY}`
    );
    const searchData = await searchRes.json();
    const items      = searchData.items || [];

    if (!items.length) {
      ytResults.innerHTML = `<div style="color:var(--text-dim);padding:10px;">Nessun risultato</div>`;
      return;
    }

    // 2. Durate
    const ids        = items.map(i => i.id.videoId).join(',');
    const detailRes  = await fetch(
      `https://www.googleapis.com/youtube/v3/videos` +
      `?part=contentDetails&id=${ids}&key=${YT_API_KEY}`
    );
    const detailData = await detailRes.json();

    const durationMap = Object.fromEntries(
      (detailData.items || []).map(v => [v.id, parseISO8601(v.contentDetails.duration)])
    );

    store.ytResults = items.map(item => ({
      type:     'youtube',
      id:       item.id.videoId,
      title:    decodeHtml(item.snippet.title),
      thumb:    item.snippet.thumbnails?.medium?.url || '',
      duration: durationMap[item.id.videoId] || 0,
      uploader: decodeHtml(item.snippet.channelTitle || 'YouTube'),
    }));

    _renderResults(store.ytResults);

  } catch (err) {
    console.error('[YT search]', err);
    ytTracksEl.innerHTML = `<div style="color:var(--text-dim);padding:10px;">Nessun risultato</div>`;  }
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════════════ */

let ytGroup = null;
let ytTracksEl = null;

function _ensureYTFolder() {
  if (ytGroup) return;
  ytGroup = document.createElement('div');
  ytGroup.className = 'folder-group';
  const header = document.createElement('div');
  header.className = 'folder-name';
  header.textContent = '🌐 YouTube';
  ytTracksEl = document.createElement('div');
  ytTracksEl.className = 'folder-tracks';
  header.addEventListener('click', () => {
    ytTracksEl.hidden = !ytTracksEl.hidden;
  });
  ytGroup.append(header, ytTracksEl);
  document.getElementById('library').prepend(ytGroup);
}

function _renderResults(results) {
  ytTracksEl.innerHTML = '';
  results.forEach((video, i) => {
    ytTracksEl.appendChild(makeTrackEl(video, '', i, true));
  });
}

function _highlight(videoId) {
  ytResults.querySelectorAll('.track-item').forEach(el => {
    const idx   = parseInt(el.dataset.ytIdx);
    const match = store.ytResults[idx]?.id === videoId;
    el.style.borderLeft = match ? '5px solid var(--accent)' : '';
    el.style.background = match ? '#252525' : '';
  });
}

/* ── Skeleton loader ────────────────────────────────────────────── */
function _skeletonHTML() {
  const row = `
    <div class="skeleton-item">
      <div class="skel-box skel-cover"></div>
      <div class="skel-info">
        <div class="skel-box skel-line"></div>
        <div class="skel-box skel-line skel-short"></div>
      </div>
    </div>`;
  return `<div class="skeleton-list">${row.repeat(3)}</div>`;
}
