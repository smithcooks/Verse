import { activeIndex, playbackPosition, timedWords, trackKey, reconcilePlayback } from './lyrics.mjs';
import { hsvHex } from './colour.mjs';

const $ = id => document.getElementById(id);
const styleNames = { ship: 'Ship', fisheye: 'Fisheye', 'fisheye-visual': 'Fisheye Visual', visual: 'Visual' };
let state, receivedAt = performance.now(), words = [], lyricSignature = '', tabName = 'lyrics', toastTimer;
let artworkKey = '', sampledPalette = null;
const pendingSettings = {};
const api = window.verse;
const isLyricsView = new URLSearchParams(location.search).get('view') === 'lyrics';
if (isLyricsView) { document.body.classList.add('lyrics-only'); $('lyrics-view').hidden = false; }

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
async function act(name) { try { await api.action(name); } catch (error) { toast(error.message); } }
function switchTab(name) {
  tabName = name;
  for (const page of document.querySelectorAll('.page')) page.classList.toggle('active', page.id === `${name}-page`);
  for (const button of document.querySelectorAll('.nav-item')) button.classList.toggle('selected', button.dataset.tab === name);
  $('page-eyebrow').textContent = name === 'lyrics' ? 'LIVE LYRICS' : name === 'music' ? 'YOUR PLAYER' : 'MAKE IT YOURS';
  $('page-title').textContent = name === 'lyrics' ? 'Now playing' : name === 'music' ? 'Music' : 'Preferences';
}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => act(button.dataset.action)));
document.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => change({ style: button.dataset.style })));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => change({ mode: button.dataset.mode })));
document.querySelectorAll('[data-setting]').forEach(input => {
  const update = () => {
    const value = input.type === 'checkbox' ? input.checked : ['fontSize', 'fontWeight', 'offset'].includes(input.dataset.setting) ? Number(input.value) : input.value;
    if (input.type === 'range') {
      pendingSettings[input.dataset.setting] = value;
      applyState({ ...state, settings: { ...state.settings, [input.dataset.setting]: value } });
      clearTimeout(input.saveTimer); input.saveTimer = setTimeout(() => change({ [input.dataset.setting]: value }), 180);
    } else change({ [input.dataset.setting]: value });
  };
  input.addEventListener(input.type === 'range' ? 'input' : 'change', update);
});
$('reset-colours').addEventListener('click', () => change({ lyric: '#ffffff', secondary: '#b7b7c5', autoSync: false }));
let wheelHue = 0, wheelSaturation = 0;
function wheelColour() {
  const colour = hsvHex(wheelHue, wheelSaturation, Number($('colour-brightness').value) / 100);
  const angle = wheelHue * Math.PI / 180, radius = wheelSaturation * 50;
  $('colour-marker').style.left = `${50 + Math.cos(angle) * radius}%`;
  $('colour-marker').style.top = `${50 + Math.sin(angle) * radius}%`;
  $('colour-wheel').setAttribute('aria-valuenow', String(Math.round(wheelHue)));
  pendingSettings.lyric = colour; pendingSettings.autoSync = false;
  applyState({ ...state, settings: { ...state.settings, lyric: colour, autoSync: false } });
  clearTimeout($('colour-wheel').saveTimer);
  $('colour-wheel').saveTimer = setTimeout(() => change({ lyric: colour, autoSync: false }), 180);
}
function pickColour(event) {
  const bounds = $('colour-wheel').getBoundingClientRect(), x = (event.clientX - bounds.left) / bounds.width * 2 - 1, y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
  wheelHue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; wheelSaturation = Math.min(1, Math.hypot(x, y)); wheelColour();
}
$('colour-wheel').addEventListener('pointerdown', event => { $('colour-wheel').setPointerCapture(event.pointerId); pickColour(event); });
$('colour-wheel').addEventListener('pointermove', event => { if (event.buttons) pickColour(event); });
$('colour-wheel').addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); wheelHue = (wheelHue + (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0) + 360) % 360; wheelSaturation = Math.max(0, Math.min(1, wheelSaturation + (event.key === 'ArrowUp' ? .05 : event.key === 'ArrowDown' ? -.05 : 0))); wheelColour(); } });
$('colour-brightness').addEventListener('input', wheelColour);
$('import-button').addEventListener('click', async () => { try { const result = await api.importLyrics(); if (result.error) toast(result.error); else if (result.ok) toast('Timed lyrics imported.'); } catch (error) { toast(error.message); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && isLyricsView) act('hide'); });
async function change(patch) {
  try {
    const value = await api.settings(patch);
    for (const key of Object.keys(patch)) if (pendingSettings[key] === patch[key]) delete pendingSettings[key];
    applyState(value);
  } catch (error) { for (const key of Object.keys(patch)) delete pendingSettings[key]; toast(error.message); }
}

