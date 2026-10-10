const stamp = '(\\d{1,3}):(\\d{2}(?:\\.\\d{1,3})?)';
const seconds = (m, s) => Number(m) * 60 + Number(s);

export function parseLrc(text) {
  if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('Lyric file is too large or invalid.');
  const offset = Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(new RegExp(`\\[${stamp}\\]`, 'g'))];
    if (!tags.length) continue;
    const body = raw.replace(new RegExp(`\\[${stamp}\\]`, 'g'), '').trim();
    const words = [...body.matchAll(new RegExp(`<${stamp}>([^<]*)`, 'g'))]
      .map(m => ({ start: seconds(m[1], m[2]) + offset, text: m[3].trim() }))
      .filter(w => w.text);
    const plain = body.replace(/<[^>]*>/g, '').trim();
    if (!plain) continue;
    for (const tag of tags) {
      const shift = seconds(tag[1], tag[2]) - seconds(tags[0][1], tags[0][2]);
      lines.push({ start: seconds(tag[1], tag[2]) + offset, text: plain,
        words: words.map(w => ({ ...w, start: w.start + shift })) });
    }
  }
  lines.sort((a, b) => a.start - b.start);
  return lines;
}

export function timedWords(lines, duration, estimate = true) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const end = lines[i + 1]?.start ?? (duration > line.start ? duration : line.start + 5);
    const segments = line.words.length ? line.words.map((word, j) => ({ ...word, end: line.words[j + 1]?.start ?? end, precise: true })) : [{ text: line.text, start: line.start, end, precise: false }];
    for (const segment of segments) {
      const parts = segment.text.split(/\s+/u);
      if (!estimate || parts.length === 1) {
        result.push({ ...segment, line: i, precise: segment.precise && parts.length === 1 });
        continue;
      }
      // shortcut: line timestamps cannot locate sung words, use enhanced LRC for precise timing.
      const weights = parts.map(w => Math.max(1, [...w].length));
      const total = weights.reduce((a, b) => a + b, 0);
      const span = Math.min(10, Math.max(0, segment.end - segment.start));
      let cursor = segment.start;
      parts.forEach((word, j) => {
        const next = cursor + span * weights[j] / total;
        result.push({ text: word, start: cursor, end: next, line: i, precise: false });
        cursor = next;
      });
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

export function activeIndex(words, position) {
  let low = 0, high = words.length - 1, found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (words[mid].start <= position) { found = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return found >= 0 && position < words[found].end ? found : -1;
}

export function playbackPosition(track, elapsedSeconds, offset = 0) {
  if (!track) return 0;
  const position = track.position + (track.playing ? Math.max(0, elapsedSeconds) * (track.rate ?? 1) : 0) + offset;
  return Math.max(0, track.duration > 0 ? Math.min(track.duration, position) : position);
}

export function trackKey(track) {
  return track ? JSON.stringify([track.source, track.id || '', track.title, track.artist, track.album]) : '';
}

export function reconcilePlayback(previous, incoming, elapsed) {
  if (!incoming || !previous || trackKey(previous) !== trackKey(incoming) ||
      !previous.playing || !incoming.playing || previous.rate !== incoming.rate ||
      previous.seekEpoch !== incoming.seekEpoch) return incoming;
  const predicted = playbackPosition(previous, elapsed);
  const drift = incoming.position - predicted;
  if (Math.abs(drift) > .75) return incoming;
  return { ...incoming, position: predicted + Math.max(0, drift) * .2 };
}

