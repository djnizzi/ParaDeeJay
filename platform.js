// ParaDeeJay - locating the addon's own files at runtime.
//
// MediaMonkey loads addon code by evaluating it in the main window, so `fetch`
// and relative URLs resolve against MediaMonkey's own document, not against the
// addon folder. Nothing documents a "give me a URL for my file" API, so we
// probe the handful of plausible locations once, remember the one that answers,
// and expose a self-test so a failed install can be diagnosed from the UI
// instead of the debugger.

(function (global) {
    'use strict';

    var ID = 'paraDeeJay';
    var BASE_KEY = 'paraDeeJay_assetBase';
    var PATH_KEY = 'paraDeeJay_installPath';
    var SETTINGS_KEY = 'paraDeeJay_settings';
    var PROBE_FILE = 'info.json';

    var cached = null;
    var tried = [];

    function get(key, fallback) {
        try { return app.getValue(key, fallback); } catch (e) { return fallback; }
    }

    function set(key, value) {
        try { app.setValue(key, value); } catch (e) { /* config dialog windows */ }
    }

    // Settings are written as a JSON string (see actions_add.js); accept the
    // object form too, for a host that hands it back untouched.
    function decodeSettings(value) {
        if (value && typeof value === 'object') return value;
        if (typeof value === 'string') {
            var text = value.replace(/^\uFEFF/, '').trim();
            if (text.charAt(0) === '{') {
                try {
                    var parsed = JSON.parse(text);
                    if (parsed && typeof parsed === 'object') return parsed;
                } catch (e) { }
            }
        }
        return {};
    }

    // "C:\...\scripts\paraDeeJay" -> "file:///C:/.../scripts/paraDeeJay/"
    function fileUrl(path) {
        if (!path) return null;
        var p = String(path).replace(/\\/g, '/');
        if (/^[a-zA-Z]:\//.test(p)) p = '/' + p;
        if (!/\/$/.test(p)) p += '/';
        try { return 'file://' + encodeURI(p); } catch (e) { return null; }
    }

    function candidates() {
        var out = [];
        var settings = decodeSettings(get(SETTINGS_KEY, null));
        if (settings.assetBaseOverride) out.push(settings.assetBaseOverride);

        var stored = get(BASE_KEY, null);
        if (stored) out.push(stored);

        var installed = fileUrl(get(PATH_KEY, null));
        if (installed) out.push(installed);

        try {
            var here = (typeof document !== 'undefined' && document.baseURI) || String(location.href);
            out.push(new URL('scripts/' + ID + '/', here).href);
            out.push(new URL(ID + '/', here).href);
        } catch (e) { /* no document (shouldn't happen in the main window) */ }

        var seen = {};
        return out
            .filter(function (b) {
                if (!b) return false;
                var key = String(b);
                if (seen[key]) return false;
                seen[key] = true;
                return true;
            })
            .map(function (b) { return String(b).replace(/\/?$/, '/'); });
    }

    function timeout(ms) {
        if (typeof AbortController === 'undefined') return {};
        var c = new AbortController();
        setTimeout(function () { c.abort(); }, ms);
        return { signal: c.signal };
    }

    // A candidate is good if it serves a valid info.json for this addon.
    async function probe(base) {
        var url = base + PROBE_FILE;
        try {
            var opts = timeout(4000);
            opts.cache = 'no-store';
            var res = await fetch(url, opts);
            if (!res.ok) return { base: base, ok: false, error: 'HTTP ' + res.status };
            var text = await res.text();
            var json;
            try { json = JSON.parse(text); } catch (e) { return { base: base, ok: false, error: 'not JSON' }; }
            if (!json || json.id !== ID) return { base: base, ok: false, error: 'wrong addon id: ' + (json && json.id) };
            return { base: base, ok: true, error: null };
        } catch (e) {
            return { base: base, ok: false, error: (e && e.name === 'AbortError') ? 'timed out' : String(e && e.message || e) };
        }
    }

    async function resolve() {
        if (cached) return cached;

        var list = candidates();
        tried = [];
        for (var i = 0; i < list.length; i++) {
            var r = await probe(list[i]);
            tried.push(r);
            if (r.ok) {
                cached = r.base;
                set(BASE_KEY, cached);
                return cached;
            }
        }

        var detail = tried.map(function (t) { return '  ' + t.base + ' -> ' + t.error; }).join('\n');
        throw new Error('Could not find this addon\'s installed files. Tried:\n' + detail);
    }

    function forget() {
        cached = null;
        tried = [];
        set(BASE_KEY, '');
    }

    // Human-readable report for the Translate-safe self-test dialog.
    async function diagnostics() {
        var lines = [];
        lines.push('Page: ' + ((typeof document !== 'undefined' && document.baseURI) || '?'));
        lines.push('Install path (from install.js): ' + (get(PATH_KEY, null) || 'not captured'));
        lines.push('WebAssembly: ' + (typeof WebAssembly === 'undefined' ? 'MISSING' : 'ok'));
        lines.push('DecompressionStream: ' + (typeof DecompressionStream === 'undefined' ? 'MISSING' : 'ok'));
        lines.push('AudioContext: ' + ((typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') ? 'MISSING' : 'ok'));
        lines.push('');

        var list = candidates();
        lines.push('Probing ' + list.length + ' candidate folder(s):');
        var good = null;
        for (var i = 0; i < list.length; i++) {
            var r = await probe(list[i]);
            lines.push('  ' + (r.ok ? 'OK   ' : 'fail ') + r.base + (r.error ? '  (' + r.error + ')' : ''));
            if (r.ok && !good) good = r.base;
        }

        if (good) {
            cached = good;
            set(BASE_KEY, good);
            lines.push('');
            lines.push('Using: ' + good);
            for (var f = 0; f < EXTRA_FILES.length; f++) {
                var file = EXTRA_FILES[f];
                try {
                    var res = await fetch(good + file, timeout(6000));
                    lines.push('  ' + (res.ok ? 'OK   ' : 'fail ') + file + (res.ok ? ' (' + res.headers.get('content-length') + ' bytes)' : ' HTTP ' + res.status));
                } catch (e) {
                    lines.push('  fail ' + file + ' (' + (e && e.message || e) + ')');
                }
            }
        } else {
            lines.push('');
            lines.push('No candidate served info.json. Set an override in the addon settings, or reinstall the addon.');
        }

        return lines.join('\n');
    }

    var EXTRA_FILES = [
        'vendor/paradee_int8.onnx',
        'vendor/ort.min.js',
        'vendor/ort-wasm-simd.wasm',
        'vendor/lexicon.tsv.gz'
    ];

    global.ParaDeeJayPlatform = {
        resolve: resolve,
        candidates: candidates,
        diagnostics: diagnostics,
        forget: forget,
        probe: probe,
        fileUrl: fileUrl
    };
})(typeof window !== 'undefined' ? window : globalThis);
