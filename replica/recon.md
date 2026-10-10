# Verci to Windows: preliminary recon

Scope: animated lyrics core loop. Platform: Windows 11 x64. Intended audience: user's initial personal beta; commercial release undecided.

Evidence and source URLs are recorded in ../tasks/plan.md. Original landing-page text was directly read; app screens and videos were not visually inspected. The inventory below is proposed, with medium confidence for functional structure and unverified visual parity.

## Core loop
Play music -> select/detect Windows playback session -> match timed lyrics -> watch synchronized animated text -> change display mode or hide from tray.

## Proposed surfaces
| ID | Surface | Entry | Components and states |
| --- | --- | --- | --- |
| S01 | Tray controls | Tray icon | Player selector, mode, show/hide, settings, exit; unavailable source |
| S02 | Fullscreen lyrics | Shortcut or tray | Track metadata, animated words/lines; loading, playing, paused, missing lyrics, error |
| S03 | Desktop overlay | Tray mode switch | Same lyric component, transparent window; hidden, visible, reduced motion |
| S04 | Settings | Tray | Font size, accent, offset, startup, motion; persisted defaults, invalid value |

## Flows
F01 Launch -> S01 -> start music -> S02 (one shortcut after music starts).
F02 S01 -> source selector -> S02; edge: competing sessions or missing timeline.
F03 S01 -> S03 -> hide; edge: shortcut collision, fullscreen application.
F04 S01 -> S04 -> timing offset -> S02; edge: Bluetooth latency.
F05 S02/S03 -> system lock/sleep -> hidden -> resynchronize on resume.

## Shared components
Lyric renderer (word/line timing, reduced motion), track label, status message, session selector and settings inputs. Fullscreen and overlay reuse the same renderer.

## Proposed local model
PlaybackSession: sourceId, title, artist, album, duration, position, playbackState, sampledAt. Evidence: SMTC documentation; high confidence in concept, availability varies by player.
Lyrics: track key, provider, timing granularity, lines, optional word timestamps. Evidence: reference feature descriptions; exact provider/coverage unverified.
Settings: source selection, mode, fontSize, accent, offsetMs, startup, reducedMotion. Proposed MVP design.
One selected session references one current track and one cached lyric result. No account or server database.

## Size and limitations
Four proposed surfaces, five flows, three local data groups. Weekend-sized beta only with working integrations and tight visuals. Hardest parts: reliable player timeline, true word-timed lyric coverage, animation performance. Genuine secured-lock-screen display, original assets and guaranteed universal coverage are excluded. See features.csv for scope.
