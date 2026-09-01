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

/* ── Opzione 2: link YouTube ─────────────────────────────────────── */
btnYtSubmit.onclick = async () => {
  const url = ytUrlInput.value.trim();
  if (!url) { _setStatus('Incolla un link YouTube valido.'); return; }

  btnYtSubmit.disabled = true;
  _setStatus('Recupero informazioni da YouTube…');

  try {
    const items = await fetchYouTubeItemsFromUrl(url);

    if (!items.length) {
      _setStatus('Nessun video trovato per questo link.');
      return;
    }

    items.forEach(item => store.queue.push(item));
    queueChanged(); // un solo notify invece di N, uno per item

    _setStatus(`Aggiunti ${items.length} brano/i alla coda.`);
    showToast(`+${items.length} in coda`);
    ytUrlInput.value = '';

    setTimeout(closeModal, 900);
  } catch (err) {
    console.error('[importModal] errore import YouTube:', err);
    _setStatus('Errore durante l\'import. Riprova.');
  } finally {
    btnYtSubmit.disabled = false;
  }
};

ytUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnYtSubmit.click();
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
