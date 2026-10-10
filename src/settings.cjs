const defaults = { style: 'fisheye-visual', lyric: '#ffffff', highlight: '#414854', secondary: '#b7b7c5', autoSync: false, background: 'gradient', backgroundRevision: 1,
  font: 'Segoe UI', fontSize: 112, fontWeight: 800, textEffect: 'none', offset: 0, mode: 'overlay', reducedMotion: false, respectSystemMotion: false, estimateWords: true, animationRevision: 3,
  keepAwake: true, startup: false, idle: false, source: '', display: '', overlayInteractive: false };
function sanitize(input) {
  const clean = { ...defaults };
  if (!input || typeof input !== 'object') return clean;
  for (const key of Object.keys(defaults)) {
    const value = input[key];
    if (typeof value !== typeof defaults[key]) continue;
    if (['lyric', 'highlight', 'secondary'].includes(key) && !/^#[0-9a-f]{6}$/i.test(value)) continue;
    if (key === 'style' && !['ship', 'fisheye', 'fisheye-visual', 'visual'].includes(value)) continue;
    if (key === 'mode' && !['fullscreen', 'overlay'].includes(value)) continue;
    if (key === 'background' && !['artwork', 'gradient', 'none'].includes(value)) continue;
    if (key === 'font' && !['Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Calibri', 'Georgia', 'Verdana', 'Trebuchet MS'].includes(value)) continue;
    if (key === 'fontWeight' && ![600, 700, 800, 900].includes(value)) continue;
    if (key === 'textEffect' && !['none', 'shadow', 'outline'].includes(value)) continue;
    if (key === 'fontSize' && (!Number.isFinite(value) || value < 28 || value > 240)) continue;
    if (key === 'offset' && (!Number.isFinite(value) || Math.abs(value) > 5)) continue;
    if (typeof value === 'string' && value.length > 512) continue;
    clean[key] = value;
  }
  return clean;
}
module.exports = { defaults, sanitize };
