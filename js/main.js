/**
 * js/main.js
 * Entry point dell'applicazione Grugofy
 */

import { store } from './core/store.js';
import { loadState } from './core/persist.js';
import { renderQueue, renderPlaylists } from './ui/queueUI.js';
import { showImporterModal, initImporterUI } from './modules/importer.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inizializza i moduli UI
  initImporterUI();
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

    menuOptionFile.onclick = () => {
      uploadMenu.classList.add('hidden');
      folderInput?.click();
    };

    menuOptionYT.onclick = () => {
      uploadMenu.classList.add('hidden');
      showImporterModal();
    };
  }

  // 3. Desktop Media Player Toggle (Apre / Chiude l'Espanso al Click)
  const nowPlayingTitle = document.getElementById('nowPlayingTitle');
  const expandedPlayer  = document.getElementById('expandedPlayer');

  if (nowPlayingTitle && expandedPlayer) {
    nowPlayingTitle.addEventListener('click', () => {
      const isOpen = expandedPlayer.classList.contains('open');
      if (isOpen) {
        expandedPlayer.classList.remove('open');
      } else {
        expandedPlayer.classList.add('open');
      }
    });
  }
});
