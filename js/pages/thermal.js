// 10.2 Battery thermal simulation: cell heat generation, conduction, liquid cooling channels, radiator/chiller and heater.
import { h, fmt, clamp, ICON } from '../lib/ui.js';
import { Chart, Trace } from '../lib/chart.js';
import { fitCanvas, themeColors, text, flow, rrect, hex, box } from '../lib/draw.js';
import { rTemp } from '../models/battery.js';
import { backward, REF4 } from '../models/vehicle.js';
import { getCycles } from '../models/drivecycles.js';

const NX = 12, NY = 4;
export function render(c, app) {
  const P = { load: 'dyn', C: 2, mode: 'liquid', flow: 8, Tin: 25, Ta: 30, heater: true, fail: false, scale: 1.5 };
  c.append(h('div', { class: 'crumbs' }, 'Laboratory / Battery Thermal Simulation'), h('h1', {}, 'Battery Thermal Management Laboratory'),
    h('p', { class: 'muted' }, 'A 12 × 4 module array (each cell node = one 48 Ah module column) with I²R(T) heat generation, cell-to-cell conduction, a serpentine liquid-cooling channel (coolant warms along its path), radiator/chiller for heat rejection and a PTC heater for cold conditions. Lumped-parameter model integrated with a 1 s step.'));
  const sel = (k, opts) => h('select', { onchange: e => P[k] = isNaN(+e.target.value) ? e.target.value : +e.target.value }, opts.map(([v, l]) => h('option', { value: v, selected: v === P[k] }, l)));
  const rngI = (k, l, u, min, max, step) => { const b = h('b', {}, P[k] + ' ' + u); return h('div', { class: 'ctrl' }, h('div', { class: 'lbl' }, h('span', {}, l), b), h('input', { type: 'range', min, max, step, value: P[k], oninput: e => { P[k] = +e.target.value; b.textContent = P[k] + ' ' + u; } })); };
  const ctr = h('div', { class: 'card' }, h('h4', {}, 'Load'), h('div', { class: 'ctrl' }, sel('load', [['dyn', 'Driving (UDDS-derived current)'], ['cc', 'Constant discharge (C-rate below)'], ['fc', 'DC fast charge (C-rate below)']])), rngI('C', 'C-rate', 'C', 0.5, 4, 0.1), rngI('scale', 'Driving load scale', '×', 0.5, 4, 0.1),
    h('h4', {}, 'Thermal management'), h('div', { class: 'ctrl' }, sel('mode', [['liquid', 'Liquid cooling (radiator)'], ['chiller', 'Liquid cooling + chiller (15 °C)'], ['air', 'Forced air'], ['none', 'Passive (no cooling)']])), rngI('flow', 'Coolant flow', 'L/min', 1, 20, 0.5), rngI('Ta', 'Ambient temperature', '°C', -15, 45, 1),
    h('label', { class: 'chk', style: { display: 'flex', gap: '8px' } }, h('input', { type: 'checkbox', checked: true, onchange: e => P.heater = e.target.checked }), 'PTC heater (below 10 °C)'), h('label', { class: 'fault', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', onchange: e => P.fail = e.target.checked }), 'Cooling-pump failure'),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn go sm', html: ICON.play + ' Start / Pause', onclick: () => run = !run }), h('button', { class: 'btn sm', html: ICON.reset + ' Reset', onclick: () => reset() })));
  const cv = h('canvas', { style: { width: '100%', height: '380px', display: 'block' } });
  const kp = h('div', { class: 'kpis' }); const charts = h('div', { class: 'charts' });
  c.append(h('div', { class: 'lab' }, ctr, h('div', {}, h('div', { class: 'stage' }, cv), kp, charts)));
  const tr = { T: [new Trace(), new Trace(), new Trace()], c: [new Trace(), new Trace()], q: [new Trace()] };
  const mk = (title, yl, s, names) => { const host = h('div', { class: 'chart' }, h('h5', {}, title)); charts.append(host); return new Chart(host, { xl: 'Time (min)', yl, series: s.map((t, i) => ({ name: names[i], x: t.x, y: t.y })) }); };
  const C1 = mk('Cell temperatures', '°C', tr.T, ['T max', 'T avg', 'T min']), C2 = mk('Coolant inlet / outlet', '°C', tr.c, ['inlet', 'outlet']), C3 = mk('Total heat generation', 'W', tr.q, ['Q']);
  let S, run = true, raf, last = 0;
  const ud = backward(getCycles().UDDS.v, REF4, { Pregen: 50e3, Paux: 600 }).Pb;
  function reset() { S = { t: 0, T: Array.from({ length: NX * NY }, () => P.Ta), Tc: Array(NX * NY).fill(P.Ta), Tin: P.Ta, z: .8, Q: 0 }; Object.values(tr).flat().forEach(t => t.clear()); }
  reset();
  function step(dt) {
    const Qcell = 48 * 3, I = P.load === 'cc' ? P.C * Qcell : P.load === 'fc' ? P.C * Qcell : ud[Math.floor(S.t) % ud.length] * 1000 / 350 * P.scale;
    const Ic = I / 3; let Qtot = 0; const R0 = 0.0015 * 1.4; // module-column resistance incl. interconnect
    const pump = !P.fail && P.mode !== 'none' && P.mode !== 'air'; const mdot = pump ? P.flow / 60 * 1.05 : 0; const cp = 3500, mc = 900 * 3, hc = pump ? 6 + 0.9 * P.flow : 0, ha = P.mode === 'air' ? (P.fail ? .3 : 2.5) : 0.25, k = 1.2;
    // coolant path: serpentine through rows
    const order = []; for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) order.push(y * NX + (y % 2 ? NX - 1 - x : x));
    let Tcool = S.Tin; const nT = S.T.slice();
    order.forEach(id => { const q = Ic * Ic * R0 * rTemp(S.T[id]) * 3; Qtot += q; let dq = q - ha * (S.T[id] - P.Ta);
      if (pump) { const qc = hc * (S.T[id] - Tcool); dq -= qc; Tcool += qc / (mdot * cp); }
      const x = id % NX, y = Math.floor(id / NX); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < NX && yy >= 0 && yy < NY) dq += k * (S.T[yy * NX + xx] - S.T[id]); });
      if (P.heater && S.T[id] < 10) dq += 60; nT[id] = S.T[id] + dq / mc * dt; S.Tc[id] = Tcool; });
    S.T = nT; S.Tout = Tcool; S.Q = Qtot;
    // heat rejection: radiator brings coolant toward ambient (+3 K approach); chiller to 15 °C
    if (pump) { const target = P.mode === 'chiller' ? Math.min(15, P.Ta) : P.Ta + 3; S.Tin = S.Tout + (target - S.Tout) * clamp(0.9 - 0.02 * P.flow, .5, .9); } else S.Tin = S.Tout;
    S.t += dt;
  }
  function draw() {
    const { g, W, H } = fitCanvas(cv), T = themeColors(); const x0 = 120, y0 = 40, cw = (W - x0 - 150) / NX, ch = (H - 90) / NY;
    S.T.forEach((t, id) => { const x = id % NX, y = Math.floor(id / NX); const f = clamp((t - 15) / 45, 0, 1); rrect(g, x0 + x * cw + 3, y0 + y * ch + 3, cw - 6, ch - 6, 6); g.fillStyle = `hsl(${(1 - f) * 230},85%,${42 + 8 * f}%)`; g.fill(); text(g, t.toFixed(1), x0 + x * cw + cw / 2, y0 + y * ch + ch / 2, { size: 11, weight: 700, color: '#06122a' }); });
    const pump = !P.fail && P.mode !== 'none' && P.mode !== 'air';
    if (pump) for (let y = 0; y < NY; y++) { const yy = y0 + y * ch + ch - 6; const pts = y % 2 ? [[x0 + NX * cw, yy], [x0, yy]] : [[x0, yy], [x0 + NX * cw, yy]]; flow(g, pts, performance.now() / 1000, P.flow / 20, T.cyan, { w: 2, arrowAt: .5 }); }
    box(g, 10, H / 2 - 40, 96, 80, P.mode === 'chiller' ? 'Chiller' : P.mode === 'air' ? 'Fan' : 'Radiator', { color: P.fail ? T.red : T.cyan, active: true, sub: P.fail ? 'PUMP FAILED' : `${fmt(S.Tin)} °C in` });
    box(g, W - 130, H / 2 - 40, 118, 80, 'Coolant out', { color: T.orange, active: true, sub: `${fmt(S.Tout)} °C` });
    text(g, `Heat generation ${fmt(S.Q)} W · ΔT spread ${fmt(Math.max(...S.T) - Math.min(...S.T))} K · t = ${(S.t / 60).toFixed(1)} min`, x0, 20, { align: 'left', weight: 700 });
    for (let k = 0; k <= 5; k++) { const t = 15 + k * 9; g.fillStyle = `hsl(${(1 - k / 5) * 230},85%,${42 + 8 * k / 5}%)`; g.fillRect(x0 + k * 46, H - 30, 46, 10); text(g, t + '°', x0 + k * 46 + 23, H - 12, { size: 10, color: T.muted }); }
  }
  let next = 0;
  const loop = now => { raf = requestAnimationFrame(loop); const dt = Math.min(.1, (now - (last || now)) / 1000); last = now; if (run) { for (let i = 0; i < Math.round(dt * 60); i++) step(1); if (S.t >= next) { const Ts = S.T; tr.T[0].push(S.t / 60, Math.max(...Ts)); tr.T[1].push(S.t / 60, Ts.reduce((a, b) => a + b, 0) / Ts.length); tr.T[2].push(S.t / 60, Math.min(...Ts)); tr.c[0].push(S.t / 60, S.Tin); tr.c[1].push(S.t / 60, S.Tout); tr.q[0].push(S.t / 60, S.Q); next = S.t + 10; C1.request(); C2.request(); C3.request(); const Tm = Math.max(...S.T); kp.innerHTML = `<div class="kpi ${Tm > 45 ? 'bad' : 'acc'}"><span>Max cell temperature</span><b>${fmt(Tm)}</b><i>°C</i></div><div class="kpi"><span>Min cell temperature</span><b>${fmt(Math.min(...S.T))}</b><i>°C</i></div><div class="kpi"><span>Temperature spread</span><b>${fmt(Tm - Math.min(...S.T))}</b><i>K</i></div><div class="kpi"><span>Heat generation</span><b>${fmt(S.Q)}</b><i>W</i></div><div class="kpi"><span>Coolant rise</span><b>${fmt(S.Tout - S.Tin)}</b><i>K</i></div><div class="kpi ${Tm > 45 ? 'bad' : 'good'}"><span>Status</span><b>${Tm > 55 ? 'BMS derating' : Tm > 45 ? 'Above optimum' : Tm < 10 ? 'Too cold' : 'Optimal 15–45 °C'}</b></div>`; } } draw(); };
  raf = requestAnimationFrame(loop);
  app.onLeave(() => { cancelAnimationFrame(raf); [C1, C2, C3].forEach(ch => ch.destroy()); });
}
