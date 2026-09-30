// ── queue.js ─────────────────────────────────────────────────────
// Logica coda + playlist salvate. Nessuna dipendenza diretta da
// player.js o dalla UI: comunica tramite callback iniettate
// (wirePlayback) ed event bus (QUEUE_CHANGE).

import { store }        from './store.js';
import { showToast, parseISO8601 } from '../utils.js';
import { saveState }    from './persist.js';
import { emit, EV }     from './events.js';
import { fetchYT }      from '../modules/ytApi.js';
import { getSetting }   from './settings.js';

const LS_KEY = 'f_p';

/* ── Wiring con player.js (evita import ciclico) ───────────────── */
let _playLocal = null;
let _playYT    = null;

/**
 * Chiamata una volta da main.js per fornire a queue.js le funzioni
 * di riproduzione, senza che queue.js debba importare player.js.
 */
export function wirePlayback({ playLocal, playYT }) {
  _playLocal = playLocal;
  _playYT    = playYT;
}

/* ── Wiring con la UI (evita import ciclico con ui/queueUI.js) ──── */
let _refreshQueueUI    = () => {};
let _refreshPlaylistUI = () => {};

export function wireQueueUI({ refreshQueue, refreshPlaylists }) {
  _refreshQueueUI    = refreshQueue    || _refreshQueueUI;
  _refreshPlaylistUI = refreshPlaylists || _refreshPlaylistUI;
}

/* ── helpers ────────────────────────────────────────────────────── */
/**
 * Notifica coda modificata: aggiorna UI, salva stato, emette evento.
 * Pubblica così altri moduli (es. importModal.js) possono aggiungere
 * più elementi alla coda e notificare una sola volta.
 */
export function queueChanged() {
  _refreshQueueUI();
  saveState();
  emit(EV.QUEUE_CHANGE);
}

export function enqueue(item, top = false) {
  top ? store.queue.unshift(item) : store.queue.push(item);
  showToast(top ? 'In cima ↑' : 'In fondo ↓');
  if (navigator.vibrate) navigator.vibrate(30);
  queueChanged();
}

/**
 * Estrae il prossimo elemento dalla coda e lo riproduce.
 * In modalità shuffleMode === 2 pesca una posizione casuale della coda
 * invece della prima, così l'ordine di uscita è imprevedibile mentre
 * la coda resta visivamente ordinata finché non viene "consumata".
 */
export function dequeueNext() {
  if (!store.queue.length) return false;

  const idx  = (store.shuffleMode === 2)
    ? Math.floor(Math.random() * store.queue.length)
    : 0;
  const [item] = store.queue.splice(idx, 1);
  queueChanged();

  if (item.type === 'youtube') {
    _playYT?.(item);
  } else {
    const plIdx = store.playlist.indexOf(item);
    if (plIdx !== -1) _playLocal?.(plIdx);
  }
  return true;
}

export function removeFromQueue(i) {
  store.queue.splice(i, 1);
  queueChanged();
}

export function clearQueue() {
  store.queue = [];
  queueChanged();
}

export function reorderQueue(from, to) {
  if (from === to) return;
  const [item] = store.queue.splice(from, 1);
  store.queue.splice(to, 0, item);
  queueChanged();
}

export function loadPlaylists() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

export function saveQueueAsPlaylist(name) {
  if (!name?.trim() || !store.queue.length) return;
  const all = loadPlaylists();
  all[name] = store.queue.map(_serialize);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  _refreshPlaylistUI();
}

export function saveHistoryAsPlaylist(name) {
  if (!name?.trim()) return;

  const entries = store.playHistory
    .map(entry => {
      if (entry && typeof entry === 'object' && entry.yt) {
        return { yt: true, id: entry.id, title: entry.title, duration: entry.duration || 0 };
      }
      const track = store.playlist[entry];
      return track ? { n: track.file.name, f: track.folder } : null;
    })
    .filter(Boolean);

  if (store.currentYTId && store.currentYTItem) {
    entries.push({ yt: true, id: store.currentYTId, title: store.currentYTItem.title, duration: store.currentYTItem.duration || 0 });
  } else if (store.currentIdx !== -1 && store.playlist[store.currentIdx]) {
    const cur = store.playlist[store.currentIdx];
    entries.push({ n: cur.file.name, f: cur.folder });
  }

  if (!entries.length) { showToast('Vuota!'); return; }

  const all = loadPlaylists();
  all[name] = entries;
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  _refreshPlaylistUI();
  showToast('Cronologia salvata');
}

