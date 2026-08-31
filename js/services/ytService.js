/**
 * js/services/ytService.js
 * Servizio per l'estrazione e il recupero dati da URL YouTube (Video Singoli e Playlist)
 */

// Inserire la propria API Key di Google YouTube Data API v3 se configurata
let API_KEY = '';

export function setApiKey(key) {
  API_KEY = key;
}

/**
 * Estrae l'ID di un video o di una playlist da un URL o testo
 * @param {string} urlString 
 * @returns {{ type: 'video'|'playlist', id: string } | null}
 */
export function parseYouTubeUrl(urlString) {
  try {
    const url = new URL(urlString.trim());
    
    // Check Playlist ID
    const listId = url.searchParams.get('list');
    if (listId) {
      return { type: 'playlist', id: listId };
    }

    // Check Video ID (Standard: youtube.com/watch?v=ID)
    const videoId = url.searchParams.get('v');
    if (videoId) {
      return { type: 'video', id: videoId };
    }

    // Check Short Link (youtu.be/ID)
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1);
      if (id) return { type: 'video', id };
    }

    // Check Embed Link (youtube.com/embed/ID)
    if (url.pathname.startsWith('/embed/')) {
      const id = url.pathname.split('/')[2];
      if (id) return { type: 'video', id };
    }
  } catch (e) {
    // Non è un URL valido, tentiamo fallback Regex su stringa generica
    const videoRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const matchVideo = urlString.match(videoRegex);
    if (matchVideo) return { type: 'video', id: matchVideo[1] };

    const listRegex = /[?&]list=([^#\&\?]+)/i;
    const matchList = urlString.match(listRegex);
    if (matchList) return { type: 'playlist', id: matchList[1] };
  }

  return null;
}

/**
 * Recupera tutti i brani da una Playlist YouTube usando Google Data API v3
 * @param {string} playlistId 
 * @returns {Promise<Array<{yt: boolean, id: string, title: string, duration: number}>>}
 */
export async function fetchPlaylistTracks(playlistId) {
  if (!API_KEY) {
    throw new Error('API Key Google non configurata. Inserire l\'API Key per recuperare playlist intere.');
  }

  let tracks = [];
  let nextPageToken = '';

  do {
    const endpoint = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${API_KEY}&pageToken=${nextPageToken}`;
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Errore nel recupero della playlist da YouTube');
    }

    const data = await response.json();
    
    data.items.forEach(item => {
      const snippet = item.snippet;
      if (snippet.resourceId && snippet.resourceId.kind === 'youtube#video') {
        tracks.push({
          yt: true,
          id: snippet.resourceId.videoId,
          title: snippet.title || `YouTube Video (${snippet.resourceId.videoId})`,
          duration: 0
        });
      }
    });

    nextPageToken = data.nextPageToken || '';
  } while (nextPageToken);

  return tracks;
}

/**
 * Recupera i dettagli di singoli video tramite API Google
 * @param {string[]} videoIds 
 * @returns {Promise<Array<{yt: boolean, id: string, title: string, duration: number}>>}
 */
export async function fetchVideoDetails(videoIds) {
  if (!API_KEY || videoIds.length === 0) {
    // Fallback senza API key: ritorna oggetti di base
    return videoIds.map(id => ({
      yt: true,
      id: id,
      title: `YouTube Video (${id})`,
      duration: 0
    }));
  }

  const idsParam = videoIds.join(',');
  const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${idsParam}&key=${API_KEY}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    return videoIds.map(id => ({ yt: true, id, title: `YouTube Video (${id})`, duration: 0 }));
  }

  const data = await response.json();
  const titleMap = {};
  data.items.forEach(item => {
    titleMap[item.id] = item.snippet.title;
  });

  return videoIds.map(id => ({
    yt: true,
    id: id,
    title: titleMap[id] || `YouTube Video (${id})`,
    duration: 0
  }));
}
