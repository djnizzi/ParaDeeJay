// ParaDeeJay G2P: English text -> Kokoro/misaki-style IPA -> Paradee token ids.
//
// Paradee was trained only on misaki phonemes, so everything here targets that
// spelling (aɪ -> I, oʊ -> O, tʃ -> ʧ, r -> ɹ, ɡ rather than plain g, ER
// unstressed -> ɚ). Words come from a CMUdict-derived lexicon built by
// tools/build-lexicon.js; anything missing goes through a small letter-to-sound
// fallback so odd artist names still produce something pronounceable.
//
// Plain script, no modules: MediaMonkey loads addon code with eval.

(function (global) {
    'use strict';

    // Kokoro's vocabulary (config.json on the Hub). Ids of symbols that never
    // appear in English output are simply unused.
    var VOCAB = {
        ';': 1, ':': 2, ',': 3, '.': 4, '!': 5, '?': 6, '\u2014': 9, '\u2026': 10,
        '"': 11, '(': 12, ')': 13, '\u201c': 14, '\u201d': 15, ' ': 16,
        '\u0303': 17, '\u02a3': 18, '\u02a5': 19, '\u02a6': 20, '\u02a8': 21,
        '\u1d5d': 22, '\uab67': 23,
        A: 24, I: 25, O: 31, Q: 33, S: 35, T: 36, W: 39, Y: 41, '\u1d4a': 42,
        a: 43, b: 44, c: 45, d: 46, e: 47, f: 48, h: 50, i: 51, j: 52, k: 53,
        l: 54, m: 55, n: 56, o: 57, p: 58, q: 59, r: 60, s: 61, t: 62, u: 63,
        v: 64, w: 65, x: 66, y: 67, z: 68,
        '\u0251': 69, '\u0250': 70, '\u0252': 71, '\u00e6': 72, '\u03b2': 75,
        '\u0254': 76, '\u0255': 77, '\u00e7': 78, '\u0256': 80, '\u00f0': 81,
        '\u02a4': 82, '\u0259': 83, '\u025a': 85, '\u025b': 86, '\u025c': 87,
        '\u025f': 90, '\u0261': 92, '\u0265': 99, '\u0268': 101, '\u026a': 102,
        '\u029d': 103, '\u026f': 110, '\u0270': 111, '\u014b': 112, '\u0273': 113,
        '\u0272': 114, '\u0274': 115, '\u00f8': 116, '\u0278': 118, '\u03b8': 119,
        '\u0153': 120, '\u0279': 123, '\u027e': 125, '\u027b': 126, '\u0281': 128,
        '\u027d': 129, '\u0282': 130, '\u0283': 131, '\u0288': 132, '\u02a7': 133,
        '\u028a': 135, '\u028b': 136, '\u028c': 138, '\u0263': 139, '\u0264': 140,
        '\u03c7': 142, '\u028e': 143, '\u0292': 147, '\u0294': 148,
        '\u02c8': 156, '\u02cc': 157, '\u02d0': 158, '\u02b0': 162, '\u02b2': 164
    };

    // Spoken letter names, for acronyms and codes like "M83" or "B.B.C.".
    var LETTER = {
        a: '\u02c8A', b: 'b\u02c8i', c: 's\u02c8i', d: 'd\u02c8i', e: '\u02c8i',
        f: '\u02c8\u025bf', g: '\u02a4\u02c8i', h: '\u02c8A\u02a7', i: '\u02c8I',
        j: '\u02a4\u02c8A', k: 'k\u02c8A', l: '\u02c8\u025bl', m: '\u02c8\u025bm',
        n: '\u02c8\u025bn', o: '\u02c8O', p: 'p\u02c8i', q: 'kj\u02c8u',
        r: '\u02c8\u0251\u0279', s: '\u02c8\u025bs', t: 't\u02c8i', u: 'j\u02c8u',
        v: 'v\u02c8i', w: 'd\u02c8\u028cb\u1d4alju', x: '\u02c8\u025bks',
        y: 'w\u02c8I', z: 'z\u02c8i'
    };

    var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
        'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
        'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
        'eighty', 'ninety'];

    // Ordered letter-to-sound rules for words the lexicon does not have.
    // Longest graphemes first so "ch" wins over "c" + "h".
    var RULES = [
        ['tion', '\u0283\u0259n'], ['sion', '\u0292\u0259n'], ['ough', 'O'],
        ['eigh', 'A'], ['igh', 'I'], ['augh', '\u0254'],
        ['ch', '\u02a7'], ['sh', '\u0283'], ['th', '\u03b8'], ['ph', 'f'],
        ['wh', 'w'], ['ck', 'k'], ['ng', '\u014b'], ['qu', 'kw'],
        ['gh', ''], ['kn', 'n'], ['wr', '\u0279'], ['mb', 'm'],
        ['ee', 'i'], ['ea', 'i'], ['ai', 'A'], ['ay', 'A'], ['oa', 'O'],
        ['oo', 'u'], ['ou', 'W'], ['ow', 'O'], ['oi', 'Y'], ['oy', 'Y'],
        ['au', '\u0254'], ['aw', '\u0254'], ['ei', 'A'], ['ie', 'i'],
        ['ey', 'A'], ['ue', 'u'], ['ui', 'u'], ['ar', '\u0251\u0279'],
        ['er', '\u025c\u0279'], ['ir', '\u025c\u0279'], ['or', '\u0254\u0279'],
        ['ur', '\u025c\u0279'],
        ['a', '\u00e6'], ['b', 'b'], ['c', 'k'], ['d', 'd'], ['e', '\u025b'],
        ['f', 'f'], ['g', '\u0261'], ['h', 'h'], ['i', '\u026a'], ['j', '\u02a4'],
        ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['o', '\u0251'],
        ['p', 'p'], ['q', 'k'], ['r', '\u0279'], ['s', 's'], ['t', 't'],
        ['u', '\u028c'], ['v', 'v'], ['w', 'w'], ['x', 'ks'], ['y', 'i'],
        ['z', 'z'], ["'", ''], ['-', '']
    ];

    var VOWEL_CHARS = '\u0251\u00e6\u028c\u0254WI\u025b\u025cA\u026a\u026aO Y\u028au\u0259\u025a\u0279\u025c';

    function isVowel(ch) {
        return '\u0251\u00e6\u028c\u0254WIA\u025b\u025c\u026aO\u028au\u0259\u025a'.indexOf(ch) >= 0;
    }

    function numberWords(n) {
        if (n < 0) return 'minus ' + numberWords(-n);
        if (n < 20) return ONES[n];
        if (n < 100) {
            var t = Math.floor(n / 10), r = n % 10;
            return TENS[t] + (r ? ' ' + ONES[r] : '');
        }
        if (n < 1000) {
            var h = Math.floor(n / 100), rr = n % 100;
            return ONES[h] + ' hundred' + (rr ? ' ' + numberWords(rr) : '');
        }
        if (n < 1000000) {
            var th = Math.floor(n / 1000), r3 = n % 1000;
            return numberWords(th) + ' thousand' + (r3 ? ' ' + numberWords(r3) : '');
        }
        return String(n).split('').map(function (d) { return ONES[+d]; }).join(' ');
    }

    // Function words lose their stress mark: "by" should not be emphasised.
    var WEAK = {
        a: 1, an: 1, and: 1, or: 1, the: 1, of: 1, to: 1, in: 1, on: 1, at: 1,
        by: 1, for: 1, with: 1, from: 1, is: 1, it: 1, as: 1
    };

    // Years and catalogue numbers read the way people say them.
    function digitsToWords(digits) {
        var n = parseInt(digits, 10);
        if (isNaN(n)) return '';
        // 808 -> "eight oh eight", 101 -> "one oh one"
        if (digits.length === 3 && digits.charAt(1) === '0' && digits.charAt(2) !== '0') {
            return ONES[+digits.charAt(0)] + ' oh ' + ONES[+digits.charAt(2)];
        }
        if (digits.length === 4 && n >= 1900 && n <= 2099) {
            if (n >= 2000 && n < 2010) return 'two thousand' + (n % 10 ? ' ' + ONES[n % 10] : '');
            var hi = Math.floor(n / 100), lo = n % 100;
            return numberWords(hi) + (lo ? ' ' + numberWords(lo) : ' hundred');
        }
        return numberWords(n);
    }

    function letterSounds(str) {
        var out = [];
        for (var i = 0; i < str.length; i++) {
            var ch = str.charAt(i).toLowerCase();
            if (LETTER[ch]) out.push(LETTER[ch]);
        }
        return out.join(' ');
    }

    function lts(word) {
        var w = word.toLowerCase();
        var out = '';
        var i = 0;
        while (i < w.length) {
            var matched = false;
            for (var r = 0; r < RULES.length; r++) {
                var g = RULES[r][0];
                if (w.substr(i, g.length) === g) {
                    // silent final e after a consonant cluster: "dance", "time"
                    if (g === 'e' && i === w.length - 1 && w.length > 2) { i += 1; matched = true; break; }
                    out += RULES[r][1];
                    i += g.length;
                    matched = true;
                    break;
                }
            }
            if (!matched) i += 1;
        }
        // Stress the first vowel so single words are not flat.
        for (var p = 0; p < out.length; p++) {
            if (isVowel(out.charAt(p))) {
                out = out.slice(0, p) + '\u02c8' + out.slice(p);
                break;
            }
        }
        return out;
    }

    function lookup(word, lex) {
        if (lex && lex[word]) return lex[word];
        if (lex && lex[word.replace(/'s$/, '')]) return lex[word.replace(/'s$/, '')];
        return null;
    }

    function numberPhonemes(digits, lex) {
        return digitsToWords(digits).split(/\s+/).map(function (w) {
            return lookup(w, lex) || lts(w);
        }).join(' ');
    }

    // "M83" / "blink-182": spoken letters (or the word's own pronunciation)
    // followed by the spoken number. Returns IPA, not English.
    function mixedToken(word, lex) {
        var m = /^([A-Za-z]{1,3})(\d{1,6})$/.exec(word);
        if (m) return letterSounds(m[1]) + ' ' + numberPhonemes(m[2], lex);
        m = /^([A-Za-z]{4,})(\d{1,6})$/.exec(word);
        if (m) {
            var head = lookup(m[1].toLowerCase(), lex) || lts(m[1]);
            return head + ' ' + numberPhonemes(m[2], lex);
        }
        return null;
    }

    function wordToPhonemes(word, lex) {
        var lower = word.toLowerCase();
        var hit = lookup(lower, lex);
        if (hit) return WEAK[lower] ? hit.replace(/[\u02c8\u02cc]/g, '') : hit;

        var mixed = mixedToken(word, lex);
        if (mixed) return mixed;

        // Bare numbers.
        if (/^\d+$/.test(word)) return numberPhonemes(word, lex);

        // Acronyms: "NYC", "BBC" -> spoken letters.
        if (/^[A-Z]{2,5}$/.test(word)) return letterSounds(word);

        return lts(lower);
    }

    function phonemize(text, lex) {
        if (!text) return '';

        // dictionary.js folds accents, ligatures and typographic punctuation to
        // ASCII and respells names the rules would mangle, before anything is
        // tokenised. Without it "RÜFÜS" splits at the Ü and every fragment is
        // read as a single letter, which is what came out as "R F S".
        var dict = global.ParaDeeJayDictionary;
        var cleaned = (dict && dict.prepare ? dict.prepare(text) : String(text))
            .replace(/\u00a0/g, ' ')
            .replace(/\s*&\s*/g, ' and ')
            .replace(/\b(?:feat|ft)\.?(?=\s|$)/gi, 'featuring')
            .replace(/\bvs\.?(?=\s|$)/gi, 'versus')
            .replace(/\bw\/(?=\s|$)/gi, 'with')
            .replace(/\u00d7/g, ' and ')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201c\u201d]/g, '"');

        var tokens = cleaned.split(/([A-Za-z0-9']+|[.,!?;:])/);
        var parts = [];

        for (var i = 0; i < tokens.length; i++) {
            var tok = tokens[i];
            if (!tok || /^\s*$/.test(tok)) continue;
            if (/^[.,!?;:]$/.test(tok)) { parts.push(tok); continue; }
            if (/^['\-]+$/.test(tok)) continue;
            var ph = wordToPhonemes(tok, lex);
            if (ph) parts.push(ph);
        }

        // Join words with spaces, punctuation tight to the previous word so the
        // model sees the same "word,. word" shape misaki produces.
        var out = '';
        for (var j = 0; j < parts.length; j++) {
            var p = parts[j];
            if (/^[.,!?;:]$/.test(p)) out += p;
            else out += (out && !/[.,!?;:]$/.test(out) ? ' ' : (out ? ' ' : '')) + p;
        }
        out = out.replace(/\s+/g, ' ').trim();
        if (!/[.!?]$/.test(out)) out += '.';
        return out;
    }

    function toIds(phonemes) {
        var ids = [0];
        for (var i = 0; i < phonemes.length; i++) {
            var ch = phonemes.charAt(i);
            var id = VOCAB[ch];
            if (id !== undefined) ids.push(id);
        }
        ids.push(0);
        return ids;
    }

    function parseLexicon(text) {
        var lex = Object.create(null);
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line) continue;
            var tab = line.indexOf('\t');
            if (tab <= 0) continue;
            lex[line.slice(0, tab)] = line.slice(tab + 1);
        }
        return lex;
    }

    global.ParaDeeJayG2P = {
        VOCAB: VOCAB,
        phonemize: phonemize,
        toIds: toIds,
        parseLexicon: parseLexicon,
        // exposed for tests
        _lts: lts,
        _numberWords: numberWords,
        _digitsToWords: digitsToWords
    };
})(typeof window !== 'undefined' ? window : globalThis);
