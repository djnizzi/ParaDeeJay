// ParaDeeJay pronunciation dictionary.
//
// The tokenizer in g2p.js only understands ASCII words, so a letter it does not
// recognise is simply dropped. That is what turned "RÜFÜS" into the fragments
// "R", "F" and "S", each of which was then read as a single letter: "ar ef es".
// Everything in this file runs before tokenisation and fixes that in two steps.
//
//   1. CHARS folds accented letters, ligatures and typographic punctuation to
//      plain ASCII, so "RÜFÜS" becomes "RUFUS" and "Motörhead" "Motorhead".
//      Folding happens with Unicode NFKD first, which covers every accented
//      Latin letter (ü -> u, é -> e, ñ -> n); CHARS only holds the letters that
//      NFKD cannot decompose (ø, æ, œ, ß, đ, ł, ...) plus symbols worth reading
//      aloud (&, @, +, #, %).
//
//   2. PHRASES respells names that folding alone still mispronounces, either
//      because the letter-to-sound rules mangle them or because an all-caps
//      word gets read letter by letter. Matching is case-insensitive, on word
//      boundaries, longest phrase first.
//
// Add your own entries freely: they are plain data, and nothing has to be
// rebuilt. To make "IAMDDB" say "I am D D B", add ['iamddb', 'I am D D B'];
// to make "Björk" say "byerk", add ['bjork', 'byerk'].