function optionList(element, items, selected) {
  const signature = JSON.stringify(items);
  if (element.dataset.signature !== signature) {
    element.replaceChildren(...items.map(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; return option; }));
    element.dataset.signature = signature;
  }
  element.value = selected;
}
function applyState(value) {
  if (value.track !== state?.track) {
    const now = performance.now();
    value = { ...value, track: reconcilePlayback(state?.track, value.track, (now - receivedAt) / 1000) };
    receivedAt = now;
  }
  state = { ...value, settings: { ...value.settings, ...pendingSettings } };
  const s = state.settings;
  document.body.classList.toggle('playing', !!state.track?.playing);
  document.body.classList.toggle('overlay', isLyricsView && s.mode === 'overlay');
  document.body.classList.toggle('reduced-motion', s.reducedMotion || (s.respectSystemMotion && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const signature = JSON.stringify([state.lyrics, trackKey(state.track)]);
  if (signature !== lyricSignature) { words = timedWords(state.lyrics || [], state.track?.duration || 0, true); lyricSignature = signature; }
  const precise = words.length && words.every(word => word.precise);
  const timing = !words.length ? 'No timed lyrics' : precise ? 'Word synced' : 'Estimated word timing';
  $('timing').textContent = timing;
  $('motion-caption').textContent = timing;
  $('preview-style').textContent = styleNames[s.style];
  const hasLyrics = words.length > 0 && state.track?.timelineAvailable !== false;
  $('empty').hidden = hasLyrics;
  $('status').textContent = state.track?.timelineAvailable === false ? 'This player is not sharing playback timing. Choose another source.' : state.status;
  $('lyric-empty').textContent = hasLyrics ? '' : $('status').textContent;
  $('track-title').textContent = state.track?.title || 'Nothing playing';
  $('track-artist').textContent = state.track?.artist || 'Play a song to begin';
  $('playback-state').textContent = state.track ? state.track.playing ? 'Playing' : 'Paused' : 'Standby';
  $('connection').textContent = state.track ? 'Player connected' : 'Waiting for playback';
  $('app-version').textContent = `Windows · Verse ${state.version || 'preview'}`;
  $('lyric-track-title').textContent = state.track ? `${state.track.title} · ${state.track.artist}` : '';
  $('lyric-track-status').textContent = timing;
  $('font-size-label').textContent = `${s.fontSize}`;
  $('colour-value').textContent = s.lyric;
  $('lyric-backdrop').dataset.mode = s.background || 'gradient';
  $('offset-label').textContent = `${s.offset > 0 ? '+' : ''}${s.offset.toFixed(1)} s`;
  $('system-motion-hint').textContent = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Windows has reduced motion enabled; disable this option to animate lyrics' : 'Follow your system accessibility setting';
  $('shortcut-hint').textContent = state.shortcutAvailable ? 'Ctrl + Alt + L to show or hide · Esc to close fullscreen' : 'Shortcut unavailable · use Show lyrics or the tray menu';
  for (const input of document.querySelectorAll('[data-setting]')) {
    if (document.activeElement === input) continue;
    if (input.type === 'checkbox') input.checked = s[input.dataset.setting]; else input.value = s[input.dataset.setting];
  }
  const sourceItems = [['', 'Follow active playback'], ['verse-player', 'Verse music player'], ...(state.sources || []).filter(x => !['youtube-internal', 'verse-player'].includes(x)).map(x => [x, x])];
  if (s.source && !sourceItems.some(x => x[0] === s.source)) sourceItems.push([s.source, `${s.source} (unavailable)`]);
  optionList($('source-select'), sourceItems, s.source);
  optionList($('display-select'), [['', 'Primary display'], ...(state.displays || []).map(d => [d.id, d.label])], s.display);
  $('startup-toggle').disabled = !state.packaged;
  for (const button of document.querySelectorAll('[data-style]')) { const selected = button.dataset.style === s.style; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }
  for (const button of document.querySelectorAll('[data-mode]')) { const selected = button.dataset.mode === s.mode; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }
  if (state.musicError) $('music-status').textContent = state.musicError;
  if (artworkKey !== (state.track?.artwork || '')) {
    artworkKey = state.track?.artwork || ''; sampledPalette = null;
    $('album-backdrop').style.backgroundImage = '';
    $('artwork').hidden = !artworkKey;
    if (artworkKey.startsWith('data:image/')) {
      $('artwork').src = artworkKey;
      const image = new Image(); image.onload = () => { if (image.src === artworkKey) {
        sampledPalette = palette(image);
        const thumbnail = document.createElement('canvas'); thumbnail.width = thumbnail.height = 192;
        const context = thumbnail.getContext('2d'); context.filter = 'blur(8px)'; context.drawImage(image, -16, -16, 224, 224);
        $('album-backdrop').style.backgroundImage = `url("${thumbnail.toDataURL('image/jpeg', .75)}")`;
        updatePalette();
      } }; image.src = artworkKey;
    } else $('artwork').removeAttribute('src');
  }
  updatePalette();
  if (isLyricsView || tabName === 'lyrics') visualizer.render(playbackPosition(state.track, (performance.now() - receivedAt) / 1000) + s.offset);
}
function palette(image) {
  const sample = document.createElement('canvas'); sample.width = sample.height = 24;
  const ctx = sample.getContext('2d'); ctx.drawImage(image, 0, 0, 24, 24);
  const pixels = ctx.getImageData(0, 0, 24, 24).data; const buckets = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]], max = Math.max(...rgb), min = Math.min(...rgb);
    if (max < 45 || min > 230) continue;
    const key = rgb.map(v => Math.round(v / 32)).join(',');
    const weight = .3 + (max - min) / 255;
    const bucket = buckets.get(key) || { sum: [0, 0, 0], weight: 0 }; bucket.weight += weight;
    rgb.forEach((v, n) => bucket.sum[n] += v * weight); buckets.set(key, bucket);
  }
  const best = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
  if (!best) return null;
  const rgb = best.sum.map(v => v / best.weight);
  const hex = values => '#' + values.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  return { lyric: hex(rgb.map(v => v * .4 + 153)), highlight: hex(rgb.map(v => v * .48)), secondary: hex(rgb.map(v => v * .45 + 55)), gradient: [hex(rgb.map(v => v * .7)), hex([rgb[2], rgb[0], rgb[1]].map(v => v * .6 + 20)), hex([rgb[1], rgb[2], rgb[0]].map(v => v * .5 + 28))] };
}
function updatePalette() {
  const colors = state.settings.autoSync && sampledPalette ? sampledPalette : state.settings;
  for (const key of ['lyric', 'highlight', 'secondary']) document.documentElement.style.setProperty(`--${key}`, colors[key]);
  const gradient = sampledPalette?.gradient || ['#285c82', '#216f69', '#71603f'];
  gradient.forEach((color, i) => document.documentElement.style.setProperty(`--gradient-${i + 1}`, color));
}


