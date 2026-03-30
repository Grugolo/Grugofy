// ─── YOUTUBE ──────────────────────────────────────────────────────────────────
import { YT_API_KEY }        from './config.js';
import { state }             from './state.js';
import { updateUI }          from './ui.js';
import { escapeHtml, formatTime, parseISO8601Duration, showToast } from './utils.js';
import { playTrack }         from './player.js';
import { stopYTSeekPolling, startYTSeekPolling, updateExpandedView } from './expandedPlayer.js';

const audio           = document.getElementById('main-audio');
const nowPlayingTitle = document.getElementById('now-playing-title');
const playBtn         = document.getElementById('btn-play');

// ─── IFrame API ───────────────────────────────────────────────────────────────

window.onYouTubeIframeAPIReady = function () {
    state.ytPlayer = new YT.Player('yt-player', {
        height: '1', width: '1', videoId: '',
        playerVars: { playsinline: 1, autoplay: 1 },
        events: {
            onReady: () => {
                state.ytReady = true;
                if (state.ytPendingVideoId) {
                    state.ytPlayer.loadVideoById(state.ytPendingVideoId);
                    state.ytPendingVideoId = null;
                    setTimeout(() => state.ytPlayer?.playVideo?.(), 300);
                }
            },
            onStateChange: (e) => {
                // PUNTO 2: quando il video YT finisce, vai al prossimo
                if (e.data === YT.PlayerState.ENDED) {
                    document.getElementById('btn-next').click();
                }
                playBtn.innerHTML = (e.data === YT.PlayerState.PLAYING)
                    ? '<div style="display:flex;gap:6px;"><div style="width:6px;height:22px;background:#000;border-radius:2px;"></div><div style="width:6px;height:22px;background:#000;border-radius:2px;"></div></div>'
                    : '<div style="width:0;height:0;border-left:18px solid #000;border-top:12px solid transparent;border-bottom:12px solid transparent;margin-left:5px;"></div>';
            },
        },
    });
};

// ─── playItem (locale o YT) ───────────────────────────────────────────────────

export function playItem(item) {
    if (item.type === 'youtube') {        
        audio.pause();
        audio.src = '';

        state.currentYTId = item.id;
        nowPlayingTitle.textContent = item.title;

        // Highlight risultati YT
        document.querySelectorAll('#youtube-results .track-item').forEach(el => {
            const idx = parseInt(el.dataset.ytIdx);
            const v = state.ytResults[idx];
            const isPlaying = v && v.id === item.id;
            el.style.borderLeft = isPlaying ? '5px solid var(--primary)' : '';
            el.style.background = isPlaying ? '#252525' : '#1a1a1a';
        });

        if (state.ytReady && state.ytPlayer) {
            state.ytPlayer.loadVideoById(item.id);
            setTimeout(() => state.ytPlayer?.playVideo?.(), 300);
        } else {
            state.ytPendingVideoId = item.id;
            if (!document.getElementById('yt-iframe-api')) {
                const tag = document.createElement('script');
                tag.id  = 'yt-iframe-api';
                tag.src = 'https://www.youtube.com/iframe_api';
                document.head.appendChild(tag);
            }
        }

        // PUNTO 3: MediaSession con prev/next anche per YT
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title:   item.title,
                artist:  item.uploader || 'YouTube',
                artwork: [{ src: item.thumb || '', sizes: '512x512', type: 'image/jpeg' }],
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => document.getElementById('btn-prev').click());
            navigator.mediaSession.setActionHandler('nexttrack',     () => document.getElementById('btn-next').click());
            navigator.mediaSession.setActionHandler('play',  () => { state.ytPlayer?.playVideo?.(); });
            navigator.mediaSession.setActionHandler('pause', () => { state.ytPlayer?.pauseVideo?.(); });
        }

        updateUI();
        // FIX punto 1: aggiorna la vista espansa senza forzare apertura
        updateExpandedView();
        startYTSeekPolling();
        return;
    }

    // File locale
    state.currentYTId = null;
    stopYTSeekPolling();

    // Rimetti l'iframe YT al body nascosto
    const ytEl = document.getElementById('yt-player');
    if (ytEl && ytEl.parentElement !== document.body) {
        document.body.appendChild(ytEl);
    }
    if (ytEl) ytEl.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
    if (state.ytReady && state.ytPlayer) state.ytPlayer.stopVideo?.();

    const idx = state.playlist.indexOf(item);
    playTrack(idx);
}

// ─── Search ───────────────────────────────────────────────────────────────────

