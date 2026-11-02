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
        dictionary: [],
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

    // The settings are stored as a JSON string and mirrored into localStorage;
    // see the persistence notes in actions_add.js. Reading both forms keeps the
    // dialog in step with the main window whichever one the host keeps.
    function parseStored(raw) {
        if (raw === null || raw === undefined || raw === '') return null;
        if (typeof raw === 'object') return raw;
        if (typeof raw === 'string') {
            var text = raw.replace(/^\uFEFF/, '').trim();
            if (text.charAt(0) === '{') {
                try {
                    var parsed = JSON.parse(text);
                    if (parsed && typeof parsed === 'object') return parsed;
                } catch (e) { }
            }
        }
        return null;
    }

    function readStored() {
        try { return parseStored(app.getValue(SETTINGS_KEY, null)); } catch (e) { return null; }
    }

    function readMirror() {
        try {
            return parseStored(window.localStorage ? window.localStorage.getItem(SETTINGS_KEY) : null);
        } catch (e) { return null; }
    }

    function readBoth() {
        var stored = readStored();
        var mirror = readMirror();
        if (!stored) return mirror;
        if (!mirror) return stored;
        return (Number(mirror.rev) || 0) > (Number(stored.rev) || 0) ? mirror : stored;
    }

    function writeMirror(s) {
        try { if (window.localStorage) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { }
    }

    function readSettings() {
        var s = readBoth();
        if (!s) s = clone(DEFAULTS);

        for (var k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && s[k] === undefined) {
                s[k] = DEFAULTS[k];
            }
        }

        s.voice = clamp(s.voice, 0, VOICES.length - 1) | 0;
        s.speed = clamp(s.speed, 0.5, 2);
        s.volume = clamp(s.volume, 0, 1);
        if (!Array.isArray(s.dictionary)) s.dictionary = [];
        return s;
    }

    // --------------------------------------------------------------- names
    //
    // Two-column editor for the pronunciation dictionary. MediaMonkey's config
    // controls are all single-line (Edit builds an <input>), so these rows are
    // plain DOM, styled by the rules in config.html.

    var MAX_ENTRIES = 200;

    function dictBox(panel) {
        try { return panel.querySelector('#pdjDictRows'); } catch (e) { return null; }
    }

    function addRow(box, from, to) {
        var row = document.createElement('div');
        row.className = 'pdj-name-row';

        var written = document.createElement('input');
        written.type = 'text';
        written.className = 'pdj-name-input';
        written.placeholder = 'as written, e.g. R\u00dcF\u00dcS';
        written.value = from || '';

        var spoken = document.createElement('input');
        spoken.type = 'text';
        spoken.className = 'pdj-name-input';
        spoken.placeholder = 'as it should sound, e.g. Rufus doo sol';
        spoken.value = to || '';

        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pdj-name-remove';
        remove.title = 'Remove this name';
        remove.textContent = '\u00d7';
        remove.addEventListener('click', function () {
            if (row.parentNode) row.parentNode.removeChild(row);
        });

        row.appendChild(written);
        row.appendChild(spoken);
        row.appendChild(remove);
        box.appendChild(row);
        return row;
    }

    function renderRows(panel, entries) {
        var box = dictBox(panel);
        if (!box) return;
        box.innerHTML = '';
        var list = Array.isArray(entries) ? entries : [];
        for (var i = 0; i < list.length && i < MAX_ENTRIES; i++) {
            var item = list[i] || {};
            var from = item.from !== undefined ? item.from : item[0];
            var to = item.to !== undefined ? item.to : item[1];
            if (!from && !to) continue;
            addRow(box, from, to);
        }
    }

    // Half-filled rows are dropped rather than saved, so a stray keystroke in the
    // Add row does not leave a rule that can never match.
    function readRows(panel) {
        var box = dictBox(panel);
        var out = [];
        if (!box) return out;
        var rows = box.querySelectorAll('.pdj-name-row');
        for (var i = 0; i < rows.length && out.length < MAX_ENTRIES; i++) {
            var inputs = rows[i].querySelectorAll('.pdj-name-input');
            if (inputs.length < 2) continue;
            var from = String(inputs[0].value || '').trim();
            var to = String(inputs[1].value || '').trim();
            if (!from || !to) continue;
            out.push({ from: from.slice(0, 80), to: to.slice(0, 120) });
        }
        return out;
    }

    function mainWindow() {
        try { return app.dialogs.getMainWindow(); } catch (e) { return null; }
    }

    function collect(UI, panel) {
        return {
            enabled: !!UI.chbEnabled.controlClass.checked,
            showToolbarButton: !!UI.chbShowToolbar.controlClass.checked,
            fallbackToSystemTts: !!UI.chbFallback.controlClass.checked,
            voice: clamp(UI.cbVoice.controlClass.focusedIndex, 0, VOICES.length - 1) | 0,
            speed: clamp(UI.slSpeed.controlClass.value / 100, 0.5, 2),
            volume: clamp(UI.slVolume.controlClass.value / 100, 0, 1),
            dictionary: readRows(panel)
        };
    }

    function updateLabels(UI) {
        UI.lblSpeed.textContent = (Math.round(UI.slSpeed.controlClass.value) / 100).toFixed(2) + 'x';
        UI.lblVolume.textContent = Math.round(UI.slVolume.controlClass.value) + '%';
    }

    // MediaMonkey windows are reached through getValue() in the samples, but
    // that is really its settings lookup; try the plain property too so the
    // hand-off survives either way.
    function callInMainWindow(name, arg) {
        var win = mainWindow();
        if (!win) return null;

        var fn = null;
        try { fn = win.getValue(name); } catch (e) { }
        if (typeof fn !== 'function') {
            try { fn = win[name]; } catch (e) { }
        }
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

            renderRows(panel, s.dictionary);

            window.localListen(UI.btnAddName, 'click', function () {
                var box = dictBox(panel);
                if (!box) return;
                var row = addRow(box, '', '');
                var input = row.querySelector('.pdj-name-input');
                if (input) input.focus();
            });

            // The CSV is built in the main window, where dictionary.js is loaded;
            // the rows are taken from the panel so unsaved edits are included.
            window.localListen(UI.btnExportNames, 'click', function () {
                callInMainWindow('ParaDeeJayExportNames', readRows(panel));
            });

            window.localListen(UI.btnTest, 'click', function () {
                callInMainWindow('ParaDeeJayTest', collect(UI, panel));
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
            // Merge into what is already stored instead of replacing it, so keys
            // the dialog does not show (assetBaseOverride) survive a save.
            var previous = readBoth() || {};
            var settings = clone(previous);
            var collected = collect(UI, panel);
            for (var k in collected) {
                if (Object.prototype.hasOwnProperty.call(collected, k) && collected[k] !== undefined) {
                    settings[k] = collected[k];
                }
            }
            settings.rev = (Number(previous.rev) || 0) + 1;

            writeMirror(settings);
            try {
                app.setValue(SETTINGS_KEY, JSON.stringify(settings));
                if (app.flushState) app.flushState();
            } catch (e) {
                console.error('ParaDeeJay: could not persist settings from the dialog', e);
            }

            callInMainWindow('ParaDeeJayApplySettings', settings);
        }
    };
})();
