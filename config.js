// ParaDeeJay - settings page (Tools > Addons > ParaDeeJay > Configure).
// Runs in the config dialog's own window; the main window is reached through
// app.dialogs.getMainWindow(), which owns the engine.

(function () {
    'use strict';

    var SETTINGS_KEY = 'paraDeeJay_settings';

    var VOICES = [
        'af_heart \u2014 American, warm (default)',
        'bf_isabella \u2014 British, light',
        'am_puck \u2014 American, brighter',
        'bm_fable \u2014 British, deeper'
    ];

    var DEFAULTS = {
        enabled: true,
        voice: 0,
        speed: 1.0,
        volume: 0.8,
        fallbackToSystemTts: true,
        showToolbarButton: true,
        assetBaseOverride: ''
    };

    function clone(obj) {
        var res = {};
        for (var k in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) res[k] = obj[k];
        }
        return res;
    }

    function clamp(value, min, max) {
        value = Number(value);
        if (!isFinite(value)) value = min;
        return Math.min(max, Math.max(min, value));
    }

    function readSettings() {
        var s = app.getValue(SETTINGS_KEY, null);
        if (!s || typeof s !== 'object') s = clone(DEFAULTS);

        for (var k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && s[k] === undefined) {
                s[k] = DEFAULTS[k];
            }
        }

        s.voice = clamp(s.voice, 0, VOICES.length - 1) | 0;
        s.speed = clamp(s.speed, 0.5, 2);
        s.volume = clamp(s.volume, 0, 1);
        return s;
    }

    function mainWindow() {
        try { return app.dialogs.getMainWindow(); } catch (e) { return null; }
    }

    function collect(UI) {
        return {
            enabled: !!UI.chbEnabled.controlClass.checked,
            showToolbarButton: !!UI.chbShowToolbar.controlClass.checked,
            fallbackToSystemTts: !!UI.chbFallback.controlClass.checked,
            voice: clamp(UI.cbVoice.controlClass.focusedIndex, 0, VOICES.length - 1) | 0,
            speed: clamp(UI.slSpeed.controlClass.value / 100, 0.5, 2),
            volume: clamp(UI.slVolume.controlClass.value / 100, 0, 1)
        };
    }

    function updateLabels(UI) {
        UI.lblSpeed.textContent = (Math.round(UI.slSpeed.controlClass.value) / 100).toFixed(2) + 'x';
        UI.lblVolume.textContent = Math.round(UI.slVolume.controlClass.value) + '%';
    }

    function callInMainWindow(name, arg) {
        var win = mainWindow();
        if (!win) return null;
        var fn = win.getValue(name);
        if (typeof fn !== 'function') return null;
        try { return fn(arg); } catch (e) { console.error('ParaDeeJay: ' + name + ' failed', e); return null; }
    }

    // Report what the engine is doing without needing a cross-window promise.
    function pollStatus(UI) {
        var win = mainWindow();
        var label = 'The voice loads the first time a track plays.';

        if (win && win.getValue) {
            var engine = win.getValue('ParaDeeJayEngine');
            if (engine && engine.state) {
                var state = engine.state();
                if (state.status === 'ready') {
                    label = 'Local voice ready';
                    if (state.last) {
                        label += ' \u2014 last: ' + state.last.inferMs + ' ms for ' +
                            state.last.audioSec + ' s (' + state.last.realtime + 'x realtime)';
                    }
                } else if (state.status === 'error') {
                    label = 'Voice failed to load: ' + (state.error && state.error.message || state.error);
                } else if (state.status !== 'idle') {
                    label = 'Loading\u2026 (' + state.status + ')';
                }
            }
        }

        if (UI.lblStatus) UI.lblStatus.textContent = label;

        setTimeout(function () {
            if (!UI.lblStatus || !document.body.contains(UI.lblStatus)) return;
            pollStatus(UI);
        }, 700);
    }

    window.configInfo = {
        load: function (panel, addon) {
            var UI = getAllUIElements(panel);
            var s = readSettings();

            UI.chbEnabled.controlClass.checked = !!s.enabled;
            UI.chbShowToolbar.controlClass.checked = !!s.showToolbarButton;
            UI.chbFallback.controlClass.checked = !!s.fallbackToSystemTts;

            var ds = newStringList(true);
            for (var i = 0; i < VOICES.length; i++) ds.add(VOICES[i]);
            UI.cbVoice.controlClass.dataSource = ds;
            UI.cbVoice.controlClass.focusedIndex = s.voice;

            UI.slSpeed.controlClass.value = Math.round(s.speed * 100);
            UI.slVolume.controlClass.value = Math.round(s.volume * 100);
            updateLabels(UI);

            window.localListen(UI.slSpeed, 'livechange', function () { updateLabels(UI); });
            window.localListen(UI.slVolume, 'livechange', function () { updateLabels(UI); });

            window.localListen(UI.btnTest, 'click', function () {
                callInMainWindow('ParaDeeJayTest', collect(UI));
            });

            window.localListen(UI.btnDiagnostics, 'click', function () {
                var win = mainWindow();
                if (win && win.getValue) {
                    var run = win.getValue('ParaDeeJayDiagnosticsRun');
                    if (typeof run === 'function') { run(); return; }
                }
            });

            pollStatus(UI);
        },

        save: function (panel, addon) {
            var UI = getAllUIElements(panel);
            var settings = collect(UI);

            app.setValue(SETTINGS_KEY, settings);
            if (app.flushState) app.flushState();

            callInMainWindow('ParaDeeJayApplySettings', settings);
        }
    };
})();
