export function cleanSong(song) {
  if (!song || typeof song.id !== 'string' || !/^[\w-]{11}$/.test(song.id) || typeof song.title !== 'string' || typeof song.artist !== 'string') return null;
  let artworkUrl = '';
  try { const url = new URL(song.artworkUrl); if (url.protocol === 'https:' && ['yt3.googleusercontent.com', 'lh3.googleusercontent.com', 'i.ytimg.com', 'yt3.ggpht.com'].includes(url.hostname)) artworkUrl = url.href; } catch {}
  return { id: song.id, title: song.title.slice(0, 512), artist: song.artist.slice(0, 512), album: typeof song.album === 'string' ? song.album.slice(0, 512) : '', duration: Number.isFinite(song.duration) && song.duration >= 0 && song.duration <= 86400 ? song.duration : 0, artworkUrl };
}
export function rememberSong(history, song) {
  const clean = cleanSong(song);
  return clean ? [clean, ...history.filter(item => item.id !== clean.id)].slice(0, 40) : history;
}