class LyricText {
  constructor(element, preview) {
    this.element = element; this.preview = preview; this.nodes = new Map();
    this.observer = new ResizeObserver(() => { this.lastIndex = undefined; });
    this.observer.observe(element);
  }
  render(position) {
    const available = words.length && state.track?.timelineAvailable !== false;
    const index = available ? activeIndex(words, position) : -1;
    const s = state.settings;
    const reduced = s.reducedMotion || (s.respectSystemMotion && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const signature = JSON.stringify([s.style, s.font, s.fontSize, s.fontWeight, s.textEffect, reduced, s.lyric, s.secondary, sampledPalette]);
    if (this.lastIndex === index && this.wordSet === words && this.signature === signature) return;
    const changedTrack = this.wordSet !== words;
    const seek = changedTrack || (this.lastIndex >= 0 && Math.abs(index - this.lastIndex) > 1);
    this.lastIndex = index; this.wordSet = words; this.signature = signature;
    this.element.classList.toggle('still', reduced || seek);
    const width = this.element.clientWidth, height = this.element.clientHeight;
    const size = this.preview ? s.fontSize * .45 : s.fontSize;
    this.element.style.fontFamily = `"${s.font}", sans-serif`;
    this.element.style.fontSize = `${size}px`;
    this.element.style.fontWeight = s.fontWeight || 800;
    this.element.dataset.effect = s.textEffect || 'none';
    const colors = s.autoSync && sampledPalette ? sampledPalette : s;
    this.element.style.setProperty('--word-colour', colors.lyric);
    this.element.style.setProperty('--past-colour', colors.secondary);
    const keep = new Set();
    if (index >= 0) for (let i = Math.max(0, index - 2); i <= Math.min(words.length - 1, index + 2); i++) {
      keep.add(i);
      let node = this.nodes.get(i);
      if (!node) {
        node = document.createElement('span'); node.className = 'lyric-word';
        const text = document.createElement('span'); text.className = 'word-ink'; text.textContent = words[i].text;
        node.append(text); this.element.append(node); this.nodes.set(i, node);
      }
      const delta = i - index, active = delta === 0;
      const curved = s.style.startsWith('fisheye');
      const scale = active ? 1 : Math.abs(delta) === 1 ? .48 : .28;
      const y = delta * size * (curved ? .8 : 1.05);
      const rotation = curved ? -delta * 32 : s.style === 'ship' ? -12 : 0;
      node.style.transform = `translate3d(-50%, calc(-50% + ${y}px), 0) rotateX(${rotation}deg) scale(${scale})`;
      node.style.opacity = reduced ? Number(active) : active ? 1 : Math.abs(delta) === 1 ? .5 : .14;
      node.style.color = active ? 'var(--word-colour)' : 'var(--past-colour)';
      const ink = node.firstElementChild;
      const wasActive = node.classList.contains('active');
      if (wasActive && !active) for (const animation of ink.getAnimations()) animation.cancel();
      node.classList.toggle('active', active);
      ink.style.transform = '';
      const naturalWidth = ink.offsetWidth;
      const fit = naturalWidth > width * .9 ? width * .9 / naturalWidth : 1;
      ink.style.transform = `scale(${fit})`;
      if (active && !wasActive && !reduced && !seek) ink.animate([
        { transform: `scale(${fit * .86})` }, { transform: `scale(${fit * 1.065})`, offset: .6 }, { transform: `scale(${fit})` }
      ], { duration: 230, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
    for (const [i, node] of this.nodes) if (!keep.has(i)) { node.remove(); this.nodes.delete(i); }
    this.element.dataset.activeWord = index >= 0 ? words[index].text : '';
  }
}
const visualizer = new LyricText(isLyricsView ? $('lyrics-canvas') : $('preview-canvas'), !isLyricsView);
const formatTime = seconds => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
let lastUi = 0;
function frame(now) {
  if (state && !document.hidden) {
    const elapsed = (now - receivedAt) / 1000;
    const playback = playbackPosition(state.track, elapsed);
    const position = state.settings.offset + playback;
    if (isLyricsView || tabName === 'lyrics') visualizer.render(position);
    if (now - lastUi > 200) {
      lastUi = now;
      $('elapsed').textContent = formatTime(playback); $('duration').textContent = formatTime(state.track?.duration || 0);
      $('progress-fill').style.width = `${state.track?.duration ? Math.min(100, playback / state.track.duration * 100) : 0}%`;
      if (document.activeElement !== $('player-seek')) $('player-seek').value = state.track?.duration ? Math.min(1000, playback / state.track.duration * 1000) : 0;
      $('player-seek').disabled = state.track?.source !== 'Verse YouTube';
    }
  }
  setTimeout(() => frame(performance.now()), document.hidden ? 500 : state?.track?.playing ? 33 : 200);
}
api.onState(applyState);
api.onNavigate?.(switchTab);
try { applyState(await api.state()); } catch (error) { toast(`Could not connect to Verse: ${error.message}`); }
requestAnimationFrame(frame);
