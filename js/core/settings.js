// ── settings.js ──────────────────────────────────────────────────
// Preferenze utente persistenti (localStorage), separate dallo stato
// di sessione in store.js. Un solo oggetto piatto, semplice da estendere.

const SETTINGS_KEY = 'grugofy_settings';

const DEFAULTS = {
  searchDebounceMs:  600,   // ritardo prima di avviare la ricerca durante la digitazione
  providerYouTube:   true,  // abilita/disabilita il provider YouTube (unico per ora)
  preferOfficialAudio: true, // nella selezione automatica per query, privilegia audio ufficiale (Topic / "official audio")
};

let _settings = _load();

function _load() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

function _save() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settings));
}

/** Restituisce il valore corrente di un'impostazione. */
export function getSetting(key) {
  return _settings[key];
}

/** Restituisce una copia di tutte le impostazioni correnti. */
export function getAllSettings() {
  return { ..._settings };
}

/** Aggiorna una o più impostazioni e le persiste subito. */
export function setSettings(patch) {
  _settings = { ..._settings, ...patch };
  _save();
}

export { DEFAULTS as SETTINGS_DEFAULTS };
