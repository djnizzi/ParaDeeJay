// ParaDeeJay engine - Paradee (8M, int8 ONNX) on onnxruntime-web.
//
// Everything is lazy: nothing loads until the first announcement, so MediaMonkey
// startup is unaffected. After that the session stays warm and an announcement
// costs one phonemisation plus one inference (~200 ms for a track title).
//
// onnxruntime-web 1.17.3 is the classic no-ESM build: it instantiates its wasm
// directly and needs no dynamic import, which keeps it usable from a custom
// scheme. The wasm bytes are fetched by hand and handed to ort as wasmBinary so
// the runtime never has to guess where its own files live.

(function (global) {
    'use strict';

    var VOICES = ['af_heart', 'bf_isabella', 'am_puck', 'bm_fable'];
    var SAMPLE_RATE = 24000;
    var MAX_TOKENS = 512; // the model's hard limit, including pad tokens

    var STATE = {
        status: 'idle',      // idle | resolving | runtime | model | lexicon | ready | error
        error: null,
        base: null,
        session: null,
        lexicon: null,
        ctx: null,
        source: null,
        last: null
    };

    var loading = null;
    var token = 0;
    var listeners = [];

    function snapshot() {
        return {
            status: STATE.status,
            error: STATE.error,
            base: STATE.base,
            voices: VOICES.slice(),
            last: STATE.last
        };
    }

    function notify() {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](snapshot()); } catch (e) { }
        }
    }

    function setStatus(status, error) {
        STATE.status = status;
        STATE.error = error || null;
        notify();
    }

    function onStatus(fn) { listeners.push(fn); }

    function loadScript(url) {
        return new Promise(function (resolve, reject) {
            var existing = document.querySelector('script[data-paradeejay="' + url + '"]');
            if (existing) { resolve(); return; }
            var s = document.createElement('script');
            s.src = url;
            s.async = false;
            s.setAttribute('data-paradeejay', url);
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('could not load ' + url)); };
            document.head.appendChild(s);
        });
    }

    async function fetchBytes(url) {
        var res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
        return await res.arrayBuffer();
    }

    async function fetchGzipText(url) {
        var res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
        var bytes = await res.arrayBuffer();
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('this build of Chromium has no DecompressionStream');
        }
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
    }

    function setBase(base) {
        STATE.base = base ? String(base).replace(/\/?$/, '/') : null;
    }

    async function ensureRuntime() {
        if (STATE.session) return STATE.session;
        if (loading) return loading;

        loading = (async function () {
            if (!STATE.base) {
                setStatus('resolving');
                setBase(await global.ParaDeeJayPlatform.resolve());
            }
            var base = STATE.base;

            if (!global.ort) {
                setStatus('runtime');
                await loadScript(base + 'vendor/ort.min.js');
            }
            var ort = global.ort;
            if (!ort) throw new Error('onnxruntime-web loaded but window.ort is missing');

            ort.env.wasm.numThreads = 1;   // no SharedArrayBuffer in the host page
            ort.env.wasm.simd = true;
            ort.env.wasm.proxy = false;
            ort.env.wasm.wasmPaths = base + 'vendor/';

            setStatus('model');
            try {
                ort.env.wasm.wasmBinary = await fetchBytes(base + 'vendor/ort-wasm-simd.wasm');
            } catch (e) {
                // Let ort fetch it through wasmPaths instead; if that fails too the
                // session creation below reports it.
            }

            var modelBytes = await fetchBytes(base + 'vendor/paradee_int8.onnx');
            STATE.session = await ort.InferenceSession.create(modelBytes, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });

            setStatus('lexicon');
            try {
                var tsv = await fetchGzipText(base + 'vendor/lexicon.tsv.gz');
                STATE.lexicon = global.ParaDeeJayG2P.parseLexicon(tsv);
            } catch (e) {
                // Letter-to-sound only; understandable, just rougher on odd names.
                STATE.lexicon = null;
            }

            setStatus('ready');
            return STATE.session;
        })();

        try {
            return await loading;
        } catch (e) {
            loading = null;
            STATE.session = null;
            setStatus('error', e);
            throw e;
        }
    }

    function audioContext() {
        if (!STATE.ctx) {
            var Ctor = global.AudioContext || global.webkitAudioContext;
            if (!Ctor) throw new Error('this host has no Web Audio');
            STATE.ctx = new Ctor();
        }
        if (STATE.ctx.state === 'suspended' && STATE.ctx.resume) STATE.ctx.resume();
        return STATE.ctx;
    }

    function stop() {
        if (STATE.source) {
            try { STATE.source.stop(); } catch (e) { }
            STATE.source = null;
        }
    }

    function play(wav, volume) {
        stop();
        var ctx = audioContext();
        var buffer = ctx.createBuffer(1, wav.length, SAMPLE_RATE);
        if (buffer.copyToChannel) buffer.copyToChannel(wav, 0);
        else buffer.getChannelData(0).set(wav);

        var gain = ctx.createGain();
        var v = Number(volume);
        gain.gain.value = isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;

        var source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        STATE.source = source;
    }

    // text -> phonemes -> ids -> waveform, without playing it.
    async function synthesize(text, opts) {
        opts = opts || {};
        var g2p = global.ParaDeeJayG2P;
        if (!g2p) throw new Error('the G2P module is not loaded');

        var myToken = ++token;
        await ensureRuntime();
        if (myToken !== token) return null; // superseded while the model was loading

        var phonemes = g2p.phonemize(text, STATE.lexicon);
        if (!phonemes) return null;

        var ids = g2p.toIds(phonemes);
        if (ids.length > MAX_TOKENS) ids = ids.slice(0, MAX_TOKENS - 1).concat([0]);
        if (ids.length <= 2) return null;

        var voice = Math.min(VOICES.length - 1, Math.max(0, Number(opts.voice) | 0));
        var speed = Math.min(2, Math.max(0.5, Number(opts.speed) || 1));

        var feeds = {
            input_ids: new global.ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
            speed: new global.ort.Tensor('float32', Float32Array.from([speed]), [1]),
            voice: new global.ort.Tensor('int64', BigInt64Array.from([BigInt(voice)]), [1])
        };

        var started = (global.performance || Date).now();
        var results = await STATE.session.run(feeds);
        var inferMs = (global.performance || Date).now() - started;
        if (myToken !== token) return null;

        var wav = results[STATE.session.outputNames[0]].data;
        var audioSec = wav.length / SAMPLE_RATE;

        return {
            text: text,
            phonemes: phonemes,
            tokens: ids.length,
            inferMs: Math.round(inferMs),
            audioSec: Math.round(audioSec * 100) / 100,
            realtime: Math.round((audioSec / (inferMs / 1000)) * 10) / 10,
            voice: VOICES[voice],
            wav: wav
        };
    }

    // Synthesise and play. Resolves with stats for the settings dialog.
    async function speak(text, opts) {
        var result = await synthesize(text, opts);
        if (!result) return null;

        play(result.wav, opts && opts.volume);
        delete result.wav;

        STATE.last = result;
        notify();
        return result;
    }

    function warm() {
        ensureRuntime().catch(function () { /* surfaced through status */ });
    }

    global.ParaDeeJayEngine = {
        VOICES: VOICES,
        SAMPLE_RATE: SAMPLE_RATE,
        state: snapshot,
        onStatus: onStatus,
        setBase: setBase,
        ensureRuntime: ensureRuntime,
        warm: warm,
        speak: speak,
        synthesize: synthesize,
        stop: stop
    };
})(typeof window !== 'undefined' ? window : globalThis);
