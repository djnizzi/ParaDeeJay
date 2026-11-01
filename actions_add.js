// ParaDeeJay - actions, hotkeys, menu entries, settings and the shared runtime.
//
// Loaded as an additive patch to MediaMonkey's actions.js, so it runs once in
// the main window at startup. init.js owns the toolbar button and the playback
// listener; everything both files need lives on window.ParaDeeJay.

// The addon's own modules live next to this file. localRequirejs evaluates them
// in the main window; they must be loaded before requirejs() is called so that
// __scriptName still points at this addon.
if (typeof localRequirejs === 'function') {
    localRequirejs('platform');
    localRequirejs('g2p');
    localRequirejs('engine');
}

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

    function readSettings() {
        var s = app.getValue(SETTINGS_KEY, null);
        if (!s || typeof s !== 'object') s = clone(DEFAULTS);

        for (var k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && s[k] === undefined) {
                s[k] = DEFAULTS[k];
            }
        }

        s.voice = Math.min(3, Math.max(0, Number(s.voice) | 0));
        s.speed = clamp(s.speed, 0.5, 2);
        s.volume = clamp(s.volume, 0, 1);
        return s;
    }

    function saveSettings(s) {
        app.setValue(SETTINGS_KEY, s);
        if (app.flushState) app.flushState();
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
            var stats = await e.speak(text, { voice: s.voice, speed: s.speed, volume: s.volume });
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

    function openSettings() {
        var list = app.getAddonList('all');
        list.whenLoaded().then(function () {
            var addon = null;
            for (var i = 0; i < list.count; i++) {
                var item = list.getValue(i);
                if (item && item.ext_id === 'paraDeeJay') { addon = item; break; }
            }
            if (!addon) {
                toast('ParaDeeJay: could not find the addon entry.');
                return;
            }
            uitools.openDialog('dlgAddonConfig', { modal: true, addon: addon });
        });
    }

    async function diagnostics() {
        var lines = [];
        try {
            if (window.ParaDeeJayPlatform) lines.push(await window.ParaDeeJayPlatform.diagnostics());
            else lines.push('platform module is not loaded');

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

    // Tools > ParaDeeJay
    if (window._menuItems && window._menuItems.tools && window._menuItems.tools.action &&
        Array.isArray(window._menuItems.tools.action.submenu)) {
        window._menuItems.tools.action.submenu.push({
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
