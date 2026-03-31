// ─── LIBRARY ──────────────────────────────────────────────────────────────────
import { state }     from './state.js';
import { showToast } from './utils.js';
import { playTrack } from './player.js';

const libraryEl = document.getElementById('library');
const input     = document.getElementById('folderInput');

// ─── Caricamento cartella ─────────────────────────────────────────────────────
input.onchange = async (e) => {
    if (!state.startTime) state.startTime = new Date();

    const files = [...e.target.files].filter(
        f => f.type.startsWith('audio/') || f.type.startsWith('video/')
    );

    const newFolders = {};
    files.forEach(f => {
        const parts = f.webkitRelativePath.split('/');
        parts.pop();
        const path = parts.join('/') || 'Root';
        if (!newFolders[path]) newFolders[path] = [];
        newFolders[path].push(f);
    });

    for (const path of Object.keys(newFolders).sort()) {
        const group      = document.createElement('div');
        group.className  = 'folder-group';

        const header     = document.createElement('div');
        header.className = 'folder-name';
        header.innerHTML = `📁 ${path}`;

        const container  = document.createElement('div');
        header.onclick   = () => {
            container.style.display = container.style.display === 'none' ? 'block' : 'none';
        };

        group.append(header, container);

        for (const file of newFolders[path]) {
            const idx = state.playlist.length;
            state.playlist.push({ file, folder: path, cover: null });
            container.appendChild(createTrackItem(file, path, idx));
            extractCover(file, idx);
            getDuration(file, idx);
        }

        libraryEl.appendChild(group);
    }
};

// ─── Crea elemento DOM per una traccia ───────────────────────────────────────
export function createTrackItem(file, path, idx) {
    const item     = document.createElement('div');
    const ext      = file.name.split('.').pop();
    item.className = 'track-item';
    item.dataset.idx = idx;
    item.innerHTML = `
        <div class="track-cover" id="cov-${idx}">🎵</div>
        <div class="track-info" onclick="window._playTrack(${idx})">
            <span class="track-name">${file.name.replace(/\.[^/.]+$/, '')}</span>
            <div class="track-meta-row">
                <span>${path.split('/').pop()}</span>
                <span class="file-format">${ext}</span>
                <span id="dur-${idx}" style="color:var(--primary);font-weight:bold;">...</span>
            </div>
        </div>`;
    setupSwipe(item, idx);
    return item;
}

// ─── Cover ────────────────────────────────────────────────────────────────────
export async function extractCover(file, idx) {
    if (file.type.startsWith('video/')) {
        const video  = document.createElement('video');
        video.src    = URL.createObjectURL(file);
        video.muted  = true;
        video.onloadeddata = () => { video.currentTime = 1; };
        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 160;
            const ctx  = canvas.getContext('2d');
            const size = Math.min(video.videoWidth, video.videoHeight);
            const x    = (video.videoWidth  - size) / 2;
            const y    = (video.videoHeight - size) / 2;
            ctx.drawImage(video, x, y, size, size, 0, 0, 160, 160);
            const imageUrl = canvas.toDataURL('image/jpeg', 0.7);
            state.playlist[idx].cover = imageUrl;
            const el = document.getElementById(`cov-${idx}`);
            if (el) el.innerHTML = `<img src="${imageUrl}">`;
            URL.revokeObjectURL(video.src);
            video.remove();
        };
        return;
    }

    if (window.jsmediatags && file.type.startsWith('audio/')) {
        jsmediatags.read(file, {
            onSuccess(tag) {
                const pic = tag.tags.picture;
                if (!pic) return;
                const blob     = new Blob([new Uint8Array(pic.data)], { type: pic.format });
                const imageUrl = URL.createObjectURL(blob);
                state.playlist[idx].cover = imageUrl;
                const el = document.getElementById(`cov-${idx}`);
                if (el) el.innerHTML = `<img src="${imageUrl}">`;
            },
        });
    }
}

// ─── Durata ───────────────────────────────────────────────────────────────────
export function getDuration(file, idx) {
    const a = new Audio();
    a.src   = URL.createObjectURL(file);
    a.onloadedmetadata = () => {
        const m  = Math.floor(a.duration / 60);
        const s  = Math.floor(a.duration % 60).toString().padStart(2, '0');
        const el = document.getElementById(`dur-${idx}`);
        if (el) el.textContent = `${m}:${s}`;
        URL.revokeObjectURL(a.src);
    };
    // BUG FIX: cleanup anche in caso di errore
    a.onerror = () => URL.revokeObjectURL(a.src);
}

// ─── Swipe per tracce locali ──────────────────────────────────────────────────
function setupSwipe(el, idx) {
    let sX = 0, sY = 0, cX = 0, isSwipe = false;
    const threshold = 50;

    el.ontouchstart = e => {
        sX = e.touches[0].clientX; sY = e.touches[0].clientY;
        isSwipe = false; el.style.transition = 'none';
    };
    el.ontouchmove = e => {
        const dX = e.touches[0].clientX - sX;
        const dY = e.touches[0].clientY - sY;
        if (!isSwipe) {
            if (Math.abs(dX) > Math.abs(dY) && Math.abs(dX) > 10) isSwipe = true;
            else if (Math.abs(dY) > 10) return;
        }
        if (isSwipe) {
            e.preventDefault();
            cX = dX * 0.5;
            el.style.transform = `translateX(${cX}px)`;
            el.style.backgroundColor = cX > 0
                ? `rgba(76,175,80,${Math.min(Math.abs(cX) / 100, 0.4)})`
                : `rgba(33,150,243,${Math.min(Math.abs(cX) / 100, 0.4)})`;
        }
    };
    el.ontouchend = () => {
        el.style.transition    = '0.4s cubic-bezier(0.18,0.89,0.32,1.28)';
        el.style.transform     = 'translateX(0)';
        el.style.backgroundColor = '';
        if (isSwipe && Math.abs(cX) > threshold) {
            if (navigator.vibrate) navigator.vibrate(30);
            addToQueue(idx, cX > 0);
        }
        cX = 0;
    };
}

function addToQueue(idx, top = true) {
    top ? state.queue.unshift(state.playlist[idx]) : state.queue.push(state.playlist[idx]);
    import('./queue.js').then(m => m.renderQueue());
    showToast(top ? 'In cima ↑' : 'In fondo ↓');
    if (navigator.vibrate) navigator.vibrate(30);
}
