const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, screen, dialog, powerMonitor, powerSaveBlocker, shell, net, protocol } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const readline = require('node:readline');
const { defaults, sanitize } = require('./settings.cjs');

const styles = [['ship', 'Ship'], ['fisheye', 'Fisheye'], ['fisheye-visual', 'Fisheye Visual'], ['visual', 'Visual']];
let settings = { ...defaults }, controls, lyricsWindow, tray, bridge, blocker, playbackTimer;
let state = { track: null, sources: [], lyrics: [], status: 'Start music in a player to see its lyrics.', demo: false };
let lyricApi, request, generation = 0, currentKey = '', locked = false, quitting = false;
let demoStart = 0, bridgeLastSeen = 0, idleOpened = false, shortcutAvailable = false;
let externalTrack = null, artworkRequest;
let nativeTrack = null, nativeTicket = 0;
let nativeStream = null;
let controlsRestoreBounds = null;
protocol.registerSchemesAsPrivileged([{ scheme: 'verse-audio', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
const nativePlayer = require('./youtube.cjs').createPlayer((url, options = {}) => net.fetch(url, { ...options, signal: AbortSignal.timeout(15000) }));
const dataPath = (...parts) => path.join(app.getPath('userData'), ...parts);
const hash = value => createHash('sha256').update(value).digest('hex');
const demoLrc = '[00:00.00]<00:00.00>Let <00:00.55>the <00:01.05>night <00:01.90>unfold\n[00:04.00]<00:04.00>We <00:04.55>are <00:05.05>made <00:05.80>of <00:06.30>starlight\n[00:08.00]<00:08.00>Every <00:08.80>heartbeat <00:09.85>finds <00:10.50>a <00:10.90>home\n[00:13.00]<00:13.00>Like <00:13.55>an <00:14.05>ocean <00:15.10>in <00:15.55>the <00:16.00>sky\n[00:18.00]<00:18.00>Stay <00:18.80>here <00:19.50>with <00:20.10>me\n[00:22.00]<00:22.00>Tonight';

if (process.argv.includes('--smoke')) app.setPath('userData', path.join(process.cwd(), 'artifacts', 'smoke-profile'));
if (!app.requestSingleInstanceLock()) { console.log('Verse is already running.'); app.quit(); }
else {
  app.on('second-instance', () => { controls?.show(); controls?.focus(); });
  app.whenReady().then(start).catch(error => { console.error(error.stack); if (!process.argv.includes('--smoke')) dialog.showErrorBox('Verse could not start', error.message); app.exit(1); });
}
app.on('window-all-closed', () => {});
app.on('before-quit', () => { quitting = true; clearInterval(playbackTimer); request?.abort(); artworkRequest?.abort(); bridge?.kill(); globalShortcut.unregisterAll(); stopBlocker(); });

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) console.error(error.message);
    return null;
  }
}
async function saveJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.tmp', JSON.stringify(value), 'utf8');
  await fs.rename(file + '.tmp', file);
}
function displays() { return screen.getAllDisplays().map(d => ({ id: String(d.id), label: d.label || `${d.bounds.width} × ${d.bounds.height}`, primary: d.id === screen.getPrimaryDisplay().id })); }
function snapshot() { return { ...state, settings, displays: displays(), shortcutAvailable, packaged: app.isPackaged, version: app.getVersion() }; }
function send() {
  if (quitting) return;
  for (const window of [controls, lyricsWindow]) if (window && !window.isDestroyed() && window.isVisible()) window.webContents.send('state', snapshot());
  updateBlocker();
}
function stopBlocker() { if (blocker !== undefined) { powerSaveBlocker.stop(blocker); blocker = undefined; } }
function updateBlocker() {
  const needed = !quitting && !locked && settings.keepAwake && state.track?.playing && lyricsWindow && !lyricsWindow.isDestroyed() && lyricsWindow.isVisible();
  if (needed && blocker === undefined) blocker = powerSaveBlocker.start('prevent-display-sleep');
  else if (!needed) stopBlocker();
}
function secureWindow(options) {
  const win = new BrowserWindow({ ...options, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  win.webContents.on('render-process-gone', (_event, details) => console.error('Renderer stopped:', details.reason));
  return win;
}
function targetDisplay() { return screen.getAllDisplays().find(d => String(d.id) === settings.display) || screen.getPrimaryDisplay(); }
function positionLyrics() {
  if (!lyricsWindow) return;
  const display = targetDisplay();
  lyricsWindow.setFullScreen(false);
  if (settings.mode === 'overlay') {
    const area = display.workArea;
    const width = Math.min(700, area.width), height = Math.min(650, area.height);
    lyricsWindow.setBounds({ x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height });
    lyricsWindow.setAlwaysOnTop(true, 'floating');
    lyricsWindow.setIgnoreMouseEvents(!settings.overlayInteractive, { forward: true });
  } else {
    lyricsWindow.setBounds(display.bounds);
    lyricsWindow.setAlwaysOnTop(false);
    lyricsWindow.setIgnoreMouseEvents(false);
    lyricsWindow.setFullScreen(true);
  }
}
function showLyrics() {
  if (locked) return;
  positionLyrics();
  idleOpened = false;
  if (settings.mode === 'overlay') lyricsWindow.showInactive(); else lyricsWindow.show();
  send();
}
function hideLyrics() { lyricsWindow?.hide(); idleOpened = false; updateBlocker(); }
function showControls() { controls.show(); controls.focus(); }
function acceptPlayback() {
  if (state.demo) return;
  state.track = settings.source === 'verse-player' ? nativeTrack : !settings.source && nativeTrack?.playing ? nativeTrack : externalTrack || (!settings.source ? nativeTrack : null);
  const key = lyricApi.trackKey(state.track);
  if (key !== currentKey) {
    currentKey = key; generation++; request?.abort(); state.lyrics = [];
    if (state.track?.title && state.track?.artist) lookup(state.track);
    else state.status = state.track ? 'This player did not provide a song title and artist.' : settings.source === 'verse-player' ? 'Choose a song in Music.' : 'Start music in a player to see its lyrics.';
  }
}
async function loadYoutubeArtwork(url, key) {
  artworkRequest?.abort();
  const abort = new AbortController(); artworkRequest = abort;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !['lh3.googleusercontent.com', 'yt3.googleusercontent.com', 'i.ytimg.com', 'yt3.ggpht.com'].includes(parsed.hostname)) return;
    const timeout = setTimeout(() => abort.abort(), 8000);
    try {
      const response = await net.fetch(url, { signal: abort.signal, redirect: 'error' });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.startsWith('image/') || Number(response.headers.get('content-length')) > 2_000_000) { if (process.argv.includes('--smoke')) console.log('Artwork response:', response.status, type); return; }
      const bytes = Buffer.from(await response.arrayBuffer());
      const target = nativeTrack;
      if (target && bytes.length <= 2_000_000 && lyricApi.trackKey(target) === key) { target.artwork = `data:${type};base64,${bytes.toString('base64')}`; acceptPlayback(); send(); }
    } finally { clearTimeout(timeout); }
  } catch (error) { if (process.argv.includes('--smoke')) console.log('Artwork unavailable:', error.message); }
}
function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show lyrics', click: showLyrics }, { label: 'Hide lyrics', click: hideLyrics },
    { type: 'separator' },
    { label: 'Display style', submenu: styles.map(([value, label]) => ({ label, type: 'radio', checked: settings.style === value, click: () => updateSettings({ style: value }) })) },
    { label: 'View', submenu: ['fullscreen', 'overlay'].map(value => ({ label: value === 'fullscreen' ? 'Fullscreen (unlocked)' : 'Desktop overlay', type: 'radio', checked: settings.mode === value, click: () => updateSettings({ mode: value }) })) },
    { label: 'Player', submenu: [{ label: 'Follow active playback', type: 'radio', checked: !settings.source, click: () => updateSettings({ source: '' }) }, ...state.sources.map(source => ({ label: source === 'verse-player' ? 'Verse YouTube player' : source, type: 'radio', checked: settings.source === source, click: () => updateSettings({ source }) }))] },
    { label: 'Monitor', submenu: displays().map(d => ({ label: d.label, type: 'radio', checked: settings.display ? settings.display === d.id : d.primary, click: () => updateSettings({ display: d.id }) })) },
    { type: 'separator' },
    { label: 'Auto Sync colours', type: 'checkbox', checked: settings.autoSync, click: item => updateSettings({ autoSync: item.checked }) },
    { label: 'Keep display awake', type: 'checkbox', checked: settings.keepAwake, click: item => updateSettings({ keepAwake: item.checked }) },
    { label: 'Demo playback', type: 'checkbox', checked: state.demo, click: item => setDemo(item.checked) },
    { label: 'Music', click: () => { showControls(); controls.webContents.send('navigate', 'music'); } },
    { label: 'Import timed lyrics…', click: async () => { const result = await importLyrics(); if (result.error) dialog.showErrorBox('Lyrics could not be imported', result.error); } }, { label: 'Preferences…', click: showControls },
    { type: 'separator' }, { label: 'Quit Verse', click: () => app.quit() }
  ]));
}
let saveQueue = Promise.resolve();
async function updateSettings(patch) {
  const old = settings;
  settings = sanitize({ ...settings, ...patch });
  if (old.startup !== settings.startup) {
    if (!app.isPackaged) settings.startup = false;
    else app.setLoginItemSettings({ openAtLogin: settings.startup, path: app.getPath('exe'), args: ['--background'] });
  }
  if (old.source !== settings.source) {
    generation++; request?.abort(); currentKey = ''; state.track = null; state.lyrics = [];
    state.status = 'Waiting for the selected player…';
    if (bridge?.stdin.writable) bridge.stdin.write(JSON.stringify({ source: ['youtube-internal', 'verse-player'].includes(settings.source) ? '' : settings.source }) + '\n');
    externalTrack = null;
    acceptPlayback();
  }
  if (old.mode !== settings.mode || old.display !== settings.display || old.overlayInteractive !== settings.overlayInteractive) positionLyrics();
  const value = { ...settings };
  saveQueue = saveQueue.catch(() => {}).then(() => saveJson(dataPath('settings.json'), value));
  try { await saveQueue; } catch (error) { state.status = `Preferences could not be saved: ${error.message}`; }
  rebuildTray(); send();
  return snapshot();
}

