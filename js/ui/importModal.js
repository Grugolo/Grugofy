// ── importModal.js ───────────────────────────────────────────────
// Modale "+": scegli tra file locali (audio/video/playlist .txt) o
// import diretto da link YouTube (video singolo o playlist intera).

import { store }                    from '../core/store.js';
import { showToast }                from '../utils.js';
import { fetchYouTubeItemsFromUrl, queueChanged } from '../core/queue.js';

const modal        = document.getElementById('importModal');
const backdrop      = document.getElementById('importModalBackdrop');
const btnOpen       = document.getElementById('btnOpenImport');
const btnClose      = document.getElementById('importModalClose');
const btnChooseFile = document.getElementById('importChooseFilesBtn');
const folderInput   = document.getElementById('folderInput');
const ytUrlInput    = document.getElementById('importYtUrl');
const btnYtSubmit   = document.getElementById('importYtSubmitBtn');
const ytStatus      = document.getElementById('importYtStatus');

btnOpen.onclick  = () => openModal();
btnClose.onclick = () => closeModal();
backdrop.onclick = () => closeModal();

/* ── Opzione 1: file/cartelle locali ────────────────────────────── */
btnChooseFile.onclick = () => folderInput.click();

// Chiudi la modale non appena la selezione file parte (l'ingest è
// già gestito da localFiles.js sull'evento onchange dell'input).
folderInput.addEventListener('change', () => closeModal());

/* ── Opzione 2: uno o più link YouTube (uno per riga) ────────────── */
btnYtSubmit.onclick = async () => {
  const urls = ytUrlInput.value
    .split('\n')
    .map(u => u.trim())
    .filter(Boolean);

  if (!urls.length) { _setStatus('Incolla almeno un link YouTube valido.'); return; }

  btnYtSubmit.disabled = true;

  let totalAdded = 0;
  let failedUrls = 0;

  for (let i = 0; i < urls.length; i++) {
    _setStatus(`Importazione ${i + 1}/${urls.length}…`);
    try {
      const items = await fetchYouTubeItemsFromUrl(urls[i]);
      if (items.length) {
        items.forEach(item => store.queue.push(item));
        totalAdded += items.length;
      } else {
        failedUrls++;
      }
    } catch (err) {
      console.error('[importModal] errore import YouTube:', urls[i], err);
      failedUrls++;
    }
  }

  if (totalAdded > 0) queueChanged(); // un solo notify per tutto il batch

  if (totalAdded > 0) {
    _setStatus(`Aggiunti ${totalAdded} brano/i alla coda${failedUrls ? ` (${failedUrls} link non riconosciuti)` : ''}.`);
    showToast(`+${totalAdded} in coda`);
    ytUrlInput.value = '';
    setTimeout(closeModal, 1200);
  } else {
    _setStatus('Nessun brano trovato per i link inseriti.');
  }

  btnYtSubmit.disabled = false;
};

ytUrlInput.addEventListener('keydown', e => {
  // Invio semplice conferma se c'è una sola riga; Shift+Invio va sempre a capo.
  if (e.key === 'Enter' && !e.shiftKey && !ytUrlInput.value.includes('\n')) {
    e.preventDefault();
    btnYtSubmit.click();
  }
});

/* ── Helpers ────────────────────────────────────────────────────── */
function openModal() {
  modal.classList.remove('hidden');
  ytStatus.textContent = '';
  ytUrlInput.focus();
}

function closeModal() {
  modal.classList.add('hidden');
}

function _setStatus(msg) {
  ytStatus.textContent = msg;
}
