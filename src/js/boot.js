/* Start-up order: UI core, Settings views, then Home (which shows itself). */
(function () {
    'use strict';

    function fitPreview() {
        if (!window.__TIZEN_MOCK__) return;
        document.documentElement.classList.add('preview');
        var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        document.getElementById('stage').style.transform = 'scale(' + scale + ')';
    }

    fitPreview();
    window.addEventListener('resize', fitPreview);

    UI.init();
    Settings.init();
    Screensaver.init();
    Weather.start();
    Home.init();

    // Experimental: start the background watcher that brings the launcher back after an app
    // exits to Samsung Home (service/watcher.js). Harmless if the TV refuses services.
    if (!window.__TIZEN_MOCK__ && window.tizen && tizen.application) {
        try {
            tizen.application.launchAppControl(
                new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
                'Arn0Lnchr0.Watcher',
                function () { DevLog && DevLog.log && DevLog.log('watcher started'); },
                function (e) { DevLog && DevLog.log && DevLog.log('watcher failed: ' + (e && e.message)); }
            );
        } catch (e) {
            // No service support: the launcher works as before.
        }
    }

    // Preview only: open a screen directly, e.g. http://localhost:8080/#settings
    var view = location.hash.slice(1);
    if (window.__TIZEN_MOCK__ && view) {
        try {
            UI.show(view);
        } catch (e) {
            // Unknown screen name: stay on Home.
        }
    }
})();
