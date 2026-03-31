// ─── UTILS ────────────────────────────────────────────────────────────────────

/** Secondi → "m:ss" */
export function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return isNaN(s) ? '0:00' : `${m}:${sec}`;
}

/** Escape HTML per output nel DOM */
export function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Toast centrato, auto-dismiss dopo 800 ms */
export function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%',
        'transform:translate(-50%,-50%)',
        'background:rgba(0,0,0,0.8)', 'color:#fff',
        'padding:12px 25px', 'border-radius:30px',
        'font-size:0.9rem', 'font-weight:bold',
        'border:1px solid var(--primary)', 'z-index:2000',
        'pointer-events:none', 'transition:opacity 0.3s ease',
        'text-align:center', 'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
    ].join(';');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 800);
}

/** ISO 8601 duration (PT4M13S) → secondi */
export function parseISO8601Duration(str) {
    if (!str) return 0;
    const m = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (parseInt(m[1] || 0) * 3600)
         + (parseInt(m[2] || 0) * 60)
         +  parseInt(m[3] || 0);
}