export function loadPlaylistIntoQueue(name) {
  const all = loadPlaylists();
  if (!all[name]) return;
  all[name].forEach(s => {
    if (s.yt) {
      store.queue.push({
        type:     'youtube',
        id:       s.id,
        title:    s.title,
        thumb:    `https://img.youtube.com/vi/${s.id}/mqdefault.jpg`,
        duration: s.duration || 0,
      });
    } else {
      const match = store.playlist.find(x => x.file.name === s.n && x.folder === s.f);
      if (match) store.queue.push(match);
    }
  });
  queueChanged();
  showToast('Caricata!');
}

export function deletePlaylist(name) {
  const all = loadPlaylists();
  delete all[name];
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  _refreshPlaylistUI();
}

/**
 * Importa una playlist da un array di righe di testo (usata per i file
 * .txt caricati dalla libreria locale). A differenza di
 * `parseLinesToQueueItems`, qui gestiamo anche righe CSV che referenziano
 * file locali ("Titolo, NomeFile.mp3"), dato che la libreria è già
 * caricata in questo contesto.
 * @param {string} name - Nome della playlist
 * @param {string[]} lines - Righe del file .txt
 */
export async function importPlaylistFromLines(name, lines) {
  if (!lines || !lines.length) return;

  const parsedItems = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, '').trim();

    // Ignora righe vuote o commenti
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(',').map(p => p.trim());

    // 1. Formato Esportato CSV (almeno 2 campi: Titolo, ID/Filename, [Durata/Cartella])
    if (parts.length >= 2) {
      const [col1, col2, col3] = parts;

      if (/^[A-Za-z0-9_-]{11}$/.test(col2)) {
        parsedItems.push({
          yt: true,
          id: col2,
          title: col1,
          duration: parseInt(col3, 10) || 0
        });
      } else {
        // Riferimento a file locale: gestito solo qui, non in parseLinesToQueueItems.
        parsedItems.push({
          n: col1,
          f: col2,
          yt: false
        });
      }
    }
    // 2. URL diretto di YouTube (anche playlist intere)
    else if (line.includes('youtube.com/') || line.includes('youtu.be/')) {
      const items = await fetchYouTubeItemsFromUrl(line);
      items.forEach(it => parsedItems.push({ yt: true, id: it.id, title: it.title, duration: it.duration || 0 }));
    }
    // 3. Testo semplice: ricerca automatica (con preferenza audio ufficiale)
    else {
      const item = await _searchBestResult(line);
      if (item) parsedItems.push({ yt: true, id: item.id, title: item.title, duration: item.duration || 0 });
    }
  }

  if (!parsedItems.length) {
    showToast('Nessun brano valido trovato nel file');
    return;
  }

  const allPlaylists = loadPlaylists();
  allPlaylists[name] = parsedItems;
  localStorage.setItem(LS_KEY, JSON.stringify(allPlaylists));
  _refreshPlaylistUI();

  showToast(`Playlist "${name}" importata (${parsedItems.length} brani)`);
}

/**
 * Converte righe di testo libero in item pronti per la coda
 * (`{type:'youtube', id, title, thumb, duration, uploader}`).
 * Riconosce, riga per riga: CSV "Titolo, ytid, [durata]", URL diretto
 * YouTube, o testo libero (ricerca automatica con fallback chiavi,
 * con preferenza opzionale per audio ufficiale — vedi settings.js).
 * Usata sia per l'import di playlist salvate sia per l'inserimento
 * diretto in coda dalla modale "+".
 * @param {string[]} lines
 * @returns {Promise<Array<object>>}
 */
