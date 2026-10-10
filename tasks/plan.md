# Windows animated lyrics: three-day build plan

Planning date: 2026-10-10. Status: implementation underway; user authorized the build, embedded YouTube Music with separate lyric lookup, and a liquid-glass-inspired UI.

## Current implementation

The user expanded scope from one style to all four. All four style families are implemented independently. Electron uses plain JavaScript modules with built-in syntax checks and node:test, avoiding an unnecessary compilation layer. A self-contained .NET 8 Windows media helper compiles. YouTube Music runs in an isolated WebContentsView and its public MediaSession/HTML media state supplies playback timing; lyrics come separately from LRCLIB or local enhanced LRC. No third-party app repository was copied.

Desktop smoke checks verified rendering, window modes, settings and a real YouTube Music homepage load. LRCLIB live lookup succeeded. Google sign-in, actual media playback and exact reference parity are still unverified. See README.md and replica/build-log.md for concrete limits. The earlier three-day plan below describes the target, not a claim that all acceptance criteria are complete.

## Goal

Build an independent Windows 11 x64 tray app that follows music playback and displays animated, synchronized lyrics in a fullscreen view or desktop overlay. Target a usable personal beta in two to three focused working days, conditional on the integration checkpoint below. A polished public release is a separate milestone.

The user wants all music players. Implement one shared integration for every player exposing Windows System Media Transport Controls (SMTC), plus a session selector. Verify Spotify desktop, Apple Music desktop, Chrome and Edge with YouTube and a web music player. Do not claim universal support: missing or inaccurate metadata/timeline means that player needs additional integration beyond this sprint.

## Verified reference

Verci's public landing page describes real word-level lyric timing, four styles (Ship, Fisheye, Fisheye Visual, Visual), a menu-bar app, Spotify and Apple Music, lock-screen and unlocked visibility, and keeping the display awake during playback. Its lyric coverage figure is the developer's own test result, not a coverage promise for our app.

The page's text was read directly. Its videos, shipping binary and actual settings UI were not inspected. Our screen inventory is a proposed Windows design, not an observed inventory of the original.

## Decisions

- Electron + TypeScript for tray, shortcuts, fullscreen/transparent windows and animated typography. Use a small Windows SMTC bridge; start by validating the approach used by the existing Windows project before choosing PowerShell or a compiled C# helper.
- Evaluate the MIT-licensed Windows project below first. Reuse is a recommendation awaiting the user's preference and a code/license review; it has not been adopted. If building fresh, implement the same narrow scope and prioritize one polished visual style.
- Playback metadata -> matched timed lyrics -> normalized timeline -> renderer. Track/session changes invalidate pending requests so old lyrics cannot replace a new song.
- Interpolate playback between updates with a monotonic clock. Freeze on pause, reset on seek, resynchronize after sleep and session changes. Never invent a timeline for a player that supplies none.
- Keep lyrics and settings local. No accounts, backend, payments or analytics. External lyric lookup necessarily sends song metadata to the provider.
- LRCLIB is a candidate for line-synchronized lyrics. True word timings require a verified source or user-supplied enhanced LRC. Verify provider access and permitted use before adoption. An existing project's NetEase integration is evidence of an approach, not proof of a supported public API.
- Exact word timings where available; line highlighting otherwise. Estimated word animation, if retained from reused code, must be described as approximate. Never advertise line timestamps as true word synchronization.
- A normal app window cannot be treated as the secured Windows lock screen. Use a clearly labeled fullscreen lyrics view while unlocked; hide on lock and respect system sleep/lock policies. No lock-screen bypass or fake security claims.
- Small settings surface: source selector, fullscreen/overlay mode, font size, accent, timing offset, reduced motion, startup toggle. Single display initially; keep windows reachable after monitor changes.

## Scope

Must: tray lifecycle, single instance, SMTC discovery/session selection, timing engine, lyric lookup/cache and no-lyrics states, one animated style, fullscreen/overlay, Escape and shortcut controls, safe handling of lock/sleep, local settings, packaged x64 beta.

Should: all four visual families if suitable reused code exists, local LRC import, optional idle activation, display-awake toggle scoped to visible playback.

Defer: genuine secured-lock-screen rendering, integrations for players without usable SMTC, romanization, extensive icon vocabulary, multi-monitor orchestration, subscriptions, installer signing and automatic updates. Additional visual styles move to a follow-up if building fresh.

## Schedule and gates

| Time | Deliverable | Exit condition |
| --- | --- | --- |
| Day 1, first 2-3 hours | Integration feasibility | Read title, artist, state and changing timeline from target players; test seek/pause; obtain one verified timed lyric result |
| Day 1, remainder | Complete core loop | Real playback drives one simple lyric view; source switch and stale-response protection work |
| Day 2 | Main experience | One polished animation, fullscreen and overlay, tray settings, timing offset and reduced motion |
| Day 3 | Reliability and packaging | Player matrix, no-network/no-lyrics, sleep/lock, DPI checks, focused tests and packaged beta launch |

If the first gate fails, record the unsupported player or word-timing limitation explicitly. Do not consume the sprint adding browser extensions, private endpoints or lock-screen hooks. Reassess scope and deadline with the user. Two days is plausible for a reused base; three days is the safer beta target. A fresh build with all four effects and every player is not a credible three-day commitment.

## Acceptance criteria

- Each tested player has a recorded result: synchronized, metadata-only or unsupported. All available usable sessions can be selected.
- Pause freezes highlighting; seeking in either direction selects the right lyric; track changes never show a previous track's late lookup result.
- Timestamped fixtures select the expected word/line within one rendered frame. Real listening tests record drift and confirm there is no cumulative drift over a complete song; adjust offset for Bluetooth output.
- No lyrics, instrumental tracks, advertisements, missing metadata and network failures have clear states without crashes or guessed lyrics.
- Overlay can be hidden and exited; fullscreen closes with Escape; shortcut collision has a tray fallback. Reduced motion and readable contrast remain usable.
- The app respects Windows lock/sleep and relaunches with persisted settings. It never suggests the fullscreen view secures the PC.
- Type check, focused parser/timing/stale-response tests and package build pass. Packaged app is tested outside the development environment.

## Build handoff

Start with tasks/todo.md Task 1. Prove real SMTC playback and timed lyric availability before visual polish. Keep the sprint local, account-free and limited to the approved scope. Use original lyric text in fixtures and screenshots. Preserve third-party license notices if reusing code. Report the tested compatibility matrix and remaining limitations with the beta.

## Sources

- https://www.verci.xyz/ — original public landing page, directly read; exact visual parity unverified.
- https://github.com/darshanseenivasakumar/theaestheticslyrics — existing Windows implementation; README inspected, code and runtime not audited.
- https://github.com/Maestro2903/maestro-lyrics — independent macOS implementation; README inspected, not a specification for Verci.
- https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager — official supported-session API.
- https://learn.microsoft.com/en-us/windows/win32/winstation/desktops — Windows desktop boundaries.
- https://www.electronjs.org/docs/latest/api/browser-window — window capabilities.
- https://lrclib.net/docs — candidate lyric-provider documentation; response contents not available in the research tool.
