// 2-D canvas drawing primitives for circuit and energy-flow animations.
export const C = {
  bg: '#0f1729', panel: '#131d33', line: '#2f4066', text: '#e6ecf7', muted: '#93a3c0',
  cyan: '#22d3ee', blue: '#3b82f6', green: '#22c55e', orange: '#f59e0b', red: '#ef4444', violet: '#a78bfa', yellow: '#facc15', pink: '#f472b6', grey: '#64748b',
};
export function themeColors() {
  const light = document.documentElement.classList.contains('light');
  return light ? Object.assign({}, C, { bg: '#ffffff', panel: '#f1f5fb', line: '#c7d3e5', text: '#0f1b33', muted: '#4b5d7d', cyan: '#0891b2', green: '#16a34a' }) : C;
}
export function text(g, s, x, y, o = {}) {
  g.save();
  g.font = `${o.weight || 500} ${o.size || 12}px Inter, system-ui, sans-serif`;
  g.fillStyle = o.color || themeColors().text; g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
  if (o.bg) { const w = g.measureText(s).width + 8, hh = (o.size || 12) + 6; g.fillStyle = o.bg; const x0 = o.align === 'left' ? x - 4 : o.align === 'right' ? x - w + 4 : x - w / 2; g.fillRect(x0, y - hh / 2, w, hh); g.fillStyle = o.color || themeColors().text; }
  g.fillText(s, x, y); g.restore();
}
export function rrect(g, x, y, w, h, r = 8) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function box(g, x, y, w, h, label, o = {}) {
  const T = themeColors();
  g.save();
  rrect(g, x, y, w, h, o.r ?? 10);
  const col = o.color || T.blue;
  const grd = g.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, hex(col, o.active ? .38 : .2)); grd.addColorStop(1, hex(col, o.active ? .2 : .08));
  g.fillStyle = grd; g.fill();
  g.lineWidth = o.active ? 2.2 : 1.3; g.strokeStyle = o.active ? col : hex(col, .7);
  if (o.glow) { g.shadowColor = col; g.shadowBlur = o.glow; }
  g.stroke(); g.restore();
  if (label) text(g, label, x + w / 2, y + (o.sub ? h / 2 - 8 : h / 2), { size: o.size || 12.5, weight: 700 });
  if (o.sub) text(g, o.sub, x + w / 2, y + h / 2 + 9, { size: 11, color: T.muted });
  if (o.val) text(g, o.val, x + w / 2, y + h + 13, { size: 11.5, weight: 600, color: o.valColor || T.cyan });
}
export function hex(c, a) {
  if (c.startsWith('#') && c.length === 7) { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  return c;
}
export function line(g, pts, color, w = 2, dash) {
  g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
  g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.restore();
}
export function arrow(g, x1, y1, x2, y2, color, w = 2, head = 9) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - Math.cos(a) * head * .6, y2 - Math.sin(a) * head * .6); g.stroke();
  g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - head * Math.cos(a - .42), y2 - head * Math.sin(a - .42)); g.lineTo(x2 - head * Math.cos(a + .42), y2 - head * Math.sin(a + .42)); g.closePath(); g.fill();
  g.restore();
}
function polyLen(pts) { let L = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; } return { L, seg }; }
function pointAt(pts, seg, s) {
  for (let i = 0; i < seg.length; i++) { if (s <= seg[i]) { const f = seg[i] ? s / seg[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; } s -= seg[i]; }
  return pts[pts.length - 1];
}
/**
 * Animated energy-flow particles along a polyline.
 * mag = normalised magnitude (0..1, sign = direction). Speed, density and size scale with |mag|.
 */
export function flow(g, pts, t, mag, color, o = {}) {
  const { L, seg } = polyLen(pts);
  const a = Math.min(1, Math.abs(mag));
  line(g, pts, hex(color, .18 + .25 * a), (o.w || 3) + a * 5);
  if (a < 0.003) return;
  const spacing = o.spacing || 26;
  const speed = (o.speed || 90) * (0.35 + a);
  const dir = mag >= 0 ? 1 : -1;
  const off = ((t * speed) % spacing + spacing) % spacing;
  g.save(); g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 8;
  const r = 1.8 + a * 2.8;
  for (let s = off; s < L; s += spacing) {
    const p = pointAt(pts, seg, dir > 0 ? s : L - s);
    g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill();
  }
  g.restore();
  if (o.arrowAt !== false) {
    const mid = L * (o.arrowAt ?? .5), p1 = pointAt(pts, seg, mid - 6 * dir), p2 = pointAt(pts, seg, mid + 6 * dir);
    arrow(g, p1[0], p1[1], p2[0], p2[1], color, 2, 10);
  }
}
export function resistor(g, x1, y, x2, color, label) {
  const w = x2 - x1, n = 6; const pts = [[x1, y], [x1 + w * .15, y]];
  for (let i = 0; i < n; i++) pts.push([x1 + w * .15 + w * .7 * (i + .5) / n, y + (i % 2 ? 7 : -7)]);
  pts.push([x1 + w * .85, y], [x2, y]); line(g, pts, color || themeColors().text, 1.8);
  if (label) text(g, label, (x1 + x2) / 2, y - 16, { size: 11.5 });
}
export function capacitor(g, x, y1, y2, color, label, horiz) {
  const T = color || themeColors().text;
  if (horiz) { const m = (x + y1) / 2; line(g, [[x, y2], [m - 4, y2]], T); line(g, [[m + 4, y2], [y1, y2]], T); line(g, [[m - 4, y2 - 11], [m - 4, y2 + 11]], T, 2.4); line(g, [[m + 4, y2 - 11], [m + 4, y2 + 11]], T, 2.4); if (label) text(g, label, m, y2 + 22, { size: 11.5 }); return; }
  const m = (y1 + y2) / 2; line(g, [[x, y1], [x, m - 4]], T); line(g, [[x, m + 4], [x, y2]], T);
  line(g, [[x - 12, m - 4], [x + 12, m - 4]], T, 2.4); line(g, [[x - 12, m + 4], [x + 12, m + 4]], T, 2.4);
  if (label) text(g, label, x + 26, m, { size: 11.5, align: 'left' });
}
export function inductor(g, x1, y, x2, color, label) {
  const T = color || themeColors().text; const n = 4, w = (x2 - x1) * .7, s = x1 + (x2 - x1) * .15;
  line(g, [[x1, y], [s, y]], T); line(g, [[s + w, y], [x2, y]], T);
  g.save(); g.strokeStyle = T; g.lineWidth = 1.8; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(s + w * (i + .5) / n, y, w / n / 2, Math.PI, 0); g.stroke(); } g.restore();
  if (label) text(g, label, (x1 + x2) / 2, y - 18, { size: 11.5 });
}
export function battery(g, x, y, h, color, label) {
  const T = color || themeColors().text;
  for (let i = 0; i < 3; i++) { const yy = y - h / 2 + 8 + i * (h - 16) / 2; line(g, [[x - 16, yy], [x + 16, yy]], T, 2.6); line(g, [[x - 8, yy + 6], [x + 8, yy + 6]], T, 4); }
  if (label) text(g, label, x + 30, y, { size: 11.5, align: 'left' });
}
/** IGBT/MOSFET switch drawn as a box that lights when gated on. */
export function sw(g, x, y, on, label, col) {
  const T = themeColors(); const c = on ? (col || T.green) : T.grey;
  g.save(); rrect(g, x - 15, y - 15, 30, 30, 6); g.fillStyle = hex(c, on ? .35 : .12); g.fill(); g.lineWidth = on ? 2 : 1.2; g.strokeStyle = c; if (on) { g.shadowColor = c; g.shadowBlur = 12; } g.stroke(); g.restore();
  line(g, [[x - 7, y - 8], [x - 7, y + 8]], c, 2.2); line(g, [[x - 3, y - 4], [x + 6, y - 10]], c, 1.6); line(g, [[x - 3, y + 4], [x + 6, y + 10]], c, 1.6);
  if (label) text(g, label, x + 24, y, { size: 11, align: 'left', color: on ? c : T.muted, weight: 700 });
}
export function motor(g, x, y, r, angle, label, col) {
  const T = themeColors(); col = col || T.cyan;
  g.save(); g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = hex(col, .12); g.fill(); g.lineWidth = 2; g.strokeStyle = col; g.stroke();
  for (let k = 0; k < 4; k++) { const a = angle + k * Math.PI / 2; line(g, [[x, y], [x + Math.cos(a) * r * .75, y + Math.sin(a) * r * .75]], col, 3); }
  g.beginPath(); g.arc(x, y, r * .18, 0, 7); g.fillStyle = col; g.fill(); g.restore();
  if (label) text(g, label, x, y + r + 14, { size: 12, weight: 700 });
}
export function wheel(g, x, y, r, angle, col) {
  const T = themeColors(); col = col || T.text;
  g.save(); g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = '#1e293b'; g.fill(); g.lineWidth = r * .22; g.strokeStyle = '#0b1220'; g.stroke();
  g.beginPath(); g.arc(x, y, r * .62, 0, 7); g.lineWidth = 2; g.strokeStyle = '#94a3b8'; g.stroke();
  for (let k = 0; k < 5; k++) { const a = angle + k * 2 * Math.PI / 5; line(g, [[x, y], [x + Math.cos(a) * r * .6, y + Math.sin(a) * r * .6]], '#cbd5e1', 2.4); }
  g.restore();
}
export function gear(g, x, y, r, teeth, angle, col) {
  g.save(); g.translate(x, y); g.rotate(angle); g.beginPath();
  for (let i = 0; i < teeth * 2; i++) { const a = i * Math.PI / teeth, rr = i % 2 ? r * .82 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = hex(col, .25); g.fill(); g.strokeStyle = col; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.arc(0, 0, r * .25, 0, 7); g.fillStyle = col; g.fill(); g.restore();
}
export function car2d(g, x, y, w, ang, col = '#3b82f6') {
  // side-view car silhouette; x,y = ground contact centre
  const h = w * .32, r = w * .11;
  g.save(); g.translate(x, y);
  g.beginPath(); g.moveTo(-w * .5, -r * 1.2); g.lineTo(-w * .5, -h * .62); g.quadraticCurveTo(-w * .46, -h * .78, -w * .3, -h * .8);
  g.lineTo(-w * .17, -h * 1.15); g.quadraticCurveTo(-w * .05, -h * 1.3, w * .1, -h * 1.22); g.lineTo(w * .28, -h * .82); g.quadraticCurveTo(w * .48, -h * .76, w * .5, -h * .55); g.lineTo(w * .5, -r * 1.2); g.closePath();
  const gr = g.createLinearGradient(0, -h * 1.3, 0, 0); gr.addColorStop(0, col); gr.addColorStop(1, hex(col, .55)); g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(186,230,253,.55)'; g.beginPath(); g.moveTo(-w * .14, -h * 1.08); g.quadraticCurveTo(-w * .04, -h * 1.2, w * .08, -h * 1.14); g.lineTo(w * .22, -h * .84); g.lineTo(-w * .26, -h * .84); g.closePath(); g.fill();
  g.restore();
  wheel(g, x - w * .31, y - r, r, ang); wheel(g, x + w * .31, y - r, r, ang);
}
/** Fit canvas backing store to CSS size; returns {g, W, H}. */
export function fitCanvas(c) {
  const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  return { g, W, H };
}
