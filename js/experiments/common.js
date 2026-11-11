// Shared helpers for experiment definitions.
import { box, flow, text, hex, themeColors, arrow, line } from '../lib/draw.js';
export const kv = (l, v, u = '', cls = '', d) => [l, v, u, cls, d];
export const lc = (id, title, xl, yl, series, o = {}) => Object.assign({ id, title, xl, yl, series }, o);
export const S = (name, x, y, o = {}) => Object.assign({ name, x, y }, o);
export const range = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
export const r2 = (x, d = 2) => +(+x).toFixed(d);

/**
 * Block-diagram energy-flow renderer.
 * nodes: {id: [x, y, w, h, label, sub, color]} in normalised [0..1] coordinates (x,y = centre)
 * edges: [[from, to, mag(-1..1), color, label, viaPoints?]]
 */
export function blocks(g, W, H, A, nodes, edges, o = {}) {
  const T = themeColors(); const N = {};
  for (const [id, n] of Object.entries(nodes)) {
    const w = n[2] * W, hh = n[3] * H; N[id] = { x: n[0] * W - w / 2, y: n[1] * H - hh / 2, w, h: hh, cx: n[0] * W, cy: n[1] * H };
  }
  for (const e of edges) {
    const a = N[e[0]], b = N[e[1]]; if (!a || !b) continue;
    let p1, p2; const via = (e[5] || []).map(p => [p[0] * W, p[1] * H]);
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    if (via.length) { p1 = edgePt(a, via[0]); p2 = edgePt(b, via[via.length - 1]); }
    else if (Math.abs(dx) * (a.h + b.h) > Math.abs(dy) * (a.w + b.w)) { p1 = [dx > 0 ? a.x + a.w : a.x, a.cy]; p2 = [dx > 0 ? b.x : b.x + b.w, b.cy]; if (Math.abs(p1[1] - p2[1]) > 2) { const mx = (p1[0] + p2[0]) / 2; via.push([mx, p1[1]], [mx, p2[1]]); } }
    else { p1 = [a.cx, dy > 0 ? a.y + a.h : a.y]; p2 = [b.cx, dy > 0 ? b.y : b.y + b.h]; if (Math.abs(p1[0] - p2[0]) > 2) { const my = (p1[1] + p2[1]) / 2; via.push([p1[0], my], [p2[0], my]); } }
    const pts = [p1, ...via, p2];
    flow(g, pts, A.running ? A.t : A.t, e[2], e[3] || T.cyan, { arrowAt: Math.abs(e[2]) > 0.005 ? .5 : false });
    if (e[4]) { const m = pts[Math.floor(pts.length / 2)], m0 = pts[Math.floor(pts.length / 2) - 1] || m; text(g, e[4], (m[0] + m0[0]) / 2, (m[1] + m0[1]) / 2 - 12, { size: 11, color: e[3] || T.cyan, weight: 700, bg: hex(T.bg, .85) }); }
  }
  for (const [id, n] of Object.entries(nodes)) {
    const b = N[id];
    box(g, b.x, b.y, b.w, b.h, n[4], { color: n[6] || T.blue, sub: n[5], active: o.active ? o.active.includes(id) : true, glow: o.sel === id ? 18 : 0, val: n[7], valColor: n[8] });
    if (A.hit) A.hit(b.x, b.y, b.w, b.h, id);
  }
  return N;
}
function edgePt(n, p) {
  const dx = p[0] - n.cx, dy = p[1] - n.cy;
  if (Math.abs(dx) * n.h > Math.abs(dy) * n.w) return [dx > 0 ? n.x + n.w : n.x, n.cy];
  return [n.cx, dy > 0 ? n.y + n.h : n.y];
}
export function legend(g, items, x, y) {
  const T = themeColors();
  items.forEach(([c, l], i) => { g.fillStyle = c; g.fillRect(x, y + i * 16 - 4, 10, 8); text(g, l, x + 15, y + i * 16, { align: 'left', size: 11, color: T.muted }); });
}
/** Mini oscilloscope inside a canvas region. */
export function scope(g, x, y, w, hh, series, o = {}) {
  const T = themeColors();
  g.save(); g.strokeStyle = T.line; g.strokeRect(x, y, w, hh);
  let mn = o.min ?? Infinity, mx = o.max ?? -Infinity;
  if (o.min === undefined) for (const s of series) for (const v of s.y) { if (v < mn) mn = v; if (v > mx) mx = v; }
  if (mx === mn) { mx += 1; mn -= 1; }
  for (const s of series) {
    g.strokeStyle = s.c; g.lineWidth = s.w || 1.4; g.beginPath();
    const n = s.y.length;
    for (let i = 0; i < n; i++) { const px = x + i / (n - 1) * w, py = y + hh - (s.y[i] - mn) / (mx - mn) * hh; i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke();
  }
  if (o.cursor !== undefined) { g.strokeStyle = T.yellow; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x + o.cursor * w, y); g.lineTo(x + o.cursor * w, y + hh); g.stroke(); g.setLineDash([]); }
  if (o.label) text(g, o.label, x + 4, y + 9, { align: 'left', size: 10.5, color: T.muted });
  g.restore();
}
export { box, flow, text, hex, themeColors, arrow, line };