(function (global) {
    'use strict';

    // Keys are lower case; an upper-case letter in the text keeps its case.
    var CHARS = {
        // Latin letters NFKD leaves alone.
        '\u00df': 'ss',   // ß
        '\u00f8': 'o',    // ø
        '\u00e6': 'ae',   // æ
        '\u0153': 'oe',   // œ
        '\u0142': 'l',    // ł
        '\u0111': 'd',    // đ
        '\u00f0': 'd',    // ð
        '\u00fe': 'th',   // þ
        '\u0131': 'i',    // ı
        '\u0127': 'h',    // ħ
        '\u014b': 'ng',   // ŋ
        '\u017f': 's',    // ſ

        // Typographic punctuation: quotes, dashes, ellipsis, odd spaces.
        '\u2018': "'", '\u2019': "'", '\u201a': "'", '\u201b': "'",
        '\u201c': '"', '\u201d': '"', '\u201e': '"', '\u00ab': '"', '\u00bb': '"',
        '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-',
        '\u2014': ' - ', '\u2015': ' - ',
        '\u2026': '.', '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ', '\u200b': '',

        // Symbols that are worth reading out loud.
        '&': ' and ', '@': ' at ', '+': ' plus ', '#': ' number ',
        '%': ' percent ', '=': ' equals ', '$': 's', '~': ' ',
        // Separators and decoration: split the word rather than swallow it.
        '/': ' ', '\\': ' ', '|': ' ', '*': ' ', '_': ' ', '`': "'",
        '\u00b4': "'", '\u02bc': "'"
    };

    // Longest first, so "rufus du sol" wins over "rufus".
    var PHRASES = [
        ['rufus du sol', 'rufus doo sol'],
        ['rufus', 'rufus'],               // RUFUS would otherwise be spelled out
        ['sigur ros', 'sigur ross'],
        ['motley crue', 'motley kroo'],
        ['bjork', 'byork'],
        ['beyonce', 'bee yon say'],
        ['motorhead', 'motor head'],      // lexicon has no "motorhead", only the two words
        ['asap', 'ay sap']                // A$AP, not the letter-spelled lexicon entry
    ];

    // Entries the user adds in the settings dialog. They are matched before the
    // built-ins, so a user entry always wins, and they live in the settings rather
    // than in this file, so an add-on update cannot throw them away.
    var MAX_ENTRIES = 300;
    var MAX_TO = 120;
    var user = [];

    // Accepts [{from, to}, ...] or [['from', 'to'], ...]; anything unusable is
    // dropped rather than throwing, because the source is a text field.
    function setUser(entries) {
        var list = [];
        if (entries && typeof entries.length === 'number') {
            for (var i = 0; i < entries.length && list.length < MAX_ENTRIES; i++) {
                var item = entries[i] || {};
                var from = String(item.from != null ? item.from : (item[0] != null ? item[0] : ''));
                var to = String(item.to != null ? item.to : (item[1] != null ? item[1] : ''));
                // The left side is matched against folded text, so it is folded
                // too: the user can type RÜFÜS and it still matches RUFUS.
                from = fold(from).toLowerCase().replace(/\s+/g, ' ').trim();
                to = fold(to).replace(/\s+/g, ' ').trim();
                if (!from || !to) continue;
                list.push([from, to.slice(0, MAX_TO)]);
            }
        }

        // Longest first, so "rufus du sol" beats "rufus"; a duplicate from-side
        // keeps the entry that sorts first in the settings, which is the newest.
        list.sort(function (a, b) { return b[0].length - a[0].length; });
        user = list.map(function (pair) {
            return [pair[0], pair[1], new RegExp('\\b' + escapeRe(pair[0]) + '\\b', 'gi')];
        });
        return user.length;
    }

    function fold(text) {
        var s = String(text == null ? '' : text);
        try {
            if (typeof s.normalize === 'function') {
                s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
            }
        } catch (e) {
            // Engines without normalize still get the CHARS table below.
        }

        var out = '';
        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            var low = ch.toLowerCase();
            // The table is consulted first: several of its keys are ASCII
            // symbols ($, @, &, +, #), which a plain ASCII pass-through would
            // otherwise hand to the tokenizer to throw away.
            var mapped = CHARS[ch] !== undefined ? CHARS[ch] : CHARS[low];
            if (mapped !== undefined) out += ch !== low ? mapped.toUpperCase() : mapped;
            else out += ch;      // unknown non-ASCII is left for the tokenizer to skip
        }
        return out;
    }

    function escapeRe(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function applyPhrases(text) {
        var s = text;
        for (var i = 0; i < PHRASES.length; i++) {
            var from = PHRASES[i][0], to = PHRASES[i][1];
            s = s.replace(new RegExp('\\b' + escapeRe(from) + '\\b', 'gi'), to);
        }
        return s;
    }

    // Text in, text the tokenizer can handle out.
    function prepare(text) {
        var s = fold(text);
        for (var i = 0; i < user.length; i++) s = s.replace(user[i][2], user[i][1]);
        return applyPhrases(s).replace(/\s+/g, ' ').replace(/^ | $/g, '');
    }

    // ---------------------------------------------------------------- export
    //
    // The settings dialog hands the list to toCsv. Excel and Sheets only decode
    // UTF-8 when the file starts with a BOM, RFC 4180 wants CRLF line ends and
    // doubled quotes, and the blank-half rule that saving uses applies here too,
    // so the file opens cleanly and can be read back line for line.

    function csvCell(value) {
        var s = String(value == null ? '' : value);
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function toCsv(entries) {
        var rows = ['As written,As it should sound'];
        var list = Array.isArray(entries) ? entries : [];
        for (var i = 0; i < list.length && rows.length <= MAX_ENTRIES; i++) {
            var item = list[i] || {};
            var from = String(item.from != null ? item.from : (item[0] != null ? item[0] : '')).trim();
            var to = String(item.to != null ? item.to : (item[1] != null ? item[1] : '')).trim();
            if (!from || !to) continue;
            rows.push(csvCell(from) + ',' + csvCell(to));
        }
        return '\uFEFF' + rows.join('\r\n') + '\r\n';
    }

    global.ParaDeeJayDictionary = {
        fold: fold,
        toCsv: toCsv,
        prepare: prepare,
        setUser: setUser,
        userCount: function () { return user.length; },
        CHARS: CHARS,
        PHRASES: PHRASES
    };
})(typeof window !== 'undefined' ? window : globalThis);
