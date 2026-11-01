// Builds vendor/lexicon.tsv.gz: CMUdict ARPAbet -> Kokoro/misaki-style IPA.
//
// Paradee was trained on phonemes spelled the way misaki spells them, so the
// ARPAbet mapping below follows the same conventions (aɪ -> I, oʊ -> O,
// tʃ -> ʧ, r -> ɹ, ER0 -> ɚ, and so on). Stress 1 becomes ˈ and stress 2
// becomes ˌ placed right before the vowel, which is where misaki puts them.
//
// Usage: node tools/build-lexicon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const VOWEL = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'W', AY: 'I',
  EH: 'ɛ', EY: 'A', IH: 'ɪ', IY: 'i', OW: 'O', OY: 'Y',
  UH: 'ʊ', UW: 'u'
};

const CONSONANT = {
  B: 'b', CH: 'ʧ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h',
  JH: 'ʤ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p',
  R: 'ɹ', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w',
  Y: 'j', Z: 'z', ZH: 'ʒ'
};

function toIpa(phones) {
  const out = [];
  for (const raw of phones) {
    const m = /^([A-Z]+)([0-2])?$/.exec(raw);
    if (!m) return null;
    const [, base, stress] = m;

    if (base === 'ER') {
      if (stress === '0' || stress === undefined) {
        out.push(stress === '2' ? 'ˌɚ' : 'ɚ');
      } else {
        out.push((stress === '2' ? 'ˌ' : 'ˈ') + 'ɜɹ');
      }
      continue;
    }

    if (base === 'AH' && stress === '0') {
      out.push('ə');
      continue;
    }

    if (base in VOWEL) {
      const ipa = VOWEL[base];
      if (stress === '1') out.push('ˈ' + ipa);
      else if (stress === '2') out.push('ˌ' + ipa);
      else out.push(ipa);
      continue;
    }

    if (base in CONSONANT) {
      out.push(CONSONANT[base]);
      continue;
    }

    return null; // unknown symbol, skip the whole entry
  }
  return out.join('');
}

const src = path.join(__dirname, 'cmudict.dict');
const dest = path.join(__dirname, '..', 'vendor', 'lexicon.tsv.gz');

const lines = fs.readFileSync(src, 'utf8').split('\n');
const lex = new Map();

for (const line of lines) {
  if (!line || line.startsWith(';;;')) continue;
  const hash = line.indexOf('#');
  const body = (hash >= 0 ? line.slice(0, hash) : line).trim();
  if (!body) continue;

  const parts = body.split(/\s+/);
  let word = parts[0];
  if (/\(\d+\)$/.test(word)) continue; // keep the primary pronunciation only
  word = word.toLowerCase();
  if (!/^[a-z']+$/.test(word)) continue;

  const ipa = toIpa(parts.slice(1));
  if (!ipa) continue;
  if (!lex.has(word)) lex.set(word, ipa);
}

const tsv = [...lex.entries()].map(([w, ipa]) => w + '\t' + ipa).join('\n') + '\n';
const gz = zlib.gzipSync(Buffer.from(tsv, 'utf8'), { level: 9 });
fs.writeFileSync(dest, gz);

console.log('entries: ' + lex.size);
console.log('tsv: ' + (tsv.length / 1024 / 1024).toFixed(2) + ' MB');
console.log('gz:  ' + (gz.length / 1024 / 1024).toFixed(2) + ' MB -> ' + dest);
for (const w of ['midnight', 'city', 'by', 'bonobo', 'burial', 'nightmares', 'on', 'wax', 'aphex', 'twin']) {
  if (lex.has(w)) console.log('  ' + w + ' -> ' + lex.get(w));
}
