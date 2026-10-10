import test from 'node:test';
import assert from 'node:assert/strict';
import youtube from '../src/youtube.cjs';
import { hsvHex } from '../src/colour.mjs';
import { cleanSong, rememberSong } from '../src/library.mjs';
test('listening history persists clean metadata, removes duplicates and stays bounded', () => {
  const song = { id: '9qnqYL0eNNI', title: 'Yellow', artist: 'Coldplay', url: 'expired-stream-secret', artworkUrl: 'https://attacker.test/image', duration: Infinity };
  assert.equal(cleanSong(song).url, undefined);
  assert.equal(cleanSong(song).artworkUrl, '');
  assert.equal(cleanSong(song).duration, 0);
  assert.equal(cleanSong({ ...song, id: '../bad' }), null);
  assert.equal(rememberSong([cleanSong(song)], song).length, 1);
  const history = Array.from({ length: 45 }, (_, index) => ({ ...song, id: String(index).padStart(11, '0') }));
  const updated = rememberSong(history, song);
  assert.equal(updated.length, 40);
  assert.equal(updated[0].title, 'Yellow');
});
test('native audio trust boundary accepts only searched video IDs and YouTube audio hosts', async () => {
  assert.equal(youtube.validId('9qnqYL0eNNI'), true);
  assert.equal(youtube.validId('../secrets'), false);
  assert.throws(() => youtube.audioUrl('https://googlevideo.com.attacker.test/audio'));
  assert.throws(() => youtube.audioUrl('http://rr1.googlevideo.com/audio'));
  assert.equal(youtube.audioUrl('https://rr1.googlevideo.com/audio'), 'https://rr1.googlevideo.com/audio');
  const player = youtube.createPlayer(() => { throw new Error('No network should be used'); });
  await assert.rejects(player.search(''), /Enter/);
  await assert.rejects(player.search('x'.repeat(201)), /200/);
  await assert.rejects(player.resolve('9qnqYL0eNNI'), /Search/);
});
test('colour wheel covers hue, saturation, brightness and hue wrapping', () => {
  assert.equal(hsvHex(0, 1, 1), '#ff0000');
  assert.equal(hsvHex(120, 1, 1), '#00ff00');
  assert.equal(hsvHex(240, 1, 1), '#0000ff');
  assert.equal(hsvHex(360, 0, 1), '#ffffff');
  assert.equal(hsvHex(20, 1, 0), '#000000');
});
