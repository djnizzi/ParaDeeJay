# Changelog

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
