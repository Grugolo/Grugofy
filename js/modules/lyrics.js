// ── lyrics.js ────────────────────────────────────────────────────
// Recupero e visualizzazione lyrics sincronizzati (LRC) da lrclib.net.
// Nessuna chiave richiesta: API pubblica gratuita.
//
// Fonte: https://lrclib.net/api/get  e  https://lrclib.net/api/search
// Formato riga LRC: [mm:ss.xx] testo

import { store }     from '../core/store.js';
import { on, EV }    from '../core/events.js';
import { mediaEl }   from '../core/player.js';

const LRCLIB_BASE = 'https://lrclib.net/api';

const lyricsEl = document.getElementById('lyricsLine');

/* ── Stato locale del modulo ────────────────────────────────────── */
let _currentLines = null;  // Array<{ time:number, text:string }> | null
let _pollTimer     = null;
let _lastLineIdx   = -1;
let _fetchToken    = 0;    // invalida richieste stantie se il brano cambia in fretta

/* ── Reagisci ai cambi di brano ─────────────────────────────────── */
on(EV.PLAYER_CHANGE, () => _onTrackChanged());

async function _onTrackChanged() {
  const token = ++_fetchToken;
  _stopPoll();
  _currentLines = null;
  _lastLineIdx  = -1;
  _hideLyrics();

  const query = _buildQuery();
  if (!query) return;

  const lrc = await _fetchLRC(query);
  if (token !== _fetchToken) return; // il brano è già cambiato di nuovo, scarta risultato

  if (!lrc) { _hideLyrics(); return; }

  _currentLines = _parseLRC(lrc);
  if (!_currentLines.length) { _hideLyrics(); return; }

  _showLyrics();
  _startPoll();
}

/* ── Costruzione query in base a locale/YouTube ─────────────────── */
function _buildQuery() {
  if (store.currentYTId && store.currentYTItem) {
    const { title, uploader, duration } = store.currentYTItem;
    // I titoli YouTube spesso contengono "Artista - Titolo": proviamo a separare.
    const { artist, track } = _splitArtistTitle(title, uploader);
    return { track_name: track, artist_name: artist, duration: duration || undefined };
  }

  if (store.currentIdx !== -1 && store.playlist[store.currentIdx]) {
    const file = store.playlist[store.currentIdx].file;
    const raw  = file.name.replace(/\.[^/.]+$/, '').replaceAll('_', ' ');
    const { artist, track } = _splitArtistTitle(raw, '');
    return { track_name: track, artist_name: artist };
  }

  return null;
}

/** Euristica: "Artista - Titolo" oppure fallback su uploader/nome intero come titolo. */
function _splitArtistTitle(raw, fallbackArtist) {
  const cleaned = raw.replace(/\s*\(.*?(official|ufficiale|videoclip|clip|video|audio|lyrics|testo|topic|hq|hd|4k).*?\)\s*/gi, '').trim();
  const parts   = cleaned.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), track: parts.slice(1).join(' - ').trim() };
  }
  return { artist: fallbackArtist || '', track: cleaned };
}

/* ── Fetch lrclib.net (match esatto, poi fallback su search) ─────── */
async function _fetchLRC({ track_name, artist_name, duration }) {
  if (!track_name) return null;

  try {
    const params = new URLSearchParams({ track_name });
    if (artist_name) params.set('artist_name', artist_name);
    if (duration)    params.set('duration', String(Math.round(duration)));

    const res = await fetch(`${LRCLIB_BASE}/get?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics) return data.syncedLyrics;
    }
  } catch (err) {
    console.warn('[lyrics] errore /get:', err);
  }

  // Fallback: ricerca libera, prendi il primo risultato con syncedLyrics
  try {
    const params = new URLSearchParams({ track_name });
    if (artist_name) params.set('artist_name', artist_name);

    const res = await fetch(`${LRCLIB_BASE}/search?${params.toString()}`);
    if (res.ok) {
      const results = await res.json();
      const hit = results.find(r => r.syncedLyrics);
      if (hit) return hit.syncedLyrics;
    }
  } catch (err) {
    console.warn('[lyrics] errore /search:', err);
  }

  return null;
}

/* ── Parsing LRC → array ordinato { time, text } ──────────────────── */
function _parseLRC(lrcText) {
  const lines = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

  lrcText.split('\n').forEach(rawLine => {
    const matches = [...rawLine.matchAll(re)];
    if (!matches.length) return;
    const text = rawLine.replace(re, '').trim();
    matches.forEach(m => {
      const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      lines.push({ time, text });
    });
  });

  return lines.sort((a, b) => a.time - b.time);
}

/* ── Poll posizione riproduzione per aggiornare la riga corrente ─── */
function _startPoll() {
  _pollTimer = setInterval(_updateCurrentLine, 250);
}

function _stopPoll() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

function _updateCurrentLine() {
  if (!_currentLines) return;

  const pos = _getCurrentPosition();
  if (pos === null) return;

  // Trova l'ultima riga con time <= pos
  let idx = -1;
  for (let i = 0; i < _currentLines.length; i++) {
    if (_currentLines[i].time <= pos) idx = i;
    else break;
  }

  if (idx !== _lastLineIdx) {
    _lastLineIdx = idx;
    lyricsEl.textContent = idx >= 0 ? _currentLines[idx].text : '';
  }
}

function _getCurrentPosition() {
  if (store.currentYTId && store.ytReady && store.ytPlayer) {
    try { return store.ytPlayer.getCurrentTime() || 0; } catch { return null; }
  }
  return mediaEl.duration ? mediaEl.currentTime : null;
}

/* ── Visibilità riga lyrics ─────────────────────────────────────── */
function _showLyrics() {
  lyricsEl.classList.remove('hidden');
}

function _hideLyrics() {
  lyricsEl.classList.add('hidden');
  lyricsEl.textContent = '';
}
