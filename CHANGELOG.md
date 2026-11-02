# Changelog

## 0.1.3

- **Fixed: names with accented letters were spelled out letter by letter.**
  "RÜFÜS" came out as "ar ef es": the tokenizer only accepts ASCII words, so the
  `Ü` was dropped and the leftover `R`, `F` and `S` were each read on their own.
  The new `dictionary.js` runs before tokenisation and folds accents, ligatures
  and typographic punctuation to ASCII — Unicode NFKD for the accented Latin
  letters, plus a table for the ones NFKD cannot decompose (`ß`, `ø`, `æ`, `œ`,
  `ł`, `đ`, `ð`, `þ`, `ı`, `ħ`, `ŋ`). `&`, `@`, `+`, `#`, `%`, `=` and `$` are
  read as words now instead of vanishing.
- Names that folding alone does not fix are respelled from a small `PHRASES`
  table (`RÜFÜS DU SOL` -> "Rufus doo sol", `Sigur Rós`, `Motley Crüe`,
  `Björk`, `Beyoncé`, `A$AP`, `Motörhead`). Adding an entry there fixes any other
  artist without touching the code or the lexicon.

## 0.1.2

- **Fixed: the addon could not be turned off, and the voice, speed and volume
  settings were ignored.** Reads of `paraDeeJay_settings` expected an object, and
  anything else — including the string MediaMonkey actually hands back — fell
  through to the defaults. The addon therefore always believed it was enabled,
  which is why the toolbar button, `Tools > ParaDeeJay` and the dialog's checkbox
  all appeared dead. Settings are now written as a JSON string, decoded tolerantly
  (string or object), mirrored into `localStorage` with a revision counter, and
  re-read after writing, so a lost `app.setValue()` no longer loses the change.
- Saving the settings dialog merges into the stored settings instead of replacing
  them, so a hand-written `assetBaseOverride` is no longer dropped.
- The toolbar button calls `window.ParaDeeJay.toggle()` directly rather than
  going through the action registry, so a missing or renamed action cannot leave
  it inert.
- The menu is **Play > ParaDeeJay** rather than **Tools > ParaDeeJay**, where a
  playback switch belongs. It falls back to the Tools menu if MediaMonkey does
  not expose one.
- The self-test gained a `Settings (paraDeeJay_settings)` block: the raw stored
  value, the mirror, the settings actually in use, and whether a JSON string
  survives a write/read round-trip.

## 0.1.1

- **Tools > ParaDeeJay > ParaDeeJay settings…** no longer raises
  "Read lock not acquired!". MediaMonkey's addon list is a native list and may
  only be read inside a read lock, so the entry is now looked up with `forEach()`
  (`locked()` where that is not available) instead of `getValue()`.
- The addon is matched case-insensitively on `ext_id`, and the unfiltered addon
  list is tried when the filtered one comes back empty, so the settings still
  open if MediaMonkey changes how the list is filtered.
- README: the artwork and version, download, platform, offline, model, voice and
  licence badges, written as markdown rather than HTML.
- The addon is now explicitly MIT licensed (`LICENSE`), and that file ships in
  the package.

## 0.1.0

First release: track announcements in a local neural voice with Paradee, four
voices, adjustable speed and volume, hotkeys, a toolbar button, a settings
dialog with a test button, and a self-test that reports why the model failed to
load.
