// Performance analysis: compare two EV configurations, and design-your-own-EV with technical report.
import { h, fmt, download, toast } from '../lib/ui.js';
import { Chart, PALETTE } from '../lib/chart.js';
import { EVTwin } from '../models/ev_engine.js';
import { REF4, gradeability } from '../models/vehicle.js';
import { getCycles } from '../models/drivecycles.js';
import { CHEM } from '../models/battery.js';

function evaluate(cfg, cycle = 'WLTC3b') {
  const ev = new EVTwin(cfg); ev.in.acc = 1; const T = [], V = []; let t100 = NaN, vmax = 0;
  for (let i = 0; i < 5000; i++) { ev.step(0.01); if (i % 25 === 0) { T.push(i * .01); V.push(ev.o.v); } if (isNaN(t100) && ev.o.v >= 100) t100 = i * .01; vmax = Math.max(vmax, ev.o.v); }
  const e2 = new EVTwin(cfg); e2.in.cycle = getCycles()[cycle].v; const n = getCycles()[cycle].v.length; for (let i = 0; i < n / .01; i++) e2.step(0.01);
  const B = e2.balance(), whkm = e2.o.netkWh * 1000 / e2.o.x; const Eu = cfg.ns * cfg.np * (cfg.ocv0 + cfg.ocv1 * .5) * cfg.Ccell / 1000 * 0.9;
  const P = Object.assign({}, REF4, cfg, { eta_tr: .97 });
  return { T, V, t100, vmax, whkm, range: Eu * 1000 / whkm, eff: 100 * B.deliveredPos / B.drawn, regen: 100 * B.recovered / B.drawn, grade: gradeability(20 / 3.6, P), Eu, B };
}
const field = (o, k, l, u, min, max, step) => { const inp = h('input', { type: 'number', value: o[k], min, max, step, onchange: e => o[k] = +e.target.value }); return h('div', { class: 'ctrl' }, h('div', { class: 'lbl' }, h('span', {}, l), h('span', {}, u)), inp); };

