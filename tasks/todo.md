# Build checklist

Implementation is present. Checked boxes indicate completed implementation/checks; unchecked verification gates remain explicit. See README.md for the tested scope.

## 1. Prove integration and choose base (Day 1)
- [x] Build independent source; inspect dependencies and build commands. No third-party clone was adopted.
- [ ] Read SMTC sessions and metadata/timeline; test Spotify, Apple Music, Chrome and Edge playback.
- [x] Verify LRCLIB returns timed lyrics; distinguish enhanced-LRC word timing from estimated line-based pacing.
Verification: live pause/seek test and one matched lyric; save compatibility results. Dependencies: none. Likely scope: bridge and diagnostic entry point, 1-3 files.

## 2. Deliver playback-to-lyrics loop (Day 1)
- [x] Parse timestamps, request matching title/artist/duration and cache lyrics locally.
- [x] Interpolate position; unit-test pause/backward seek; desktop-test stale-response rejection after source change.
- [x] Render lyric view and loading/no-player/no-lyrics/error states.
Verification: focused original-text fixtures for parsing/timing/stale responses and real-song listening. Dependencies: 1. Likely scope: media state, lyric lookup, timeline, renderer and tests, up to 5 files.

## Checkpoint A
- [ ] Live core loop works; limitations recorded and scope agreed before adding effects.

## 3. Polish one visual style (Day 2)
- [x] Four animated style families with inactive-word context and current-word/line emphasis; desktop screenshots verified.
- [x] Font size, three colours, Auto Sync, timing offset and motion preferences persist.
Verification: original demo fixtures at 100%, 150% and 200% display scale; pause and seek remain correct. Dependencies: 2. Likely scope: renderer, styles, settings and timing fixture, up to 4 files.

## 4. Desktop behavior (Day 2)
- [x] Implement tray, single instance, session selector, shortcut fallback and Escape handler.
- [ ] Fullscreen and desktop overlay remain controllable; hide on lock and recover after sleep.
- [ ] Startup toggle works in packaged app; optional idle/display-awake features only if time remains.
Verification: manual window/focus/lock/sleep/shortcut-collision checks. Dependencies: 3. Likely scope: main process, tray, window handling, settings and preload, up to 5 files.

## Checkpoint B
- [ ] A complete usable desktop app; add remaining styles only if reliability is already satisfactory.

## 5. Package and verify beta (Day 3)
- [ ] Test player matrix, competing sessions, rapid skips, offline mode and unavailable lyrics.
- [x] JavaScript syntax checks, focused unit tests, .NET compile and desktop smoke checks pass.
- [ ] Launch packaged x64 beta; include license notices and accurate compatibility notes.
Verification: packaged smoke test plus complete-song drift test. Dependencies: 4. Likely scope: package configuration, notices, release notes and tests, up to 4 files.

## Complete
- [ ] Must-have acceptance criteria in plan.md pass; remaining limitations disclosed.

## Added scope: integrated player and glass UI
- [x] Isolated official YouTube Music view and public playback-state bridge.
- [x] Verify homepage content loads; do not read credentials or account cookies.
- [x] Build glass control surface and shared fullscreen/overlay renderer.
- [ ] Verify Google sign-in and real song playback with the user's account.
- [ ] Verify all requested music players and real-song timing on the user's audio hardware.
