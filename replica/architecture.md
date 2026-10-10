# Implemented architecture

- Electron main process (`src/main.cjs`): tray/windows, local settings/cache/import, guarded lookup generation, isolated YouTube Music view and Windows media helper lifecycle.
- Local preload (`src/preload.cjs`): narrow settings, actions and snapshot interface; no renderer Node access.
- YouTube preload (`src/youtube-preload.cjs`): public HTML media playback and MediaSession metadata only, restricted to music.youtube.com. No lyric extraction or private endpoints.
- Renderer (`src/renderer.mjs`): glass controls, per-frame interpolation, canvas typography and WebGL lens shader. Same renderer for preview/fullscreen/overlay.
- Shared timing (`src/lyrics.mjs`): LRC/enhanced LRC parser, exact or estimated word segments, binary-search active word, position clamp.
- Windows helper (`bridge/Program.cs`): .NET 8 self-contained executable using supported Windows.Media.Control sessions; public metadata and artwork. JSON lines over local process pipes.

No database, server, subscriptions or API-key storage. YouTube playback lives in an isolated persistent Chromium session. Sign-in is left to the user. LRCLIB lookup is a fixed HTTPS endpoint.

Visual thesis: a dark listening workspace with translucent chrome, soft edges and warm lyric colour; animated words remain the dominant visual.
Content plan: source navigation, one large lyric preview, four style choices, display controls, current track, a separate settings surface.
Interaction thesis: eased word depth, a curved glass lens, and quiet control-state transitions; motion can follow accessibility preferences.
