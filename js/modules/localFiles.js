// ── localFiles.js ────────────────────────────────────────────────
// Caricamento cartella, estrazione cover/durata, creazione track item DOM.

import { store }                 from '../core/store.js';
import { playLocal }             from '../core/player.js';
import { enqueue }               from '../core/queue.js';
import { escHtml, decodeHtml }   from '../utils.js';

const libraryEl = document.getElementById('library');
const input     = document.getElementById('folderInput');

/* ═══════════════════════════════════════════════════════════════════
   CARICAMENTO CARTELLA
   ═══════════════════════════════════════════════════════════════════ */

input.onchange = (e) => {
  if (!store.sessionStart) store.sessionStart = new Date();

  const files = [...e.target.files].filter(
    f => f.type.startsWith('audio/') || f.type.startsWith('video/')
  );

  // Raggruppa per cartella
  const folders = {};
  files.forEach(f => {
    const parts = f.webkitRelativePath.split('/');
    parts.pop();
    const path = parts.join('/') || 'Root';
    (folders[path] ??= []).push(f);
  });

  for (const path of Object.keys(folders).sort()) {
    const group    = _makeFolderGroup(path);
    const tracksEl = group.querySelector('.folder-tracks');

    for (const file of folders[path]) {
      const idx = store.playlist.length;
      store.playlist.push({ file, folder: path, cover: null });
      tracksEl.appendChild(makeTrackEl(file, path, idx, false));
      _extractCover(file, idx);
      _extractDuration(file, idx);
    }

    libraryEl.appendChild(group);
  }
};

/* ═══════════════════════════════════════════════════════════════════
   TRACK ITEM DOM  (usato anche da youtube.js per i risultati YT)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Crea e restituisce un elemento DOM .track-item.
 * @param {File|object} item  — File locale oppure oggetto YT
 * @param {string}      path  — cartella (vuota per YT)
 * @param {number}      idx   — indice nell'array di riferimento
 * @param {boolean}     isYT  — true per item YouTube
 */
export function makeTrackEl(item, path, idx, isYT = false) {
  const el = document.createElement('div');
  el.className   = 'track-item';
  el.dataset.idx = idx;
  if (isYT) el.dataset.ytIdx = idx;
  const cover = document.createElement('div');
  cover.className = 'track-cover';
  cover.id = `cov-${idx}`;

  if (isYT) {
    cover.innerHTML = item.thumb
      ? `<img src="${item.thumb}" alt="">`
      : '▶️';
  }

  const title    = isYT ? decodeHtml(item.title)  : item.name.replace(/\.[^/.]+$/, '');
  const subtitle = isYT ? decodeHtml(item.uploader || 'YouTube') : (path.split('/').pop() || path);
  const ext      = isYT ? 'YT' : item.name.split('.').pop().toUpperCase();
  const durText  = isYT && item.duration
    ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2,'0')}`
    : '';

  const info = document.createElement('div');
  info.className = 'track-info';

  const nameEl = document.createElement('span');
  nameEl.className = 'track-name';
  nameEl.textContent = title;

  const meta = document.createElement('div');
  meta.className = 'track-meta-row';

  const sub = document.createElement('span');
  sub.textContent = subtitle;

  const format = document.createElement('span');
  format.className = 'file-format' + (isYT ? ' yt' : '');
  format.textContent = ext;

  const dur = document.createElement('span');
  dur.id = `dur-${isYT ? 'yt' : ''}${idx}`;
  dur.style.color = 'var(--accent)';
  dur.style.fontWeight = '700';
  dur.textContent = durText;

  meta.append(sub, format, dur);
  info.append(nameEl, meta);
  el.append(cover, info);

el.appendChild(info);

  // Click su track-info → riproduci
  el.querySelector('.track-info').addEventListener('click', () => {
    if (isYT) {
      import('./youtube.js').then(m => m.playYTItem(item));
    } else {
      playLocal(idx);
    }
  });

  // Swipe → coda
  _setupSwipe(el, isYT ? item : store.playlist[idx]);

  return el;
}

/* ═══════════════════════════════════════════════════════════════════
   COVER
   ═══════════════════════════════════════════════════════════════════ */

function _extractCover(file, idx) {
  if (file.type.startsWith('video/')) {
    _videoCover(file, idx);
  } else if (window.jsmediatags && file.type.startsWith('audio/')) {
    jsmediatags.read(file, {
      onSuccess(tag) {
        const pic = tag.tags.picture;
        if (!pic) return;
        const blob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
        const url  = URL.createObjectURL(blob);
        store.playlist[idx].cover = url;
        _setCoverEl(`cov-${idx}`, url);
        // URL non revocato: serve per MediaSession e expanded player
      },
    });
  }
}

function _videoCover(file, idx) {
  const video = document.createElement('video');
  video.src   = URL.createObjectURL(file);
  video.muted = true;
  video.onloadeddata = () => { video.currentTime = 1; };
  video.onseeked = () => {
    const SIZE   = 160;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx  = canvas.getContext('2d');
    const size = Math.min(video.videoWidth, video.videoHeight);
    const ox   = (video.videoWidth  - size) / 2;
    const oy   = (video.videoHeight - size) / 2;
    ctx.drawImage(video, ox, oy, size, size, 0, 0, SIZE, SIZE);
    const url = canvas.toDataURL('image/jpeg', 0.7);
    store.playlist[idx].cover = url;
    _setCoverEl(`cov-${idx}`, url);
    URL.revokeObjectURL(video.src);
    video.remove();
  };
}

function _setCoverEl(id, url) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<img src="${url}" alt="">`;
}

