// ParaDeeJay - actions, hotkeys, menu entries, settings and the shared runtime.
//
// Loaded as an additive patch to MediaMonkey's actions.js, so it runs once in
// the main window at startup. init.js owns the toolbar button and the playback
// listener; everything both files need lives on window.ParaDeeJay.

// The addon's own modules live next to this file and are loaded by init.js.
// Do not use localRequirejs here: MediaMonkey concatenates this file into its own
// `actions` module, where that helper's __scriptName variable is not in scope and
// calling it throws. Everything below reaches the runtime lazily through
// window.ParaDeeJay, so the modules only have to exist by the time a track plays.

(function () {
    'use strict';

    var SETTINGS_KEY = 'paraDeeJay_settings';

    var DEFAULTS = {
        enabled: true,
        voice: 0,                 // index into ParaDeeJayEngine.VOICES
        speed: 1.0,               // 0.5 .. 2.0, fed to the model as its `speed` input
        volume: 0.8,              // 0 .. 1
        fallbackToSystemTts: true, // speak with the OS voice if the model cannot load
        showToolbarButton: true,
        dictionary: [],           // [{ from, to }] names added in the settings dialog
        assetBaseOverride: ''     // where the addon's files live, if auto-detection fails
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

    function toast(message) {
        try {
            uitools.toastMessage.show(message, { disableUndo: true });
        } catch (e) {
            console.log('ParaDeeJay: ' + message);
        }
    }

    // ------------------------------------------------------------- persistence
    //
    // Nothing in MediaMonkey's documentation says whether app.setValue can store
    // an object or only a string, and a value that comes back as a string (or as
    // "[object Object]") makes every read look like a first run: the addon then
    // ignores every setting, including the on/off switch, because it keeps
    // starting from DEFAULTS. So settings are written as a JSON string, read back
    // tolerantly (string or object), and mirrored into localStorage, which the
    // main window and the config dialog share. `rev` decides which copy is newer.

    function parseStored(raw) {
        if (raw === null || raw === undefined || raw === '') return null;
        if (typeof raw === 'object') return raw;
        if (typeof raw === 'string') {
            var text = raw.replace(/^\uFEFF/, '').trim();
            if (text.charAt(0) === '{') {
                try {
                    var parsed = JSON.parse(text);
                    if (parsed && typeof parsed === 'object') return parsed;
                } catch (e) { /* not JSON, treat as absent */ }
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

        s.voice = Math.min(3, Math.max(0, Number(s.voice) | 0));
        s.speed = clamp(s.speed, 0.5, 2);
        s.volume = clamp(s.volume, 0, 1);
        if (!Array.isArray(s.dictionary)) s.dictionary = [];
        return s;
    }

    function saveSettings(s) {
        s.rev = (Number(s.rev) || 0) + 1;
        writeMirror(s);

        try {
            app.setValue(SETTINGS_KEY, JSON.stringify(s));
            if (app.flushState) app.flushState();
        } catch (e) {
            console.error('ParaDeeJay: could not persist settings', e);
        }

        // Confirm the host kept it. If the value came back unreadable, store the
        // object form as a second attempt; the mirror covers it either way.
        var back = readStored();
        if (!back || Number(back.rev) !== s.rev) {
            try {
                app.setValue(SETTINGS_KEY, s);
                if (app.flushState) app.flushState();
            } catch (e) { }
        }
        return s;
    }

    function engine() {
        return window.ParaDeeJayEngine;
    }

    // --------------------------------------------------------- announcement

    function describeTrack(track) {
        if (!track) return '';
        var title = track.title || 'Unknown title';
        var artist = '';
        if (track.artist) {
            artist = (typeof track.artist === 'object') ? track.artist.title : track.artist;
        }
        artist = artist || '';
        return artist ? (title + ' by ' + artist) : title;
    }

    function trackKey(track) {
        if (!track) return '';
        var artist = track.artist
            ? ((typeof track.artist === 'object') ? track.artist.title : track.artist)
            : '';
        return [track.contentID || '', track.title || '', artist || ''].join('|');
    }

    function systemSpeak(text, s) {
        if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
        try {
            window.speechSynthesis.cancel();
            var utterance = new SpeechSynthesisUtterance(text);
            utterance.volume = s.volume;
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.error('ParaDeeJay: system speech failed', e);
        }
    }

    var fallbackWarned = false;

    async function speakText(text, s) {
        var e = engine();
        if (!e) return;
        try {
            var stats = await e.speak(text, { voice: s.voice, speed: s.speed, volume: s.volume, dictionary: s.dictionary });
            if (stats && stats.inferMs) {
                // Keep a quiet record of the last utterance for the settings dialog.
                lastUtterance = stats;
            }
        } catch (err) {
            console.error('ParaDeeJay: synthesis failed', err);
            if (s.fallbackToSystemTts) {
                if (!fallbackWarned) {
                    fallbackWarned = true;
                    toast('ParaDeeJay: local voice unavailable, using the system voice. Run the self-test in the addon settings for details.');
                }
                systemSpeak(text, s);
            }
        }
    }

    var lastUtterance = null;

    function announce(track, force) {
        var s = readSettings();
        if (!force && !s.enabled) return;

        var text = describeTrack(track);
        if (!text) return;

        speakText(text, s);
    }

    var lastKey = '';
    var lastTime = 0;

    function onPlay() {
        var s = readSettings();
        if (!s.enabled) return;

        var track = app.player.getCurrentTrack();
        if (!track) return;

        var key = trackKey(track);
        var now = Date.now();
        if (key === lastKey && (now - lastTime) < 1500) return; // duplicate `play`
        lastKey = key;
        lastTime = now;

        announce(track, false);
    }

    function announceCurrent() {
        var track = app.player.getCurrentTrack();
        if (!track) {
            toast('ParaDeeJay: nothing is playing.');
            return;
        }
        announce(track, true);
    }

    // -------------------------------------------------------------- settings

    function toggle() {
        var s = readSettings();
        s.enabled = !s.enabled;
        saveSettings(s);
        if (!s.enabled && engine()) engine().stop();
        toast('ParaDeeJay: ' + (s.enabled ? 'ON' : 'OFF'));
        notifyChanged();
        return s.enabled;
    }

    function notifyChanged() {
        if (typeof window.ParaDeeJayRefreshToolbar === 'function') {
            try { window.ParaDeeJayRefreshToolbar(); } catch (e) { console.error(e); }
        }
    }

    function applySettings(newSettings) {
        var s = readSettings();
        if (newSettings && typeof newSettings === 'object') {
            for (var k in s) {
                if (Object.prototype.hasOwnProperty.call(s, k) && newSettings[k] !== undefined) {
                    s[k] = newSettings[k];
                }
            }
            s.voice = Math.min(3, Math.max(0, Number(s.voice) | 0));
            s.speed = clamp(s.speed, 0.5, 2);
            s.volume = clamp(s.volume, 0, 1);
        }
        saveSettings(s);
        if (!s.enabled && engine()) engine().stop();
        notifyChanged();
        return s;
    }

    function statusText() {
        var s = readSettings();
        if (!s.enabled) return 'ParaDeeJay: Off \u2014 click to turn on';
        var e = engine();
        var state = e && e.state ? e.state() : null;
        if (!state || state.status === 'idle') return 'ParaDeeJay: On (model loads on the first track)';
        if (state.status === 'ready') return 'ParaDeeJay: On \u2014 local voice ready';
        if (state.status === 'error') return 'ParaDeeJay: voice failed to load \u2014 see settings';
        return 'ParaDeeJay: loading voice\u2026';
    }

    // MediaMonkey's addon list is a native list. Reading it with getValue()
    // outside a read lock throws "Read lock not acquired!": the loop has to run
    // inside locked() (see controls/artworklist.js in MediaMonkey), which is
    // what forEach() does for us when it is available.
    function scanForOwnAddon(list) {
        var addon = null;
        var check = function (item) {
            if (!addon && item && String(item.ext_id).toLowerCase() === 'paradeejay') addon = item;
        };

        try {
            if (typeof list.forEach === 'function') {
                list.forEach(check);
            } else {
                list.locked(function () {
                    for (var i = 0; i < list.count; i++) check(list.getValue(i));
                });
            }
        } catch (e) {
            console.error('ParaDeeJay: could not read the addon list', e);
        }
        return addon;
    }

    function openSettings() {
        // The filtered list is the one the bundled customNodes sample uses; the
        // unfiltered list is the fallback if that filter ever stops matching.
        var filters = [['all', 'all', 'justInstalled'], ['all']];

        function tryList(index) {
            if (index >= filters.length) {
                toast('ParaDeeJay: could not find the addon entry.');
                return;
            }

            var list = null;
            try {
                list = app.getAddonList.apply(app, filters[index]);
            } catch (e) {
                console.error('ParaDeeJay: could not read the addon list', e);
            }
            if (!list) { tryList(index + 1); return; }

            list.whenLoaded().then(function () {
                var addon = scanForOwnAddon(list);
                if (addon) uitools.openDialog('dlgAddonConfig', { modal: true, addon: addon });
                else tryList(index + 1);
            });
        }

        tryList(0);
    }

    async function diagnostics() {
        var lines = [];
        try {
            if (window.ParaDeeJayPlatform) lines.push(await window.ParaDeeJayPlatform.diagnostics());
            else lines.push('platform module is not loaded');

            try {
                lines.push('');
                lines.push('Settings (' + SETTINGS_KEY + '):');
                var raw = app.getValue(SETTINGS_KEY, null);
                lines.push('  stored: ' + (raw === null || raw === undefined ? 'empty' : typeof raw) +
                    ' ' + JSON.stringify(parseStored(raw)));
                lines.push('  mirror: ' + JSON.stringify(readMirror()));
                lines.push('  in use: ' + JSON.stringify(readSettings()));

                var probeKey = SETTINGS_KEY + '_probe';
                app.setValue(probeKey, JSON.stringify({ rev: 1, ok: true }));
                var round = parseStored(app.getValue(probeKey, null));
                lines.push('  string round-trip: ' + (round && round.ok === true ? 'ok' : 'FAILED'));
                if (app.deleteValue) { try { app.deleteValue(probeKey); } catch (e3) { } }
            } catch (probeErr) {
                lines.push('  settings probe failed: ' + (probeErr && probeErr.message || probeErr));
            }

            var e = engine();
            if (e) {
                e.setBase(null); // re-detect from scratch
                try {
                    await e.ensureRuntime();
                    lines.push('');
                    lines.push('Engine: ready (' + e.state().base + ')');
                } catch (err) {
                    lines.push('');
                    lines.push('Engine: FAILED');
                    lines.push(String(err && err.message || err));
                }
            }
        } catch (err) {
            lines.push('Self-test crashed: ' + (err && err.message || err));
        }
        return lines.join('\n');
    }

    function showDiagnostics() {
        diagnostics().then(function (text) {
            console.log('ParaDeeJay self-test\n' + text);
            messageDlg(text, 'information', ['btnOK'], { title: 'ParaDeeJay self-test', defaultButton: 'btnOK' }, undefined);
        });
    }

    // Called from config.js, which lives in the config dialog's own window.
    window.ParaDeeJayApplySettings = function (settings) {
        return applySettings(settings);
    };

    // Test button in the settings dialog.
    window.ParaDeeJayTest = function (settings) {
        var s = applySettings(settings);
        speakText('Paradee is a small voice that runs anywhere. This is how track announcements will sound.', s);
    };

    window.ParaDeeJayLastUtterance = function () { return lastUtterance; };
    window.ParaDeeJayStatus = function () { return statusText(); };

    window.ParaDeeJay = {
        SETTINGS_KEY: SETTINGS_KEY,
        DEFAULTS: DEFAULTS,
        read: readSettings,
        save: saveSettings,
        applySettings: applySettings,
        onPlay: onPlay,
        announce: announce,
        announceCurrent: announceCurrent,
        toggle: toggle,
        statusText: statusText,
        openSettings: openSettings,
        diagnostics: diagnostics,
        engine: engine
    };

    // --------------------------------------------------------------- actions

    actions.paraDeeJay_toggle = {
        title: 'ParaDeeJay',
        hotkeyTitle: 'Turn ParaDeeJay track announcements on/off',
        icon: 'para-deejay',
        hotkeyAble: true,
        checkable: true,
        checked: function () { return readSettings().enabled; },
        execute: function () { toggle(); }
    };

    actions.paraDeeJay_speakCurrent = {
        title: 'Announce current track (ParaDeeJay)',
        icon: 'para-deejay',
        hotkeyAble: true,
        execute: function () { announceCurrent(); }
    };

    actions.paraDeeJay_testVoice = {
        title: 'Test the local voice',
        hotkeyAble: false,
        execute: function () {
            var s = readSettings();
            speakText('Paradee is a small voice that runs anywhere.', s);
        }
    };

    actions.paraDeeJay_diagnostics = {
        title: 'ParaDeeJay self-test\u2026',
        icon: 'para-deejay',
        hotkeyAble: false,
        execute: function () { showDiagnostics(); }
    };

    actions.paraDeeJay_settings = {
        title: 'ParaDeeJay settings\u2026',
        icon: 'para-deejay',
        hotkeyAble: false,
        execute: function () { openSettings(); }
    };

    // Ctrl+Shift+9 / 8. Track Announcer uses 0, 1 and 2, so these do not collide.
    hotkeys.addHotkey('Ctrl+Shift+9', 'paraDeeJay_toggle', false);
    hotkeys.addHotkey('Ctrl+Shift+8', 'paraDeeJay_speakCurrent', false);

    // Play > ParaDeeJay, falling back to Tools. Both menus are plain
    // {action: {submenu: []}} objects defined in MediaMonkey's actions.js, so the
    // same push works for either; Play is where a playback switch belongs.
    var menuTarget = null;
    ['play', 'tools'].forEach(function (name) {
        if (menuTarget !== null) return;
        var item = window._menuItems && window._menuItems[name];
        if (item && item.action && Array.isArray(item.action.submenu)) menuTarget = item.action.submenu;
    });

    if (menuTarget) {
        menuTarget.push({
            action: {
                title: 'ParaDeeJay',
                icon: 'para-deejay',
                submenu: [
                    { action: actions.paraDeeJay_toggle, order: 10, grouporder: 10 },
                    { action: actions.paraDeeJay_speakCurrent, order: 20, grouporder: 20 },
                    { action: actions.paraDeeJay_testVoice, order: 10, grouporder: 30 },
                    { action: actions.paraDeeJay_settings, order: 20, grouporder: 30 },
                    { action: actions.paraDeeJay_diagnostics, order: 30, grouporder: 30 }
                ]
            },
            order: 910,
            grouporder: 90
        });
    }
})();