export async function parseLinesToQueueItems(lines) {
  if (!lines || !lines.length) return [];

  const results = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, '').trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(',').map(p => p.trim());

    // 1. CSV: "Titolo, ytid, [durata]" — solo se col2 è un ID YouTube valido
    //    (11 caratteri alfanumerici/underscore/trattino). Righe CSV per file
    //    locali ("Titolo, NomeFile.mp3") non sono gestibili qui: non abbiamo
    //    la libreria locale caricata in questo contesto, vengono ignorate.
    if (parts.length >= 2 && /^[A-Za-z0-9_-]{11}$/.test(parts[1])) {
      const [title, id, durationStr] = parts;
      results.push({
        type:     'youtube',
        id,
        title,
        thumb:    `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
        duration: parseInt(durationStr, 10) || 0,
        uploader: '',
      });
      continue;
    }

    // 2. URL diretto (video singolo o playlist) — riusa il parser già
    //    esistente per i link, che gestisce anche la paginazione playlist.
    if (line.includes('youtube.com/') || line.includes('youtu.be/')) {
      const items = await fetchYouTubeItemsFromUrl(line);
      results.push(...items);
      continue;
    }

    // 3. Testo libero: ricerca automatica (con preferenza audio ufficiale
    //    se attiva nelle impostazioni).
    const item = await _searchBestResult(line);
    if (item) results.push(item);
  }

  return results;
}

/**
 * Cerca su YouTube una query testuale e sceglie il risultato migliore.
 * Se la preferenza "audio ufficiale" è attiva, tra i primi risultati
 * privilegia un canale "Topic" (auto-generato da YouTube per la musica
 * ufficiale) o un titolo che contiene esplicitamente "official audio"/
 * "audio ufficiale". Se nessuno corrisponde, usa il primo risultato
 * normale — non blocchiamo mai una ricerca solo per questa preferenza.
 */
async function _searchBestResult(query) {
  const wantOfficial = getSetting('preferOfficialAudio');
  const maxResults = wantOfficial ? 5 : 1;

  const data = await fetchYT('search', { part: 'snippet', type: 'video', maxResults, q: query });
  const items = data?.items || [];
  if (!items.length) return null;

  let chosen = items[0];

  if (wantOfficial) {
    const officialMatch = items.find(it => _looksLikeOfficialAudio(it.snippet));
    if (officialMatch) chosen = officialMatch;
  }

  return {
    type:     'youtube',
    id:       chosen.id.videoId,
    title:    chosen.snippet.title,
    thumb:    chosen.snippet.thumbnails?.medium?.url || '',
    duration: 0, // la durata esatta arriva solo con videos.list; non la richiediamo qui per non appesantire l'import
    uploader: chosen.snippet.channelTitle || 'YouTube',
  };
}

/** Euristica: canale "Topic" (musica ufficiale auto-generata da YouTube) o titolo con "official audio". */
function _looksLikeOfficialAudio(snippet) {
  const channel = (snippet.channelTitle || '').toLowerCase();
  const title    = (snippet.title || '').toLowerCase();
  return channel.endsWith('- topic')
    || channel.endsWith('-topic')
    || /\bofficial\s*audio\b/.test(title)
    || /\baudio\s*ufficiale\b/.test(title);
}

/* ═══════════════════════════════════════════════════════════════════
   IMPORT DA LINK YOUTUBE (video singolo o playlist intera)
   ═══════════════════════════════════════════════════════════════════
   Costo quota: playlistItems.list = 1 unità ogni 50 brani, videos.list
   (durate) = 1 unità ogni 50 id. Import anche di playlist molto grandi
   costa quindi pochissimo — nessun limite artificiale applicato qui.
   ═══════════════════════════════════════════════════════════════════ */

const YT_VIDEO_ID_RE    = /[?&]v=([\w-]{11})/;
const YT_SHORT_ID_RE    = /youtu\.be\/([\w-]{11})/;
const YT_PLAYLIST_ID_RE = /[?&]list=([\w-]+)/;

/**
 * Riconosce e importa un link YouTube: video singolo o playlist intera
 * (con paginazione automatica di tutte le pagine necessarie).
 * @param {string} url
 * @returns {Promise<Array<object>>} elementi { type:'youtube', id, title, thumb, duration, uploader }
 */
export async function fetchYouTubeItemsFromUrl(url) {
  const listId = url.match(YT_PLAYLIST_ID_RE)?.[1];

  if (listId) {
    return _fetchFullPlaylist(listId);
  }

  const videoId = url.match(YT_VIDEO_ID_RE)?.[1] || url.match(YT_SHORT_ID_RE)?.[1];
  if (videoId) {
    const item = await _fetchSingleVideo(videoId);
    return item ? [item] : [];
  }

  return [];
}

async function _fetchSingleVideo(videoId) {
  const data = await fetchYT('videos', { part: 'snippet,contentDetails', id: videoId });
  const v = data?.items?.[0];
  if (!v) return null;

  return {
    type:     'youtube',
    id:       v.id,
    title:    v.snippet.title,
    thumb:    v.snippet.thumbnails?.medium?.url || '',
    duration: parseISO8601(v.contentDetails.duration),
    uploader: v.snippet.channelTitle || 'YouTube',
  };
}

/** Scarica tutte le pagine di una playlist (50 item a chiamata) e le durate. */
async function _fetchFullPlaylist(playlistId) {
  const rawItems = [];
  let pageToken = '';

  do {
    const data = await fetchYT('playlistItems', {
      part: 'snippet',
      maxResults: 50,
      playlistId,
      ...(pageToken ? { pageToken } : {}),
    });

    if (!data) break; // errore di rete o chiavi esaurite: ferma qui, restituisci quanto raccolto

    for (const it of data.items || []) {
      // Video privati/rimossi hanno titolo placeholder ("Private video" / "Deleted video")
      const videoId = it.snippet?.resourceId?.videoId;
      if (!videoId || it.snippet.title === 'Private video' || it.snippet.title === 'Deleted video') continue;

      rawItems.push({
        id:       videoId,
        title:    it.snippet.title,
        thumb:    it.snippet.thumbnails?.medium?.url || '',
        uploader: it.snippet.videoOwnerChannelTitle || it.snippet.channelTitle || 'YouTube',
      });
    }

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  if (!rawItems.length) return [];

  // Recupera le durate in blocchi da 50 id (limite API di videos.list)
  const durationMap = {};
  for (let i = 0; i < rawItems.length; i += 50) {
    const chunk = rawItems.slice(i, i + 50);
    const data  = await fetchYT('videos', { part: 'contentDetails', id: chunk.map(x => x.id).join(',') });
    for (const v of data?.items || []) {
      durationMap[v.id] = parseISO8601(v.contentDetails.duration);
    }
  }

  return rawItems.map(it => ({
    type:     'youtube',
    id:       it.id,
    title:    it.title,
    thumb:    it.thumb,
    uploader: it.uploader,
    duration: durationMap[it.id] || 0,
  }));
}

function _serialize(item) {
  if (item?.type === 'youtube') return { yt: true, id: item.id, title: item.title, duration: item.duration || 0 };
  return { n: item.file.name, f: item.folder };
}

/* ── Calcolo durata totale coda ─────────────────────────────────── */
export function queueTotalSeconds() {
  return store.queue.reduce((acc, item) => {
    if (item?.type === 'youtube') return acc + (item.duration || 0);
    const idx = store.playlist.indexOf(item);
    if (idx !== -1) {
      const durEl = document.getElementById(`dur-${idx}`);
      if (durEl) {
        const [m, s] = (durEl.textContent || '').split(':').map(Number);
        if (!isNaN(m) && !isNaN(s)) return acc + m * 60 + s;
      }
    }
    return acc;
  }, 0);
}

/* ── Esporta tutte le playlist salvate in un archivio .ZIP ──────── */
export async function exportAllPlaylists() {
  const all = loadPlaylists();
  const names = Object.keys(all);

  if (!names.length) {
    showToast('Nessuna playlist da esportare');
    return;
  }

  if (typeof JSZip === 'undefined') {
    showToast('Errore: libreria ZIP non disponibile');
    return;
  }

  const zip = new JSZip();

  names.forEach(name => {
    let textContent = '';

    all[name].forEach(entry => {
      if (entry.yt) {
        textContent += `${entry.title}, ${entry.id}, ${entry.duration || 0}\n`;
      } else {
        textContent += `${entry.n}, ${entry.f}\n`;
      }
    });

    const safeFileName = name.replace(/[/\\?%*:|"<>]/g, '_');
    zip.file(`${safeFileName}.txt`, textContent);
  });

  try {
    showToast('Generazione ZIP in corso...');

    const blob = await zip.generateAsync({ type: 'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');

    a.href     = url;
    a.download = `Grugofy_Playlists_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Playlists esportate!');
  } catch (err) {
    console.error('Errore creazione ZIP:', err);
    showToast('Errore durante l\'esportazione');
  }
}
