import { store } from './core/store.js';
import { loadState } from './core/persist.js';
import { renderQueue, renderPlaylists } from './ui/queueUI.js';
import { showImporterModal, initImporterUI } from './modules/importer.js';
import { renderLocalTrackList } from './modules/localFiles.js';
import { scheduleYTSearch } from './modules/youtube.js';
import './ui/controls.js'; // Inizializza i controlli
import { setupExpandedSwipe } from './ui/expandedPlayer.js';

document.addEventListener('DOMContentLoaded', () => {
  initImporterUI();
  loadState();
  renderQueue();
  renderPlaylists();
  setupExpandedSwipe();

  // 1. Menu Dropdown per il Pulsante "+" (File o YouTube)
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

    menuOptionFile.onclick = () => {
      uploadMenu.classList.add('hidden');
      folderInput?.click();
    };

    menuOptionYT.onclick = () => {
      uploadMenu.classList.add('hidden');
      showImporterModal();
    };
  }

  // 2. Lettura dei file locali (Logica mancante)
  if (folderInput) {
    folderInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('audio/') || f.type.startsWith('video/'));
      if (!files.length) return;
      
      files.forEach(file => {
        store.playlist.push({
          file: file,
          folder: file.webkitRelativePath ? file.webkitRelativePath.split('/')[0] : 'Sconosciuto',
          cover: null,
          path: file.webkitRelativePath || file.name
        });
      });
      
      renderLocalTrackList(document.getElementById('library'));
      e.target.value = ''; // Resetta l'input
    });
  }

  // 3. Desktop Media Player Toggle
  const nowPlayingTitle = document.getElementById('nowPlayingTitle');
  const expandedPlayer  = document.getElementById('expandedPlayer');

  if (nowPlayingTitle && expandedPlayer) {
    nowPlayingTitle.addEventListener('click', () => {
      expandedPlayer.classList.toggle('open');
    });
  }

  // 4. Ricerca (Locale e YT)
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  
  if (searchInput && clearBtn) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      clearBtn.classList.toggle('active', q.length > 0);
      
      // Filtra tracce locali
      document.querySelectorAll('#library .track-item:not([data-yt-idx])').forEach(el => {
        const title = el.querySelector('.track-title')?.innerText.toLowerCase() || '';
        el.style.display = title.includes(q) ? 'flex' : 'none';
      });

      // Cerca su YouTube
      scheduleYTSearch(q);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
    });
  }
});
