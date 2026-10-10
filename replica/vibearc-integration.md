# VibeArc integration findings — 2026-10-10

GitHub: https://github.com/smithcooks/VibeArc (old local remote Akumukage/VibeArc redirects here).
Inspected public default-branch files through the GitHub connector:
- app/src/main/java/com/vibearc/app/OnlineMusic.kt: InnerTube WEB_REMIX song search, NewPipe fallback, bounded resolved-audio cache, audio stream selection.
- app/src/main/java/com/vibearc/app/PlaybackService.kt: native ExoPlayer/Media3 playback, queue and one-time expired-source refresh.
- app/src/main/java/com/vibearc/app/YouTubeMusicSessionApi.kt: experimental signed-in InnerTube account/playlist API. No account cookies, keys or signing files were read.

This implementation does not require a user YouTube Data API key for public song search. Android playback code cannot run unchanged in Electron; the equivalent Windows design is a JS InnerTube adapter plus an in-app audio element and main-screen queue/controls. Avoid adding a Java runtime just to run NewPipe.

Windows implementation: youtubei.js 18.1.0 performs WEB_REMIX public song search and IOS audio resolution. Electron net.fetch succeeds where Node's networking timed out. Full-file range requests were rejected; the app feeds each requested browser range through bounded 64 KB upstream chunks with proper HTTP range headers. It streams without buffering the complete song in Node, accepts only Googlevideo audio URLs, and creates no YouTube website renderer. Expired sources receive one retry. Public search needs no API key.

Timing fix: ignore small backward clock corrections while playing, recognize real seeks/seek epochs, and avoid regenerating lyrics when duration fluctuates. Cancel an outgoing word's pop animation when it becomes inactive. Seven parser/settings/clock/colour/provider validation tests pass.

Live Electron verification: Coldplay Yellow plays; pause/resume and seek beyond 20% recover; 37 LRCLIB lines load; album art is fetched from yt3.googleusercontent.com; fullscreen controls, queued next-song playback and hidden-window audio pass. Screenshots are in artifacts/verse-youtube-music.png and artifacts/verse-album-fullscreen.png. No advertising UI is loaded in this tested path; availability/ad-free behavior across all songs and regions is not guaranteed. No sign-in/private playlist/live-stream support is included.

UI/UX Pro Max guidance applied with the user's neutral palette overriding its music template: system Segoe UI, restrained chrome, translucent borders/reflections, 12px blur on small controls, no glass or coloured boxes behind lyrics. Fullscreen uses a 192px preblurred album image or a slow compositor gradient from the artwork colour. Colour wheel supports pointer and keyboard selection. Glyph animations run on the compositor; scheduling is 30Hz while playing, 5Hz while paused, 2Hz while hidden, and reacts immediately to setting changes.
