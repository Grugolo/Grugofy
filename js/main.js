/**
 * js/main.js
 * Entry point dell'applicazione Grugofy
 */

import { store } from './core/store.js';
import { loadState } from './core/persist.js';
import { renderQueue, renderPlaylists } from './ui/queueUI.js';
import { showImporterModal, initImporterUI } from './modules/importer.js';
import { scheduleYTSearch } from './modules/youtube.js';
import { saveQueueAsPlaylist, saveHistoryAsPlaylist, exportAllPlaylists, clearQueue } from './core/queue.js';
import { setupExpandedSwipe } from './ui/expandedPlayer.js';
import './ui/controls.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inizializza i moduli UI
  initImporterUI();
  setupExpandedSwipe();
  loadState();
  renderQueue();
  renderPlaylists();

  // 2. Menu Dropdown per il Pulsante "+" (File o YouTube)
  const btnUploadMenu = document.getElementById('btnUploadMenu');
  const uploadMenu     = document.getElementById('uploadMenu');
  const menuOptionFile = document.getElementById('menuOptionFile');
  const menuOptionYT   = document.getElementById('menuOptionYTLink');
  const folderInput    = document.getElementById('folderInput');

  if (btnUploadMenu && uploadMenu) {
    btnUploadMenu.onclick = (e) => {
      e.stopPropagation();
      uploadMenu.classList.toggle('hidden');
    };

    document.addEventListener('click', () => {
      uploadMenu.classList.add('hidden');
    });

    if (menuOptionFile) {
      menuOptionFile.onclick = () => {
        uploadMenu.classList.add('hidden');
        folderInput?.click();
      };
    }

    if (menuOptionYT) {
      menuOptionYT.onclick = () => {
        uploadMenu.classList.add('hidden');
        showImporterModal();
      };
    }
  }

  // 3. Caricamento File Locali
  if (folderInput) {
    folderInput.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      
      store.playlist = files.map(file => ({
        file,
        folder: file.webkitRelativePath ? file.webkitRelativePath.split('/')[0] : 'Locali',
        cover: null
      }));

      import('./modules/localFiles.js').then(m => {
        m.renderLocalTrackList(document.getElementById('libraryList'));
      });
    };
  }

  // 4. Gestione Pulsanti Azioni Coda e Playlist
  document.getElementById('saveQueueBtn')?.addEventListener('click', () => {
    const name = prompt('Nome della playlist:');
    if (name) saveQueueAsPlaylist(name);
  });

  document.getElementById('clearQueueBtn')?.addEventListener('click', () => {
    clearQueue();
  });

  document.getElementById('saveHistoryBtn')?.addEventListener('click', () => {
    const name = prompt('Nome playlist per Cronologia:', 'Cronologia ' + new Date().toLocaleDateString());
    if (name) saveHistoryAsPlaylist(name);
  });

  document.getElementById('exportPlaylistsBtn')?.addEventListener('click', () => {
    exportAllPlaylists();
  });

  // 5. Ricerca Unificata
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  if (searchInput) {
    searchInput.oninput = (e) => {
      const q = e.target.value.trim();
      if (clearSearchBtn) clearSearchBtn.classList.toggle('active', q.length > 0);
      scheduleYTSearch(q);
    };
  }

  if (clearSearchBtn) {
    clearSearchBtn.onclick = () => {
      if (searchInput) {
        searchInput.value = '';
        scheduleYTSearch('');
      }
      clearSearchBtn.classList.remove('active');
    };
  }

  // 6. Desktop Media Player Toggle
  const nowPlayingTitle = document.getElementById('nowPlayingTitle');
  const expandedPlayer  = document.getElementById('expandedPlayer');

  if (nowPlayingTitle && expandedPlayer) {
    nowPlayingTitle.addEventListener('click', () => {
      expandedPlayer.classList.toggle('open');
    });
  }
});
