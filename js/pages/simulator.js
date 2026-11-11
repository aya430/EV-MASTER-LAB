// PART E – Fully interconnected real-time EV digital twin.
import { h, renderMath, toast, download, fmt, clamp, ICON } from '../lib/ui.js';
import { Chart, Trace, PALETTE } from '../lib/chart.js';
import { fitCanvas, themeColors } from '../lib/draw.js';
import { EVTwin, MODES } from '../models/ev_engine.js';
import { getCycles, CYCLE_OPTS } from '../models/drivecycles.js';
import { drawPowerFlow, gauge } from '../experiments/twinviz.js';
import { carView } from '../three/views.js';

const GRAPHS = [
  ['v', 'Speed vs time', 'km/h', o => [o.v]], ['soc', 'SOC vs time', '%', o => [o.soc]], ['vb', 'Battery voltage vs time', 'V', o => [o.Vt]], ['ib', 'Battery current vs time', 'A', o => [o.Ib]],
  ['pb', 'Battery power vs time', 'kW', o => [o.Pb]], ['tm', 'Motor torque vs time', 'N·m', o => [o.Tm]], ['rpm', 'Motor speed vs time', 'r/min', o => [o.rpm]], ['pm', 'Motor power vs time', 'kW', o => [o.Pmm]],
  ['preg', 'Regenerative power vs time', 'kW', o => [o.Preg]], ['ereg', 'Regenerated energy vs time', 'kWh', o => [o.Ereg]], ['tb', 'Battery temperature vs time', '°C', o => [o.Tb]], ['a', 'Acceleration vs time', 'm/s²', o => [o.a]],
  ['ed', 'Energy consumption vs distance', 'kWh', o => [o.netkWh], 'x'], ['eff', 'Motor efficiency vs speed', '%', o => [Math.abs(o.etaM) * 100], 'rpm'], ['rl', 'Road-load forces vs time', 'N', o => [o.Fr, o.Fa, o.Fg, o.Fi]], ['ref', 'Reference vs actual drive-cycle speed', 'km/h', o => [o.vref ?? NaN, o.v]],
];
const LBL = { rl: ['F_rr', 'F_d', 'F_g', 'F_inertia'], ref: ['reference', 'actual'] };

