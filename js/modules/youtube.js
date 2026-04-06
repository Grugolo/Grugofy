// ── youtube.js ───────────────────────────────────────────────────
// Ricerca YouTube e avvio riproduzione YT.

import { YT_API_KEY }                        from '../config.js';
import { store }                             from '../core/store.js';
import { playYT }                            from '../core/player.js';
import { makeTrackEl }                       from './localFiles.js';
import { parseISO8601, escHtml, decodeHtml } from '../utils.js';
  
let ytGroup = null;
let ytTracksEl = null;
let _lastReqId = 0;

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
  const reqId = ++_lastReqId;
  if (!q || q.length < 2) {
    // FIX BUG 1: ripristina visibilità del gruppo YT quando la query è vuota
    if (ytGroup) ytGroup.style.display = 'none';
    if (ytTracksEl) {
      ytTracksEl.innerHTML = `<div style="color:var(--text-dim);padding:10px;">Cerca su YouTube</div>`;
    }
    store.ytResults = [];
    return;
  }

  _ensureYTFolder();
  // Assicura che il gruppo sia visibile quando si cerca
  ytGroup.style.display = '';
  ytTracksEl.innerHTML = _skeletonHTML();
  ytTracksEl.hidden = false;
  
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
      ytTracksEl.innerHTML = `<div style="color:var(--text-dim);padding:10px;">Nessun risultato</div>`;
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
    
    if (reqId !== _lastReqId) return;
    _renderResults(store.ytResults);

  } catch (err) {
    console.error('[YT search]', err);
    ytTracksEl.innerHTML = `<div style="color:var(--text-dim);padding:10px;">Nessun risultato</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════════════ */

function _ensureYTFolder() {
  const library = document.getElementById('library');

  // se esiste ma NON è più nel DOM → reset
  if (ytGroup && !library.contains(ytGroup)) {
    ytGroup = null;
    ytTracksEl = null;
  }

  if (ytGroup) return;

  ytGroup = document.createElement('div');
  ytGroup.className = 'folder-group';
  // FIX BUG 1: marca il gruppo YT così il filtro locale lo ignora
  ytGroup.dataset.ytGroup = '1';
  // Nascosto di default finché non c'è una query attiva
  ytGroup.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'folder-name';
  header.textContent = '🌐 YouTube';

  ytTracksEl = document.createElement('div');
  ytTracksEl.className = 'folder-tracks';

  header.addEventListener('click', () => {
    ytTracksEl.hidden = !ytTracksEl.hidden;
  });

  ytGroup.append(header, ytTracksEl);
  library.prepend(ytGroup);
}

function _renderResults(results) {
  ytTracksEl.innerHTML = '';
  results.forEach((video, i) => {
    ytTracksEl.appendChild(makeTrackEl(video, '', i, true));
  });
}

function _highlight(videoId) {
  if (!ytTracksEl) return;
  ytTracksEl.querySelectorAll('.track-item').forEach(el => {
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
