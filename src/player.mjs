import { cleanSong, rememberSong } from './library.mjs';
const api = window.verse;
const $ = id => document.getElementById(id);
const lyricsView = new URLSearchParams(location.search).get('view') === 'lyrics';
if (api && !lyricsView) {
  const audio = $('native-audio');
  let queue = [], current = null, seekEpoch = 0, ticket = 0, searchTicket = 0, retrying = false, libraryView = 'home', recommendationSeed = '', recommendationTicket = 0, featureArtwork = '';
  const readLibrary = name => { try { const items = JSON.parse(localStorage.getItem(`verse-${name}`) || '[]'); return Array.isArray(items) ? items.slice(0, 40).map(cleanSong).filter(Boolean) : []; } catch { return []; } };
  let history = readLibrary('history'), liked = readLibrary('liked');
  audio.volume = .7;
  const status = message => $('music-status').textContent = message;
  function saveLibrary() { try { localStorage.setItem('verse-history', JSON.stringify(history)); localStorage.setItem('verse-liked', JSON.stringify(liked)); } catch { status('Could not save your library on this device.'); } }
  function artwork(song, className) { const image = document.createElement('img'); image.className = className; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; const safe = cleanSong(song); if (safe?.artworkUrl) image.src = safe.artworkUrl; image.addEventListener('error', () => image.classList.add('image-missing'), { once: true }); return image; }
  const publish = () => current && api.musicPlayback({ id: current.id, position: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : current.duration, playing: !audio.paused && !audio.ended && audio.readyState >= 2, seekEpoch });
  function rows(element, songs, queued = false) {
    element.replaceChildren(...songs.map((song, index) => {
      const row = document.createElement('div'); row.className = 'song-row';
      const play = document.createElement('button'); play.className = 'song-detail';
      const title = document.createElement('strong'); title.textContent = song.title;
      const artist = document.createElement('span'); artist.textContent = `${song.artist}${song.album ? ' · ' + song.album : ''}`;
      const copy = document.createElement('span'); copy.className = 'song-copy'; copy.append(title, artist);
      play.append(artwork(song, 'song-art'), copy); play.addEventListener('click', () => { if (queued) { queue.splice(index, 1); refreshQueue(); } start(song); });
      const add = document.createElement('button'); add.className = 'queue-add'; add.textContent = queued ? '×' : '+'; add.setAttribute('aria-label', `${queued ? 'Remove' : 'Queue'} ${song.title}`);
      add.addEventListener('click', () => { if (queued) queue.splice(index, 1); else if (queue.length < 100) queue.push(song); refreshQueue(); });
      row.append(play, add); return row;
    }));
    if (!songs.length) { const empty = document.createElement('p'); empty.className = 'library-empty'; empty.textContent = queued ? 'Add a song with +. Your queue lives here.' : element.id === 'history-songs' ? 'Songs you play will appear here.' : 'Like a song to save it to your collection.'; element.append(empty); }
  }
  function cards(element, songs) {
    element.replaceChildren(...songs.map(song => { const card = document.createElement('div'); card.className = 'album-card glass'; const button = document.createElement('button'); button.className = 'album-play'; const title = document.createElement('strong'); title.textContent = song.title; const artist = document.createElement('span'); artist.textContent = song.artist; button.append(artwork(song, 'album-art'), title, artist); button.addEventListener('click', () => start(song)); const add = document.createElement('button'); add.className = 'album-add'; add.textContent = '+'; add.setAttribute('aria-label', `Queue ${song.title}`); add.addEventListener('click', () => { if (queue.length < 100) queue.push(song); refreshQueue(); }); card.append(button, add); return card; }));
    if (!songs.length) { const empty = document.createElement('p'); empty.className = 'library-empty'; empty.textContent = 'Play a song to start your listening history.'; element.append(empty); }
  }
  const refreshQueue = () => { rows($('music-queue'), queue, true); $('queue-count').textContent = String(queue.length); };
  function refreshLibrary() { cards($('recent-songs'), history.slice(0, 4)); rows($('history-songs'), history); rows($('liked-songs'), liked); $('play-liked').disabled = !liked.length; const selected = current && liked.some(song => song.id === current.id); $('like-current').disabled = !current; $('like-current').textContent = selected ? 'Liked ♥' : 'Like song'; $('like-current').setAttribute('aria-pressed', String(!!selected)); }
  async function recommendations(force = false) {
    const seed = history[0]?.id || '9qnqYL0eNNI';
    if (!force && recommendationSeed === seed) return;
    recommendationSeed = seed; const selection = ++recommendationTicket;
    $('recommendation-caption').textContent = history[0] ? `Because you played ${history[0].title}` : 'Discover something new';
    try { const songs = await api.musicRecommendations(seed); if (selection !== recommendationTicket) return; cards($('music-recommendations'), songs); if (!songs.length) $('music-recommendations').firstElementChild.textContent = 'No recommendations available. Try search to find your next song.'; }
    catch { if (selection === recommendationTicket) { recommendationSeed = ''; $('music-recommendations').replaceChildren(); const message = document.createElement('p'); message.className = 'library-empty'; message.textContent = 'Recommendations could not load. Try Refresh or search for a song.'; $('music-recommendations').append(message); } }
  }
  function view(name) { libraryView = name; for (const section of document.querySelectorAll('.library-view')) section.hidden = section.id !== `library-${name}`; for (const button of document.querySelectorAll('.library-tabs button')) { button.classList.toggle('selected', button.dataset.library === name); button.setAttribute('aria-pressed', String(button.dataset.library === name)); } if (name === 'home') recommendations(); }
  document.querySelectorAll('[data-library]').forEach(button => button.addEventListener('click', () => view(button.dataset.library)));
  document.querySelectorAll('[data-tab="music"]').forEach(button => button.addEventListener('click', () => { if (libraryView === 'home') recommendations(); }));
  api.onNavigate(name => { if (name === 'music' && libraryView === 'home') recommendations(); });
  $('refresh-recommendations').addEventListener('click', () => recommendations(true));
  $('clear-history').addEventListener('click', () => { history = []; saveLibrary(); refreshLibrary(); });
  $('like-current').addEventListener('click', () => { if (!current) return; liked = liked.some(song => song.id === current.id) ? liked.filter(song => song.id !== current.id) : rememberSong(liked, current); saveLibrary(); refreshLibrary(); });
  $('play-liked').addEventListener('click', () => { if (!liked.length) return; queue = liked.slice(1); refreshQueue(); start(liked[0]); });
  $('shuffle-queue').addEventListener('click', () => { for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; } refreshQueue(); });
  $('repeat-song').addEventListener('click', () => { audio.loop = !audio.loop; $('repeat-song').setAttribute('aria-pressed', String(audio.loop)); $('repeat-song').textContent = audio.loop ? 'Repeat on' : 'Repeat off'; });
  refreshLibrary(); refreshQueue();
  async function start(song, position = 0, retry = false) {
    const selection = ++ticket; audio.pause(); current = null;
    status(`Loading ${song.title}…`);
    try {
      const resolved = await api.musicResolve(song.id, cleanSong(song));
      if (selection !== ticket) return;
      current = resolved; seekEpoch++; retrying = retry;
      audio.src = resolved.url;
      if (position) audio.addEventListener('loadedmetadata', () => { if (selection === ticket) audio.currentTime = position; }, { once: true });
      await audio.play(); publish(); status(`Playing ${resolved.title}`);
      if (!retry) { history = rememberSong(history, resolved); saveLibrary(); refreshLibrary(); }
    } catch (error) { if (selection === ticket) status(`Could not play: ${error.message}`); }
  }
  async function command(name) {
    if (name === 'next') { if (queue.length) { const song = queue.shift(); refreshQueue(); await start(song); } else status('Add another song to the queue.'); }
    else if (name === 'previous' && current) { if (audio.currentTime < 3 && history[1]) await start(history[1]); else { audio.currentTime = 0; seekEpoch++; publish(); } }
    else if (name === 'toggle') {
      if (!current) { status('Choose a song first.'); document.querySelector('[data-tab="music"]').click(); }
      else if (audio.paused) { try { await audio.play(); } catch (error) { status(error.message); } } else audio.pause();
    }
  }
  api.onMusicCommand(command);
  for (const event of ['timeupdate', 'playing', 'pause', 'waiting', 'durationchange']) audio.addEventListener(event, publish);
  audio.addEventListener('seeked', () => { seekEpoch++; publish(); });
  audio.addEventListener('ended', () => { publish(); command('next'); });
  audio.addEventListener('error', () => {
    if (current && !retrying) { const song = current, position = audio.currentTime; start(song, position, true); }
    else status('Audio unavailable. Try a different result or search again.');
  });
  $('player-seek').addEventListener('input', event => { if (current && Number.isFinite(audio.duration)) { seekEpoch++; audio.currentTime = Number(event.target.value) / 1000 * audio.duration; publish(); } });
  $('player-volume').addEventListener('input', event => audio.volume = Number(event.target.value));
  $('clear-queue').addEventListener('click', () => { queue = []; refreshQueue(); });
  $('music-search').addEventListener('submit', async event => {
    event.preventDefault(); const search = ++searchTicket;
    view('search');
    $('search-button').disabled = true; status('Searching…');
    try { const songs = await api.musicSearch($('music-query').value); if (search === searchTicket) { rows($('music-results'), songs); status(songs.length ? `${songs.length} songs · select to play, + to queue` : 'No songs found. Try another search.'); } }
    catch (error) { if (search === searchTicket) status(`Search unavailable: ${error.message}`); }
    finally { if (search === searchTicket) $('search-button').disabled = false; }
  });
  api.onState(state => {
    const track = state.track, playing = track?.source === 'Verse YouTube' && track?.playing;
    $('play-toggle').textContent = playing ? 'Ⅱ' : '▶'; $('feature-play').textContent = playing ? 'Pause' : 'Play';
    $('feature-title').textContent = track?.title || 'Find your next favourite.'; $('feature-artist').textContent = track ? `${track.artist}${track.album ? ' · ' + track.album : ''}` : 'Choose a song and make it yours.';
    if (featureArtwork !== (track?.artwork || '')) { featureArtwork = track?.artwork || ''; $('feature-artwork').hidden = !featureArtwork.startsWith('data:image/'); if (!$('feature-artwork').hidden) $('feature-artwork').src = featureArtwork; else $('feature-artwork').removeAttribute('src'); }
  });
}
document.querySelectorAll('[data-music]').forEach(button => button.addEventListener('click', () => api?.musicCommand(button.dataset.music)));
