/**
 * js/modules/importer.js
 * Modulo per il recupero e l'importazione di Link/Playlist YouTube
 */

import { parseYouTubeUrl, fetchPlaylistTracks, fetchVideoDetails } from '../services/ytService.js';
import { loadPlaylists, savePlaylists } from '../core/queue.js';
import { renderPlaylists } from '../ui/queueUI.js';
import { showToast } from '../ui/toast.js';

let modalEl = null;

export function initImporterUI() {
  if (document.getElementById('ytLinkModal')) return;

  const modalHtml = `
    <div id="ytLinkModal" class="modal-overlay hidden">
      <div class="modal-content">
        <h3>Importa da YouTube</h3>
        
        <label class="modal-label">Chiave API Google (opzionale per link singoli, richiesta per Playlist):</label>
        <input type="password" id="ytApiKeyInput" placeholder="Incolla API Key Google Data v3..." class="modal-input" style="margin-bottom:12px;">

        <label class="modal-label">Nome Playlist di destinazione:</label>
        <input type="text" id="ytLinkPlaylistName" placeholder="Es. My YT Hits" class="modal-input">
        
        <label class="modal-label">Incolla URL Video o Playlist YouTube (uno per riga):</label>
        <textarea id="ytLinkInput" class="modal-textarea" placeholder="https://www.youtube.com/watch?v=...&#10;https://www.youtube.com/playlist?list=..."></textarea>
        
        <div class="modal-actions">
          <button id="btnCancelYTLink" class="pill-btn pill-btn--danger">Annulla</button>
          <button id="btnProcessYTLink" class="pill-btn">Converti e Salva</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  modalEl = document.getElementById('ytLinkModal');

  document.getElementById('btnCancelYTLink').onclick = hideImporterModal;
  document.getElementById('btnProcessYTLink').onclick = processImport;
}

export function showImporterModal() {
  if (!modalEl) initImporterUI();
  document.getElementById('ytLinkPlaylistName').value = 'Playlist YT ' + new Date().toLocaleDateString();
  document.getElementById('ytLinkInput').value = '';
  modalEl.classList.remove('hidden');
}

export function hideImporterModal() {
  if (modalEl) modalEl.classList.add('hidden');
}

async function processImport() {
  const apiKey = document.getElementById('ytApiKeyInput').value.trim();
  const name = document.getElementById('ytLinkPlaylistName').value.trim();
  const rawText = document.getElementById('ytLinkInput').value.trim();

  if (!name || !rawText) {
    showToast('Inserisci un nome ed almeno un link YouTube.');
    return;
  }

  if (apiKey) {
    const { setApiKey } = await import('../services/ytService.js');
    setApiKey(apiKey);
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  let accumulatedTracks = [];

  showToast('Elaborazione link in corso...');

  try {
    const singleVideoIds = [];

    for (const line of lines) {
      const parsed = parseYouTubeUrl(line);
      if (parsed) {
        if (parsed.type === 'playlist') {
          const playlistTracks = await fetchPlaylistTracks(parsed.id);
          accumulatedTracks.push(...playlistTracks);
        } else if (parsed.type === 'video') {
          singleVideoIds.push(parsed.id);
        }
      }
    }

    if (singleVideoIds.length > 0) {
      const videoTracks = await fetchVideoDetails(singleVideoIds);
      accumulatedTracks.push(...videoTracks);
    }

    if (accumulatedTracks.length === 0) {
      showToast('Nessun link o playlist YouTube validi individuati.');
      return;
    }

    // Salva nella memoria locale
    const playlists = loadPlaylists();
    playlists[name] = accumulatedTracks;
    savePlaylists(playlists);

    renderPlaylists();
    hideImporterModal();
    showToast(`Playlist "${name}" creata con successo con ${accumulatedTracks.length} brani!`);

  } catch (err) {
    console.error(err);
    showToast(`Errore durante l'importazione: ${err.message}`);
  }
}
