// ─── QUEUE & PLAYLISTS ────────────────────────────────────────────────────────
import { state }                  from './state.js';
import { DRAW }                   from './draw.js';
import { escapeHtml, showToast }  from './utils.js';
import { playItem }               from './ytApi.js';

const queueListEl = document.getElementById('queue-list');

// ─── BUG FIX: listener drag registrati una volta sola, non ad ogni render ─────
let dragIdx = null;

queueListEl.addEventListener('touchstart', e => {
    const el = e.target.closest('[data-drag]');
    if (!el) return;
    dragIdx = parseInt(el.dataset.drag);
    e.stopPropagation();
}, { passive: false });

queueListEl.addEventListener('touchmove', e => {
    if (dragIdx === null) return;
    e.preventDefault();
    const touch  = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const item   = target?.closest('[data-drag-item]');
    if (!item) return;
    const overIdx = parseInt(item.dataset.dragItem);
    if (overIdx !== dragIdx) {
        const moved = state.queue.splice(dragIdx, 1)[0];
        state.queue.splice(overIdx, 0, moved);
        dragIdx = overIdx;
        renderQueue();
    }
}, { passive: false });

queueListEl.addEventListener('touchend', () => { dragIdx = null; });

// ─── Queue ────────────────────────────────────────────────────────────────────
export function renderQueue() {
    queueListEl.innerHTML = '';
    document.getElementById('queue-section').style.display =
        state.queue.length ? 'block' : 'none';

    state.queue.forEach((t, i) => {
        const item  = document.createElement('div');
        // BUG FIX: aggiunto data-drag-item per il riconoscimento nel touchmove
        item.dataset.dragItem = i;
        const title = t.type === 'youtube' ? t.title : t.file.name;

        item.innerHTML = `
            <div style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:0.85rem;">${escapeHtml(title)}</div>
            <div style="display:flex;gap:12px;margin-left:10px;align-items:center;">
                <div data-rem="${i}">${DRAW.x}</div>
                <div class="drag-handle" data-drag="${i}">☰</div>
            </div>`;

        item.querySelector(`[data-move-up="${i}"]`)?.addEventListener('click',   () => moveQ(i, -1));
        item.querySelector(`[data-move-down="${i}"]`)?.addEventListener('click', () => moveQ(i,  1));
        item.querySelector(`[data-rem="${i}"]`)?.addEventListener('click',       () => remQ(i));

        queueListEl.appendChild(item);
    });
}

function moveQ(i, d) {
    [state.queue[i], state.queue[i + d]] = [state.queue[i + d], state.queue[i]];
    renderQueue();
}

function remQ(i) {
    state.queue.splice(i, 1);
    renderQueue();
}

window.moveQ = moveQ;
window.remQ  = remQ;

// ─── Salva coda come playlist ─────────────────────────────────────────────────
document.getElementById('save-playlist-btn').onclick = () => {
    const n = prompt('Nome Playlist:', 'Playlist ' + new Date().toLocaleDateString());
    if (!n || !state.queue.length) return;
    const all = JSON.parse(localStorage.getItem('f_p') || '{}');
    all[n] = state.queue.map(x =>
        x.type === 'youtube'
            ? { yt: true, id: x.id, title: x.title, thumb: x.thumb }
            : { n: x.file.name, f: x.folder }
    );
    localStorage.setItem('f_p', JSON.stringify(all));
    renderPlaylists();
};

// ─── Salva cronologia ─────────────────────────────────────────────────────────
document.getElementById('save-history-btn').onclick = () => {
    if (!state.playHistory.length || !state.startTime) return showToast('Vuota!');
    const now      = new Date();
    const startH   = state.startTime.getHours();
    const startM   = state.startTime.getMinutes().toString().padStart(2, '0');
    const diffDays = Math.floor((now - state.startTime) / (1000 * 60 * 60 * 24));
    const endH     = now.getHours() + diffDays * 24;
    const endM     = now.getMinutes().toString().padStart(2, '0');
    const dateStr  = `${state.startTime.getDate()}/${state.startTime.getMonth() + 1}/${state.startTime.getFullYear().toString().slice(-2)}`;
    const name     = `${dateStr} ${startH}:${startM}-${endH}:${endM}`;

    const all = JSON.parse(localStorage.getItem('f_p') || '{}');
    all[name] = state.playHistory.map(idx => {
        const t = state.playlist[idx];
        if (t && t.type === 'youtube') return { yt: true, id: t.id, title: t.title };
        return t ? { n: t.file.name, f: t.folder } : null;
    }).filter(Boolean);

    localStorage.setItem('f_p', JSON.stringify(all));
    renderPlaylists();
    showToast('Cronologia Salvata');
};

// ─── Playlist salvate ─────────────────────────────────────────────────────────
export function renderPlaylists() {
    const listEl = document.getElementById('saved-playlists-list');
    const all    = JSON.parse(localStorage.getItem('f_p') || '{}');
    listEl.innerHTML = '';

    Object.keys(all).forEach(name => {
        const div = document.createElement('div');
        div.innerHTML = `
            <div style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:0.85rem;">${escapeHtml(name)}</div>
            <div style="display:flex;gap:12px;margin-left:10px;align-items:center;">
                <div data-load style="color:var(--primary);font-weight:bold;font-size:0.7rem;cursor:pointer;">CARICA</div>
                <div data-del>${DRAW.x}</div>
            </div>`;

        div.querySelector('[data-load]').onclick = () => loadPlaylist(name);
        div.querySelector('[data-del]').onclick  = () => deletePlaylist(name);
        listEl.appendChild(div);
    });
}

function loadPlaylist(name) {
    const all = JSON.parse(localStorage.getItem('f_p') || '{}');
    if (!all[name]) return;
    all[name].forEach(s => {
        if (s.yt) {
            state.queue.push({
                type: 'youtube', id: s.id, title: s.title,
                thumb: `https://img.youtube.com/vi/${s.id}/mqdefault.jpg`,
            });
        } else {
            const m = state.playlist.find(x => x.file.name === s.n && x.folder === s.f);
            if (m) state.queue.push(m);
        }
    });
    renderQueue();
    showToast('Caricata!');
}

function deletePlaylist(name) {
    if (!confirm('Elimina?')) return;
    const all = JSON.parse(localStorage.getItem('f_p') || '{}');
    delete all[name];
    localStorage.setItem('f_p', JSON.stringify(all));
    renderPlaylists();
}

window.loadP = loadPlaylist;
window.delP  = deletePlaylist;
