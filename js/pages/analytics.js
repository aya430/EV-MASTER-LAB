// 10.1 AI-based battery analytics: models trained in the browser on clearly labelled synthetic data.
import { h, fmt, rng, clamp } from '../lib/ui.js';
import { Chart } from '../lib/chart.js';
import { ageing, ECM, ocv } from '../models/battery.js';
import { standardize, linear, mlp, forest, boost, kernelRidge, metrics } from '../models/ml.js';

function sohData(n, seed) { const R = rng(seed); const X = [], y = []; for (let i = 0; i < n; i++) { const cyc = R() * 3000, cpy = 100 + R() * 400, dod = .2 + R() * .8, T = 10 + R() * 35, cr = .3 + R() * 2.2; const a = ageing({ cycles: cyc, years: cyc / cpy, dod, T, crate: cr }); X.push([cyc, cyc / cpy, dod, T, cr]); y.push(a.SOHc * 100 + R.gauss() * 0.4); } return { X, y, names: ['Cycles', 'Age (years)', 'DoD', 'Temperature (°C)', 'C-rate'] }; }
function socData(n, seed) { const R = rng(seed); const X = [], y = []; let k = 0; while (X.length < n) { const c = new ECM({ chem: 'NMC', Q: 48, order: 1, z: .2 + .8 * R(), T: 5 + 35 * R(), Tamb: 25, tempEffects: true, mcp: 1e9 }); for (let s = 0; s < 40 && X.length < n; s++) { const i = (R() * 3 - 1) * 48; const v = c.step(i, 30); X.push([v + R.gauss() * .004, i + R.gauss() * .5, c.T]); y.push(c.z * 100); } k++; } return { X, y, names: ['Terminal voltage (V)', 'Current (A)', 'Temperature (°C)'] }; }

