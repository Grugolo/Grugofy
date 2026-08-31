// ── queue.js ─────────────────────────────────────────────────────
import { store }          from './store.js';
import { showToast, fmtDateShort } from '../utils.js';
import { saveState }      from './persist.js';
import { emit, EV }       from './events.js';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const LS_KEY = 'f_p';

/* ── helpers emit ───────────────────────────────────────────────── */
function _queueChanged() {
  _refreshQueueUI();
  saveState();
  emit(EV.QUEUE_CHANGE);
}

export function enqueue(item, top = false) {
  top ? store.queue.unshift(item) : store.queue.push(item);
  showToast(top ? 'In cima ↑' : 'In fondo ↓');
  if (navigator.vibrate) navigator.vibrate(30);
  _queueChanged();
}

export function dequeueNext() {
  if (!store.queue.length) return false;
  const item = store.queue.shift();
  _queueChanged();
  import('./player.js').then(({ playLocal, playYT }) => {
    if (item.type === 'youtube') {
      playYT(item);
    } else {
      const idx = store.playlist.indexOf(item);
      if (idx !== -1) playLocal(idx);
    }
  });
  return true;
}

export function removeFromQueue(i) {
  store.queue.splice(i, 1);
  _queueChanged();
}

export function clearQueue() {
  store.queue = [];
  _queueChanged();
}

export function reorderQueue(from, to) {
  if (from === to) return;
  const [item] = store.queue.splice(from, 1);
  store.queue.splice(to, 0, item);
  _queueChanged();
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
  _queueChanged();
  showToast('Caricata!');
}

export function deletePlaylist(name) {
  const all = loadPlaylists();
  delete all[name];
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  _refreshPlaylistUI();
}

/**
 * Importa una playlist da un array di righe di testo
 * @param {string} name - Nome della playlist
 * @param {string[]} lines - Righe del file .txt
 */
export async function importPlaylistFromLines(name, lines) {
  if (!lines || !lines.length) return;

  const { YT_API_KEY } = await import('../config.js');
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
        parsedItems.push({
          n: col1,
          f: col2,
          yt: false
        });
      }
    } 
    // 2. URL diretto di YouTube
    else if (line.includes('youtube.com/') || line.includes('youtu.be/')) {
      const match = line.match(/(?:v=|\/)([\w-]{11})/);
      if (match) {
        parsedItems.push({
          yt: true,
          id: match[1],
          title: `YouTube Track (${match[1]})`,
          duration: 0
        });
      }
    } 
    // 3. Testo semplice: Cerca il brano su YouTube Data API
    else {
      try {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/search` +
          `?part=snippet&type=video&maxResults=1` +
          `&q=${encodeURIComponent(line)}&key=${YT_API_KEY}`
        );
        const data = await res.json();
        const item = data.items?.[0];

        if (item) {
          parsedItems.push({
            yt: true,
            id: item.id.videoId,
            title: item.snippet.title,
            duration: 0
          });
        }
      } catch (err) {
        console.error(`Errore nella ricerca YT per "${line}":`, err);
      }
    }
  }

  if (!parsedItems.length) {
    showToast('Nessun brano valido trovato nel file');
    return;
  }

  // Salvataggio nello storage e aggiornamento UI
  const allPlaylists = loadPlaylists();
  allPlaylists[name] = parsedItems;
  localStorage.setItem(LS_KEY, JSON.stringify(allPlaylists));
  _refreshPlaylistUI();

  showToast(`Playlist "${name}" importata (${parsedItems.length} brani)`);
}

function _serialize(item) {
  if (item?.type === 'youtube') return { yt: true, id: item.id, title: item.title, duration: item.duration || 0 };
  return { n: item.file.name, f: item.folder };
}

function _refreshQueueUI()    { import('../ui/queueUI.js').then(m => m.renderQueue()); }
function _refreshPlaylistUI() { import('../ui/queueUI.js').then(m => m.renderPlaylists()); }

/* ── Calcolo durata totale coda ─────────────────────────────────── */
export function queueTotalSeconds() {
  return store.queue.reduce((acc, item) => {
    if (item?.type === 'youtube') return acc + (item.duration || 0);
    // file locale: prova a leggere da cache DOM
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



/* ── Esporta tutte le playlist salvate in LocalStorage creando un archivio .ZIP ─────────────────────────────────── */


export async function exportAllPlaylists() {
  const all = loadPlaylists();
  const names = Object.keys(all);

  if (!names.length) {
    showToast('Nessuna playlist da esportare');
    return;
  }

  const zip = new JSZip();

  names.forEach(name => {
    let textContent = '';

    all[name].forEach(entry => {
      if (entry.yt) {
        // Formato YT: Titolo, ID_Video, Durata
        textContent += `${entry.title}, ${entry.id}, ${entry.duration || 0}\n`;
      } else {
        // Formato Locale: NomeFile, NomeCartella
        textContent += `${entry.n}, ${entry.f}\n`;
      }
    });

    // Pulisce il nome della playlist per evitare caratteri non validi
    const safeFileName = name.replace(/[/\\?%*:|"<>]/g, '_');
    
    // Aggiunge il file .txt all'archivio ZIP
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



/**
 * Parse testo contenente link YouTube e crea una nuova playlist salvata
 * @param {string} name 
 * @param {string} rawText 
 */
export function importPlaylistFromYTLinks(name, rawText) {
  if (!name?.trim() || !rawText?.trim()) {
    showToast('Inserisci un nome e almeno un link!');
    return;
  }

  // Regex per estrarre qualsiasi ID video YouTube a 11 caratteri da URL vari
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/gi;
  const matches = [...rawText.matchAll(ytRegex)];
  const uniqueIds = [...new Set(matches.map(m => m[1]))];

  if (!uniqueIds.length) {
    showToast('Nessun link YouTube valido trovato');
    return;
  }

  const parsedItems = uniqueIds.map((id, index) => ({
    yt: true,
    id: id,
    title: `YouTube Track ${index + 1} (${id})`,
    duration: 0
  }));

  const all = loadPlaylists();
  all[name] = parsedItems;
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  
  // Aggiorna UI
  import('../ui/queueUI.js').then(m => m.renderPlaylists());
  showToast(`Playlist "${name}" salvata con ${parsedItems.length} brani!`);
}
