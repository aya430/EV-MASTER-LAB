// Shared visualisations of the EV digital-twin state (power-flow chain, gauges).
import { box, flow, text, hex, arrow, line, car2d, wheel, gear, rrect } from '../lib/draw.js';
import { fmt, clamp } from '../lib/ui.js';

/**
 * Battery pack → BMS → DC link → inverter → motor → gearbox → differential → wheels.
 * o = EVTwin.o outputs. Electrical stages show V, I, P; mechanical stages show T, rpm, P.
 */
export function drawPowerFlow(g, W, H, A, o, opt = {}) {
  const T = A.T; if (!o) return;
  const regen = o.Pb < -0.05, P = o.Pb;
  const st = [
    ['Battery pack', [`${fmt(o.Vt)} V`, `${fmt(o.Ib)} A`, `${fmt(o.Pb)} kW`], T.green],
    ['BMS', [`SOC ${o.soc.toFixed(1)} %`, `${o.Tb.toFixed(1)} °C`, opt.contactor === false ? 'OPEN' : 'closed'], T.cyan],
    ['DC link', [`${fmt(o.Vt)} V`, `${fmt(o.Pdc * 1000 / Math.max(o.Vt, 1))} A`, `${fmt(o.Pdc)} kW`], T.yellow],
    ['Inverter', [`η ${(Math.abs(o.etaInv) * 100).toFixed(1)} %`, `${fmt(o.Pe)} kW AC`, ''], T.orange],
    ['Motor', [`${fmt(o.Tm)} N·m`, `${fmt(o.rpm)} r/min`, `${fmt(o.Pmm)} kW`], T.cyan],
    ['Gearbox', [`${fmt(o.Tw)} N·m`, `${fmt(o.wheelRpm)} r/min`, `G = 9`], T.violet],
    ['Differential', [`${fmt(o.Tw / 2)} N·m/side`, '', ''], T.violet],
    ['Wheels', [`${fmt(o.Fw)} N`, `${fmt(o.v)} km/h`, `${fmt(o.Pwheel)} kW`], T.blue],
  ];
  const n = st.length, gap = 14, bw = (W - 20 - gap * (n - 1)) / n, y = opt.y ?? H * 0.38, bh = opt.bh ?? 58;
  const pmax = 110;
  const pw = [o.Pb, o.Pb, o.Pdc, o.Pe, o.Pmm, o.Pwheel, o.Pwheel];
  st.forEach((s, i) => {
    const x = 10 + i * (bw + gap);
    box(g, x, y, bw, bh, s[0], { color: s[2], active: true, size: 11.5 });
    s[1].forEach((v, k) => v && text(g, v, x + bw / 2, y + bh + 14 + k * 14, { size: 10.5, color: k === 2 ? (regen ? T.green : T.cyan) : T.muted, weight: k === 2 ? 700 : 500 }));
    if (i < n - 1) { const m = clamp(pw[i] / pmax, -1, 1); flow(g, [[x + bw, y + bh / 2], [x + bw + gap, y + bh / 2]], A.t, m, m < 0 ? T.green : i < 4 ? T.cyan : T.violet, { w: 3, arrowAt: false, spacing: 10 }); }
  });
  // losses
  if (opt.losses !== false) {
    const L = [['Battery', o.Vt && o.Ib ? Math.abs((o.Voc - o.Vt) * o.Ib / 1000) : 0], ['Inverter', Math.abs(o.Pdc - o.Pe)], ['Motor', o.Pml], ['Aux', o.Paux]];
    text(g, 'Losses: ' + L.map(([l, v]) => `${l} ${fmt(v)} kW`).join(' · '), 10, y + bh + 62, { align: 'left', size: 11, color: T.red });
  }
  text(g, regen ? '◀◀ REGENERATION: wheels → battery' : P > 0.05 ? 'MOTORING: battery → wheels ▶▶' : 'IDLE', 10, y - 14, { align: 'left', weight: 800, color: regen ? T.green : T.cyan, size: 13 });
}
/** Side-view scene with car, road (grade) and force arrows. */
export function drawScene(g, W, H, A, s, o, opt = {}) {
  const T = A.T; const gy = opt.gy ?? H * 0.86; const grade = opt.grade || 0, ang = Math.atan(grade / 100);
  g.save(); g.translate(W / 2, gy); g.rotate(-ang);
  g.fillStyle = hex(T.blue, .08); g.fillRect(-W, 0, 2 * W, H);
  line(g, [[-W, 0], [W, 0]], T.muted, 2);
  const off = ((s ? s.x : 0) * 14) % 60; for (let x = -W - off; x < W; x += 60) line(g, [[x, 14], [x + 30, 14]], T.muted, 3);
  car2d(g, 0, 0, opt.w ?? 200, s ? s.wheelAng : 0, o && o.Pb < -0.05 ? '#16a34a' : '#2563eb');
  if (o && opt.forces) {
    const sc = 0.035;
    if (Math.abs(o.Fw) > 1) { arrow(g, 40, -20, 40 + o.Fw * sc, -20, o.Fw >= 0 ? T.green : T.yellow, 3); text(g, `F_t ${fmt(o.Fw)} N`, 40 + o.Fw * sc, -34, { size: 11, color: T.green }); }
    if (o.Fa > 1) { arrow(g, -110, -50, -110 - o.Fa * sc * 2, -50, T.orange, 2.5); text(g, `F_d ${fmt(o.Fa)}`, -120 - o.Fa * sc, -62, { size: 11, color: T.orange }); }
    if (o.Fr > 1) { arrow(g, -90, -6, -90 - o.Fr * sc * 2, -6, T.red, 2.5); text(g, `F_rr ${fmt(o.Fr)}`, -100 - o.Fr * sc, 8, { size: 11, color: T.red }); }
    if (Math.abs(o.Fg) > 1) { arrow(g, 0, -60, -o.Fg * sc * 2, -60, T.violet, 2.5); text(g, `F_g ${fmt(o.Fg)}`, -o.Fg * sc, -74, { size: 11, color: T.violet }); }
    if (o.Ffric > 1) { arrow(g, 60, -4, 60 - o.Ffric * sc, -4, T.pink, 2.5); text(g, `F_brake ${fmt(o.Ffric)}`, 60 - o.Ffric * sc / 2, 10, { size: 11, color: T.pink }); }
  }
  g.restore();
}
/** Circular gauge. */
export function gauge(g, cx, cy, r, val, max, label, unit, col, min = 0) {
  const T = { line: '#2f4066', text: '#e6ecf7', muted: '#93a3c0' };
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, f = clamp((val - min) / (max - min), 0, 1);
  g.save(); g.lineCap = 'round'; g.lineWidth = r * 0.14; g.strokeStyle = T.line; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  g.strokeStyle = col; g.beginPath(); if (min < 0) { const z = (0 - min) / (max - min); g.arc(cx, cy, r, a0 + (a1 - a0) * Math.min(z, f), a0 + (a1 - a0) * Math.max(z, f)); } else g.arc(cx, cy, r, a0, a0 + (a1 - a0) * f); g.stroke(); g.restore();
  text(g, typeof val === 'number' ? (Math.abs(val) >= 100 ? val.toFixed(0) : val.toFixed(1)) : val, cx, cy - 2, { size: r * 0.42, weight: 800 });
  text(g, unit, cx, cy + r * 0.32, { size: r * 0.2, color: T.muted }); text(g, label, cx, cy + r * 0.82, { size: r * 0.2, color: T.muted, weight: 600 });
}