export function render(c) {
  c.append(h('div', { class: 'crumbs' }, 'Laboratory / AI Battery Analytics'), h('h1', {}, 'AI-Based Battery Analytics'),
    h('div', { class: 'note warn' }, h('b', {}, 'Data provenance: '), 'all datasets on this page are SYNTHETIC, generated from the laboratory’s semi-empirical ageing model (SOH task) or the 1-RC equivalent-circuit cell model (SOC task), with seeded noise. The models below are genuinely trained in your browser on that data; their predictions are trained-model outputs on synthetic data, not on measured cell data. The LSTM card is an illustrative explanation only and is not trained here.'));
  const task = h('select', {}, h('option', { value: 'soh' }, 'SOH prediction (from usage features)'), h('option', { value: 'soc' }, 'SOC estimation (from V, I, T)'));
  const nIn = h('input', { type: 'number', value: 600, min: 200, max: 1500, step: 100, style: { width: '90px' } });
  const out = h('div', {});
  c.append(h('div', { class: 'card row' }, h('label', {}, 'Task ', task), h('label', {}, 'Samples ', nIn), h('button', { class: 'btn pri', onclick: () => train() }, 'Generate data & train models')), out,
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'LSTM (illustrative)'), h('p', {}, 'Long short-term memory networks process sequences (e.g. voltage/current/temperature histories over many cycles) and keep an internal cell state that captures long-term degradation trends, making them suitable for remaining-useful-life (RUL) forecasting from early-cycle data. Training an LSTM requires substantial sequence data and compute; it is described here for completeness and is not run in the browser.'), h('span', { class: 'tag ill' }, 'Illustrative – not a trained model')));
  async function train() {
    out.innerHTML = '<div class="loading">Training models in the browser…</div>'; await new Promise(r => setTimeout(r, 30));
    const n = +nIn.value, D = task.value === 'soh' ? sohData(n, 11) : socData(n, 21);
    const S = standardize(D.X); const Xs = D.X.map(S.f); const cut = Math.floor(n * .8);
    const Xtr = Xs.slice(0, cut), ytr = D.y.slice(0, cut), Xte = Xs.slice(cut), yte = D.y.slice(cut);
    const res = []; const t = f => { const t0 = performance.now(); const m = f(); return Object.assign(m, { ms: performance.now() - t0 }); };
    for (const f of [() => linear(Xtr, ytr), () => mlp(Xtr, ytr, { epochs: task.value === 'soh' ? 200 : 120 }), () => forest(Xtr, ytr), () => boost(Xtr, ytr), () => kernelRidge(Xtr, ytr, { gamma: task.value === 'soh' ? 0.3 : 0.6 })]) { const m = t(f); res.push([m, metrics(m, Xte, yte)]); await new Promise(r => setTimeout(r, 5)); }
    out.innerHTML = '';
    const tbl = h('table', { class: 't' }, h('tr', {}, ['Model', 'Test RMSE (%)', 'Test MAE (%)', 'R²', 'Training time (ms)', 'Status'].map(x => h('th', {}, x))), res.map(([m, r]) => h('tr', {}, h('td', {}, m.name), h('td', { class: 'num' }, fmt(r.rmse)), h('td', { class: 'num' }, fmt(r.mae)), h('td', { class: 'num' }, r.r2.toFixed(4)), h('td', { class: 'num' }, fmt(m.ms)), h('td', {}, h('span', { class: 'tag src' }, 'trained on synthetic data')))));
    const ch1 = h('div', { class: 'chart tall' }, h('h5', {}, 'Parity plot: predicted vs reference (test set)')), ch2 = h('div', { class: 'chart tall' }, h('h5', {}, task.value === 'soh' ? 'SOH trajectory & RUL for a usage profile (25 °C, 80 % DoD, 1C, 300 cycles/yr)' : 'SOC estimate along a held-out discharge'));
    out.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, `Results – ${task.value === 'soh' ? 'SOH' : 'SOC'} (${n} samples: ${cut} train / ${n - cut} test)`), tbl), h('div', { class: 'charts', style: { marginTop: '14px' } }, ch1, ch2));
    new Chart(ch1, { xl: 'Reference (%)', yl: 'Predicted (%)', series: [...res.map(([m, r]) => ({ name: m.name.split(' (')[0], x: yte, y: r.p, type: 'scatter', r: 2.2 })), { name: 'ideal', x: [Math.min(...yte), Math.max(...yte)], y: [Math.min(...yte), Math.max(...yte)], color: '#ffffff', dash: [4, 3] }] });
    if (task.value === 'soh') {
      const N = Array.from({ length: 61 }, (_, i) => i * 50); const truth = N.map(n => ageing({ cycles: n, years: n / 300, dod: .8, T: 25, crate: 1 }).SOHc * 100);
      const series = [{ name: 'Model truth', x: N, y: truth, color: '#ffffff', width: 2.5 }]; const rul = [];
      res.forEach(([m]) => { const yp = N.map(n => m.predict(S.f([n, n / 300, .8, 25, 1]))); series.push({ name: m.name.split(' (')[0], x: N, y: yp, dash: [4, 3] }); const k = yp.findIndex(v => v < 80); rul.push([m.name.split(' (')[0], k > 0 ? N[k] : '> 3000']); });
      new Chart(ch2, { xl: 'Equivalent full cycles', yl: 'SOH (%)', series, marks: [{ y: 80, label: 'EoL' }] });
      const kT = truth.findIndex(v => v < 80); out.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Remaining useful life (cycles to 80 % SOH) for the profile'), h('p', {}, `Reference model: ${kT > 0 ? N[kT] : '> 3000'} cycles. Predictions: ` + rul.map(r => `${r[0]}: ${r[1]}`).join(' · '))));
    } else {
      const R = rng(99); const cell = new ECM({ chem: 'NMC', Q: 48, order: 1, z: .95, T: 25, mcp: 1e9 }); const tt = [], zt = [], P = res.map(() => []);
      for (let k = 0; k < 220 && cell.z > .03; k++) { const i = 40 + 20 * Math.sin(k / 7); const v = cell.step(i, 30); tt.push(k * .5); zt.push(cell.z * 100); res.forEach(([m], j) => P[j].push(m.predict(S.f([v + R.gauss() * .004, i, 25])))); }
      new Chart(ch2, { xl: 'Time (min)', yl: 'SOC (%)', series: [{ name: 'Reference', x: tt, y: zt, color: '#ffffff', width: 2.5 }, ...res.map(([m], j) => ({ name: m.name.split(' (')[0], x: tt, y: P[j], dash: [4, 3] }))] });
    }
  }
}
