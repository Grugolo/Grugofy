// ─── YOUTUBE API ──────────────────────────────────────────────────────────────
import { YT_API_KEY } from './config.js';
import { state } from './state.js';
import { updateUI } from './ui.js';
import { escapeHtml, formatTime, parseISO8601Duration, showToast } from './utils.js';
import { playTrack } from './player.js';
import { stopYTSeekPolling, startYTSeekPolling, updateExpandedView } from './expandedPlayer.js';

const audio = document.getElementById('main-audio');
const nowPlayingTitle = document.getElementById('now-playing-title');

// ─── IFrame API ───────────────────────────────────────────────────────────────
window.onYouTubeIframeAPIReady = function () {
    state.ytPlayer = new YT.Player('yt-player', {
        height: '1',
        width: '1',
        videoId: '',
        playerVars: { playsinline: 1, autoplay: 1 },
        events: {
            onReady: () => {
                state.ytReady = true;

                if (state.ytPendingVideoId) {
                    loadYTVideo(state.ytPendingVideoId);
                    state.ytPendingVideoId = null;
                }
            },
            onStateChange: (e) => {
                if (e.data === YT.PlayerState.ENDED) {
                    document.getElementById('btn-next').click();
                }
                updateUI();
            },
        },
    });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureYTScript() {
    if (window.YT || document.getElementById('yt-iframe-api')) return;
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
}

function showYTPlayer() {
    const ytEl = document.getElementById('yt-player');
    if (ytEl) {
        ytEl.style.opacity = '1';
        ytEl.style.pointerEvents = 'auto';
    }
}

function hideYTPlayer() {
    const ytEl = document.getElementById('yt-player');
    if (ytEl) {
        ytEl.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
    }
}

function resetProgress() {
    state.currentTime = 0;
    state.duration = 0;
}

function loadYTVideo(videoId) {
    if (!state.ytPlayer) return;

    state.ytPlayer.loadVideoById(videoId);

    const waitReady = setInterval(() => {
        try {
            const dur = state.ytPlayer.getDuration();
            if (dur && dur > 0) {
                clearInterval(waitReady);

                state.ytPlayer.playVideo();
                startYTSeekPolling();
            }
        } catch (_) {}
    }, 100);
}

// ─── playItem ─────────────────────────────────────────────────────────────────
export function playItem(item) {
    if (item.type === 'youtube') {
        // STOP AUDIO
        audio.pause();
        audio.removeAttribute('src');
        audio.load();

        stopYTSeekPolling();

        // STATE
        state.currentYTId = item.id;
        resetProgress();

        nowPlayingTitle.textContent = item.title;
        updateExpandedView();
        showYTPlayer();

        // UI highlight
        document.querySelectorAll('#youtube-results .track-item').forEach(el => {
            const v = state.ytResults[parseInt(el.dataset.ytIdx)];
            const playing = v && v.id === item.id;
            el.style.borderLeft = playing ? '5px solid var(--primary)' : '';
            el.style.background = playing ? '#252525' : '#1a1a1a';
        });

        // LOAD PLAYER
        if (state.ytReady && state.ytPlayer) {
            loadYTVideo(item.id);
        } else {
            state.ytPendingVideoId = item.id;
            ensureYTScript();
        }

        // MEDIA SESSION
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => state.ytPlayer?.playVideo());
            navigator.mediaSession.setActionHandler('pause', () => state.ytPlayer?.pauseVideo());
            navigator.mediaSession.setActionHandler('previoustrack', () => document.getElementById('btn-prev').click());
            navigator.mediaSession.setActionHandler('nexttrack', () => document.getElementById('btn-next').click());

            navigator.mediaSession.metadata = new MediaMetadata({
                title: item.title,
                artist: item.uploader || 'YouTube',
                artwork: [{ src: item.thumb || '', sizes: '512x512', type: 'image/jpeg' }],
            });
        }

        updateUI();
        return;
    }

    // ─── FILE LOCALE ───────────────────────────────────────────────────────────
    state.currentYTId = null;
    stopYTSeekPolling();

    hideYTPlayer();
    if (state.ytReady && state.ytPlayer) {
        state.ytPlayer.stopVideo?.();
    }

    const idx = state.playlist.indexOf(item);
    if (idx !== -1) playTrack(idx);
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
let ytSearchDebounce = null;

export function scheduleYTSearch(query, delayMs = 500) {
    clearTimeout(ytSearchDebounce);
    ytSearchDebounce = setTimeout(() => searchYouTube(query), delayMs);
}

async function searchYouTube(q) {
    const container = document.getElementById('youtube-results');
    const section = document.getElementById('yt-section');

    if (!q || q.length < 2) {
        section.style.display = 'none';
        container.innerHTML = '';
        state.ytResults = [];
        return;
    }

    section.style.display = 'block';

    container.innerHTML = `
        <div class="yt-skeleton">
            ${[0,1,2].map(() => `
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
        const searchData = await searchRes.json();

        const items = searchData.items || [];
        if (!items.length) {
            container.innerHTML = `<div style="color:var(--text-dim);padding:10px;">Nessun risultato</div>`;
            return;
        }

        const ids = items.map(i => i.id.videoId).join(',');
        const detailRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${YT_API_KEY}`);
        const detailData = await detailRes.json();

        const durationMap = {};
        (detailData.items || []).forEach(v => {
            durationMap[v.id] = parseISO8601Duration(v.contentDetails.duration);
        });

        state.ytResults = items.map(item => ({
            type: 'youtube',
            id: item.id.videoId,
            title: item.snippet.title,
            thumb: item.snippet.thumbnails?.medium?.url || '',
            duration: durationMap[item.id.videoId] || 0,
            uploader: item.snippet.channelTitle || 'YouTube',
        }));

        renderYouTubeResults(state.ytResults);

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div style="color:red;padding:10px;">Errore</div>`;
    }
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderYouTubeResults(results) {
    const container = document.getElementById('youtube-results');
    container.innerHTML = '';

    results.forEach((video, i) => {
        const el = document.createElement('div');
        el.className = 'track-item';
        el.dataset.ytIdx = i;

        const durStr = video.duration ? formatTime(video.duration) : '';

        el.innerHTML = `
            <div class="track-cover">
                <img src="${video.thumb}">
            </div>
            <div class="track-info" data-play-yt="${i}">
                <span>${escapeHtml(video.title)}</span>
                <div>
                    <span>${escapeHtml(video.uploader)}</span>
                    ${durStr ? `<span>${durStr}</span>` : ''}
                </div>
            </div>`;

        el.querySelector('[data-play-yt]').onclick = () => playItem(video);
        container.appendChild(el);
    });
}
