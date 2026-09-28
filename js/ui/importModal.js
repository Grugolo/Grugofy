// ── importModal.js ───────────────────────────────────────────────
// Modale "+": scegli tra file locali (audio/video/playlist .txt) o
// import diretto da testo libero — una riga per elemento, ciascuna
// può essere: un link YouTube (video o playlist), una riga CSV
// "Titolo, ytid, [durata]", o una query testuale (ricerca automatica).

import { store }                    from '../core/store.js';
import { showToast }                from '../utils.js';
import { parseLinesToQueueItems, queueChanged } from '../core/queue.js';

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

/* ── Opzione 2: righe libere — link YouTube, CSV, o query testuale ── */
btnYtSubmit.onclick = async () => {
  const lines = ytUrlInput.value
    .split('\n')
    .map(u => u.trim())
    .filter(Boolean);

  if (!lines.length) { _setStatus('Incolla almeno una riga (link, CSV o titolo brano).'); return; }

  btnYtSubmit.disabled = true;
  _setStatus(`Elaborazione di ${lines.length} riga/e…`);

  let items = [];
  try {
    items = await parseLinesToQueueItems(lines);
  } catch (err) {
    console.error('[importModal] errore import:', err);
  }

  if (items.length > 0) {
    items.forEach(item => store.queue.push(item));
    queueChanged(); // un solo notify per tutto il batch

    const skipped = lines.length - items.length;
    _setStatus(`Aggiunti ${items.length} brano/i alla coda${skipped > 0 ? ` (${skipped} riga/e non riconosciute)` : ''}.`);
    showToast(`+${items.length} in coda`);
    ytUrlInput.value = '';
    setTimeout(closeModal, 1200);
  } else {
    _setStatus('Nessun brano trovato per le righe inserite.');
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
