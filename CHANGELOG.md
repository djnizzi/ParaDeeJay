# Changelog

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

## 0.1.0

First release: track announcements in a local neural voice with Paradee, four
voices, adjustable speed and volume, hotkeys, a toolbar button, a settings
dialog with a test button, and a self-test that reports why the model failed to
load.
