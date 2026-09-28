// ── settingsModal.js ─────────────────────────────────────────────
// Modale "⚙": preferenze utente persistenti (vedi core/settings.js).

import { getAllSettings, setSettings } from '../core/settings.js';

const modal    = document.getElementById('settingsModal');
const backdrop = document.getElementById('settingsModalBackdrop');
const btnOpen  = document.getElementById('btnOpenSettings');
const btnClose = document.getElementById('settingsModalClose');

const debounceInput      = document.getElementById('settingSearchDebounce');
const debounceValueLabel = document.getElementById('settingSearchDebounceValue');
const providerYTInput    = document.getElementById('settingProviderYouTube');
const preferAudioInput   = document.getElementById('settingPreferOfficialAudio');

btnOpen.onclick  = () => openModal();
btnClose.onclick = () => closeModal();
backdrop.onclick = () => closeModal();

debounceInput.addEventListener('input', () => {
  const ms = Number(debounceInput.value);
  _updateDebounceLabel(ms);
  setSettings({ searchDebounceMs: ms });
});

providerYTInput.addEventListener('change', () => {
  setSettings({ providerYouTube: providerYTInput.checked });
});

preferAudioInput.addEventListener('change', () => {
  setSettings({ preferOfficialAudio: preferAudioInput.checked });
});

function openModal() {
  const s = getAllSettings();
  debounceInput.value        = s.searchDebounceMs;
  providerYTInput.checked    = s.providerYouTube;
  preferAudioInput.checked   = s.preferOfficialAudio;
  _updateDebounceLabel(s.searchDebounceMs);
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
}

function _updateDebounceLabel(ms) {
  debounceValueLabel.textContent = `${(ms / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}s`;
}