async function lookup(track) {
  const key = lyricApi.trackKey(track), ticket = ++generation;
  request?.abort();
  const abort = new AbortController(); request = abort;
  state.lyrics = []; state.status = 'Finding timed lyrics…'; send();
  const fileKey = hash(JSON.stringify([track.title, track.artist, track.album]));
  const localPath = dataPath('lyrics', fileKey + '.lrc');
  let text;
  try { text = await fs.readFile(localPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') console.error(error.message); }
  let result = text ? { syncedLyrics: text, local: true } : await readJson(dataPath('cache', hash(key) + '.json'));
  try {
    if (!result) {
      const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
      if (track.album) params.set('album_name', track.album);
      if (track.duration > 0) params.set('duration', String(Math.round(track.duration)));
      const timeout = setTimeout(() => abort.abort(), 12000);
      try {
        const response = await fetch(`https://lrclib.net/api/get?${params}`, { headers: { 'User-Agent': 'VerseWindows/0.1 (local desktop lyrics app)' }, signal: abort.signal });
        if (response.status === 404) result = { missing: true };
        else if (!response.ok) throw new Error(`Lyric service returned ${response.status}.`);
        else {
          const json = await response.json();
          if (typeof json !== 'object' || !json) throw new Error('Invalid lyric response.');
          result = { syncedLyrics: typeof json.syncedLyrics === 'string' ? json.syncedLyrics : '', instrumental: json.instrumental === true };
          await saveJson(dataPath('cache', hash(key) + '.json'), result);
        }
      } finally { clearTimeout(timeout); }
    }
    if (ticket !== generation || key !== currentKey || state.demo) return;
    state.lyrics = result.syncedLyrics ? lyricApi.parseLrc(result.syncedLyrics) : [];
    state.status = result.instrumental ? 'Instrumental track' : state.lyrics.length ? (result.local ? 'Imported lyrics' : 'Lyrics from LRCLIB') : 'No timed lyrics found. Import an LRC file to add this track.';
  } catch (error) {
    if (ticket !== generation) return;
    state.status = error.name === 'AbortError' ? 'Lyric lookup timed out. Retry or import an LRC file.' : `Lyrics unavailable: ${error.message}`;
    state.lyrics = [];
  }
  send();
}
async function importLyrics() {
  if (!state.track || state.demo) return { error: 'Play a real track before importing lyrics.' };
  const track = { ...state.track }, key = currentKey;
  const result = await dialog.showOpenDialog(controls, { title: 'Choose lyrics for the current track', filters: [{ name: 'Timed lyrics', extensions: ['lrc'] }], properties: ['openFile'] });
  if (result.canceled) return { canceled: true };
  try {
    const stat = await fs.stat(result.filePaths[0]);
    if (stat.size > 2_000_000) throw new Error('Choose a file smaller than 2 MB.');
    const text = await fs.readFile(result.filePaths[0], 'utf8');
    const lines = lyricApi.parseLrc(text);
    if (!lines.length) throw new Error('This file does not contain timed lyrics.');
    if (currentKey !== key || state.demo) throw new Error('The track changed. Import for the new track instead.');
    const fileKey = hash(JSON.stringify([track.title, track.artist, track.album]));
    await fs.mkdir(dataPath('lyrics'), { recursive: true });
    await fs.writeFile(dataPath('lyrics', fileKey + '.lrc'), text, 'utf8');
    generation++; request?.abort(); state.lyrics = lines; state.status = 'Imported lyrics'; send();
    return { ok: true };
  } catch (error) { return { error: error.message }; }
}
function setDemo(enabled) {
  generation++; request?.abort(); currentKey = ''; state.demo = enabled;
  if (enabled) {
    demoStart = performance.now();
    state.track = { source: 'Verse original demo', title: 'Made of Starlight', artist: 'Verse · original demo text', album: 'A little light', duration: 26, position: 0, playing: true, rate: 1 };
    state.lyrics = lyricApi.parseLrc(demoLrc); state.status = 'Original demo · true word timestamps';
  } else { state.track = null; state.lyrics = []; state.status = 'Waiting for music…'; }
  rebuildTray(); send();
}
function startBridge() {
  if (process.platform !== 'win32') { state.status = 'Live playback requires Windows.'; send(); return; }
  const executable = app.isPackaged ? path.join(process.resourcesPath, 'bridge', 'MediaBridge.exe') : path.join(__dirname, '..', 'bridge', 'bin', 'publish', 'MediaBridge.exe');
  bridge = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  bridge.on('error', error => { if (!state.demo) { state.status = `Playback helper unavailable: ${error.message}. Run npm run bridge.`; send(); } });
  bridge.stderr.on('data', data => console.error(String(data)));
  bridge.stdin.on('error', error => console.error(error.message));
  bridge.on('spawn', () => bridge.stdin.write(JSON.stringify({ source: ['youtube-internal', 'verse-player'].includes(settings.source) ? '' : settings.source }) + '\n'));
  readline.createInterface({ input: bridge.stdout }).on('line', line => {
    try {
      const value = JSON.parse(line); bridgeLastSeen = Date.now();
      const sources = ['verse-player', ...(Array.isArray(value.sources) ? value.sources.filter(s => typeof s === 'string') : [])];
      const changedSources = JSON.stringify(sources) !== JSON.stringify(state.sources);
      state.sources = sources;
      externalTrack = value.track;
      acceptPlayback();
      if (value.error && !state.demo && !nativeTrack && settings.source !== 'youtube-internal') state.status = `Windows playback unavailable: ${value.error}`;
      if (changedSources) rebuildTray();
      send();
    } catch (error) { console.error('Invalid playback update:', error.message); }
  });
  bridge.on('exit', () => {
    if (quitting) return;
    if (!state.demo && !nativeTrack && settings.source !== 'youtube-internal') { generation++; request?.abort(); currentKey = ''; state.track = null; state.lyrics = []; state.status = 'Playback helper stopped. Restart Verse to reconnect.'; send(); }
  });
}
async function start() {
  console.log('Starting Verse desktop…');
  protocol.handle('verse-audio', async request => {
    if (!nativeStream || request.url !== nativeStream.local) return new Response(null, { status: 404 });
    try {
      const stream = nativeStream;
      const range = request.headers.get('range');
      let start = 0, end = stream.size - 1;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) return new Response(null, { status: 416 });
        if (match[1]) { start = Number(match[1]); if (match[2]) end = Number(match[2]); }
        else if (match[2]) start = Math.max(0, stream.size - Number(match[2]));
      }
      end = Math.min(end, stream.size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stream.size) return new Response(null, { status: 416 });
      const abort = new AbortController();
      request.signal.addEventListener('abort', () => abort.abort(), { once: true });
      let offset = start;
      // Feed the browser its requested range using bounded upstream chunks; never buffer the entire song in Node.
      const body = new ReadableStream({
        async pull(controller) {
          if (offset > end) { controller.close(); return; }
          try {
            const last = Math.min(end, offset + 65535), url = new URL(stream.remote);
            url.searchParams.set('range', `${offset}-${last}`);
            const response = await net.fetch(url.href, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
            if (!response.ok) throw new Error(`Audio server returned ${response.status}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.length !== last - offset + 1) throw new Error('Incomplete audio range');
            offset += bytes.length; controller.enqueue(bytes);
          } catch (error) { controller.error(error); }
        },
        cancel() { abort.abort(); }
      });
      return new Response(body, { status: range ? 206 : 200, headers: { 'Content-Type': stream.mime, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${stream.size}` } : {}) } });
    } catch { return new Response(null, { status: 502 }); }
  });
  lyricApi = await import('./lyrics.mjs');
  const savedSettings = await readJson(dataPath('settings.json'));
  settings = sanitize(savedSettings);
  if (settings.source === 'youtube-internal') settings.source = 'verse-player';
  if (savedSettings && savedSettings.animationRevision !== 3) {
    settings = { ...settings, estimateWords: true, reducedMotion: false, respectSystemMotion: false, font: 'Segoe UI', fontSize: 112, fontWeight: 800, lyric: '#ffffff', secondary: '#b7b7c5', autoSync: false, mode: 'overlay', overlayInteractive: false };
    await saveJson(dataPath('settings.json'), settings);
  }
  if (savedSettings && savedSettings.backgroundRevision !== 1) {
    settings.background = 'gradient';
    await saveJson(dataPath('settings.json'), settings);
  }
  const area = screen.getPrimaryDisplay().workArea;
  // Transparent Electron windows need a fixed frame; Expand uses explicit bounds instead of native maximize.
  controls = secureWindow({ width: Math.min(1080, area.width), height: Math.min(760, area.height), transparent: true, frame: false, resizable: false, maximizable: false, backgroundColor: '#00000000', title: 'Verse', autoHideMenuBar: true, show: false });
  lyricsWindow = secureWindow({ width: 1000, height: 720, transparent: true, frame: false, backgroundColor: '#00000000', skipTaskbar: true, show: false, title: 'Verse · lyrics' });
  controls.on('close', event => { if (!quitting) { event.preventDefault(); controls.hide(); } });
  lyricsWindow.on('close', event => { if (!quitting) { event.preventDefault(); hideLyrics(); } });
  lyricsWindow.on('hide', updateBlocker);
  const pixels = Buffer.alloc(20 * 20 * 4);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const row = Math.floor(y / 5), width = [15, 10, 17, 7][row];
    if (y % 5 < 3 && x >= 2 && x < width) { const i = (y * 20 + x) * 4; pixels[i] = 157; pixels[i + 1] = 98; pixels[i + 2] = 235; pixels[i + 3] = 255; }
  }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 20, height: 20 }));
  tray.setToolTip('Verse · animated lyrics'); tray.on('click', showControls);
  const trusted = event => [controls, lyricsWindow].some(win => win?.webContents.id === event.sender.id);
  const handle = (channel, handler) => ipcMain.handle(channel, (event, ...args) => { if (!trusted(event)) throw new Error('Unknown window.'); return handler(...args); });
  handle('state', snapshot);
  handle('music-search', query => nativePlayer.search(query));
  handle('music-recommendations', id => nativePlayer.recommendations(id));
  handle('music-resolve', async (id, saved) => {
    const ticket = ++nativeTicket;
    const song = await nativePlayer.resolve(id, saved);
    if (ticket !== nativeTicket) throw new Error('Another song was selected.');
    nativeStream = { remote: song.url, local: `verse-audio://player/${song.id}?session=${ticket}`, size: song.size, mime: song.mime };
    if (state.demo) setDemo(false);
    nativeTrack = { ...song, url: undefined, source: 'Verse YouTube', position: 0, playing: false, rate: 1, seekEpoch: 0, timelineAvailable: true };
    await updateSettings({ source: 'verse-player' });
    acceptPlayback(); send();
    loadYoutubeArtwork(song.artworkUrl, lyricApi.trackKey(nativeTrack));
    return { ...song, url: nativeStream.local };
  });
  handle('music-command', name => {
    if (!['toggle', 'next', 'previous'].includes(name)) throw new Error('Unknown playback control.');
    controls.webContents.send('music-command', name);
  });
  ipcMain.on('music-playback', (event, value) => {
    if (event.sender.id !== controls.webContents.id || !nativeTrack || value?.id !== nativeTrack.id) return;
    if (!Number.isFinite(value.position) || value.position < 0 || !Number.isFinite(value.duration) || value.duration < 0 || value.duration > 86400 || !Number.isSafeInteger(value.seekEpoch) || value.seekEpoch < 0) return;
    Object.assign(nativeTrack, { position: value.position, duration: value.duration || nativeTrack.duration, playing: value.playing === true, seekEpoch: value.seekEpoch });
    acceptPlayback(); send();
  });
  handle('settings', patch => updateSettings(patch));
  handle('action', async action => {
    if (action === 'show') showLyrics(); else if (action === 'hide') hideLyrics();
    else if (action === 'preferences') showControls(); else if (action === 'demo') setDemo(!state.demo);
    else if (action === 'retry' && state.track && !state.demo) lookup(state.track);
    else if (action === 'music-browser') shell.openExternal('https://music.youtube.com/');
    else if (action === 'quit') app.quit();
    else if (action === 'window-hide') controls.hide();
    else if (action === 'window-minimize') controls.minimize();
    else if (action === 'window-expand') {
      if (controlsRestoreBounds) { controls.setBounds(controlsRestoreBounds); controlsRestoreBounds = null; }
      else { controlsRestoreBounds = controls.getBounds(); controls.setBounds(screen.getDisplayMatching(controlsRestoreBounds).workArea); }
    }
    return snapshot();
  });
  handle('import', importLyrics);
  await Promise.all([controls.loadFile(path.join(__dirname, 'index.html')), lyricsWindow.loadFile(path.join(__dirname, 'index.html'), { query: { view: 'lyrics' } })]);
  shortcutAvailable = globalShortcut.register('Control+Alt+L', () => lyricsWindow.isVisible() ? hideLyrics() : showLyrics());
  globalShortcut.register('Control+Alt+,', showControls);
  screen.on('display-removed', () => { positionLyrics(); rebuildTray(); send(); });
  screen.on('display-added', () => { rebuildTray(); send(); });
  powerMonitor.on('lock-screen', () => { locked = true; hideLyrics(); });
  powerMonitor.on('unlock-screen', () => { locked = false; send(); });
  powerMonitor.on('suspend', () => { locked = true; hideLyrics(); });
  powerMonitor.on('resume', () => { locked = false; currentKey = ''; generation++; request?.abort(); state.track = null; state.lyrics = []; send(); });
  startBridge();
  if (process.argv.includes('--demo')) { setDemo(true); showLyrics(); }
  if (!process.argv.includes('--background')) showControls();
  rebuildTray(); send();
  console.log('Verse windows ready.');
  playbackTimer = setInterval(() => {
    if (state.demo) { if (state.track.playing) state.track.position = ((performance.now() - demoStart) / 1000) % 26; send(); }
    else if (!nativeTrack && settings.source !== 'youtube-internal' && bridgeLastSeen && Date.now() - bridgeLastSeen > 8000 && state.track?.source !== 'YouTube Music' && state.track) {
      generation++; request?.abort(); currentKey = ''; state.track = null; state.lyrics = []; state.status = 'Playback updates stopped. Waiting to reconnect…'; send();
    }
    if (settings.idle && !locked && state.track?.playing && state.lyrics.length && !lyricsWindow.isDestroyed()) {
      const idle = powerMonitor.getSystemIdleTime();
      if (idle >= 120 && !lyricsWindow.isVisible()) { showLyrics(); idleOpened = true; }
      else if (idle < 2 && idleOpened) hideLyrics();
    }
  }, 500);
  if (process.argv.includes('--smoke')) await runSmoke();
}

