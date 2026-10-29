/*
 * Return-to-launcher watcher (experimental, Tizen web service app).
 *
 * The launcher cannot be the system Home, so leaving an app lands on Samsung Home
 * (com.samsung.tv.csfs). This service listens for app status changes and, when Samsung Home
 * becomes active right after a content app (a store app, Netflix, Prime Video, Apple TV),
 * reopens the launcher. Arriving at Samsung Home from the launcher itself, from settings or
 * from any other Samsung system app is left alone, so Samsung Home stays reachable.
 *
 * Started by the launcher on every boot (js/boot.js). Stop it by uninstalling the launcher.
 */
var LAUNCHER = 'Arn0Lnchr0.Launcher';
var SAMSUNG_HOME = 'com.samsung.tv.csfs';
var CONTENT_APP = /^([A-Za-z0-9]{10}\.[A-Za-z0-9]+|org\.tizen\.(netflix-app|primevideo)|com\.samsung\.tv\.(aria-video|tvplus|tvPlusDeeplinker))$/;
var LOG_URL = null; // e.g. 'http://10.0.0.200:8099/log' while debugging (npm run devlog)

var NOT_CONTENT = /service|worker|preview|tiles|companion|agent|deeplink.*bg/i;
var POLL_MS = 1000;

var timer = null;
var running = {};     // content app ids running on the previous poll

function isContent(appId) {
    return appId !== LAUNCHER && CONTENT_APP.test(appId) && !NOT_CONTENT.test(appId);
}

function returnToLauncher() {
    tizen.application.launch(LAUNCHER, function () {
        log('relaunched launcher');
    }, function (err) {
        log('relaunch failed', String(err && err.message));
    });
}

/*
 * The 2020 Premiere accepts addAppStatusChangeListener but never fires it, so poll instead:
 * when the last running content app goes away (Back/Exit closes it) and Samsung Home is
 * running, the user has landed on Samsung Home, so bring the launcher back.
 * Apps left running in the background by the Home button are not caught by this.
 */
function poll() {
    try {
        pollOnce();
    } catch (e) {
        log('poll threw', String(e && (e.name + ': ' + e.message)));
        if (timer) clearInterval(timer);
        timer = null;
    }
}

function pollOnce() {
    tizen.application.getAppsContext(function (contexts) {
        var now = {};
        var home = false;
        contexts.forEach(function (c) {
            if (isContent(c.appId)) now[c.appId] = true;
            if (c.appId === SAMSUNG_HOME) home = true;
        });
        var closed = Object.keys(running).filter(function (id) { return !now[id]; });
        if (closed.length && !Object.keys(now).length) {
            log('closed ' + closed.join(',') + (home ? ', Samsung Home running' : ''));
            returnToLauncher();
        }
        running = now;
    }, function (err) {
        log('getAppsContext failed', String(err && err.message));
    });
}

module.exports.onStart = function () {
    log('started');
    poll();
    timer = setInterval(poll, POLL_MS);
};

module.exports.onRequest = function () {
    // The launcher pings the service on every start; make sure polling is running.
    log('ping' + (timer ? '' : ', starting poll'));
    if (!timer) {
        poll();
        timer = setInterval(poll, POLL_MS);
    }
};

module.exports.onExit = function () {
    if (timer) clearInterval(timer);
    log('exit');
};
