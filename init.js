// ParaDeeJay - toolbar button and playback listener.
// Actions, hotkeys, the Tools menu and the runtime live in actions_add.js.
requirejs('actions');

// MediaMonkey only runs init.js, actions_add.js, config.js and upgrade.js from an
// addon folder, so the runtime modules have to be pulled in here.
//
// The documented helper, localRequirejs, forwards a __scriptName variable that is
// not in scope when the addon's code is evaluated (calling it aborts the host
// with "ReferenceError: __scriptName is not defined"), so it is tried first but
// never trusted: if it fails, the same files are loaded with plain <script> tags
// from whichever candidate folder answers.
(function () {
    'use strict';

    var MODULES = ['platform', 'g2p', 'engine'];

    function wait(fn, ms) {
        return (window.requestTimeout || window.setTimeout)(fn, ms);
    }

    function hasAll() {
        return !!(window.ParaDeeJayPlatform && window.ParaDeeJayG2P && window.ParaDeeJayEngine);
    }

    function loadByTag(url) {
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = url;
            script.async = false;
            script.onload = function () { resolve(); };
            script.onerror = function () { reject(new Error('could not load ' + url)); };
            document.head.appendChild(script);
        });
    }

    // The remembered folder comes first: platform.js stores it after a successful
    // load, which makes every run after the first one a single request.
    function candidateBases() {
        var list = [];
        try {
            var stored = app.getValue('paraDeeJay_assetBase', '');
            if (stored) list.push(String(stored));
        } catch (e) { }

        // install.js records where MediaMonkey put the addon; that path is the
        // most reliable answer on a first run.
        try {
            var installPath = app.getValue('paraDeeJay_installPath', '');
            if (installPath) {
                var asUrl = String(installPath).replace(/\\/g, '/');
                if (!/^[a-z][a-z0-9+.-]*:/i.test(asUrl)) asUrl = 'file:///' + asUrl.replace(/^\/+/, '');
                list.push(asUrl);
            }
        } catch (e) { }

        list.push('scripts/paraDeeJay/', 'paraDeeJay/', './');

        var seen = {};
        return list
            .map(function (base) { return base.replace(/\/?$/, '/'); })
            .filter(function (base) {
                if (seen[base]) return false;
                seen[base] = true;
                return true;
            });
    }

    function viaLocalRequirejs() {
        return new Promise(function (resolve) {
            var settled = false;
            function finish(ok) { if (!settled) { settled = true; resolve(ok); } }

            try {
                if (typeof localRequirejs !== 'function') return finish(false);
                if (typeof window.__scriptName === 'undefined') window.__scriptName = 'paraDeeJay';
                localRequirejs(MODULES, function () { finish(hasAll()); }, false);
                wait(function () { finish(hasAll()); }, 2000);
            } catch (e) {
                console.warn('ParaDeeJay: localRequirejs unavailable, loading by script tag', e);
                finish(false);
            }
        });
    }

    function viaScriptTags(bases, index) {
        if (index >= bases.length) return Promise.resolve(false);

        var base = bases[index];
        return MODULES.reduce(function (chain, name) {
            return chain.then(function () { return loadByTag(base + name + '.js'); });
        }, Promise.resolve()).then(function () {
            // Same folder answered for every module, so it is the addon's.
            if (window.ParaDeeJayEngine && !window.ParaDeeJayEngine.state().base) {
                window.ParaDeeJayEngine.setBase(base);
            }
            return true;
        }).catch(function () {
            return viaScriptTags(bases, index + 1);
        });
    }

    if (!hasAll()) {
        viaLocalRequirejs().then(function (ok) {
            return ok ? true : viaScriptTags(candidateBases(), 0);
        }).then(function (ok) {
            if (!ok) {
                console.error('ParaDeeJay: could not load its own modules; ' +
                    'the self-test in the addon settings reports where they are looked for');
            }
        }).catch(function (e) {
            console.error('ParaDeeJay: module loading failed', e);
        });
    }
})();

(function () {
    'use strict';

    var toolbarIcon = null;

    function setCheckedState(el, checked) {
        if (!el) return;
        if (checked) el.setAttribute('data-checked', '1');
        else el.removeAttribute('data-checked');
    }

    function updateToolbarState() {
        if (!toolbarIcon || !window.ParaDeeJay) return;

        var settings = window.ParaDeeJay.read();
        var tip = window.ParaDeeJay.statusText();
        var button = toolbarIcon.querySelector('.toolButton') || toolbarIcon;

        button.classList.add('checkable');
        setCheckedState(toolbarIcon, settings.enabled);
        setCheckedState(button, settings.enabled);
        button.style.opacity = settings.enabled ? '1' : '0.45';

        toolbarIcon.setAttribute('data-tip', tip);
        toolbarIcon.setAttribute('data-aria-label', tip);

        var svg = toolbarIcon.querySelector('svg');
        if (svg) svg.setAttribute('aria-label', tip);
    }

    function removeToolbarButton() {
        if (!toolbarIcon) return;
        if (toolbarIcon.parentNode) toolbarIcon.parentNode.removeChild(toolbarIcon);
        toolbarIcon = null;
    }

    // Called by actions_add.js whenever the settings change.
    window.ParaDeeJayRefreshToolbar = function () {
        if (!window.ParaDeeJay) return;

        var settings = window.ParaDeeJay.read();

        if (!settings.showToolbarButton) {
            removeToolbarButton();
            return;
        }

        if (!toolbarIcon) {
            toolbarIcon = window.uitools.addToolButton('righttoolbuttons', 'para-deejay', function () {
                actions.paraDeeJay_toggle.execute();
            }, window.ParaDeeJay.statusText());

            toolbarIcon.controlClass.contextMenu = new Menu([
                { action: actions.paraDeeJay_toggle, order: 10, grouporder: 10 },
                { action: actions.paraDeeJay_speakCurrent, order: 20, grouporder: 20 },
                { action: actions.paraDeeJay_testVoice, order: 10, grouporder: 30 },
                { action: actions.paraDeeJay_settings, order: 20, grouporder: 30 }
            ]);
        }

        updateToolbarState();
    };

    window.whenReady(function () {
        window.ParaDeeJayRefreshToolbar();

        // Announce on `play` only: at `trackChanged` the new track is not loaded
        // yet, while the `play` that follows always is.
        app.listen(app.player, 'playbackState', function (state) {
            if (state === 'play' && window.ParaDeeJay) {
                window.ParaDeeJay.onPlay();
            }
        });

        // Build the runtime in the background so the first announcement does not
        // pay the 1.5 s session-creation cost.
        window.requestTimeout(function () {
            var engine = window.ParaDeeJay && window.ParaDeeJay.engine();
            if (engine) engine.warm();
        }, 4000);
    });
})();
