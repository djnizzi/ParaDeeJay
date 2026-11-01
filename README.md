# ParaDeeJay

A MediaMonkey 5 addon that announces the playing track in a **local neural voice**.
No cloud, no API key, no installed Windows voice: it runs [Paradee], an 8M-parameter
text-to-speech model distilled from Kokoro-82M, inside MediaMonkey's own Chromium.

- 8.5 MB int8 ONNX model, four voices (`af_heart`, `bf_isabella`, `am_puck`, `bm_fable`)
- ~12x faster than real time on one wasm thread, so a track title is spoken about
  200 ms after playback starts
- Nothing leaves the machine, and no network access is needed after install

This addon is separate from **Track Announcer** and can be installed alongside it.
If both are enabled they will both speak, so turn off speech in the one you are not using.

## Install

1. Build the package (below) or take `ParaDeeJay.mmip` from a release.
2. MediaMonkey: **Tools > Addons > Add**, choose the `.mmip`, restart.
3. Options: **Tools > Addons > ParaDeeJay > Configure**.

Hotkeys: `Ctrl+Shift+9` toggles announcements, `Ctrl+Shift+8` announces the current
track immediately. Both are also in **Tools > ParaDeeJay** and on the toolbar button.

## Build

```sh
node tools/build-lexicon.js   # only when changing the G2P; needs tools/cmudict.dict
node build.js                 # -> ParaDeeJay.mmip
```

The addon icon is drawn as `paradeejay.png` and `build.js` copies it over
`icon.png` (the file `info.json` names) whenever it is newer, so re-saving the
artwork and re-running the build is enough. 256x256 with an alpha channel is the
sweet spot: MediaMonkey renders it small, and a 2048px export adds megabytes for
nothing.

`node tools/build-lexicon.js` downloads nothing: fetch `cmudict.dict` from
<https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict> into
`tools/` first. `build.js` shells out to PowerShell's `Compress-Archive` on Windows
and `zip` elsewhere.

## How it works

```
track "Midnight City by M83"
  -> engine.js        G2P -> Kokoro/misaki-style IPA -> vocab ids
  -> vendor/*.onnx    Paradee int8, one graph: ids + speed + voice -> 24 kHz float32
  -> Web Audio        one buffer source, volume via a gain node
```

The pieces, all vendored so the addon works offline:

| File | Size | Role |
|---|---|---|
| `vendor/paradee_int8.onnx` | 8.5 MB | the model |
| `vendor/ort.min.js` + `vendor/ort-wasm-simd.wasm` | 0.5 + 10.5 MB | onnxruntime-web 1.17.3 (classic build, no ESM) |
| `vendor/lexicon.tsv.gz` | 0.8 MB | 124,926 CMUdict words mapped to misaki IPA |
| `g2p.js` | small | text normalisation, IPA, token ids |
| `engine.js` | small | lazy load, inference, playback |

**Phonemes matter.** Paradee was trained only on misaki's spelling of phonemes
(`aɪ -> I`, `oʊ -> O`, `tʃ -> ʧ`, `r -> ɹ`). Fed raw eSpeak or CMU output it
mumbles badly, so `tools/build-lexicon.js` converts ARPAbet to misaki's IPA and
`g2p.js` normalises numbers, codes (`M83 -> "em eighty three"`), acronyms and
`feat.`/`&`/`vs.` before lookup. Words missing from the lexicon go through a small
letter-to-sound fallback.

Nothing loads at startup: the first announcement resolves paths, fetches the
runtime and builds the session (~1.5 s), then the session stays warm. `init.js`
also warms it in the background 4 s after the window is ready.

## The one thing that may need attention

MediaMonkey evaluates addon code inside its own window, and it does not document a
"give me a URL for a file in my addon" API. Relative URLs therefore resolve against
MediaMonkey's document, not the addon folder. `platform.js` probes, in order:

1. `assetBaseOverride` from settings (for manual repair)
2. the base remembered from a previous successful run
3. the install path captured by `install.js` (`window.__currentAddonPath`) as `file://`
4. `scripts/paraDeeJay/` relative to the page
5. `paraDeeJay/` relative to the page

The first folder that serves a valid `info.json` wins and is remembered. If none
does, the addon falls back to the system voice (if that setting is on) and
**Tools > ParaDeeJay > ParaDeeJay self-test** prints exactly what failed and why.
To repair manually, set `assetBaseOverride` in `persistent.json` under
`paraDeeJay_settings` to a folder URL ending in `/`.

## Licences

- Paradee model and the misaki phoneme table: Apache 2.0, (c) Sahil Mahendrakar,
  distilled from Kokoro-82M by hexgrad. See `vendor/paradee_LICENSE.txt`.
- onnxruntime-web: MIT, (c) Microsoft.
- CMU Pronouncing Dictionary: BSD-2-clause, (c) Carnegie Mellon University.
- Kokoro vocabulary: Apache 2.0.

[Paradee]: https://github.com/sahilmahendrakar/paradee
