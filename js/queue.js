// ─── QUEUE & PLAYLISTS ────────────────────────────────────────────────────────
import { state }      from './state.js';
import { DRAW }       from './draw.js';
import { escapeHtml, showToast } from './utils.js';
import { playItem }   from './ytApi.js';

const queueListEl = document.getElementById('queue-list');

// ─── Drag-to-reorder state ────────────────────────────────────────────────────
let dragState = null;
// dragState = { idx, startY, currentY, itemH, placeholder, clone }

// ─── Queue ────────────────────────────────────────────────────────────────────

export function renderQueue() {
    queueListEl.innerHTML = '';
    document.getElementById('queue-section').style.display =
        state.queue.length ? 'block' : 'none';

    state.queue.forEach((t, i) => {
        const item  = document.createElement('div');
        item.className = 'queue-item';
        item.dataset.qidx = i;

        const title = t.type === 'youtube' ? t.title : t.file.name;

        item.innerHTML = `
            <div class="queue-drag-handle" data-drag="${i}" touch-action="none">
                <div class="drag-lines"></div>
            </div>
            <div style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:0.85rem;">${escapeHtml(title)}</div>
            <div style="display:flex;gap:12px;margin-left:10px;align-items:center;">
                <div data-rem="${i}">${DRAW.x}</div>
            </div>`;

        item.querySelector(`[data-rem="${i}"]`).addEventListener('click', () => remQ(i));

        // Setup drag handle
        const handle = item.querySelector('[data-drag]');
        setupDragHandle(handle, i);

        queueListEl.appendChild(item);
    });
}

// ─── Drag-to-reorder ──────────────────────────────────────────────────────────

function setupDragHandle(handle, idx) {
    handle.addEventListener('touchstart', onDragStart, { passive: false });
}

function onDragStart(e) {
    e.stopPropagation();   // non propagare all'expanded-player o allo scroll
    e.preventDefault();

    const handle  = e.currentTarget;
    const idx     = parseInt(handle.dataset.drag);
    const item    = handle.closest('.queue-item');
    const rect    = item.getBoundingClientRect();
    const itemH   = rect.height;
    const startY  = e.touches[0].clientY;

    // Crea placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'queue-placeholder';
    placeholder.style.height = itemH + 'px';

    // Crea clone visivo
    const clone = item.cloneNode(true);
    clone.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${itemH}px;
        z-index: 9999;
        opacity: 0.92;
        pointer-events: none;
        border-radius: 8px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.6);
        background: #2e2e2e;
        display: flex;
        align-items: center;
        padding: 10px 15px;
        gap: 12px;
        transition: none;
    `;

    // Nascondi item originale, inserisci placeholder
    item.style.visibility = 'hidden';
    item.parentElement.insertBefore(placeholder, item);

    document.body.appendChild(clone);

    dragState = { idx, startY, currentY: startY, itemH, placeholder, clone, item };

    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend',  onDragEnd,  { passive: true });
}

function onDragMove(e) {
    if (!dragState) return;
    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    dragState.currentY = touch.clientY;
    const dy = dragState.currentY - dragState.startY;

    // Muovi il clone
    const origRect = dragState.item.getBoundingClientRect();
    dragState.clone.style.top = (origRect.top + dy) + 'px';

    // Calcola la nuova posizione nella lista
    const items   = [...queueListEl.querySelectorAll('.queue-item')];
    const cloneY  = dragState.clone.getBoundingClientRect().top + dragState.itemH / 2;

    let targetIdx = dragState.idx;
    items.forEach((el, i) => {
        if (el === dragState.item) return;
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (cloneY > mid) targetIdx = parseInt(el.dataset.qidx);
    });

    // Sposta il placeholder visivamente
    const currentPlaceholder = queueListEl.querySelector('.queue-placeholder');
    if (targetIdx !== dragState.idx) {
        const targetEl = queueListEl.querySelector(`[data-qidx="${targetIdx}"]`);
        if (targetEl) {
            // inserisci dopo targetEl se stiamo andando giù, prima se stiamo andando su
            if (targetIdx > dragState.idx) {
                targetEl.after(currentPlaceholder);
            } else {
                targetEl.before(currentPlaceholder);
            }
        }
    }
}

function onDragEnd(e) {
    if (!dragState) return;
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend',  onDragEnd);

    const { idx, clone, placeholder, item } = dragState;

    // Calcola indice finale in base alla posizione del placeholder
    const allItems = [...queueListEl.querySelectorAll('.queue-item')];
    const phIndex  = [...queueListEl.children].indexOf(placeholder);
    let newIdx = 0;
    let count = 0;
    for (let i = 0; i < queueListEl.children.length; i++) {
        const child = queueListEl.children[i];
        if (child === placeholder) break;
        if (child.classList.contains('queue-item')) count++;
    }
    newIdx = count;

    // Rimuovi clone e placeholder
    clone.remove();
    placeholder.remove();
    item.style.visibility = '';

    dragState = null;

    // Riordina la coda
    if (newIdx !== idx) {
        const moved = state.queue.splice(idx, 1)[0];
        state.queue.splice(newIdx, 0, moved);
        if (navigator.vibrate) navigator.vibrate(20);
    }

    renderQueue();
}

// ─── Rimozione ────────────────────────────────────────────────────────────────

function remQ(i) {
    state.queue.splice(i, 1);
    renderQueue();
}

window.remQ = remQ;

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
    const now     = new Date();
    const startH  = state.startTime.getHours();
    const startM  = state.startTime.getMinutes().toString().padStart(2, '0');
    const diffDays = Math.floor((now - state.startTime) / (1000 * 60 * 60 * 24));
    const endH    = now.getHours() + diffDays * 24;
    const endM    = now.getMinutes().toString().padStart(2, '0');
    const dateStr = `${state.startTime.getDate()}/${state.startTime.getMonth() + 1}/${state.startTime.getFullYear().toString().slice(-2)}`;
    const name    = `${dateStr} ${startH}:${startM}-${endH}:${endM}`;

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
                <div data-load="${escapeHtml(name)}" style="color:var(--primary);font-weight:bold;font-size:0.7rem;cursor:pointer;">CARICA</div>
                <div data-del="${escapeHtml(name)}">${DRAW.x}</div>
            </div>`;

        div.querySelector(`[data-load]`).onclick = () => loadPlaylist(name);
        div.querySelector(`[data-del]`).onclick  = () => deletePlaylist(name);
        listEl.appendChild(div);
    });
}

function loadPlaylist(name) {
    const all = JSON.parse(localStorage.getItem('f_p'));
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
    const all = JSON.parse(localStorage.getItem('f_p'));
    delete all[name];
    localStorage.setItem('f_p', JSON.stringify(all));
    renderPlaylists();
}

window.loadP = loadPlaylist;
window.delP  = deletePlaylist;