/* ═══════════════════════════════════════════════════════════════════
   DURATA
   ═══════════════════════════════════════════════════════════════════ */

function _extractDuration(file, idx) {
  const a = new Audio();
  a.src   = URL.createObjectURL(file);
  a.onloadedmetadata = () => {
    const m  = Math.floor(a.duration / 60);
    const s  = String(Math.floor(a.duration % 60)).padStart(2, '0');
    const el = document.getElementById(`dur-${idx}`);
    if (el) el.textContent = `${m}:${s}`;
    URL.revokeObjectURL(a.src);
  };
  a.onerror = () => URL.revokeObjectURL(a.src);
}

/* ═══════════════════════════════════════════════════════════════════
   SWIPE su track item → aggiunge alla coda
   sinistra → in fondo ↓    destra → in cima ↑
   ═══════════════════════════════════════════════════════════════════ */

function _setupSwipe(el, item) {
  let startX = 0, startY = 0, deltaX = 0, swiping = false;
  const THRESHOLD = 50;

  el.addEventListener('touchstart', e => {
    startX  = e.touches[0].clientX;
    startY  = e.touches[0].clientY;
    swiping = false;
    deltaX  = 0;
    el.style.transition = 'none';
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!swiping) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) swiping = true;
      else if (Math.abs(dy) > 10) return; // scroll verticale → ignora
    }
    if (!swiping) return;

    e.preventDefault();
    deltaX = dx * 0.5;
    el.style.transform  = `translateX(${deltaX}px)`;
    el.style.background = deltaX > 0
      ? `rgba(76,175,80,${Math.min(Math.abs(deltaX) / 100, 0.4)})`
      : `rgba(33,150,243,${Math.min(Math.abs(deltaX) / 100, 0.4)})`;
  }, { passive: false });

  el.addEventListener('touchend', () => {
    el.style.transition = '0.4s cubic-bezier(0.18,0.89,0.32,1.28)';
    el.style.transform  = 'translateX(0)';
    el.style.background = '';

    if (swiping && Math.abs(deltaX) > THRESHOLD) {
      enqueue(item, deltaX > 0); // true = in cima
    }
    deltaX = 0;
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════════════
   FOLDER GROUP DOM
   ═══════════════════════════════════════════════════════════════════ */

function _makeFolderGroup(path) {
  const group  = document.createElement('div');
  group.className = 'folder-group';

  const header = document.createElement('div');
  header.className   = 'folder-name';
  header.textContent = `📁 ${path}`;

  const tracks = document.createElement('div');
  tracks.className = 'folder-tracks';

  // Click sull'header → espandi/collassa
  header.addEventListener('click', () => {
    tracks.hidden = !tracks.hidden;
  });

  group.append(header, tracks);
  return group;
}