let ytSearchDebounce = null;

export function scheduleYTSearch(query, delayMs = 500) {
    clearTimeout(ytSearchDebounce);
    ytSearchDebounce = setTimeout(() => searchYouTube(query), delayMs);
}

async function searchYouTube(q) {
    const container = document.getElementById('youtube-results');
    const section   = document.getElementById('yt-section');

    if (!q || q.length < 2) {
        section.style.display = 'none';
        container.innerHTML = '';
        state.ytResults = [];
        return;
    }

    section.style.display = 'block';
    container.innerHTML = `
        <div class="yt-skeleton">
            ${[0, 1, 2].map(() => `
            <div class="yt-skeleton-item">
                <div class="skel-cover"></div>
                <div class="skel-info">
                    <div class="skel-line"></div>
                    <div class="skel-line short"></div>
                </div>
            </div>`).join('')}
        </div>`;

    try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=3&key=${YT_API_KEY}`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error(await searchRes.text());
        const searchData = await searchRes.json();

        const items = searchData.items || [];
        if (!items.length) {
            container.innerHTML = `<div style="color:var(--text-dim);font-size:0.8rem;padding:10px;">Nessun risultato</div>`;
            return;
        }

        const videoIds = items.map(i => i.id.videoId).join(',');
        const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${YT_API_KEY}`;
        const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) });
        const detailData = detailRes.ok ? await detailRes.json() : { items: [] };

        const durationMap = {};
        (detailData.items || []).forEach(v => {
            durationMap[v.id] = parseISO8601Duration(v.contentDetails.duration);
        });

        state.ytResults = items.map(item => ({
            type:     'youtube',
            id:       item.id.videoId,
            title:    item.snippet.title,
            thumb:    item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
            duration: durationMap[item.id.videoId] || 0,
            uploader: item.snippet.channelTitle || 'YouTube',
        }));

        renderYouTubeResults(state.ytResults);

    } catch (err) {
        console.error('YouTube search error:', err);
        container.innerHTML = `<div style="color:#ff4444;font-size:0.8rem;padding:10px;">Errore: ${err.message}</div>`;
    }
}

function renderYouTubeResults(results) {
    const container = document.getElementById('youtube-results');
    container.innerHTML = '';
    const n = results.length;

    results.forEach((video, i) => {
        const el = document.createElement('div');
        el.className = 'track-item';
        el.dataset.ytIdx = i;
        el.style.background   = '#1a1a1a';
        el.style.borderBottom = i < n - 1 ? '1px solid #2a2a2a' : 'none';
        el.style.marginBottom = i === n - 1 ? '15px' : '0';
        if      (n === 1)    el.style.borderRadius = '15px';
        else if (i === 0)    el.style.borderRadius = '15px 15px 0 0';
        else if (i === n-1)  el.style.borderRadius = '0 0 15px 15px';

        const durStr = video.duration ? formatTime(video.duration) : '';
        el.innerHTML = `
            <div class="track-cover">
                <img src="${video.thumb}" alt="" onerror="this.parentElement.innerHTML='▶️'">
            </div>
            <div class="track-info" data-play-yt="${i}">
                <span class="track-name">${escapeHtml(video.title)}</span>
                <div class="track-meta-row">
                    <span>${escapeHtml(video.uploader)}</span>
                    <span class="file-format yt-badge">YT</span>
                    ${durStr ? `<span style="color:var(--primary);font-weight:bold;">${durStr}</span>` : ''}
                </div>
            </div>`;

        el.querySelector('[data-play-yt]').onclick = () => playItem(state.ytResults[i]);

        if (state.currentYTId && state.currentYTId === video.id) {
            el.style.borderLeft = '5px solid var(--primary)';
            el.style.background = '#252525';
        }

        setupYTSwipe(el, i);
        container.appendChild(el);
    });
}

function setupYTSwipe(el, idx) {
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
        el.style.transition = '0.4s cubic-bezier(0.18,0.89,0.32,1.28)';
        el.style.transform = 'translateX(0)';
        el.style.backgroundColor = '';
        if (isSwipe && Math.abs(cX) > threshold) {
            if (navigator.vibrate) navigator.vibrate(30);
            const video = state.ytResults[idx];
            if (cX > 0) { state.queue.unshift(video); showToast('In cima ↑'); }
            else         { state.queue.push(video);    showToast('In fondo ↓'); }
            import('./queue.js').then(m => m.renderQueue());
        }
        cX = 0;
    };
}

