/*
 * Live TV: free channels (js/channels.js, plus any M3U playlists from config) in a grid with
 * group tabs, and a full-screen player.
 *
 * Same feel as For you: rest the highlight on a channel for PREVIEW_DELAY_MS and it starts
 * playing behind the grid (quieter, see liveTv.previewVolume), with a loading line along the
 * card; once the picture arrives the page falls back to just that row. OK goes full screen on
 * the same stream, without reloading it.
 *
 * Playback is one <video> (#live-video) shared by the preview and the player. The TV's web engine
 * plays HLS natively; a browser that cannot, or a stream the engine rejects, gets hls.js from a
 * CDN. In the player: Up/Down or CH change channel within the group, Back
 * returns to the grid with the channel still previewing, OK opens captions on/off. A channel that has not started after
 * STALL_MS counts as unavailable.
 */
(function () {
    'use strict';

    var STORE_KEY = 'arn0.livetv.v1';
    var GRID_COLS = 5;
    var STALL_MS = 15000;
    var BANNER_MS = 4000;
    var PREVIEW_DELAY_MS = 650;     // stream request only after a real pause on a card, as For you
    // The remote's CH ▲/▼ rocker, registered in init.
    var CHANNEL_UP = 427;
    var CHANNEL_DOWN = 428;
    var HLS_JS = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.20/hls.min.js';

    var cfg = window.LAUNCHER_CONFIG.liveTv || {};
    var log = DevLog.log;
    var $ = UI.$;
    var el = UI.el;
    var KEY = UI.KEY;

    var channels = [];          // [{ name, group, url }]
    var group = null;           // tab shown in the grid
    var stream = null;          // { channel, state: 'loading' | 'playing' | 'failed', viaJs, token }
    var hls = null;
    var previewTimer = null;
    var viewWatch = null;
    var captionTimer = null;
    var quiet = false;          // focus moves made by the code itself, not the viewer
    var hlsLoading = null;
    var stallTimer = null;
    var bannerTimer = null;

    // ---------- Channel list

    function fromBuiltIn() {
        return (window.FREE_CHANNELS || []).map(function (c) {
            return { name: c[0], group: c[1], url: c[2] };
        });
    }

    // Minimal M3U: #EXTINF:-1 ... group-title="X",Name  followed by the stream URL.
    function parseM3u(text, fallbackGroup) {
        var out = [];
        var pending = null;
        text.split(/\r?\n/).forEach(function (line) {
            line = line.trim();
            if (/^#EXTINF/i.test(line)) {
                var g = /group-title="([^"]*)"/i.exec(line);
                pending = {
                    name: line.slice(line.lastIndexOf(',') + 1).trim(),
                    group: fallbackGroup || (g && g[1].split(';')[0]) || 'Playlist'
                };
            } else if (pending && line && line.charAt(0) !== '#') {
                pending.url = line;
                out.push(pending);
                pending = null;
            }
        });
        return out;
    }

    function loadPlaylists() {
        var lists = cfg.playlists || [];
        lists.forEach(function (p) {
            var url = typeof p === 'string' ? p : p.url;
            fetch(url).then(function (r) { return r.text(); }).then(function (text) {
                var extra = parseM3u(text, p.group);
                log('Live TV: ' + extra.length + ' channels from ' + url);
                channels = channels.concat(extra);
                if (UI.isVisible('livetv')) render();
            }).catch(function (err) {
                log('Live TV: playlist failed ' + url + ': ' + DevLog.errorText(err));
            });
        });
    }

    function groups() {
        var seen = [];
        channels.forEach(function (c) { if (seen.indexOf(c.group) < 0) seen.push(c.group); });
        return seen;
    }

    function inGroup(g) {
        return channels.filter(function (c) { return c.group === g; });
    }

    function readStore() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
    }

    function writeStore(v) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) { /* only loses the memory */ }
    }

    // ---------- Grid

    function hue(text) {
        var h = 0;
        for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
        return h;
    }

    function initials(name) {
        var words = name.replace(/[^\w\s+]/g, ' ').trim().split(/\s+/);
        return ((words[0] ? words[0][0] : '?') + (words[1] ? words[1][0] : '')).toUpperCase();
    }

    function card(c) {
        var wrap = el('div', 'app channel');
        var tile = el('div', 'tile');
        tile.style.background = 'hsl(' + hue(c.name) + ',32%,24%)';
        tile.appendChild(el('div', 'mono', initials(c.name)));
        tile.appendChild(el('div', 'live-dot', 'LIVE'));
        var bar = el('div', 'load-bar');
        bar.appendChild(el('div', 'load-fill'));
        tile.appendChild(bar);
        wrap._bar = bar;
        wrap.appendChild(tile);
        wrap.appendChild(el('div', 'label', c.name));
        wrap._item = c;
        return wrap;
    }

    function renderTabs() {
        var tabs = $('livetv-tabs');
        tabs.innerHTML = '';
        groups().forEach(function (g) {
            var chip = el('div', 'chip' + (g === group ? ' on-tab' : ''), g);
            chip._group = g;
            tabs.appendChild(chip);
        });
    }

    function renderGrid() {
        focusMode(false);
        var grid = $('livetv-grid');
        grid.innerHTML = '';
        UI.resetScroll(grid);
        inGroup(group).forEach(function (c) { grid.appendChild(card(c)); });
        $('livetv-count').textContent = channels.length + ' free channels';
    }

    function render() {
        var all = groups();
        if (all.indexOf(group) < 0) group = all[0] || null;
        renderTabs();
        renderGrid();
    }

    function selectGroup(g) {
        if (g === group) return;
        group = g;
        UI.children($('livetv-tabs')).forEach(function (chip) {
            chip.classList.toggle('on-tab', chip._group === g);
        });
        renderGrid();
    }

    // ---------- Stream (one video for preview and player)

    function loadHlsJs() {
        if (window.Hls) return Promise.resolve();
        if (hlsLoading) return hlsLoading;
        hlsLoading = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = HLS_JS;
            s.onload = function () { resolve(); };
            s.onerror = function () { hlsLoading = null; reject(new Error('hls.js did not load')); };
            document.head.appendChild(s);
        });
        return hlsLoading;
    }

    function video() { return $('live-video'); }

    function detach() {
        clearTimeout(stallTimer);
        if (hls) {
            hls.destroy();
            hls = null;
        }
        var v = video();
        v.pause();
        v.removeAttribute('src');
        v.load();
        $('live-layer').classList.remove('playing');
    }

    function full() { return UI.current() === 'player'; }

    function setVolume() {
        var pv = cfg.previewVolume === undefined ? 50 : cfg.previewVolume;
        video().volume = full() ? 1 : UI.clamp(pv, 0, 100) / 100;
    }

    // viaJs: skip the engine's own HLS (used as a second try when it rejects a stream).
    function load(c, viaJs) {
        detach();
        stream = { channel: c, state: 'loading', viaJs: !!viaJs, token: {} };
        var token = stream.token;
        var st = readStore();
        st.group = c.group;
        st.url = c.url;
        writeStore(st);
        log('Live TV: ' + c.name + (viaJs ? ' (hls.js) ' : ' ') + c.url);
        setProgress(c, 10);
        setVolume();
        document.documentElement.classList.add('live-on');
        watchViews();
        var v = video();
        stallTimer = setTimeout(function () { failed('no picture after ' + STALL_MS / 1000 + ' s'); }, STALL_MS);
        if (!viaJs && v.canPlayType('application/vnd.apple.mpegurl')) {
            v.src = c.url;
            v.play().catch(function () { /* the error event reports real failures */ });
            return;
        }
        loadHlsJs().then(function () {
            if (!stream || stream.token !== token) return;
            if (!window.Hls.isSupported()) return failed('no HLS support');
            hls = new window.Hls({ maxBufferLength: 20 });
            hls.on(window.Hls.Events.ERROR, function (e, data) {
                if (data.fatal) failed(data.type + ' ' + data.details);
            });
            hls.loadSource(c.url);
            hls.attachMedia(v);
            v.play().catch(function () {});
        }).catch(function (err) { failed(DevLog.errorText(err)); });
    }

    function onPlaying() {
        if (!stream) return;
        clearTimeout(stallTimer);
        stream.state = 'playing';
        setProgress(stream.channel, 100);
        $('live-layer').classList.add('playing');
        if (full()) banner('');
        else focusMode(true);
        applyCaptions();
    }

    function failed(why) {
        if (!stream || stream.state === 'failed') return;
        var c = stream.channel;
        log('Live TV: ' + c.name + ' unavailable (' + why + ')');
        detach();
        stream.state = 'failed';
        setProgress(null, 0);
        var cardEl = cardFor(c);
        if (cardEl) cardEl.classList.add('down');
        if (full()) banner('Not available right now. ▲▼ for another channel.', true);
    }

    function stopStream() {
        clearTimeout(previewTimer);
        if (!stream) return;
        detach();
        stream = null;
        setProgress(null, 0);
        focusMode(false);
        document.documentElement.classList.remove('live-on');
        clearInterval(viewWatch);
        viewWatch = null;
    }

    // Leaving Live TV any way at all (Back, a colour key, an app) stops the stream.
    function watchViews() {
        if (viewWatch) return;
        viewWatch = setInterval(function () {
            var v = UI.current();
            if (document.hidden || (v !== 'livetv' && v !== 'player' && v !== 'menu')) stopStream();
        }, 500);
    }

    // ---------- Preview on the grid

    function cardFor(c) {
        var cards = UI.children($('livetv-grid'));
        for (var i = 0; i < cards.length; i++) if (cards[i]._item === c) return cards[i];
        return null;
    }

    // Loading line along the bottom of the card: 10% requested, 60% stream answered, 100% picture.
    function setProgress(c, pct) {
        UI.children($('livetv-grid')).forEach(function (cardEl) {
            var bar = cardEl._bar;
            if (cardEl._item !== c) {
                bar.className = 'load-bar';
                bar.firstChild.style.transform = '';
                return;
            }
            bar.className = 'load-bar active' + (pct >= 100 ? ' done' : '');
            bar.firstChild.style.transform = 'scaleX(' + (pct / 100) + ')';
        });
    }

    /*
     * Focus mode while a channel previews: title and tabs fall back and the grid becomes one row
     * along the bottom of the screen holding the whole group, so Left/Right browse every channel
     * without leaving the picture. Up (the tabs) or Back brings the grid back.
     */
    function previewMode() { return document.documentElement.classList.contains('live-previewing'); }

    function focusMode(on) {
        var want = !!on && UI.isVisible('livetv');
        if (want === previewMode()) return;
        var grid = $('livetv-grid');
        var focused = grid.querySelector('.focused');
        document.documentElement.classList.toggle('live-previewing', want);
        grid.className = want ? 'row-track livetv-row' : 'grid';
        UI.resetScroll(grid);
        // Same card, new place in the layout; the preview logic must not treat it as a move.
        if (focused && UI.isVisible('livetv')) {
            var was = quiet;
            quiet = true;
            UI.focusOn(focused);
            quiet = was;
        }
    }

    function previewFocus(target) {
        if (quiet) return;
        clearTimeout(previewTimer);
        var c = target && target._item;
        if (!c) {
            // Tabs: stop the picture, show the whole grid again.
            if (stream) stopStream();
            return;
        }
        if (stream && stream.channel === c && stream.state !== 'failed') {
            if (stream.state === 'playing') focusMode(true);
            return;
        }
        // The previous channel goes at once; the next only starts after a real pause. The row
        // stays, so moving along it does not flash the grid back.
        if (stream) {
            detach();
            stream = null;
            setProgress(null, 0);
        }
        if (cfg.previews === false) return;
        previewTimer = setTimeout(function () {
            if (UI.isVisible('livetv')) load(c);
        }, PREVIEW_DELAY_MS);
    }

    // ---------- Captions
    //
    // Most US channels carry closed captions (CEA-608 in the video, or a WebVTT track); hls.js
    // and the TV's own HLS player expose either as a text track. Shown full screen only, never
    // over the grid preview. The choice is remembered.

    function captionsOn() { return readStore().captions === true; }

    function captionTracks() {
        var list = video().textTracks || [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].kind === 'captions' || list[i].kind === 'subtitles') out.push(list[i]);
        }
        return out;
    }

    /*
     * A stream can expose several tracks (608 captions, WebVTT, and empty ones left behind by
     * earlier channels), so every track listens ('hidden' still loads cues) and the one with
     * the most cues is shown. Rechecked every few seconds while captions are up.
     */
    function applyCaptions() {
        var show = captionsOn() && full();
        if (hls && show && hls.subtitleTracks && hls.subtitleTracks.length && hls.subtitleTrack < 0) hls.subtitleTrack = 0;
        var tracks = captionTracks();
        var best = null;
        tracks.forEach(function (t) {
            var n = t.cues ? t.cues.length : 0;
            if (!best || n > (best.cues ? best.cues.length : 0)) best = t;
        });
        if (show && best && !(best.cues && best.cues.length)) best = tracks[tracks.length - 1];
        tracks.forEach(function (t) {
            var mode = !show ? 'disabled' : t === best ? 'showing' : 'hidden';
            if (t.mode !== mode) t.mode = mode;
        });
        clearTimeout(captionTimer);
        if (show) captionTimer = setTimeout(applyCaptions, 3000);
    }

    function setCaptions(on) {
        var st = readStore();
        st.captions = on;
        writeStore(st);
        applyCaptions();
        if (on && !captionTracks().length) banner('No captions on this channel.');
    }

    function playerMenu() {
        var on = captionsOn();
        UI.menu(stream ? stream.channel.name : 'Live TV', [
            { label: 'Captions on', checked: on, run: function () { setCaptions(true); } },
            { label: 'Captions off', checked: !on, run: function () { setCaptions(false); } }
        ]);
    }

    // ---------- Player

    function banner(text, sticky) {
        var c = stream && stream.channel;
        $('player-name').textContent = c ? c.name : '';
        var list = c ? inGroup(c.group) : [];
        $('player-meta').textContent = c ? c.group + ' · ' + (list.indexOf(c) + 1) + ' of ' + list.length : '';
        $('player-status').textContent = text || '';
        $('player-banner').classList.add('visible');
        clearTimeout(bannerTimer);
        if (!sticky) bannerTimer = setTimeout(function () { $('player-banner').classList.remove('visible'); }, BANNER_MS);
    }

    function zap(step) {
        if (!stream) return;
        var list = inGroup(stream.channel.group);
        var i = list.indexOf(stream.channel);
        load(list[(i + step + list.length) % list.length]);
        banner('Loading…', true);
    }

    function open(c) {
        clearTimeout(previewTimer);
        if (window.ForYou) ForYou.stopPreview();
        UI.show('player');
        document.documentElement.classList.add('live-full');
        if (stream && stream.channel === c && stream.state !== 'failed') {
            // Already previewing: same stream, just louder and full screen.
            setVolume();
            applyCaptions();
            banner(stream.state === 'playing' ? '' : 'Loading…', stream.state !== 'playing');
            return;
        }
        load(c);
        applyCaptions();
        banner('Loading…', true);
    }

    function close() {
        $('player-banner').classList.remove('visible');
        document.documentElement.classList.remove('live-full');
        var c = stream && stream.channel;
        // Back on the channel that was playing (it may be in another group after zapping),
        // which keeps previewing behind the grid. Focus passes over the old card on the way, so
        // the preview logic sits this out rather than restart the stream.
        quiet = true;
        UI.show('livetv', { back: true });
        if (c) {
            selectGroup(c.group);
            var cardEl = cardFor(c);
            if (cardEl) UI.focusOn(cardEl);
        }
        if (stream && stream.state === 'playing') focusMode(true);
        quiet = false;
        setVolume();
        if (stream && stream.state === 'failed') stopStream();
        applyCaptions();
    }

    // ---------- Views

    function init() {
        if (cfg.enabled === false) return;
        channels = fromBuiltIn();
        group = readStore().group || null;
        loadPlaylists();
        try {
            tizen.tvinputdevice.registerKeyBatch(['ChannelUp', 'ChannelDown']);
        } catch (e) {
            log('Channel keys unavailable: ' + DevLog.errorText(e));
        }

        var v = video();
        v.addEventListener('playing', onPlaying);
        v.addEventListener('loadedmetadata', function () {
            if (stream && stream.state === 'loading') setProgress(stream.channel, 60);
        });
        if (v.textTracks && v.textTracks.addEventListener) v.textTracks.addEventListener('addtrack', applyCaptions);
        v.addEventListener('error', function () {
            if (!stream || stream.state === 'failed' || hls || !v.error) return;
            if (!stream.viaJs) load(stream.channel, true);
            else failed('video error ' + v.error.code);
        });

        UI.register('livetv', {
            el: $('livetv'),
            startRow: 1,
            hints: [['OK', 'Watch'], ['Back', 'Home']],
            onShow: function (opts) { if (!opts.back) render(); },
            rows: function () {
                var cards = UI.children($('livetv-grid'));
                return [UI.children($('livetv-tabs'))].concat(previewMode() ? [cards] : UI.chunk(cards, GRID_COLS));
            },
            onFocus: function (target) {
                if (target && target._group) selectGroup(target._group);
                previewFocus(target);
            },
            activate: open,
            // Back from the preview row returns to the grid; from the grid, to Home.
            onBack: function () {
                var row = previewMode();
                stopStream();
                return row;
            }
        });

        UI.register('player', {
            el: $('player'),
            hints: [],
            // Everything but Back stays in the player, so a colour key cannot leave a stream
            // playing behind another screen.
            onKey: function (k) {
                if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) return false;
                if (k === KEY.UP || k === CHANNEL_UP) zap(-1);
                else if (k === KEY.DOWN || k === CHANNEL_DOWN) zap(1);
                else if (k === KEY.ENTER) playerMenu();
                return true;
            },
            onBack: function () {
                close();
                return true;
            }
        });
    }

    window.LiveTV = {
        init: init,
        enabled: function () { return cfg.enabled !== false && channels.length > 0; },
        // For a config M3U playlist or a test: the parsed list, without touching the screen.
        parseM3u: parseM3u
    };
})();