export function render(c, app, tab = 'compare') {
  c.append(h('div', { class: 'crumbs' }, 'Performance Analysis'), h('h1', {}, 'EV Performance Analysis'), h('div', { class: 'tabs' }, h('button', { class: tab === 'compare' ? 'on' : '', onclick: () => location.hash = '#/perf/compare' }, 'Compare two EV configurations'), h('button', { class: tab === 'design' ? 'on' : '', onclick: () => location.hash = '#/perf/design' }, 'Design your own EV')));
  if (tab === 'design') return design(c, app);
  const A = { m: 1500, ns: 96, np: 3, Ccell: 48, Ppk: 110, Tpk: 280, G: 9, Cd: .30, A: 2.2 }, B = { m: 1900, ns: 108, np: 4, Ccell: 50, Ppk: 150, Tpk: 350, G: 9.5, Cd: .33, A: 2.5 };
  const col = (o, name) => h('div', { class: 'card' }, h('h3', {}, name), field(o, 'm', 'Vehicle mass', 'kg', 800, 3000, 10), field(o, 'ns', 'Series cells', '', 50, 200, 1), field(o, 'np', 'Parallel cells', '', 1, 10, 1), field(o, 'Ccell', 'Cell capacity', 'Ah', 5, 200, 1), field(o, 'Ppk', 'Motor peak power', 'kW', 30, 400, 5), field(o, 'Tpk', 'Motor peak torque', 'N·m', 100, 700, 5), field(o, 'G', 'Gear ratio', '', 5, 15, .1), field(o, 'Cd', 'Cd', '', .2, .5, .01), field(o, 'A', 'Frontal area', 'm²', 1.6, 3.2, .05));
  const out = h('div', {}); const btn = h('button', { class: 'btn pri', onclick: () => run() }, 'Run comparison');
  c.append(h('div', { class: 'grid g3' }, col(A, 'Configuration A'), col(B, 'Configuration B'), h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Both configurations are simulated on the same digital twin: a full-throttle acceleration run and a complete WLTC Class 3b cycle with the PI driver. Pack: NMC cells, linear OCV as in the Unit 4 notes.'), btn)), out);
  function run() {
    out.innerHTML = '<div class="loading">Simulating…</div>';
    setTimeout(() => {
      const cfg = o => ({ m: o.m, ns: o.ns, np: o.np, Ccell: o.Ccell, Ppk: o.Ppk * 1000, Tpk: o.Tpk, G: o.G, Cd: o.Cd, A: o.A, Rcell: 1.5e-3 });
      const ra = evaluate(Object.assign({}, (new EVTwin()).P, cfg(A))), rb = evaluate(Object.assign({}, (new EVTwin()).P, cfg(B)));
      const rows = [['Battery capacity (usable)', ra.Eu, rb.Eu, 'kWh'], ['Motor power', A.Ppk, B.Ppk, 'kW'], ['Motor torque', A.Tpk, B.Tpk, 'N·m'], ['Vehicle mass', A.m, B.m, 'kg'], ['Maximum speed', ra.vmax, rb.vmax, 'km/h'], ['0–100 km/h', ra.t100, rb.t100, 's'], ['Gradeability @20 km/h', ra.grade, rb.grade, '%'], ['WLTC consumption', ra.whkm, rb.whkm, 'Wh/km'], ['Range (WLTC)', ra.range, rb.range, 'km'], ['Battery-to-wheel efficiency', ra.eff, rb.eff, '%'], ['Regenerated / drawn', ra.regen, rb.regen, '%']];
      out.innerHTML = ''; const tbl = h('table', { class: 't' }, h('tr', {}, h('th', {}, 'Metric'), h('th', { class: 'num' }, 'A'), h('th', { class: 'num' }, 'B'), h('th', {}, 'Unit'), h('th', {}, 'Better')), rows.map(r => h('tr', {}, h('td', {}, r[0]), h('td', { class: 'num' }, fmt(r[1])), h('td', { class: 'num' }, fmt(r[2])), h('td', {}, r[3]), h('td', {}, ['0–100 km/h', 'WLTC consumption', 'Vehicle mass'].includes(r[0]) ? (r[1] < r[2] ? 'A' : 'B') : (r[1] > r[2] ? 'A' : 'B')))));
      const ch1 = h('div', { class: 'chart' }, h('h5', {}, 'Full-throttle acceleration')), ch2 = h('div', { class: 'chart' }, h('h5', {}, 'Key metrics (normalised to A = 100)'));
      out.append(h('div', { class: 'card', style: { marginTop: '14px' } }, tbl), h('div', { class: 'charts', style: { marginTop: '14px' } }, ch1, ch2));
      new Chart(ch1, { xl: 's', yl: 'km/h', series: [{ name: 'A', x: ra.T, y: ra.V }, { name: 'B', x: rb.T, y: rb.V }] });
      const idx = [4, 5, 6, 7, 8, 9]; new Chart(ch2, { xl: 'Metric (vmax, 0–100, grade, Wh/km, range, η)', yl: '%', series: [{ name: 'A', x: idx.map((_, i) => i + 1), y: idx.map(() => 100), type: 'bar' }, { name: 'B', x: idx.map((_, i) => i + 1), y: idx.map(i => 100 * rows[i][2] / rows[i][1]), type: 'bar' }], xr: [.4, 6.6] });
    }, 30);
  }
}

function design(c, app) {
  const d = { chem: 'NMC', Ccell: 50, ns: 96, np: 3, mtype: 'PMSM', Ppk: 110, Tpk: 280, inv: 'SiC', G: 9, glider: 1150, r: 0.31, target: 350, Cd: 0.29, A: 2.2 };
  const sel = (k, l, opts) => h('div', { class: 'ctrl' }, h('div', { class: 'lbl' }, h('span', {}, l)), h('select', { onchange: e => d[k] = isNaN(+e.target.value) ? e.target.value : +e.target.value }, opts.map(([v, t]) => h('option', { value: v, selected: v === d[k] }, t))));
  const out = h('div', {});
  c.append(h('p', { class: 'muted' }, 'Configure a complete vehicle, run the simulation and generate a technical design report. Pack mass is computed from the chosen chemistry (cell-to-pack factor 0.65); motor mass ≈ 0.6 kg/kW (PMSM) or 0.8 kg/kW (IM).'),
    h('div', { class: 'grid g3' },
      h('div', { class: 'card' }, h('h3', {}, 'Battery'), sel('chem', 'Chemistry', Object.keys(CHEM).map(k => [k, CHEM[k].name])), field(d, 'Ccell', 'Cell capacity', 'Ah', 5, 200, 1), field(d, 'ns', 'Cells in series', '', 20, 220, 1), field(d, 'np', 'Cells in parallel', '', 1, 20, 1)),
      h('div', { class: 'card' }, h('h3', {}, 'Powertrain'), sel('mtype', 'Motor type', [['PMSM', 'PMSM (interior magnet)'], ['IM', 'Induction motor']]), field(d, 'Ppk', 'Motor peak power', 'kW', 30, 400, 5), field(d, 'Tpk', 'Motor peak torque', 'N·m', 100, 700, 5), sel('inv', 'Inverter devices', [['SiC', 'SiC MOSFET (η ≈ 98.5 %)'], ['Si', 'Si IGBT (η ≈ 97 %)']]), field(d, 'G', 'Gear ratio', '', 5, 15, .1)),
      h('div', { class: 'card' }, h('h3', {}, 'Vehicle & target'), field(d, 'glider', 'Glider mass (without pack & motor)', 'kg', 600, 2500, 10), field(d, 'r', 'Wheel radius', 'm', .25, .4, .005), field(d, 'Cd', 'Cd', '', .2, .45, .01), field(d, 'A', 'Frontal area', 'm²', 1.6, 3.2, .05), field(d, 'target', 'Target range (WLTC)', 'km', 100, 800, 10), h('button', { class: 'btn pri', style: { marginTop: '8px' }, onclick: () => run() }, 'Run simulation & design check'))), out);
  function run() {
    out.innerHTML = '<div class="loading">Simulating the design…</div>';
    setTimeout(() => {
      const C = CHEM[d.chem]; const Vnom = C.Vnom; const Ecell = Vnom * d.Ccell / 1000; const E = d.ns * d.np * Ecell; const wh = (C.Ewh[0] + C.Ewh[1]) / 2 * 0.65; const mPack = E * 1000 / wh; const mMot = d.Ppk * (d.mtype === 'IM' ? 0.8 : 0.6); const m = d.glider + mPack + mMot + 75;
      const span = C.ocv[12] - C.ocv[0]; const cfg = Object.assign({}, (new EVTwin()).P, { m, ns: d.ns, np: d.np, Ccell: d.Ccell, ocv0: C.Vmin + span * 0.15, ocv1: span * 0.75, VcellMin: C.Vmin, VcellMax: C.Vmax - 0.15, Ppk: d.Ppk * 1000, Tpk: d.Tpk, G: d.G, r: d.r, Cd: d.Cd, A: d.A, kcu: d.mtype === 'IM' ? 0.17 : 0.12, kfe: d.mtype === 'IM' ? 0.045 : 0.038, inv1: d.inv === 'SiC' ? 0.007 : 0.015, Rcell: 1.5e-3 * 50 / d.Ccell, Pc: d.Ppk * 550, Tc: d.Tpk * 0.55 });
      const r = evaluate(cfg); const ok = r.range >= d.target;
      const vmaxLim = 12000 * Math.PI / 30 * d.r / d.G * 3.6;
      const rows = [['Battery chemistry', C.name], ['Pack configuration', `${d.ns}s${d.np}p, ${d.Ccell} Ah cells`], ['Pack voltage (nominal)', `${fmt(d.ns * Vnom)} V`], ['Pack energy (nominal)', `${fmt(E)} kWh`], ['Pack mass (est.)', `${fmt(mPack)} kg`], ['Motor', `${d.mtype}, ${d.Ppk} kW / ${d.Tpk} N·m peak`], ['Inverter', d.inv === 'SiC' ? 'SiC MOSFET' : 'Si IGBT'], ['Gear ratio / wheel radius', `${d.G} / ${d.r} m`], ['Kerb + driver mass', `${fmt(m)} kg`], ['0–100 km/h', `${fmt(r.t100)} s`], ['Maximum speed', `${fmt(r.vmax)} km/h (motor-speed limit ${fmt(vmaxLim)} km/h)`], ['Gradeability at 20 km/h', `${fmt(r.grade)} %`], ['WLTC consumption', `${fmt(r.whkm)} Wh/km`], ['WLTC range', `${fmt(r.range)} km`], ['Target range', `${d.target} km — ${ok ? '✓ MET' : '✗ NOT MET'}`], ['Battery-to-wheel efficiency', `${fmt(r.eff)} %`], ['Regenerated / drawn energy', `${fmt(r.regen)} %`], ['Peak battery C-rate', `${fmt(d.Ppk / 0.9 / E)} C`]];
      const advice = []; if (!ok) advice.push(`Increase battery energy by ≈ ${fmt((d.target / r.range - 1) * 100)} % (add ${Math.ceil(d.np * (d.target / r.range - 1))} parallel string(s)) or reduce mass/drag.`); if (r.t100 > 12) advice.push('Acceleration is slow: raise peak torque/power or the gear ratio.'); if (d.Ppk / 0.9 / E > 3 && d.chem !== 'LTO') advice.push('Peak C-rate above 3C: the pack is power-limited; add parallel cells or choose a high-power cell.'); if (!advice.length) advice.push('All checks satisfied.');
      out.innerHTML = '';
      const ch = h('div', { class: 'chart' }, h('h5', {}, 'Full-throttle acceleration'));
      out.append(h('div', { class: 'grid g2', style: { marginTop: '14px' } }, h('div', { class: 'card' }, h('h3', {}, ok ? '✓ Design meets the target range' : '✗ Design does not meet the target range'), h('table', { class: 't' }, rows.map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))), h('h3', {}, 'Engineering recommendations'), h('ul', {}, advice.map(a => h('li', {}, a))), h('button', { class: 'btn pri', onclick: () => report(rows, advice) }, 'Generate technical design report')), ch));
      new Chart(ch, { xl: 's', yl: 'km/h', series: [{ name: 'Speed', x: r.T, y: r.V }] });
    }, 30);
  }
  function report(rows, advice) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>EV technical design report</title><style>body{font-family:Inter,Arial;max-width:860px;margin:24px auto;padding:0 20px;color:#0f1b33}h1{font-size:22px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #c7d3e5;padding:5px 8px}th{background:#eef3fa}.f{margin-top:30px;font-size:12px;color:#4b5d7d;border-top:1px solid #c7d3e5;padding-top:8px}button{float:right}@media print{button{display:none}}</style></head><body><button onclick="print()">Print / Save PDF</button><h1>EV Technical Design Report</h1><p>EV MASTER LAB · B24EES502 · Generated ${new Date().toLocaleString()}</p><p>Student: ________________ SRN: __________</p><h2>Design specification and simulated performance</h2><table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table><h2>Recommendations</h2><ul>${advice.map(a => `<li>${a}</li>`).join('')}</ul><h2>Method</h2><p>Acceleration and WLTC Class 3b cycle simulated with the EV MASTER LAB digital twin (fixed 10 ms step; PI driver; motor/inverter loss models; 1-RC battery with linear OCV; series brake blending with regeneration limits). Pack mass from mid-range chemistry specific energy × 0.65 cell-to-pack factor.</p><div class="f">EV MASTER LAB · Developed by Dr Bansilal Bairwa, Assistant Professor, REVA University, Bengaluru · https://www.linkedin.com/in/dr-bansilal-bairwa-4816b2106/</div></body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } else download('EV_design_report.html', html, 'text/html');
  }
}