async function runSmoke() {
  const assert = require('node:assert/strict');
  const output = path.join(process.cwd(), 'artifacts');
  await fs.mkdir(output, { recursive: true });
  controls.show(); controls.focus();
  controls.webContents.setBackgroundThrottling(false);
  await new Promise(resolve => setTimeout(resolve, 400));
  const translucency = async () => {
    const pixels = (await controls.webContents.capturePage({ x: 600, y: 90, width: 30, height: 20 })).toBitmap();
    assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0 && value < 230), 'Main window surface is opaque.');
  };
  await translucency();
  const originalBounds = controls.getBounds();
  await controls.webContents.executeJavaScript(`document.querySelector('[data-action="window-expand"]').click()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.deepEqual(controls.getBounds(), screen.getDisplayMatching(originalBounds).workArea);
  await translucency();
  await controls.webContents.executeJavaScript(`document.querySelector('[data-action="window-expand"]').click()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.deepEqual(controls.getBounds(), originalBounds);
  console.log('Whole-window translucency and Expand/Restore passed.');
  const realFetch = global.fetch;
  let releaseFetch, signalFetch;
  const startedFetch = new Promise(resolve => signalFetch = resolve);
  const lateResponse = new Promise(resolve => releaseFetch = resolve);
  global.fetch = async () => { signalFetch(); return lateResponse; };
  setDemo(true);
  const staleTrack = { source: 'Smoke fixture', title: `Original late fixture ${Date.now()}`, artist: 'Verse tests', duration: 10 };
  currentKey = lyricApi.trackKey(staleTrack);
  const pending = lookup(staleTrack);
  try {
    await startedFetch;
    setDemo(true);
    releaseFetch({ ok: true, json: async () => ({ syncedLyrics: '[00:01]Obsolete original fixture' }) });
    await pending;
    assert.equal(state.status, 'Original demo · true word timestamps');
    assert.equal(state.lyrics[0].text, 'Let the night unfold');
    console.log('Stale lyric response rejected after source change.');
  } finally { global.fetch = realFetch; }
  setDemo(true);
  demoStart = performance.now() - 8500;
  state.track.position = 8.5;
  await updateSettings({ reducedMotion: false, respectSystemMotion: false });
  for (const [style] of styles) {
    await updateSettings({ style });
    const deadline = Date.now() + 10000;
    let visible = false;
    while (Date.now() < deadline) {
      visible = await controls.webContents.executeJavaScript(`document.querySelector('[data-style="${style}"]').getAttribute('aria-pressed') === 'true' && document.querySelector('#empty').hidden`);
      if (visible) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(visible, true, `Style ${style} did not render`);
    await new Promise(resolve => setTimeout(resolve, 250));
    await fs.writeFile(path.join(output, `verse-${style}.png`), (await controls.webContents.capturePage()).toPNG());
  }
  assert.equal(state.lyrics.length, 6);
  assert.equal(state.demo, true);
  await updateSettings({ style: 'fisheye-visual' });
  state.track.playing = false; state.track.position = 8.72; send();
  await new Promise(resolve => setTimeout(resolve, 350));
  const beforePop = (await controls.webContents.capturePage({ x: 240, y: 125, width: 600, height: 190 })).toPNG();
  state.track.position = 8.91; send();
  await new Promise(resolve => setTimeout(resolve, 100));
  const afterPop = (await controls.webContents.capturePage({ x: 240, y: 125, width: 600, height: 190 })).toPNG();
  assert.notEqual(hash(beforePop), hash(afterPop), 'Word transition did not change the lyric canvas.');
  await fs.writeFile(path.join(output, 'word-pop-before.png'), beforePop);
  await fs.writeFile(path.join(output, 'word-pop-after.png'), afterPop);
  const frameRate = await controls.webContents.executeJavaScript(`new Promise(resolve => {
    let first, frames = 0; const deadline = setTimeout(() => resolve(0), 2500); function sample(now) { first ??= now; frames++;
      if (now - first >= 1000) { clearTimeout(deadline); resolve(Math.round((frames - 1) * 1000 / (now - first))); }
      else requestAnimationFrame(sample); } requestAnimationFrame(sample);
  })`);
  const textProbe = await controls.webContents.executeJavaScript(`(() => {
    const stage = document.querySelector('#preview-canvas'), active = stage.querySelector('.active');
    return { word: stage.dataset.activeWord, nodes: stage.children.length, canvas: stage.tagName,
      background: getComputedStyle(active.firstElementChild).backgroundColor,
      transition: getComputedStyle(active).transitionDuration, clock: !!document.querySelector('#clock') };
  })()`);
  assert.equal(textProbe.word, 'heartbeat'); assert.ok(textProbe.nodes <= 5);
  assert.equal(textProbe.canvas, 'DIV'); assert.equal(textProbe.background, 'rgba(0, 0, 0, 0)');
  assert.equal(textProbe.clock, false); assert.notEqual(textProbe.transition, '0s');
  await updateSettings({ fontSize: 80 }); await new Promise(resolve => setTimeout(resolve, 80));
  const smallSize = await controls.webContents.executeJavaScript(`parseFloat(getComputedStyle(document.querySelector('#preview-canvas')).fontSize)`);
  await updateSettings({ fontSize: 160 }); await new Promise(resolve => setTimeout(resolve, 80));
  const largeSize = await controls.webContents.executeJavaScript(`parseFloat(getComputedStyle(document.querySelector('#preview-canvas')).fontSize)`);
  assert.equal(largeSize, smallSize * 2);
  await updateSettings({ fontSize: 112 });
  console.log('Native word pop verified, no word background/clock, size doubles correctly; foreground FPS:', frameRate);
  controls.webContents.debugger.attach('1.3');
  try {
    await controls.webContents.debugger.sendCommand('Performance.enable');
    const readMetrics = async () => Object.fromEntries((await controls.webContents.debugger.sendCommand('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
    const before = await readMetrics();
    await new Promise(resolve => setTimeout(resolve, 1500));
    const after = await readMetrics();
    console.log('Renderer task milliseconds over 1.5 seconds:', Math.round((after.TaskDuration - before.TaskDuration) * 1000));
  } finally { controls.webContents.debugger.detach(); }
  setDemo(true);
  await updateSettings({ mode: 'overlay' }); showLyrics();
  assert.equal(lyricsWindow.isVisible(), true);
  hideLyrics(); assert.equal(lyricsWindow.isVisible(), false);
  await updateSettings({ mode: 'fullscreen', background: 'gradient' }); showLyrics();
  lyricsWindow.webContents.setBackgroundThrottling(false);
  state.track.playing = false; state.track.position = 8.91; send();
  await new Promise(resolve => setTimeout(resolve, 500));
  const animations = await lyricsWindow.webContents.executeJavaScript(`document.querySelector('#gradient-backdrop').getAnimations({subtree: true}).length`);
  assert.equal(animations, 3, 'Expected three compositor gradient layers.');
  const region = { x: 80, y: 100, width: 180, height: 160 };
  const gradientBefore = (await lyricsWindow.webContents.capturePage(region)).toPNG();
  await new Promise(resolve => setTimeout(resolve, 1600));
  const gradientAfter = (await lyricsWindow.webContents.capturePage(region)).toPNG();
  assert.notEqual(hash(gradientBefore), hash(gradientAfter), 'Fullscreen gradient did not move while lyrics were paused.');
  await fs.writeFile(path.join(output, 'verse-fullscreen.png'), (await lyricsWindow.webContents.capturePage()).toPNG());
  await updateSettings({ reducedMotion: true });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await lyricsWindow.webContents.executeJavaScript(`document.querySelector('#gradient-backdrop').getAnimations({subtree: true}).length`), 0);
  const stillBefore = (await lyricsWindow.webContents.capturePage(region)).toPNG();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(hash(stillBefore), hash((await lyricsWindow.webContents.capturePage(region)).toPNG()));
  await updateSettings({ reducedMotion: false });
  console.log('Fullscreen gradient changes continuously; reduced motion freezes every layer.');
  hideLyrics();
  controls.show(); controls.focus();
  await controls.webContents.executeJavaScript(`document.querySelector('[data-tab="settings"]').click()`);
  assert.equal(await controls.webContents.executeJavaScript(`document.querySelector('#settings-page').classList.contains('active')`), true);
  await new Promise(resolve => setTimeout(resolve, 500));
  await fs.writeFile(path.join(output, 'verse-settings.png'), (await controls.webContents.capturePage()).toPNG());
  console.log('Windows reduced-motion preference:', await controls.webContents.executeJavaScript(`matchMedia('(prefers-reduced-motion: reduce)').matches`));
  console.log('Desktop smoke passed: four styles, demo lyrics, overlay/fullscreen visibility, preferences.');
  if (process.argv.includes('--music-smoke')) {
    setDemo(false);
    await controls.webContents.executeJavaScript(`document.querySelector('[data-tab="music"]').click(); document.querySelector('#native-audio').volume = .03;`, true);
    const waitFor = async (expression, timeout = 25000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) { if (await controls.webContents.executeJavaScript(expression)) return; await new Promise(resolve => setTimeout(resolve, 250)); }
      throw new Error(`Native player check timed out: ${await controls.webContents.executeJavaScript(`document.querySelector('#music-status').textContent + ' · ' + document.querySelector('#music-recommendations').textContent`)} (${expression})`);
    };
    if (await controls.webContents.executeJavaScript(`document.querySelectorAll('#history-songs .song-row').length > 0`)) {
      await controls.webContents.executeJavaScript(`document.querySelector('[data-library="history"]').click(); document.querySelector('#history-songs .song-detail').click()`, true);
      await waitFor(`document.querySelector('#native-audio').currentTime > 1 && !document.querySelector('#native-audio').paused`);
      console.log('Saved listening history plays after app restart without searching again.');
    }
    await controls.webContents.executeJavaScript(`document.querySelector('#music-query').value = 'Coldplay Yellow'; document.querySelector('#music-search').requestSubmit();`, true);
    await waitFor(`document.querySelectorAll('#music-results .song-row').length > 0`);
    await controls.webContents.executeJavaScript(`document.querySelector('#music-results .queue-add').click(); document.querySelector('#music-results .song-detail').click();`, true);
    await waitFor(`document.querySelector('#native-audio').currentTime > 1 && !document.querySelector('#native-audio').paused`);
    assert.ok(nativeTrack?.playing);
    console.log('Native audio playing:', nativeTrack.title, 'position:', nativeTrack.position.toFixed(2), 'seconds');
    assert.equal(await controls.webContents.executeJavaScript(`document.querySelector('#page-title').textContent`), 'Music');
    assert.ok(await controls.webContents.executeJavaScript(`document.querySelectorAll('#history-songs .song-row').length > 0 && !localStorage.getItem('verse-history').includes('verse-audio:')`));
    await controls.webContents.executeJavaScript(`if (document.querySelector('#like-current').getAttribute('aria-pressed') !== 'true') document.querySelector('#like-current').click(); document.querySelector('[data-library="home"]').click()`, true);
    await waitFor(`document.querySelectorAll('#music-recommendations .album-card').length > 0`);
    assert.ok(await controls.webContents.executeJavaScript(`document.querySelectorAll('#liked-songs .song-row').length > 0`));
    await new Promise(resolve => setTimeout(resolve, 1000));
    await fs.writeFile(path.join(output, 'verse-music-library.png'), (await controls.webContents.capturePage()).toPNG());
    await controls.webContents.executeJavaScript(`document.querySelector('[data-library="history"]').click()`, true);
    await fs.writeFile(path.join(output, 'verse-music-history.png'), (await controls.webContents.capturePage()).toPNG());
    await controls.webContents.executeJavaScript(`document.querySelector('[data-library="home"]').click()`, true);
    console.log('Music library: actual radio recommendations, persistent local history, liked songs, and Music label passed.');
    await controls.webContents.executeJavaScript(`document.querySelector('[data-music="toggle"]').click()`, true);
    await waitFor(`document.querySelector('#native-audio').paused`, 5000);
    await controls.webContents.executeJavaScript(`document.querySelector('[data-music="toggle"]').click()`, true);
    await waitFor(`!document.querySelector('#native-audio').paused`, 5000);
    await controls.webContents.executeJavaScript(`document.querySelector('#player-seek').value = 200; document.querySelector('#player-seek').dispatchEvent(new Event('input'))`);
    await waitFor(`document.querySelector('#native-audio').currentTime > document.querySelector('#native-audio').duration * .2 + 2 && !document.querySelector('#native-audio').paused`);
    await waitFor(`document.querySelector('#artwork').src.startsWith('data:image/')`, 12000);
    await new Promise(resolve => setTimeout(resolve, 700));
    await fs.writeFile(path.join(output, 'verse-youtube-music.png'), (await controls.webContents.capturePage()).toPNG());
    console.log('Native queue, pause/resume, seek and album artwork passed; lyric lines:', state.lyrics.length);
    showLyrics();
    await new Promise(resolve => setTimeout(resolve, 700));
    await fs.writeFile(path.join(output, 'verse-album-fullscreen.png'), (await lyricsWindow.webContents.capturePage()).toPNG());
    await lyricsWindow.webContents.executeJavaScript(`document.querySelector('[data-music="toggle"]').click()`, true);
    await waitFor(`document.querySelector('#native-audio').paused`, 5000);
    console.log('Fullscreen playback control passed.');
    await lyricsWindow.webContents.executeJavaScript(`document.querySelector('[data-music="toggle"]').click()`, true);
    await waitFor(`!document.querySelector('#native-audio').paused`, 5000);
    controls.hide();
    const beforeHidden = nativeTrack.position;
    await new Promise(resolve => setTimeout(resolve, 3000));
    assert.ok(nativeTrack.position > beforeHidden + 1, 'Background audio did not advance');
    console.log('Native audio continues with the main window hidden.');
    controls.show();
    await controls.webContents.executeJavaScript(`document.querySelector('[data-music="next"]').click()`, true);
    await waitFor(`document.querySelectorAll('#music-queue .song-row').length === 0 && document.querySelector('#native-audio').currentTime > 1 && !document.querySelector('#native-audio').paused`);
    console.log('Queued next song passed.');
    controls.hide(); hideLyrics();
    const metricsBefore = app.getAppMetrics(), backgroundPosition = nativeTrack.position;
    await new Promise(resolve => setTimeout(resolve, 5000));
    const metricsAfter = app.getAppMetrics();
    assert.ok(nativeTrack.position > backgroundPosition + 2, 'Hidden background playback stopped');
    const previousCpu = new Map(metricsBefore.map(metric => [metric.pid, metric.cpu.cumulativeCPUUsage]));
    const cpuSeconds = metricsAfter.reduce((sum, metric) => sum + Math.max(0, metric.cpu.cumulativeCPUUsage - (previousCpu.get(metric.pid) || metric.cpu.cumulativeCPUUsage)), 0);
    console.log('Hidden native playback: aggregate Electron CPU seconds over 5 s:', cpuSeconds.toFixed(3), 'aggregate working sets MB:', Math.round(metricsAfter.reduce((sum, metric) => sum + metric.memory.workingSetSize, 0) / 1024));
    controls.show();
    await controls.webContents.executeJavaScript(`document.querySelector('#native-audio').pause()`);
    hideLyrics();
  }
  setDemo(true);
  lyricsWindow.destroy();
  assert.equal(lyricsWindow.isDestroyed(), true);
  send(); updateBlocker();
  await new Promise(resolve => setTimeout(resolve, 600));
  console.log('Shutdown regression passed: active demo updates tolerate a destroyed lyric window.');
  app.quit();
  assert.equal(quitting, true);
  assert.equal(playbackTimer._destroyed, true);
}

