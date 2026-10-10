const validId = id => typeof id === 'string' && /^[\w-]{11}$/.test(id);
function audioUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.googlevideo.com')) throw new Error('Invalid audio host.');
  return url.href;
}
function createPlayer(fetch) {
  let session;
  const songs = new Map();
  const client = () => session ||= import('youtubei.js').then(({ Innertube }) => Innertube.create({ retrieve_player: false, generate_session_locally: true, fetch })).catch(error => { session = null; throw error; });
  return {
    async search(query) {
      if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Enter a song or artist (up to 200 characters).');
      const result = await (await client()).music.search(query.trim(), { type: 'song' });
      const items = result.contents.flatMap(shelf => shelf.contents || []).filter(item => validId(item.id)).slice(0, 25).map(item => ({
        id: item.id, title: String(item.title || '').slice(0, 512), artist: (item.artists || []).map(artist => artist.name).join(', ').slice(0, 512),
        album: String(item.album?.name || '').slice(0, 512), duration: item.duration?.seconds || 0,
        artworkUrl: (item.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`).replace(/=w\d+-h\d+/, '=w320-h320')
      }));
      for (const item of items) songs.set(item.id, item);
      while (songs.size > 150) songs.delete(songs.keys().next().value);
      return items;
    },
    async recommendations(id) {
      if (!validId(id)) throw new Error('Invalid song.');
      const result = await (await client()).music.getUpNext(id);
      const items = result.contents.filter(item => validId(item.video_id) && item.video_id !== id).slice(0, 12).map(item => ({ id: item.video_id, title: String(item.title), artist: item.artists?.map(artist => artist.name).join(', ') || item.author || '', album: item.album?.name || '', duration: item.duration?.seconds || 0, artworkUrl: (item.thumbnail?.at(-1)?.url || '').replace(/=w\d+-h\d+/, '=w320-h320') }));
      for (const song of items) songs.set(song.id, song);
      while (songs.size > 150) songs.delete(songs.keys().next().value);
      return items;
    },
    async resolve(id, saved) {
      if (!validId(id)) throw new Error('Invalid song.');
      if (!songs.has(id)) {
        const { cleanSong } = await import('./library.mjs');
        const song = cleanSong(saved);
        if (!song || song.id !== id) throw new Error('Search for this song again before playing it.');
        songs.set(id, song);
        while (songs.size > 150) songs.delete(songs.keys().next().value);
      }
      const info = await (await client()).getBasicInfo(id, { client: 'IOS' });
      const format = info.chooseFormat({ type: 'audio', quality: 'best' });
      if (!format.url) throw new Error('This song is unavailable. Try another result.');
      if (!Number.isSafeInteger(format.content_length) || format.content_length <= 0) throw new Error('Unsupported live audio stream. Choose a recorded song.');
      return { ...songs.get(id), url: audioUrl(format.url), size: format.content_length, mime: format.mime_type.split(';')[0] };
    }
  };
}
module.exports = { createPlayer, validId, audioUrl };
