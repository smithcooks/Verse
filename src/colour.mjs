export function hsvHex(hue, saturation, value) {
  const h = ((hue % 360) + 360) % 360 / 60, c = value * saturation, x = c * (1 - Math.abs(h % 2 - 1)), m = value - c;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h)];
  return '#' + rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
}
