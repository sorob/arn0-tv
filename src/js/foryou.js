/*
 * "For you": AI show and movie suggestions on Home, learning from what the household rates.
 *
 * The launcher cannot see what plays inside other apps, so taste comes from two places only:
 * ratings given here (OK on a card: Love it / Not for us / Already watched) and how often each
 * app is opened from the launcher. Suggestions come from the OpenAI API (config.ai), are cached
 * on the TV and refreshed every few hours or after a few new ratings. With a TMDB key
 * (config.ai.tmdbKey) each pick gets a backdrop image and is checked against TMDB's
 * where-to-watch data: the app is corrected, and titles none of the household's apps stream
 * are dropped.
 *
 * The "Ask" card opens Samsung's on-screen keyboard for a request ("something funny under 90
 * minutes"); on TVs whose keyboard supports it, holding the remote's mic button dictates into it.
 * Requests are remembered and feed later suggestions.
 *
 * Everything stays in this TV's localStorage; only the titles and app names in the prompt are
 * sent to OpenAI.
 */
(function () {
    'use strict';

    // Each profile keeps its own taste; "everyone" keeps the original key so nothing is lost.
    var STORE_KEY = 'arn0.taste.v1';
    var PROFILE_KEY = 'arn0.profile';
    var MAX_LIST = 80;          // titles kept per list in the prompt
    var REFETCH_AFTER_RATINGS = 3;
    var MAX_ASKS = 20;
    var PROMPT_VERSION = 2;     // bump when the prompt changes enough to redo cached suggestions
    var IME_DONE = 65376;       // Samsung on-screen keyboard Done / Cancel
    var IME_CANCEL = 65385;
    var DAY_MS = 24 * 3600 * 1000;
    var MAX_HISTORY = 30;       // titles opened from a card (or loved), newest first
    var CONTINUE_DAYS = 30;     // opened this recently -> "Continue" card
    var MAX_CONTINUE = 4;
    var MAX_RESUME = 5;         // Continue + New episodes cards together
    var AIRING_TTL_MS = DAY_MS; // TMDB /tv/{id} checked at most once a day per show
    var AIRING_PER_RUN = 10;

    var cfg = window.LAUNCHER_CONFIG.ai || {};
    var log = DevLog.log;
    var el = UI.el;

    var fetching = false;
    var onChange = function () {};

    function blank() {
        return { liked: [], disliked: [], watched: [], opens: {}, asks: [], query: '', recent: null,
            items: [], fetchedAt: 0, ratedSince: 0, error: '',
            history: [], likedItems: [], airing: {} };
    }

    var profiles = (cfg.profiles && cfg.profiles.length) ? cfg.profiles : [{ id: 'everyone', name: 'Everyone' }];
    var profileId = readProfile();

    function readProfile() {
        var id = null;
        try { id = localStorage.getItem(PROFILE_KEY); } catch (e) {}
        return profiles.some(function (p) { return p.id === id; }) ? id : profiles[0].id;
    }

    function profile() {
        return profiles.filter(function (p) { return p.id === profileId; })[0] || profiles[0];
    }

    function storeKey() {
        return profileId === 'everyone' ? STORE_KEY : STORE_KEY + '.' + profileId;
    }

    var taste = load();
    setTimeout(function () { prefetchTrailers(); }, 4000);   // cards cached from an earlier run
    setTimeout(function () { checkAiring(); }, 6000);

    function load() {
        var t = blank();
        try {
            var saved = JSON.parse(localStorage.getItem(storeKey()));
            if (saved) Object.keys(t).forEach(function (k) { if (saved[k] !== undefined) t[k] = saved[k]; });
            // Suggestions made by an older prompt are dropped once; ratings and history are kept.
            if (!saved || saved.v !== PROMPT_VERSION) { t.items = []; t.fetchedAt = 0; }
        } catch (e) {
            // Start fresh.
        }
        return t;
    }

    function save() {
        taste.v = PROMPT_VERSION;
        try {
            localStorage.setItem(storeKey(), JSON.stringify(taste));
        } catch (e) {
            log('For you: could not save taste');
        }
    }

    function enabled() {
        return !!(cfg.apiKey && cfg.enabled !== false);
    }

    function key(item) {
        return (item.title + ' (' + (item.year || '?') + ')');
    }

    function push(list, item) {
        var k = key(item);
        if (list.indexOf(k) === -1) list.push(k);
        if (list.length > MAX_LIST) list.shift();
    }

    // ---------- Tracking

    var SHOW_FIELDS = ['title', 'year', 'type', 'service', 'tmdbId', 'kind', 'image'];

    function brief(show) {
        var o = {};
        SHOW_FIELDS.forEach(function (f) { if (show[f] !== undefined && show[f] !== null) o[f] = show[f]; });
        return o;
    }

    /*
     * History of titles opened from a card (newest first, one entry per title). The entries are
     * the shows behind "Continue" cards, so they also keep details/trailer/links once looked up.
     * how: 'opened' (moves to the front) or 'loved'.
     */
    function remember(show, how) {
        if (!show || !show.title) return;
        var k = key(show);
        var at = -1;
        taste.history.forEach(function (h, i) { if (at === -1 && key(h) === k) at = i; });
        var entry = at === -1 ? null : taste.history[at];
        var fresh = !entry;
        entry = entry || {};
        var info = brief(show);
        Object.keys(info).forEach(function (f) { entry[f] = info[f]; });
        if (fresh) ['details', 'trailer', 'links'].forEach(function (f) { if (show[f] !== undefined) entry[f] = show[f]; });
        if (how === 'opened') entry.openedAt = Date.now();
        if (!entry.openedAt) entry.openedAt = 0;
        if (how === 'loved') {
            entry.loved = true;
            entry.liked = true;
        }
        // Opening moves the title to the front; loving one keeps its place (new ones go first).
        if (how === 'opened' || fresh) {
            if (!fresh) taste.history.splice(at, 1);
            taste.history.unshift(entry);
        }
        if (taste.history.length > MAX_HISTORY) taste.history.length = MAX_HISTORY;
        if (how === 'loved') {
            // Structured copy of the Love it list (taste.liked keeps "Title (year)" for the prompt).
            taste.likedItems = taste.likedItems.filter(function (l) { return key(l) !== k; });
            taste.likedItems.push(brief(show));
            if (taste.likedItems.length > MAX_LIST) taste.likedItems.shift();
        }
        save();
    }

    function noteAppOpen(item) {
        if (!item || !item.label) return;
        taste.opens[item.label] = (taste.opens[item.label] || 0) + 1;
        save();
    }

    function rate(item, how) {
        if (how === 'liked') {
            push(taste.liked, item);
            remember(item, 'loved');
            setTimeout(checkAiring, 500);
        }
        if (how === 'disliked') push(taste.disliked, item);
        if (how === 'watched') push(taste.watched, item);
        if (how === 'disliked' || how === 'watched') {
            taste.items = taste.items.filter(function (i) { return key(i) !== key(item); });
        } else {
            item.liked = true;
        }
        taste.ratedSince++;
        save();
        onChange();
        if (taste.ratedSince >= REFETCH_AFTER_RATINGS || taste.items.length < 4) refresh(true, taste.query);
    }

    // ---------- Suggestions

    function installedServices() {
        var labels = Home.homeItems().map(function (i) { return i.label; });
        return labels.filter(function (l) { return !/spotify|youtube$/i.test(l); });
    }

    function prompt(query, recent) {
        var opens = Object.keys(taste.opens).sort(function (a, b) {
            return taste.opens[b] - taste.opens[a];
        }).slice(0, 8).map(function (k) { return k + ' (' + taste.opens[k] + ')'; });
        var services = installedServices();
        return [
            {
                role: 'system',
                content: 'You recommend TV shows and movies for one household watching on a home projector. ' +
                    (profile().kids ? 'This is the KIDS profile: every pick must suit children under 12 ' +
                        '(movies G or PG, shows TV-Y, TV-Y7, TV-G or TV-PG); no exceptions, even if asked. ' :
                        (profileId !== 'everyone' ? 'These picks are for one person, "' + profile().name + '". ' : '')) +
                    'Reply only with JSON {"items":[{"title":string,"year":number,"type":"show"|"movie",' +
                    '"service":string,"reason":string}]}. "service" must be exactly one of the household\'s apps, ' +
                    'the one where the title is most likely streaming in the ' + (cfg.region || 'US') + ' right now. ' +
                    '"reason": under 60 characters, tied to their taste when you know it. Never suggest a title ' +
                    'they liked, disliked or watched. Lean towards their liked titles; avoid what resembles ' +
                    'their dislikes. Mix shows and movies and include a couple of less obvious picks. ' +
                    'When they make a request, every pick must fit it, and "reason" says how it fits. ' +
                    'Today is ' + new Date().toISOString().slice(0, 10) + '. At least half of the picks must be ' +
                    'from the last two years; take those from the list of recent releases when one is given ' +
                    '(it is live data and newer than your knowledge), unless the request asks for older titles.'
            },
            {
                role: 'user',
                content: 'Apps: ' + services.join(', ') + '\n' +
                    'Loved: ' + (taste.liked.join('; ') || 'none yet') + '\n' +
                    'Not for us: ' + (taste.disliked.join('; ') || 'none') + '\n' +
                    'Already watched: ' + (taste.watched.join('; ') || 'none') + '\n' +
                    'Most-opened apps: ' + (opens.join(', ') || 'unknown') + '\n' +
                    'Earlier requests (hints at taste): ' + (taste.asks.join('; ') || 'none') + '\n' +
                    (recent && recent.length ? 'Popular recent releases on their apps: ' + recent.join('; ') + '\n' : '') +
                    (query ? 'Their request right now: "' + query + '"\n' : '') +
                    'Give ' + (cfg.count || 14) + ' picks.'
            }
        ];
    }

    function request(messages) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://api.openai.com/v1/chat/completions', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Authorization', 'Bearer ' + cfg.apiKey);
            xhr.timeout = 30000;
            xhr.onload = function () {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.error) return reject(new Error(data.error.message));
                    resolve(JSON.parse(data.choices[0].message.content).items || []);
                } catch (e) {
                    reject(new Error('Bad reply (' + xhr.status + ')'));
                }
            };
            xhr.onerror = function () { reject(new Error('No connection')); };
            xhr.ontimeout = function () { reject(new Error('Timed out')); };
            xhr.send(JSON.stringify({
                model: cfg.model || 'gpt-5.4-mini',
                response_format: { type: 'json_object' },
                messages: messages
            }));
        });
    }

    // query: a spoken/typed request answered by this batch; '' for general suggestions.
    function refresh(force, query) {
        if (!enabled() || fetching) return;
        query = query || '';
        var stale = Date.now() - taste.fetchedAt > (cfg.refreshHours || 6) * 3600 * 1000;
        // A request stays on screen until the household asks for something else.
        if (!force && (taste.query || !stale) && taste.items.length) return;
        fetching = true;
        taste.query = query;
        log('For you: asking ' + (cfg.model || 'gpt-5.4-mini') + (query ? ' "' + query + '"' : '') + '…');
        onChange();
        recentTitles().then(function (recent) {
            return request(prompt(query, recent));
        }).then(enrichAll).then(function (items) {
            var seen = {};
            taste.liked.concat(taste.disliked, taste.watched).forEach(function (k) { seen[k] = true; });
            taste.items = items.filter(function (i) { return i && i.title && !seen[key(i)]; });
            taste.fetchedAt = Date.now();
            taste.ratedSince = 0;
            taste.error = '';
            save();
            log('For you: ' + taste.items.length + ' suggestions');
            prefetchTrailers();
        }).catch(function (err) {
            taste.error = DevLog.errorText(err);
            log('For you failed: ' + taste.error);
        }).then(function () {
            fetching = false;
            onChange();
        });
    }

    // ---------- TMDB: artwork and where to watch

    // Home app label -> TMDB provider names that count as "streams there" (US names).
    // id: TMDB watch-provider id (US), used to discover recent releases on the household's apps.
    var PROVIDERS = [
        { app: /netflix/i, name: /^netflix/i, id: 8 },
        { app: /prime/i, name: /^amazon prime video/i, id: 9 },
        { app: /disney/i, name: /^disney plus$/i, id: 337 },
        { app: /hbo|max/i, name: /^(hbo )?max$/i, id: 1899 },
        { app: /hulu/i, name: /^hulu$/i, id: 15 },
        { app: /apple/i, name: /^apple tv( plus|\+)?$/i, id: 350 },
        { app: /peacock/i, name: /^peacock/i, id: 386 },
        { app: /plex/i, name: /^plex$/i, id: 538 },
        { app: /tv plus/i, name: /^samsung tv plus$/i }
    ];

    var RECENT_TTL_MS = 12 * 3600 * 1000;

    /*
     * The model's own knowledge lags and favours famous older titles, so each request carries
     * TMDB's live list of popular releases from the last ~18 months on the household's apps.
     */
    function recentTitles() {
        if (!cfg.tmdbKey) return Promise.resolve([]);
        if (taste.recent && Date.now() - taste.recent.at < RECENT_TTL_MS) return Promise.resolve(taste.recent.list);
        var services = installedServices();
        var ids = PROVIDERS.filter(function (p) {
            return p.id && services.some(function (l) { return p.app.test(l); });
        }).map(function (p) { return p.id; });
        if (!ids.length) return Promise.resolve([]);
        var since = new Date(Date.now() - 548 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        function discover(kind, page) {
            var params = {
                watch_region: cfg.region || 'US',
                with_watch_providers: ids.join('|'),
                with_watch_monetization_types: 'flatrate|free|ads',
                'vote_count.gte': kind === 'tv' ? 60 : 150,
                sort_by: 'popularity.desc',
                page: page
            };
            params[(kind === 'tv' ? 'first_air_date' : 'primary_release_date') + '.gte'] = since;
            if (profile().kids) {
                // Family (10751), Animation (16), Kids (10762, TV only); movies also capped at PG.
                params.with_genres = kind === 'tv' ? '10762|10751|16' : '10751|16';
                if (kind === 'movie') {
                    params.certification_country = 'US';
                    params['certification.lte'] = 'PG';
                }
                params['vote_count.gte'] = kind === 'tv' ? 20 : 50;
            }
            return tmdb('/discover/' + kind, params).then(function (res) {
                return (res.results || []).map(function (r) {
                    var date = r.first_air_date || r.release_date || '';
                    return (r.name || r.title) + ' (' + date.slice(0, 4) + ', ' + (kind === 'tv' ? 'show' : 'movie') + ')';
                });
            });
        }
        return Promise.all([discover('tv', 1), discover('tv', 2), discover('movie', 1), discover('movie', 2)])
            .then(function (lists) {
                var list = [].concat.apply([], lists);
                taste.recent = { at: Date.now(), list: list };
                save();
                return list;
            }).catch(function () { return []; });
    }

    function tmdb(path, params) {
        var q = Object.keys(params || {}).map(function (k) {
            return k + '=' + encodeURIComponent(params[k]);
        }).join('&');
        var url = 'https://api.themoviedb.org/3' + path + '?api_key=' + cfg.tmdbKey + (q ? '&' + q : '');
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = 15000;
            xhr.onload = function () {
                try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); }
            };
            xhr.onerror = xhr.ontimeout = function () { reject(new Error('TMDB unreachable')); };
            xhr.send();
        });
    }

    // Resolves to the item with image/service filled in, or null when no household app streams it.
    function enrich(item) {
        var kind = item.type === 'movie' ? 'movie' : 'tv';
        var params = { query: item.title };
        if (item.year) params[kind === 'movie' ? 'year' : 'first_air_date_year'] = item.year;
        return tmdb('/search/' + kind, params).then(function (res) {
            var hit = res.results && res.results[0];
            if (!hit) return item;
            item.tmdbId = hit.id;
            item.kind = kind;
            if (hit.backdrop_path) item.image = 'https://image.tmdb.org/t/p/w780' + hit.backdrop_path;
            return tmdb('/' + kind + '/' + hit.id + '/watch/providers').then(function (wp) {
                var region = wp.results && wp.results[cfg.region || 'US'];
                if (!region) return item;
                var names = [].concat(region.flatrate || [], region.free || [], region.ads || [])
                    .map(function (p) { return p.provider_name; });
                var apps = installedServices().filter(function (label) {
                    return PROVIDERS.some(function (p) {
                        return p.app.test(label) && names.some(function (n) { return p.name.test(n); });
                    });
                });
                if (!apps.length) return null;
                if (apps.indexOf(item.service) === -1) item.service = apps[0];
                item.verified = true;
                return item;
            });
        }).catch(function () {
            return item;    // TMDB down: keep the model's guess.
        });
    }

    function enrichAll(items) {
        if (!cfg.tmdbKey) return Promise.resolve(items);
        return Promise.all(items.map(enrich)).then(function (list) {
            return list.filter(Boolean);
        });
    }

    // ---------- Continue watching and new episodes
    //
    // The launcher cannot see playback, so "Continue" means "opened from a card lately". Shows the
    // household opened or loved are also checked against TMDB once a day for fresh episodes.

    function parseDay(text) {
        var t = text ? Date.parse(text) : NaN;     // "YYYY-MM-DD" (UTC midnight)
        return isNaN(t) ? null : t;
    }

    function normTitle(t) {
        return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function badgeFor(d) {
        var now = Date.now();
        var last = parseDay(d.last_air_date);
        var next = d.next_episode_to_air ? parseDay(d.next_episode_to_air.air_date) : null;
        var recent = last !== null && last <= now && now - last <= 21 * DAY_MS;
        var soon = next !== null && next >= now - DAY_MS && next - now <= 7 * DAY_MS;
        if (!recent && !soon) return '';
        // The season being aired: the upcoming episode's when it is close, else the last one's.
        var ep = soon ? d.next_episode_to_air : d.last_episode_to_air;
        var num = ep ? ep.season_number : null;
        var season = (d.seasons || []).filter(function (s) { return s.season_number === num; })[0];
        var start = season ? parseDay(season.air_date) : null;
        if (num > 1 && start !== null && start - now <= 7 * DAY_MS && now - start <= 30 * DAY_MS) return 'New season';
        return 'New episodes';
    }

    function bad(k) {
        return taste.disliked.indexOf(k) !== -1;
    }

    // Shows worth checking: opened or loved series, plus older "Title (year)" Love it entries.
    function airingCandidates() {
        var seen = {};
        var list = [];
        function add(show) {
            var k = key(show);
            if (seen[k] || bad(k) || show.type === 'movie' || show.kind === 'movie') return;
            seen[k] = true;
            list.push(show);
        }
        taste.history.forEach(add);
        taste.likedItems.forEach(add);
        taste.liked.forEach(function (text) {
            var m = /^(.*) \((\d{4}|\?)\)$/.exec(text);
            if (m) add({ title: m[1], year: m[2] === '?' ? undefined : Number(m[2]), legacy: true });
        });
        return list;
    }

    var checking = false;

    function checkAiring() {
        if (!enabled() || !cfg.tmdbKey || checking) return;
        var mine = taste;
        var now = Date.now();
        var due = airingCandidates().filter(function (show) {
            var c = mine.airing[key(show)];
            return !c || now - c.at > (c.notTv ? 30 * AIRING_TTL_MS : AIRING_TTL_MS);
        }).slice(0, AIRING_PER_RUN);
        if (!due.length) return;
        checking = true;
        var changed = false;
        var chain = Promise.resolve();
        due.forEach(function (show) {
            chain = chain.then(function () {
                if (taste !== mine) return;     // profile switched meanwhile
                return checkOne(show).then(function (badge) {
                    var k = key(show);
                    var old = mine.airing[k];
                    if ((old && old.badge || '') !== (badge || '')) changed = true;
                    mine.airing[k] = { at: Date.now(), badge: badge || '', notTv: badge === null };
                }, function () {});
            });
        });
        chain.then(function () {
            checking = false;
            if (taste !== mine) return;
            save();
            log('For you: checked ' + due.length + ' shows for new episodes');
            if (changed) onChange();
        });
    }

    // Resolves to a badge, '' when nothing new, or null when the title is not a TV show.
    function checkOne(show) {
        var lookup = show.tmdbId ? Promise.resolve(show) : findTmdb(show);
        return lookup.then(function () {
            if (!show.tmdbId || show.kind === 'movie') return null;
            return tmdb('/tv/' + show.tmdbId, { language: 'en-US' }).then(function (d) {
                if (!d || !d.id) return null;
                if (!show.image && !show.legacy && d.backdrop_path) show.image = 'https://image.tmdb.org/t/p/w780' + d.backdrop_path;
                // A legacy "Title (year)" may be a movie: only trust an exact name match.
                if (show.legacy && normTitle(d.name) !== normTitle(show.title) &&
                    normTitle(d.original_name) !== normTitle(show.title)) return null;
                var badge = badgeFor(d);
                if (badge && show.legacy) return adoptLegacy(show, d).then(function () { return badge; });
                return badge;
            });
        });
    }

    // Older Love it entries were only text: give them artwork and an app so they can be cards.
    function adoptLegacy(show, d) {
        var item = { title: show.title, year: show.year || (d.first_air_date || '').slice(0, 4) * 1 || undefined,
            type: 'show' };
        return enrich(item).then(function (full) {
            if (!full) return;
            if (!full.image && d.backdrop_path) full.image = 'https://image.tmdb.org/t/p/w780' + d.backdrop_path;
            if (!full.service) return;
            full.liked = true;
            if (!taste.likedItems.some(function (l) { return key(l) === key(show); })) {
                var b = brief(full);
                b.title = show.title;
                b.year = show.year;
                b.liked = true;
                taste.likedItems.push(b);
            }
        });
    }

    // Up to MAX_CONTINUE recently opened titles, then shows with new episodes, MAX_RESUME in all.
    function resumeCards() {
        var now = Date.now();
        var out = [];
        var seen = {};
        taste.history.filter(function (h) {
            var k = key(h);
            return h.openedAt && now - h.openedAt <= CONTINUE_DAYS * DAY_MS && !bad(k) &&
                taste.watched.indexOf(k) === -1;
        }).sort(function (a, b) { return b.openedAt - a.openedAt; }).slice(0, MAX_CONTINUE).forEach(function (h) {
            seen[key(h)] = true;
            out.push({ show: h, badges: ['Continue'], resume: true });
        });
        out.forEach(function (c) {
            var a = taste.airing[key(c.show)];
            if (a && a.badge) c.badges.push(a.badge);
        });
        var shelves = taste.history.concat(taste.likedItems);
        for (var i = 0; i < shelves.length && out.length < MAX_RESUME; i++) {
            var show = shelves[i];
            var k = key(show);
            var a = taste.airing[k];
            if (seen[k] || !a || !a.badge || bad(k) || !show.service) continue;
            seen[k] = true;
            out.push({ show: show, badges: [a.badge], resume: !!show.openedAt });
        }
        return out;
    }

    // ---------- Cards

    function serviceApp(service) {
        var s = (service || '').toLowerCase().replace(/[^a-z0-9+]/g, '');
        var items = Home.homeItems();
        for (var i = 0; i < items.length; i++) {
            var l = items[i].label.toLowerCase().replace(/[^a-z0-9+]/g, '');
            if (l === s || l.indexOf(s) === 0 || s.indexOf(l) === 0) return items[i];
        }
        return null;
    }

    function card(item, extra) {
        var app = serviceApp(item.service);
        var brand = (app && app.brand) || findBrand({ name: item.service || '' });
        var wrap = el('div', 'app show');
        var tile = el('div', 'tile show-tile');
        tile.style.background = brand ? brand.bg : '#2a2f3a';
        if (item.image) {
            var img = new Image();
            img.className = 'show-art';
            img.src = item.image;
            tile.appendChild(img);
            tile.appendChild(el('div', 'show-shade'));
        }
        if (extra && extra.badges) {
            tile.classList.add('badged');
            var pills = el('div', 'show-badges');
            extra.badges.forEach(function (b) {
                pills.appendChild(el('div', 'show-badge' + (b === 'Continue' ? '' : ' new'), b));
            });
            tile.appendChild(pills);
        }
        tile.appendChild(el('div', 'show-title', item.title));
        tile.appendChild(el('div', 'show-meta', (item.type === 'movie' ? 'Movie' : 'Series') +
            (item.year ? ' · ' + item.year : '') + (item.liked ? '  ♥' : '')));
        wrap.appendChild(tile);
        var note = extra ? extra.note : item.reason;
        wrap.appendChild(el('div', 'label', (item.service || '') + (note ? ' · ' + note : '')));
        wrap._item = { kind: 'show', show: item, app: app, resume: !!(extra && extra.resume) };
        return wrap;
    }

    function noteCard(text) {
        var wrap = el('div', 'app show');
        var tile = el('div', 'tile show-tile');
        tile.style.background = 'rgba(255,255,255,0.08)';
        tile.appendChild(el('div', 'show-meta', text));
        wrap.appendChild(tile);
        wrap.appendChild(el('div', 'label', ''));
        wrap._item = { kind: 'show-refresh' };
        return wrap;
    }

    function profileCard() {
        var p = profile();
        var wrap = el('div', 'app show');
        var tile = el('div', 'tile show-tile profile-tile');
        tile.appendChild(el('div', 'profile-avatar', p.name.charAt(0).toUpperCase()));
        tile.appendChild(el('div', 'show-title', p.name));
        tile.appendChild(el('div', 'show-meta', 'Switch profile'));
        tile.style.background = 'linear-gradient(135deg, hsl(' + hueOf(p.name) + ',45%,26%), hsl(' + ((hueOf(p.name) + 40) % 360) + ',55%,38%))';
        wrap.appendChild(tile);
        wrap.appendChild(el('div', 'label', 'Watching as ' + p.name));
        wrap._item = { kind: 'show-profile' };
        return wrap;
    }

    function hueOf(text) {
        var h = 0;
        for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
        return h;
    }

    function switchProfile(id) {
        if (id === profileId) return;
        stopPreview(false);
        profileId = id;
        try { localStorage.setItem(PROFILE_KEY, id); } catch (e) {}
        taste = load();
        log('For you: profile ' + profile().name);
        onChange();
        refresh(false);
        prefetchTrailers();
        setTimeout(checkAiring, 1500);
    }

    // Moods are canned requests; they go through the same path as a typed Ask.
    var MOODS = [
        { label: 'Funny', query: 'something genuinely funny' },
        { label: 'Thriller', query: 'a gripping thriller' },
        { label: 'Short (under 100 min)', query: 'a movie under 100 minutes' },
        { label: 'Family', query: 'something the whole family can watch together' },
        { label: 'Award winners', query: 'award-winning, critically acclaimed picks' },
        { label: 'Comfort rewatch', query: 'cozy comfort viewing, easy to dip into' }
    ];

    function askMenu() {
        var options = [{ label: 'Type a request…', run: openAsk }];
        MOODS.forEach(function (m) {
            options.push({ label: m.label, run: function () { ask(m.query); } });
        });
        UI.menu('What are you in the mood for?', options);
    }

    function askCard() {
        var wrap = el('div', 'app show');
        var tile = el('div', 'tile show-tile ask-tile');
        var icon = el('div', 'ask-icon');
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">' +
            '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
        tile.appendChild(icon);
        tile.appendChild(el('div', 'show-title', 'Ask'));
        tile.appendChild(el('div', 'show-meta', 'Type a request'));
        wrap.appendChild(tile);
        wrap.appendChild(el('div', 'label', 'What are you in the mood for?'));
        wrap._item = { kind: 'show-ask' };
        return wrap;
    }

    function render(row) {
        row.innerHTML = '';
        if (!enabled()) return false;
        var title = document.getElementById('foryou-title');
        if (title) title.textContent = taste.query ? 'For you · “' + taste.query + '”' : 'For you';
        if (profiles.length > 1) row.appendChild(profileCard());
        row.appendChild(askCard());
        var shown = {};
        resumeCards().forEach(function (c) {
            shown[key(c.show)] = true;
            c.note = c.show.openedAt ? openedAgo(c.show.openedAt) : 'You loved it';
            row.appendChild(card(c.show, c));
        });
        taste.items.forEach(function (item) { if (!shown[key(item)]) row.appendChild(card(item)); });
        if (fetching && !taste.items.length) row.appendChild(noteCard('Finding something to watch…'));
        else if (taste.error && !taste.items.length) row.appendChild(noteCard('Suggestions unavailable · OK to retry'));
        else row.appendChild(noteCard(fetching ? 'Updating…' : (taste.query ? '↻  Back to For you' : '↻  New suggestions')));
        return true;
    }

    function openedAgo(at) {
        var days = Math.floor((Date.now() - at) / DAY_MS);
        return days < 1 ? 'Opened today' : days === 1 ? 'Opened yesterday' : 'Opened ' + days + ' days ago';
    }

    function activate(item, launch) {
        if (item.kind === 'show-ask') {
            askMenu();
            return;
        }
        if (item.kind === 'show-profile') {
            UI.menu('Who\'s watching?', profiles.map(function (p) {
                return { label: p.name + (p.kids ? '  (family-safe)' : ''), checked: p.id === profileId,
                    run: function () { switchProfile(p.id); } };
            }));
            return;
        }
        if (item.kind === 'show-refresh') {
            refresh(true);
            onChange();
            return;
        }
        openDetails(item, launch);
    }

    // ---------- Deep links: open the title itself, not just the app
    //
    // Per-service ids come from Wikidata (TMDB external_ids -> wikidata_id -> claims). Only
    // Netflix is wired so far: Samsung's Netflix app takes "m=<id>&source_type=4" as the app
    // control PAYLOAD. Anything else, or a refusal, falls back to opening the app.

    var WIKIDATA_IDS = {
        netflix: ['P1874'],
        disney: ['P7595', 'P7596'],
        prime: ['P8055'],
        hbo: ['P8298'],
        hulu: ['P6466', 'P6467'],
        apple: ['P9586', 'P9751']
    };

    function serviceLinks(item) {
        if (item.links) return Promise.resolve(item.links);
        return findTmdb(item).then(function () {
            if (!item.tmdbId) return {};
            return tmdb('/' + item.kind + '/' + item.tmdbId + '/external_ids').then(function (ext) {
                if (!ext.wikidata_id) return {};
                return new Promise(function (resolve) {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', 'https://www.wikidata.org/wiki/Special:EntityData/' + ext.wikidata_id + '.json', true);
                    xhr.timeout = 10000;
                    xhr.onload = function () {
                        var links = {};
                        try {
                            var ent = JSON.parse(xhr.responseText).entities;
                            var claims = ent[Object.keys(ent)[0]].claims || {};
                            Object.keys(WIKIDATA_IDS).forEach(function (svc) {
                                WIKIDATA_IDS[svc].forEach(function (p) {
                                    var c = claims[p] && claims[p][0] && claims[p][0].mainsnak.datavalue;
                                    if (c && !links[svc]) links[svc] = c.value;
                                });
                            });
                        } catch (e) {}
                        resolve(links);
                    };
                    xhr.onerror = xhr.ontimeout = function () { resolve({}); };
                    xhr.send();
                });
            });
        }).then(function (links) {
            item.links = links;
            save();
            return links;
        }).catch(function () { return {}; });
    }

    function launchWithPayload(appId, payload) {
        return new Promise(function (resolve, reject) {
            var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', null, null, null,
                [new tizen.ApplicationControlData('PAYLOAD', [payload])]);
            tizen.application.launchAppControl(ctrl, appId, resolve, reject);
        });
    }

    function openTitle(item, launch) {
        var show = item.show;
        remember(show, 'opened');
        setTimeout(function () { onChange(); checkAiring(); }, 1500);
        serviceLinks(show).then(function (links) {
            var id = /netflix/i.test(item.app.id + item.app.label) && links.netflix;
            if (!id || !window.tizen) return launch(item.app);
            log('Deep link: Netflix ' + id + ' for ' + show.title);
            noteAppOpen(item.app);
            stopPreview(true);
            launchWithPayload(item.app.id, 'm=' + id + '&source_type=4').then(function () {
                log('Deep link: Netflix accepted');
            }, function (err) {
                log('Deep link failed (' + DevLog.errorText(err) + '), opening app');
                launch(item.app);
            });
        });
    }

    // ---------- Details: description and actions for one card (trailer keeps playing behind)

    var detailsRegistered = false;
    var detailsItem = null;

    function showDetails(item) {
        if (!cfg.tmdbKey) return Promise.resolve(null);
        if (item.details) return Promise.resolve(item.details);
        return findTmdb(item).then(function () {
            if (!item.tmdbId) return null;
            return tmdb('/' + item.kind + '/' + item.tmdbId, { language: 'en-US' }).then(function (d) {
                item.details = {
                    overview: d.overview || '',
                    tagline: d.tagline || '',
                    genres: (d.genres || []).map(function (g) { return g.name; }).slice(0, 3),
                    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
                    runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || null,
                    seasons: d.number_of_seasons || null
                };
                save();
                return item.details;
            });
        }).catch(function () { return null; });
    }

    function metaLine(show, d) {
        var parts = [show.type === 'movie' ? 'Movie' : 'Series'];
        if (show.year) parts.push(show.year);
        if (d && d.seasons) parts.push(d.seasons + (d.seasons === 1 ? ' season' : ' seasons'));
        else if (d && d.runtime) parts.push(Math.floor(d.runtime / 60) ? Math.floor(d.runtime / 60) + 'h ' + (d.runtime % 60) + 'm' : d.runtime + 'm');
        if (d && d.genres.length) parts.push(d.genres.join(', '));
        if (d && d.rating) parts.push('★ ' + d.rating);
        return parts.join('  ·  ');
    }

    function fillDetails(item) {
        var show = item.show;
        var $ = function (id) { return document.getElementById(id); };
        $('d-title').textContent = show.title;
        $('d-meta').textContent = metaLine(show, show.details);
        $('d-reason').textContent = (show.service ? 'On ' + show.service : '') + (show.reason ? '  ·  ' + show.reason : '');
        $('d-overview').textContent = show.details ? (show.details.overview || 'No description available.') : 'Loading description…';
    }

    function detailButtons(item, launch) {
        var show = item.show;
        var list = [];
        if (item.app) list.push({ label: (item.resume ? 'Resume in ' : 'Open in ') + item.app.label, primary: true, run: function () { closeDetails(); openTitle(item, launch); } });
        list.push({ label: show.liked ? '♥  Loved' : '♥  Love it', run: function () {
            rate(show, 'liked');
            renderButtons(item, launch, 1);
        } });
        list.push({ label: '✕  Not for us', run: function () { closeDetails(); rate(show, 'disliked'); } });
        list.push({ label: '✓  Already watched', run: function () { closeDetails(); rate(show, 'watched'); } });
        return list;
    }

    function renderButtons(item, launch, focusIndex) {
        var box = document.getElementById('d-actions');
        box.innerHTML = '';
        detailButtons(item, launch).forEach(function (b) {
            var btn = el('div', 'd-btn' + (b.primary ? ' primary' : ''), b.label);
            btn._item = b;
            box.appendChild(btn);
        });
        if (focusIndex !== undefined) UI.focusOn(box.children[Math.min(focusIndex, box.children.length - 1)]);
    }

    function openDetails(item, launch) {
        if (!detailsRegistered) registerDetails();
        detailsItem = item;
        fillDetails(item);
        renderButtons(item, launch);
        document.documentElement.classList.add('details-open');
        UI.show('details');
        showDetails(item.show).then(function () {
            if (detailsItem === item) fillDetails(item);
        });
        serviceLinks(item.show);    // ready by the time Open is pressed
    }

    function cleanupDetails() {
        detailsItem = null;
        document.documentElement.classList.remove('details-open');
    }

    // UI.back() runs onBack (cleanup), then returns to Home.
    function closeDetails() {
        if (UI.isVisible('details')) UI.back();
        else cleanupDetails();
    }

    function registerDetails() {
        detailsRegistered = true;
        UI.register('details', {
            el: document.getElementById('details'),
            overlay: true,
            hints: [['OK', 'Select'], ['Back', 'Close']],
            rows: function () { return [UI.children(document.getElementById('d-actions'))]; },
            activate: function (b) { b.run(); },
            onBack: function () {
                cleanupDetails();
                return false;
            }
        });
    }

    function reset() {
        taste = blank();
        save();
        onChange();
        refresh(true);
    }

    // ---------- Preview: trailer (or artwork) behind Home while a card is highlighted
    //
    // Artwork shows at once with a slow pan; the trailer (TMDB -> YouTube) fades in as soon as
    // YouTube reports it playing, so a refused embed leaves the artwork rather than an error.
    // Trailer ids are fetched for every card in advance, and with a relay (trailer-host/) one
    // player stays loaded while on Home and just switches videos, so moving along the row
    // starts the next trailer without reloading YouTube.

    var PREVIEW_DELAY_MS = 250;     // only so sweeping along the row doesn't start every card
    var preview = { el: null, timer: null, item: null, frame: null, ready: false, watch: null };

    function previewEl() {
        if (preview.el) return preview.el;
        var box = el('div', '');
        box.id = 'preview';
        box.appendChild(el('div', 'preview-art'));
        box.appendChild(el('div', 'preview-video'));
        box.appendChild(el('div', 'preview-shade'));
        var bg = document.getElementById('bg');
        bg.parentNode.insertBefore(box, bg.nextSibling);
        window.addEventListener('message', onPlayerMessage);
        preview.el = box;
        return box;
    }

    function trailerKey(item) {
        if (item.trailer !== undefined) return Promise.resolve(item.trailer);
        if (!cfg.tmdbKey) return Promise.resolve('');
        return findTmdb(item).then(function () {
            if (!item.tmdbId) return { results: [] };
            return tmdb('/' + item.kind + '/' + item.tmdbId + '/videos', { language: 'en-US' });
        }).then(function (res) {
            var vids = (res.results || []).filter(function (v) { return v.site === 'YouTube'; });
            var rank = function (v) {
                return (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : 2) + (v.official ? 0 : 0.5);
            };
            vids.sort(function (a, b) { return rank(a) - rank(b); });
            item.trailer = vids.length ? vids[0].key : '';
            return item.trailer;
        }).catch(function () { return ''; });
    }

    // Cards cached before trailers existed have no TMDB id yet: look it up once.
    function findTmdb(item) {
        if (item.tmdbId) return Promise.resolve(item);
        var kind = item.type === 'movie' ? 'movie' : 'tv';
        var params = { query: item.title };
        if (item.year) params[kind === 'movie' ? 'year' : 'first_air_date_year'] = item.year;
        return tmdb('/search/' + kind, params).then(function (res) {
            var hit = res.results && res.results[0];
            if (hit) {
                item.tmdbId = hit.id;
                item.kind = kind;
                if (!item.image && hit.backdrop_path) item.image = 'https://image.tmdb.org/t/p/w780' + hit.backdrop_path;
                save();
            }
            return item;
        });
    }

    function prefetchTrailers() {
        if (!cfg.tmdbKey || cfg.previews === false) return;
        resumeCards().forEach(function (c) { trailerKey(c.show); });
        taste.items.forEach(function (item) { trailerKey(item); });
    }

    function relayUrl(key) {
        // k: shared secret checked by trailer-host/middleware.js (set in config.local.js, never committed)
        return cfg.trailerRelay + '?v=' + key + (cfg.trailerSecret ? '&k=' + encodeURIComponent(cfg.trailerSecret) : '') +
            (cfg.trailerSound ? '&sound=1&vol=' + (cfg.trailerVolume || 50) : '');
    }

    function playTrailer(key, item) {
        var box = previewEl();
        box.classList.remove('playing');
        if (preview.frame && cfg.trailerRelay) {
            // Player already loaded: switch video in place.
            preview.frame.contentWindow.postMessage({ arn0: 'load', v: key }, '*');
        } else {
            removeFrame();
            var frame = document.createElement('iframe');
            frame.setAttribute('tabindex', '-1');
            frame.setAttribute('allow', 'autoplay; encrypted-media');
            // YouTube refuses embeds from a packaged app (error 153: no referrer), so go through
            // trailer-host/index.html on a real web origin when one is configured.
            frame.src = cfg.trailerRelay ? relayUrl(key) :
                'https://www.youtube.com/embed/' + key + '?autoplay=1&mute=1&controls=0&disablekb=1' +
                '&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=' + key +
                '&enablejsapi=1';
            frame.onload = function () {
                if (cfg.trailerRelay) return;   // the relay says "listening" to the player itself
                try { frame.contentWindow.postMessage('{"event":"listening","id":1}', '*'); } catch (e) {}
            };
            preview.frame = frame;
            box.querySelector('.preview-video').appendChild(frame);
        }
        log('Preview: trailer ' + key + ' for ' + item.title);
    }

    function startPreview(item) {
        clearTimeout(preview.timer);
        preview.item = item;
        // The previous card's trailer goes at once; never show it behind the new card.
        if (preview.el) preview.el.classList.remove('playing');
        if (preview.frame && cfg.trailerRelay) preview.frame.contentWindow.postMessage({ arn0: 'stop' }, '*');
        preview.timer = setTimeout(function () {
            if (preview.item !== item) return;
            var box = previewEl();
            var art = box.querySelector('.preview-art');
            art.style.backgroundImage = item.image ? 'url("' + item.image.replace('/w780/', '/w1280/') + '")' : 'none';
            // Restart the pan for the new picture.
            box.classList.remove('visible');
            void box.offsetWidth;
            box.classList.add('visible');
            document.documentElement.classList.add('previewing');
            trailerKey(item).then(function (key) {
                if (preview.item !== item) return;
                if (key) playTrailer(key, item);
                else pauseFrame();
            });
            if (!preview.watch) {
                // Leaving Home (Settings, All apps, an app) ends the preview and frees the player.
                preview.watch = setInterval(function () {
                    var v = UI.current();
                    if (document.hidden || (v !== 'home' && v !== 'menu' && v !== 'details')) stopPreview(true);
                }, 500);
            }
        }, PREVIEW_DELAY_MS);
    }

    function onPlayerMessage(e) {
        if (!preview.frame || e.source !== preview.frame.contentWindow) return;
        var data;
        try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
        if (!data || !preview.item) return;
        var playing = data.event === 'onStateChange' ? data.info === 1 :
            data.event === 'infoDelivery' && data.info && data.info.playerState === 1;
        if (playing) preview.el.classList.add('playing');
        if (data.event === 'onError') {
            log('Preview: YouTube refused (' + data.info + '), showing artwork');
            preview.el.classList.remove('playing');
        }
    }

    function pauseFrame() {
        if (preview.frame && cfg.trailerRelay) preview.frame.contentWindow.postMessage({ arn0: 'stop' }, '*');
        else removeFrame();
        if (preview.el) preview.el.classList.remove('playing');
    }

    function removeFrame() {
        if (preview.frame && preview.frame.parentNode) preview.frame.parentNode.removeChild(preview.frame);
        preview.frame = null;
    }

    // full: also unload the player (leaving Home); otherwise it stays warm for the next card.
    function stopPreview(full) {
        clearTimeout(preview.timer);
        preview.item = null;
        if (full) {
            clearInterval(preview.watch);
            preview.watch = null;
            removeFrame();
        } else {
            pauseFrame();
        }
        if (preview.el) preview.el.className = '';
        document.documentElement.classList.remove('previewing');
    }

    function focus(item) {
        if (cfg.previews === false) return;
        if (item && item.kind === 'show') {
            if (preview.item !== item.show) startPreview(item.show);
        } else if (UI.current() === 'home' && preview.item) {
            stopPreview(false);
        }
    }

    // ---------- Ask (Samsung on-screen keyboard; the remote's mic may dictate into it)

    var askRegistered = false;

    function openAsk() {
        if (!askRegistered) registerAsk();
        document.getElementById('ask-input').value = '';
        UI.show('ask');
    }

    function closeAsk(submit) {
        var input = document.getElementById('ask-input');
        var query = input.value.trim().slice(0, 200);
        input.blur();
        UI.back();
        if (!submit || !query) return;
        ask(query);
    }

    function ask(query) {
        taste.asks.push(query);
        if (taste.asks.length > MAX_ASKS) taste.asks.shift();
        save();
        refresh(true, query);
    }

    function registerAsk() {
        askRegistered = true;
        UI.register('ask', {
            el: document.getElementById('ask'),
            overlay: true,
            focusEl: function () { return document.getElementById('ask-input'); },
            hints: [['OK', 'Ask'], ['Back', 'Cancel']],
            onShow: function () {
                setTimeout(function () { document.getElementById('ask-input').focus(); }, 0);
            },
            onKey: function (k) {
                if (k === UI.KEY.ENTER || k === IME_DONE) {
                    closeAsk(true);
                    return true;
                }
                if (k === UI.KEY.BACK || k === UI.KEY.ESC || k === IME_CANCEL) {
                    closeAsk(false);
                    return true;
                }
                return 'pass';
            }
        });
    }

    window.ForYou = {
        enabled: enabled,
        render: render,
        activate: activate,
        refresh: refresh,
        noteAppOpen: noteAppOpen,
        focus: focus,
        stopPreview: function () { stopPreview(true); },
        reset: reset,
        stats: function () {
            return { liked: taste.liked.length, disliked: taste.disliked.length, watched: taste.watched.length };
        },
        onChange: function (fn) { onChange = fn; }
    };
})();
