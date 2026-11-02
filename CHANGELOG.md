# Changelog

## 0.1.6

- **Import CSV…** reads `ParaDeeJay names.csv` back from the same folder the
  export writes to, and adds the names that are not already in the list. Rows
  already on screen keep their order and win, so importing the same file twice
  changes nothing and a spelling edited in the dialog is not overwritten.
- The reader is a real CSV parser rather than a split on commas: quoted cells,
  doubled quotes and CRLF/LF/CR line ends are handled, the byte-order mark and
  the header row are skipped, and empty or half-filled rows are dropped, so
  exporting and re-importing reproduces the same list.
- Results are reported under the buttons rather than in a dialog, and the import
  has to be confirmed with OK like any other change.

## 0.1.5

- **Export CSV…** beside **Add name** in the settings dialog writes the Names
  list to `ParaDeeJay names.csv` in MediaMonkey's user folder, and reports the
  full path when it finishes. MediaMonkey offers add-ons no save-as dialog, so
  the folder is fixed rather than asked for.
- The file is UTF-8 with a byte-order mark, CRLF line ends and RFC 4180 quoting,
  so Excel opens `RÜFÜS,Rufus` as two cells instead of mojibake, and a name with
  a comma or a quote in it stays in one cell.
- It exports what is on screen, so rows you added but have not saved are
  included; empty and half-filled rows are skipped, exactly as when saving.

## 0.1.4

- The settings dialog gained a **Names** list: two columns per row, "as written"
  and "as it should sound", with **Add name** and a remove button on each row.
  Entries are saved with the other settings, so they survive add-on updates —
  they are not written into `dictionary.js`, which the package replaces — and
  they are matched before the built-in table, so a user entry always wins.
  The left column is folded the same way as track text, so `RÜFÜS` and `RUFUS`
  are the same entry; matching ignores case, respects word boundaries and tries
  the longest entry first.
- Empty and half-filled rows are dropped on save instead of being stored as
  rules that can never match. The list is capped at 200 rows in the dialog and
  300 in the matcher, 80 characters for the written form and 120 for the
  respelling.

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
