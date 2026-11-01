// ParaDeeJay - records where the addon was installed so the runtime can find its
// model even if the page-relative guess is wrong. Runs once, at install time,
// where MediaMonkey provides window.__currentAddonPath.

(function () {
    'use strict';

    try {
        if (window.__currentAddonPath) {
            app.setValue('paraDeeJay_installPath', window.__currentAddonPath);
            if (app.flushState) app.flushState();
            console.log('ParaDeeJay: install path ' + window.__currentAddonPath);
        }
    } catch (e) {
        console.error('ParaDeeJay: could not record the install path', e);
    }
})();
