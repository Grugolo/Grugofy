// ── utils.js ─────────────────────────────────────────────────────
// Funzioni pure di utilità — zero side effects, zero import.

/** Secondi → "m:ss" */
export function formatTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Escape HTML per output sicuro nel DOM */
export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Toast centrato, auto-dismiss dopo 800 ms */
export function showToast(msg) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'background:rgba(0,0,0,.85)', 'color:#fff',
    'padding:12px 25px', 'border-radius:30px',
    'font-size:.9rem', 'font-weight:700',
    'border:1px solid var(--accent)', 'z-index:2000',
    'pointer-events:none', 'transition:opacity .3s ease',
    'text-align:center', 'box-shadow:0 4px 20px rgba(0,0,0,.5)',
  ].join(';');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 800);
}

/** ISO 8601 duration (PT4M13S) → secondi */
export function parseISO8601(str) {
  if (!str) return 0;
  const m = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600)
       + (parseInt(m[2] || 0) * 60)
       +  parseInt(m[3] || 0);
}

