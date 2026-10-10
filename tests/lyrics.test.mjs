import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, timedWords, activeIndex, playbackPosition, trackKey, reconcilePlayback } from '../src/lyrics.mjs';
import settings from '../src/settings.cjs';

test('clock corrections cannot replay a previous word, but seeks and track changes work', () => {
  const previous = { source: 'test', title: 'song', artist: 'artist', position: 8.85, playing: true, rate: 1, duration: 196.49, seekEpoch: 0 };
  const corrected = reconcilePlayback(previous, { ...previous, position: 8.79, duration: 196.51 }, .1);
  assert.ok(corrected.position >= 8.95 - 1e-10);
  assert.equal(trackKey(previous), trackKey(corrected));
  assert.equal(reconcilePlayback(previous, { ...previous, position: 2 }, .1).position, 2);
  assert.equal(reconcilePlayback(previous, { ...previous, position: 8.6, seekEpoch: 1 }, .1).position, 8.6);
  assert.equal(reconcilePlayback(previous, { ...previous, title: 'new', position: 0 }, .1).position, 0);
  assert.equal(reconcilePlayback(previous, { ...previous, playing: false, position: 8.7 }, .1).position, 8.7);
});

test('multi-word timestamp segments animate individual words without claiming exact timing', () => {
  const words = timedWords(parseLrc('[00:01]<00:01>One whole phrase <00:04>ends\n[00:05]Another sentence here'), 8);
  assert.deepEqual(words.map(word => word.text), ['One', 'whole', 'phrase', 'ends', 'Another', 'sentence', 'here']);
  assert.equal(words[0].start, 1);
  assert.equal(words[2].end, 4);
  assert.ok(words.slice(0, 3).every(word => !word.precise));
  assert.equal(words[3].precise, true);
  assert.equal(words[3].start, 4);
  assert.equal(activeIndex(words, words[1].start + .01), 1);
});

test('enhanced timestamps, offset and repeated lines retain real word timing', () => {
  const lines = parseLrc('[offset:-100]\n[00:01.00][00:05.00]<00:01.00>Morning <00:01.50>light\n[00:08.00]Fades away');
  assert.equal(lines.length, 3);
  assert.equal(lines[1].words[1].start, 5.4);
  const words = timedWords(lines, 10);
  assert.equal(activeIndex(words, .8), -1);
  assert.equal(activeIndex(words, 1.5), 1);
  assert.equal(words[1].precise, true);
  assert.equal(words.at(-1).precise, false);
  assert.equal(activeIndex(words, 10), -1);
});
test('line mode, pauses, seeking backwards and playback clamps', () => {
  const words = timedWords(parseLrc('[00:02]Original words\n[00:04]Another line'), 6, false);
  assert.equal(activeIndex(words, 4.2), 1);
  assert.equal(activeIndex(words, 2.2), 0);
  assert.equal(activeIndex(words, 1), -1);
  assert.equal(playbackPosition({ position: 3, playing: false, duration: 8 }, 2), 3);
  assert.equal(playbackPosition({ position: 3, playing: true, duration: 8 }, 2), 5);
  assert.equal(playbackPosition({ position: 7, playing: true, duration: 8 }, 2), 8);
});
test('malformed input and trust-boundary settings', () => {
  assert.deepEqual(parseLrc('not a timed file'), []);
  assert.throws(() => parseLrc(null));
  assert.equal(settings.sanitize({ offset: Infinity }).offset, 0);
  assert.equal(settings.sanitize({ highlight: 'url(https://evil)' }).highlight, settings.defaults.highlight);
  assert.equal(settings.sanitize({ style: 'other' }).style, settings.defaults.style);
  assert.equal(settings.sanitize({ fontSize: 240, fontWeight: 900, font: 'Impact', textEffect: 'outline' }).fontSize, 240);
  assert.equal(settings.sanitize({ fontWeight: 123 }).fontWeight, 800);
  assert.equal(settings.sanitize({ textEffect: 'url(evil)' }).textEffect, 'none');
  assert.equal(trackKey({ source: 'one', title: 'x' }) === trackKey({ source: 'two', title: 'x' }), false);
});