export function render(c, app) {
  const ev = new EVTwin(); let running = false, acc = 0, last = 0, raf = 0, simSpeed = 1, kb = {}, view = null, nextSample = 0;
  const traces = {}, charts = {};
  const T = themeColors();
  // -------------- layout --------------
  const clock = h('span', { class: 'clock' }, 't = 0.00 s');
  const runBtn = h('button', { class: 'btn go sm', html: ICON.play + ' Start (Enter)', onclick: () => toggle() });
  const cycSel = h('select', { onchange: e => { const v = e.target.value; if (v) { ev.reset(ev.s.z); ev.in.cycle = getCycles()[v].v; ev.in.cycleT0 = 0; clearTraces(); toast('Driver model will follow ' + v); if (!running) toggle(); } else { ev.in.cycle = null; } } }, h('option', { value: '' }, 'Manual driving'), CYCLE_OPTS.map(([k, l]) => h('option', { value: k }, 'Drive cycle: ' + l)));
  const chgSel = h('select', { onchange: e => { const v = e.target.value; if (!v) { ev.in.charging = null; return; } if (ev.s.v > 0.5) { toast('Stop the vehicle before charging'); e.target.value = ''; return; } ev.in.charging = v === 'AC' ? { type: 'AC', Pmax: 7.4e3, eta: 0.93 } : { type: 'DC', Pmax: 60e3, eta: 0.95 }; ev.in.acc = 0; simSpeed = 60; speedSel.value = 60; toast('Charging started (sim speed 60×)'); if (!running) toggle(); } }, h('option', { value: '' }, 'Not charging'), h('option', { value: 'AC' }, 'AC charging 7.4 kW (OBC)'), h('option', { value: 'DC' }, 'DC fast charging 60 kW'));
  const speedSel = h('select', { onchange: e => simSpeed = +e.target.value }, [0.25, 0.5, 1, 2, 5, 10, 20, 60].map(v => h('option', { value: v, selected: v === 1 }, v + '×')));
  const tb = h('div', { class: 'toolbar' }, runBtn, h('button', { class: 'btn sm', html: ICON.stop + ' Stop', onclick: () => { if (running) toggle(); } }), h('button', { class: 'btn sm', html: ICON.reset + ' Reset', onclick: () => reset() }), h('span', { class: 'sep' }), h('label', {}, 'Sim speed', speedSel), h('label', {}, 'Δt = 10 ms (fixed)'), h('span', { class: 'sep' }), cycSel, chgSel, h('span', { class: 'sep' }),
    h('button', { class: 'btn sm', html: ICON.full, title: 'Full screen 3D', onclick: () => stage.classList.toggle('fs') }), h('button', { class: 'btn sm', html: ICON.cam, title: 'Camera reset', onclick: () => view && view.resetCam() }), h('button', { class: 'btn sm', html: ICON.dl + ' Export', onclick: () => exportCSV() }), h('button', { class: 'btn sm', html: ICON.help, onclick: () => help() }), clock);
  const stage = h('div', { class: 'stage', style: { height: '430px' } });
  const v3 = h('div', { class: 'v3d', style: { height: '430px' } }); stage.append(v3);
  const flowC = h('canvas', { style: { width: '100%', height: '170px', display: 'block' } });
  const gaugesC = h('canvas', { style: { width: '100%', height: '170px', display: 'block' } });
  const kpis = h('div', { class: 'dash' });
  const warnBox = h('div', {});
  // controls
  const pedal = (label, key, col) => { const bar = h('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, background: col, borderRadius: '8px' } }); const el = h('div', { class: 'pedal', style: { position: 'relative', height: '130px', width: '64px', border: '2px solid ' + col, borderRadius: '10px', background: 'var(--panel2)', cursor: 'pointer', overflow: 'hidden' } }, bar, h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '.8rem', color: 'var(--text)', textAlign: 'center' } }, label)); let held = false; const set = e => { const r = el.getBoundingClientRect(); const f = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); ev.in[key] = f; }; el.addEventListener('pointerdown', e => { held = true; el.setPointerCapture(e.pointerId); set(e); if (!running) toggle(); }); el.addEventListener('pointermove', e => held && set(e)); el.addEventListener('pointerup', () => { held = false; ev.in[key] = 0; }); el.bar = bar; return el; };
  const accP = pedal('ACCEL\n(W / ↑)', 'acc', 'rgba(34,197,94,.55)'), brkP = pedal('BRAKE\n(S / ↓)', 'brk', 'rgba(239,68,68,.55)');
  const steer = h('input', { type: 'range', min: -1, max: 1, step: 0.01, value: 0, oninput: e => ev.in.steer = +e.target.value, style: { width: '100%' } });
  const gearBtns = ['R', 'N', 'D'].map(g => h('button', { class: 'btn sm' + (g === 'D' ? ' on' : ''), onclick: () => setGear(g) }, g));
  const modeBtns = Object.keys(MODES).map(m => h('button', { class: 'btn sm' + (m === 'NORMAL' ? ' on' : ''), onclick: () => { ev.in.mode = m; modeBtns.forEach(b => b.classList.toggle('on', b.textContent === m)); } }, m));
  const rng = (l, u, min, max, step, v, f) => { const b = h('b', {}, v + ' ' + u); return h('div', { class: 'ctrl' }, h('div', { class: 'lbl' }, h('span', {}, l), b), h('input', { type: 'range', min, max, step, value: v, oninput: e => { f(+e.target.value); b.textContent = e.target.value + ' ' + u; } })); };
  const cruiseChk = h('input', { type: 'checkbox', onchange: e => { ev.in.cruise = e.target.checked; ev.in.cruiseSet = Math.max(20, Math.round(ev.o.v)); toast(e.target.checked ? `Cruise set at ${ev.in.cruiseSet} km/h` : 'Cruise off'); } });
  const faults = [['inverter', 'Inverter fault'], ['battHot', 'Battery overheating'], ['motorHot', 'Motor overheating'], ['cooling', 'Cooling failure'], ['sensor', 'Sensor (SOC) failure'], ['comm', 'Communication failure'], ['cellOV', 'Cell over-voltage'], ['cellUV', 'Cell under-voltage'], ['overcurrent', 'Over-current']];
  const faultEls = faults.map(([k, l]) => { const cb = h('input', { type: 'checkbox', onchange: e => { ev.faults[k] = e.target.checked; if (k === 'battHot' && e.target.checked) ev.s.Tb = 58; if (k === 'motorHot' && e.target.checked) ev.s.Tm = 150; el.classList.toggle('act', e.target.checked); } }); const el = h('label', { class: 'fault' }, cb, l); return el; });
  const ctrls = h('div', { class: 'card' },
    h('h4', {}, 'Driver controls'), h('div', { class: 'row', style: { justifyContent: 'space-around' } }, accP, brkP),
    h('div', { class: 'ctrl', style: { marginTop: '10px' } }, h('div', { class: 'lbl' }, h('span', {}, 'Steering (A / D, ← / →)')), steer),
    h('div', { class: 'ctrl' }, h('div', { class: 'lbl' }, h('span', {}, 'Gear selector (R / N / G)')), h('div', { class: 'row' }, gearBtns)),
    h('div', { class: 'ctrl' }, h('div', { class: 'lbl' }, h('span', {}, 'Drive mode')), h('div', { class: 'row' }, modeBtns)),
    rng('Regeneration level', '%', 0, 100, 5, 70, v => ev.in.regen = v / 100),
    h('label', { class: 'chk', style: { display: 'flex', gap: '8px', margin: '6px 0' } }, cruiseChk, 'Cruise control (holds present speed)'),
    h('button', { class: 'btn bad', style: { width: '100%', marginTop: '6px' }, onpointerdown: () => { ev.in.emergency = true; if (!running) toggle(); }, onpointerup: () => ev.in.emergency = false, onpointerleave: () => ev.in.emergency = false }, '⛔ EMERGENCY BRAKE (Space)'),
    h('h4', {}, 'Environment & vehicle'), rng('Road gradient', '%', -12, 25, 0.5, 0, v => ev.in.grade = v), rng('Vehicle mass', 'kg', 1100, 2500, 10, 1500, v => ev.P.m = v), rng('Ambient temperature', '°C', -15, 45, 1, 25, v => ev.P.Tamb = v),
    h('label', { class: 'chk', style: { display: 'flex', gap: '8px' } }, h('input', { type: 'checkbox', checked: true, onchange: e => ev.in.cooling = e.target.checked }), 'Battery cooling active'),
    h('h4', {}, 'Fault injection'), faultEls);
  const graphsEl = h('div', { class: 'charts' });
  const balEl = h('div', { class: 'card' });
  c.append(h('div', { class: 'crumbs' }, 'Laboratory / Live EV Digital Twin'),
    h('h1', {}, 'Live EV Simulator – Digital Twin'),
    h('p', { class: 'muted' }, 'One centralised simulation (fixed 10 ms step) drives the 3D vehicle, dashboard, power-flow animation, graphs and energy balance. Reference vehicle: Unit 4 notes, Table 4.3. Keyboard: W/↑ accelerate · S/↓ brake · A/D steer · R reverse · N neutral · G drive · Space emergency brake · P pause · Enter start.'),
    tb, h('div', { class: 'lab simlab' }, ctrls,
      h('div', {}, stage, h('div', { class: 'card', style: { marginTop: '12px', padding: '6px' } }, gaugesC), kpis, warnBox, h('div', { class: 'card', style: { padding: '6px' } }, flowC))),
    h('h2', { style: { marginTop: '18px' } }, 'Live graphs (all from the same simulation state)'), graphsEl, h('h2', { style: { marginTop: '18px' } }, 'Live energy balance'), balEl);
  // graphs
  for (const [id, title, unit, f, xk] of GRAPHS) {
    const host = h('div', { class: 'chart' }, h('h5', {}, title)); graphsEl.append(host);
    const n = f(ev.o).length; traces[id] = Array.from({ length: n }, () => new Trace(4000));
    charts[id] = new Chart(host, { xl: xk === 'x' ? 'Distance (km)' : xk === 'rpm' ? 'Motor speed (r/min)' : 'Time (s)', yl: unit, series: traces[id].map((t, i) => ({ name: (LBL[id] || [title.split(' vs')[0]])[i], x: t.x, y: t.y, type: xk === 'rpm' ? 'scatter' : 'line', r: 1.5, color: PALETTE[i] })), legend: n > 1 });
  }
  function clearTraces() { for (const id in traces) traces[id].forEach(t => t.clear()); }
  function sample() {
    const o = ev.o;
    for (const [id, , , f, xk] of GRAPHS) { const vals = f(o), x = xk === 'x' ? o.x : xk === 'rpm' ? o.rpm : o.t; vals.forEach((v, i) => traces[id][i].push(x, v)); }
  }
  // -------------- loop --------------
  function setGear(g) { if (Math.abs(ev.s.v) > 1 && ((g === 'R' && ev.s.v > 0) || (g === 'D' && ev.s.v < 0))) { toast('Stop the vehicle before changing direction'); return; } ev.in.gear = g; gearBtns.forEach(b => b.classList.toggle('on', b.textContent === g)); }
  function toggle() { running = !running; runBtn.innerHTML = running ? ICON.pause + ' Pause (P)' : ICON.play + ' Resume (Enter)'; runBtn.classList.toggle('go', !running); runBtn.classList.toggle('warn', running); last = performance.now(); }
  function reset() { const m = ev.P.m, Ta = ev.P.Tamb; ev.reset(0.9); ev.P.m = m; ev.P.Tamb = Ta; clearTraces(); acc = 0; nextSample = 0; cycSel.value = ''; chgSel.value = ''; cruiseChk.checked = false; setGear('D'); toast('Simulation reset'); }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dtR = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    // keyboard ramps
    if (kb.w) ev.in.acc = Math.min(1, ev.in.acc + dtR * 1.5); else if (kb.wr) { ev.in.acc = Math.max(0, ev.in.acc - dtR * 3); if (ev.in.acc === 0) kb.wr = false; }
    if (kb.s) ev.in.brk = Math.min(1, ev.in.brk + dtR * 1.5); else if (kb.sr) { ev.in.brk = Math.max(0, ev.in.brk - dtR * 3); if (ev.in.brk === 0) kb.sr = false; }
    if (kb.a) ev.in.steer = Math.max(-1, ev.in.steer - dtR * 1.5); else if (kb.d) ev.in.steer = Math.min(1, ev.in.steer + dtR * 1.5); else if (kb.k) ev.in.steer *= Math.pow(0.02, dtR);
    steer.value = ev.in.steer;
    if (running) {
      acc += dtR * simSpeed; let n = 0;
      while (acc >= 0.01 && n < 20000) { ev.step(0.01); acc -= 0.01; n++; if (ev.o.t >= nextSample) { sample(); nextSample = ev.o.t + (simSpeed > 5 ? 0.5 : 0.1); } }
      if (n >= 20000) acc = 0;
      if (ev.in.cycle && ev.flags.cycleDone) { toggle(); toast(`Drive cycle finished: ${fmt(ev.o.x)} km, ${fmt(ev.o.netkWh * 1000 / Math.max(ev.o.x, 1e-3))} Wh/km, regenerated ${fmt(ev.o.Ereg)} kWh, estimated range ${fmt(ev.o.range)} km`, 9000); ev.in.cycle = null; cycSel.value = ''; }
      if (ev.in.charging && ev.o.soc >= 99.8) { ev.in.charging = null; chgSel.value = ''; toast('Charging complete'); simSpeed = 1; speedSel.value = 1; }
      for (const id in charts) charts[id].request();
    }
    accP.bar.style.height = (ev.o.acc ?? ev.in.acc) * 100 + '%'; brkP.bar.style.height = (ev.o.brk ?? ev.in.brk) * 100 + '%';
    clock.textContent = `t = ${ev.o.t.toFixed(2)} s`;
    drawFlow(); drawGauges(); if (Math.floor(now / 200) !== Math.floor((now - dtR * 1000) / 200)) { updKpis(); updBal(); }
    if (view) view.frame(dtR, running, null, null, { ev });
  }
  function drawFlow() { const { g, W, H } = fitCanvas(flowC); drawPowerFlow(g, W, H, { t: performance.now() / 1000, T: themeColors() }, ev.o, { y: 28, bh: 52 }); }
  function drawGauges() {
    const { g, W, H } = fitCanvas(gaugesC); const o = ev.o, r = Math.min(H * .38, W / 14);
    const gs = [[o.v, 160, 'Speed', 'km/h', '#22d3ee'], [o.rpm, 12000, 'Motor', 'r/min', '#a78bfa'], [o.Pb, 120, 'Battery power', 'kW', o.Pb < 0 ? '#22c55e' : '#f59e0b', -60], [o.Tm, 280, 'Torque', 'N·m', '#3b82f6', -280], [o.socDisp, 100, 'SOC', '%', o.soc < 15 ? '#ef4444' : '#22c55e'], [o.Tb, 70, 'Battery temp', '°C', o.Tb > 50 ? '#ef4444' : '#f472b6', -20]];
    gs.forEach((q, k) => gauge(g, W / gs.length * (k + .5), H * .48, r, q[0], q[1], q[2], q[3], q[4], q[5] || 0));
    g.fillStyle = '#e6ecf7'; g.font = '800 15px Inter'; g.textAlign = 'left'; g.fillText(`${o.gear} · ${o.mode}${ev.in.cruise ? ' · CRUISE ' + ev.in.cruiseSet : ''}${ev.in.charging ? ' · CHARGING ' + ev.in.charging.type : ''}`, 8, 18);
  }
  function updKpis() {
    const o = ev.o; kpis.innerHTML = '';
    [['Vehicle speed', o.v, 'km/h', 'acc'], ['Motor speed', o.rpm, 'r/min'], ['Battery SOC', o.socDisp, '%', o.soc < 15 ? 'bad' : 'good'], ['Battery SOH', o.soh, '%'], ['Battery voltage', o.Vt, 'V'], ['Battery current', o.Ib, 'A', o.Ib < 0 ? 'good' : ''], ['Battery power', o.Pb, 'kW', o.Pb < 0 ? 'good' : ''], ['Motor torque', o.Tm, 'N·m'], ['Motor power', o.Pmm, 'kW'], ['Motor efficiency', Math.abs(o.etaM) * 100, '%'], ['Battery temp.', o.Tb, '°C', o.Tb > 50 ? 'bad' : ''], ['Regen power', o.Preg, 'kW', 'good'], ['Recovered energy', o.Ereg, 'kWh', 'good'], ['Acceleration', o.a, 'm/s²'], ['Distance', o.x, 'km'], ['Estimated range', o.range, 'km', 'acc'], ['Consumption', o.kwh100, 'kWh/100 km'], ['Motor temp.', o.Tmot, '°C', o.Tmot > 140 ? 'bad' : '']].forEach(([l, v, u, cl]) => kpis.append(h('div', { class: 'kpi ' + (cl || '') }, h('span', {}, l), h('b', {}, fmt(v)), h('i', {}, u))));
    warnBox.innerHTML = ''; ev.warn.forEach(w => warnBox.append(h('div', { class: 'note ' + (w[1] === 'bad' ? 'bad' : w[1] === 'warn' ? 'warn' : '') }, w[0])));
  }
  function updBal() {
    const B = ev.balance(); const r = (l, v, cl) => `<tr><td>${l}</td><td class="num ${cl || ''}">${fmt(v * 1000)}</td></tr>`;
    balEl.innerHTML = `<div class="grid g3"><div><h3>Battery side (Wh)</h3><table class="t">${r('Total energy drawn from battery', B.drawn)}${r('Total recovered (regeneration into DC link)', B.recovered, 'ok-t')}${r('Net battery energy consumption', B.net)}${r('Chemical energy change (Σ V_oc·I·dt)', B.chem)}${r('Auxiliary energy', B.aux)}</table></div><div><h3>Conversion losses (Wh)</h3><table class="t">${r('Battery internal', B.losses.battery)}${r('Inverter', B.losses.inverter)}${r('Motor', B.losses.motor)}${r('Gear + differential', B.losses.gear)}${r('Total conversion losses', B.losses.battery + B.losses.inverter + B.losses.motor + B.losses.gear)}</table></div><div><h3>Vehicle side (Wh)</h3><table class="t">${r('Mechanical energy delivered at wheels (motoring)', B.deliveredPos)}${r('Net mechanical energy at wheels', B.delivered)}${r('Aerodynamic', B.road.aero)}${r('Rolling resistance', B.road.rolling)}${r('Friction brakes', B.road.friction)}${r('Kinetic energy stored', B.kinetic)}${r('Potential energy stored', B.potential)}</table><p style="margin-top:8px">Energy-balance error: <span class="pill ${B.errPct < 0.01 ? 'ok' : 'warn'}">${B.errPct.toExponential(2)} %</span> <span class="muted">(Σ chemical + charger = Σ losses + aux + road + stored)</span></p></div></div>`;
  }
  function exportCSV() { const lines = ['# EV MASTER LAB digital twin export — Developed by Dr Bansilal Bairwa, REVA University']; for (const [id, title] of GRAPHS) { lines.push('# ' + title); const tr = traces[id]; lines.push(['x', ...(LBL[id] || ['y'])].join(',')); for (let i = 0; i < tr[0].x.length; i++) lines.push([tr[0].x[i], ...tr.map(t => t.y[i])].join(',')); } download('EV_digital_twin.csv', lines.join('\n'), 'text/csv'); }
  function help() { toast('Press Start, then hold the accelerator (W). Release to coast with one-pedal regeneration, press S to brake. Select a drive cycle to let the driver model drive.', 8000); }
  const kd = e => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && e.target.type !== 'range') return; const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault(); if (k === 'w' || k === 'arrowup') { kb.w = true; if (!running) toggle(); } if (k === 's' || k === 'arrowdown') kb.s = true; if (k === 'a' || k === 'arrowleft') kb.a = true; if (k === 'd' || k === 'arrowright') kb.d = true; if (k === ' ') { ev.in.emergency = true; } if (k === 'r') setGear('R'); if (k === 'n') setGear('N'); if (k === 'g') setGear('D'); if (k === 'p') { if (running) toggle(); } if (k === 'enter') { if (!running) toggle(); } };
  const ku = e => { const k = e.key.toLowerCase(); if (k === 'w' || k === 'arrowup') { kb.w = false; kb.wr = true; } if (k === 's' || k === 'arrowdown') { kb.s = false; kb.sr = true; } if (k === 'a' || k === 'arrowleft') { kb.a = false; kb.k = true; } if (k === 'd' || k === 'arrowright') { kb.d = false; kb.k = true; } if (k === ' ') ev.in.emergency = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  // 3D
  try {
    view = carView(v3, { scroll: true, mode: 'transparent', state: (p, R, S) => ({ speed: ev.s.v, flow: clamp(ev.o.Pb / 80, -1, 1), steer: ev.in.steer, braking: ev.o.brk > 0.02 || ev.in.emergency }) });
    // let the car yaw with heading for steering feedback
    const baseFrame = view.frame; view.frame = (dt, run, p, R, S) => { view.car.rotation.y = -ev.s.heading * 0.15; baseFrame(dt, run, p, R, S); };
  } catch (e) { v3.innerHTML = '<div class="note bad">WebGL unavailable – 3D view disabled; the simulator and all other views still work.</div>'; }
  ev.step(0); updKpis(); updBal();
  raf = requestAnimationFrame(frame);
  app.onLeave(() => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); Object.values(charts).forEach(ch => ch.destroy()); view && view.dispose(); });
}
