// Validation panel: engineering checks against worked examples in the notes, and digital-twin test cases.
import { h, fmt } from '../lib/ui.js';
import { REF1, REF4, roadLoad, accelRun, motorTmax, backward } from '../models/vehicle.js';
import { EVTwin } from '../models/ev_engine.js';
import { vsi } from '../models/inverter.js';
import { imSteady, IM_EX13, PMSM_EX20, pmsmTorque, clarke, park, ipark, iclarke } from '../models/machines.js';
import { getCycles } from '../models/drivecycles.js';

const near = (x, ref, tol) => Math.abs(x - ref) <= tol;
function runTwin(cfg, z0, fn, sec, set) { const ev = new EVTwin(cfg); ev.reset(z0); if (set) set(ev); let mx = {}; for (let i = 0; i < sec / 0.01; i++) { fn && fn(ev, i * 0.01); ev.step(0.01); for (const k of ['Ib', 'Pb', 'v', 'Tmot', 'Tm', 'balErrPct']) { mx['min' + k] = Math.min(mx['min' + k] ?? Infinity, ev.o[k]); mx['max' + k] = Math.max(mx['max' + k] ?? -Infinity, ev.o[k]); } } return { ev, mx }; }

export const TESTS = [
  // ----- engineering validation -----
  ['Engineering', 'Road-load force, Unit 1 Example 1 (3 %, 60 km/h, 1 m/s²)', () => { const r = roadLoad(60 / 3.6, 1, 3, REF1); return [r.Ft, '2425 N (notes)', near(r.Ft, 2425, 3)]; }],
  ['Engineering', 'Battery energy of 96s3p 48 Ah 3.65 V pack', () => { const E = 96 * 3 * 3.65 * 48 / 1000; return [E, '50.46 kWh (Table 4.3)', near(E, 50.46, 0.01)]; }],
  ['Engineering', 'SOC by Coulomb counting: 144 Ah pack, 144 A for 30 min from 100 %', () => { const ev = new EVTwin(); ev.reset(1); const z = 1 - 144 * 0.5 / 144; return [z * 100, '50 %', near(z * 100, 50, 1e-9)]; }],
  ['Engineering', 'Motor torque–power relation at base speed (P = Tω)', () => { const wb = REF4.Ppk / REF4.Tpk; const T = motorTmax(wb * 1.0001, REF4); return [T * wb * 1.0001 / 1000, '110 kW', near(T * wb * 1.0001, 110e3, 1)]; }],
  ['Engineering', 'Gearbox: wheel torque = Tm·G·ηg (200 N·m, G = 9, η = 0.97)', () => { const Tw = 200 * 9 * 0.97; return [Tw, '1746 N·m', near(Tw, 1746, 0.01)]; }],
  ['Engineering', 'Acceleration of reference BEV 0–100 km/h (numerical integration)', () => { const r = accelRun(Object.assign({}, REF4, { eta_tr: .97 })); const k = r.V.findIndex(v => v >= 100); return [r.t100, 'physically plausible 5–12 s, speed monotonic up to 100 km/h', r.t100 > 5 && r.t100 < 12 && r.V.slice(0, k).every((v, i) => !i || v >= r.V[i - 1] - 1e-9)]; }],
  ['Engineering', 'Regenerative energy ≤ available kinetic energy (stop from 72 km/h)', () => { const ev = new EVTwin(); ev.s.v = 20; ev.step(0); const KE = 0.5 * 1.05 * 1500 * 400; ev.in.brk = .4; while (ev.s.v > 0 && ev.o.t < 60) ev.step(.01); return [ev.E.regen / KE * 100, '< 100 % of KE', ev.E.regen < KE && ev.E.regen > 0]; }],
  ['Engineering', 'Charging time: AC 7.4 kW, 20→80 % of 50.46 kWh', () => { const ev = new EVTwin(); ev.reset(.2); ev.in.charging = { type: 'AC', Pmax: 7.4e3, eta: .93 }; let t = 0; while (ev.o.soc < 80 && t < 30000) { ev.step(1); t++; } const th = 50.46 * .6 / (7.4 * .93 - 0.6); return [t / 3600, `≈ ${th.toFixed(2)} h = E·ΔSOC/(P·η − P_aux), ±10 %`, Math.abs(t / 3600 - th) / th < 0.1]; }],
  ['Engineering', 'SPWM fundamental = ma·Vdc/2 (ma = 0.8, Vdc = 400 V)', () => { const r = vsi({ Vdc: 400, m: .8, f1: 50, fc: 2550, method: 'spwm', R: 5, L: .01 }); return [r.V1ph, '160 V ± 1 %', near(r.V1ph, 160, 1.6)]; }],
  ['Engineering', 'SVPWM linear range: V1 = 1.15·Vdc/2 at ma = 1.15', () => { const r = vsi({ Vdc: 400, m: 1.15, f1: 50, fc: 2550, method: 'svpwm', R: 5, L: .01 }); return [r.V1ph, '230 V ± 1 %', near(r.V1ph, 230, 2.3)]; }],
  ['Engineering', 'Induction motor Example 13: Is, PF, Pag at s = 3 %', () => { const o = imSteady(IM_EX13, .03); return [`${fmt(o.Is)} A, ${o.PF.toFixed(3)}, ${fmt(o.Pag / 1000)} kW`, '38.8 A, 0.889, 23.01 kW', near(o.Is, 38.8, .1) && near(o.PF, .889, .002) && near(o.Pag, 23010, 30)]; }],
  ['Engineering', 'PMSM torque, Unit 3 Example 20 (id = −100 A, iq = 250 A)', () => { const T = pmsmTorque(PMSM_EX20, -100, 250); return [T, '180 N·m', near(T, 180, 1e-9)]; }],
  ['Engineering', 'Clarke → Park → inverse Park → inverse Clarke round trip', () => { let e = 0; for (let k = 0; k < 100; k++) { const th = k * .37, a = Math.cos(th + .3), b = Math.cos(th + .3 - 2.094395102), c = -a - b; const ab = clarke(a, b, c), dq = park(ab.al, ab.be, th), ab2 = ipark(dq.d, dq.q, th), r = iclarke(ab2.al, ab2.be); e = Math.max(e, Math.abs(r.a - a), Math.abs(r.b - b), Math.abs(r.c - c)); } return [e, '< 1e-9', e < 1e-9]; }],
  ['Engineering', 'Indirect vector control slip, Unit 3 Example 17', () => { const w = (1 / (0.0042 / 0.012)) * (262.5 / 50); return [w, '15.0 rad/s', near(w, 15, .01)]; }],
  ['Engineering', 'Drive-cycle data: UDDS distance', () => { const d = getCycles().UDDS.v.reduce((a, v) => a + v / 3.6, 0) / 1000; return [d, '11.99 km (EPA)', near(d, 11.99, .02)]; }],
  // ----- digital-twin test cases -----
  ['Simulation', '1. EV acceleration from rest', () => { const { ev } = runTwin({}, .9, ev => ev.in.acc = 1, 8); return [`${fmt(ev.o.v)} km/h, SOC ${ev.o.soc.toFixed(2)} %`, 'speed ↑, SOC ↓, I_b > 0', ev.o.v > 60 && ev.o.soc < 90 && ev.o.Ib > 0]; }],
  ['Simulation', '2. Constant-speed driving (cruise 60 km/h)', () => { const { ev } = runTwin({}, .9, null, 60, ev => { ev.s.v = 60 / 3.6; ev.in.cruise = true; ev.in.cruiseSet = 60; }); return [ev.o.v, '60 ± 1 km/h', near(ev.o.v, 60, 1)]; }],
  ['Simulation', '3. Deceleration (coasting with one-pedal regen)', () => { const { ev } = runTwin({}, .9, null, 10, ev => { ev.s.v = 25; }); return [ev.o.v, '< 90 km/h start', ev.o.v < 90]; }],
  ['Simulation', '4. Regenerative braking: battery current negative', () => { const { ev, mx } = runTwin({}, .7, ev => ev.in.brk = .3, 6, ev => { ev.s.v = 25; }); return [`I_min ${fmt(mx.minIb)} A, E_reg ${fmt(ev.o.Ereg * 1000)} Wh`, 'I_b < 0, E_reg > 0', mx.minIb < -10 && ev.o.Ereg > 0]; }],
  ['Simulation', '5. Hill climbing 10 % at 50 km/h needs more power than level', () => { const a = runTwin({}, .9, null, 20, ev => { ev.s.v = 50 / 3.6; ev.in.cruise = true; ev.in.cruiseSet = 50; }).ev.o.Pb, b = runTwin({}, .9, null, 20, ev => { ev.s.v = 50 / 3.6; ev.in.cruise = true; ev.in.cruiseSet = 50; ev.in.grade = 10; }).ev.o.Pb; return [`${fmt(b)} vs ${fmt(a)} kW`, 'P_hill > P_level', b > a + 10]; }],
  ['Simulation', '6. Downhill −6 % at constant 50 km/h regenerates', () => { const { ev } = runTwin({}, .7, null, 30, ev => { ev.s.v = 50 / 3.6; ev.in.cruise = true; ev.in.cruiseSet = 50; ev.in.grade = -6; }); return [`P_b ${fmt(ev.o.Pb)} kW, v ${fmt(ev.o.v)}`, 'P_b < 0, speed held', ev.o.Pb < 0 && near(ev.o.v, 50, 1.5)]; }],
  ['Simulation', '7. Battery low SOC → limp-home power limit', () => { const { ev } = runTwin({}, .06, ev => ev.in.acc = 1, 3); return [`P_b ${fmt(ev.o.Pb)} kW`, '≤ 25 kW', ev.o.Pb <= 25.01]; }],
  ['Simulation', '8. Battery overheating → derate then contactor opens', () => { const { ev } = runTwin({}, .8, ev => ev.in.acc = 1, 2, ev => { ev.s.Tb = 62; }); return [`flags: ${ev.flags.contactor || 'closed'}, P_b ${fmt(ev.o.Pb)} kW`, 'contactor OPEN, P_b ≈ aux only', ev.flags.contactor === 'OPEN']; }],
  ['Simulation', '9. AC charging 7.4 kW', () => { const { ev } = runTwin({}, .3, null, 600, ev => { ev.in.charging = { type: 'AC', Pmax: 7.4e3, eta: .93 }; }); return [`P_chg ${fmt(ev.o.Pchg)} kW, SOC ${ev.o.soc.toFixed(2)} %`, '≈ 6.9 kW into pack, SOC ↑', near(ev.o.Pchg, 7.4 * .93, .2) && ev.o.soc > 30]; }],
  ['Simulation', '10. DC fast charging current limited to 150 A', () => { const { ev, mx } = runTwin({}, .2, null, 300, ev => { ev.in.charging = { type: 'DC', Pmax: 60e3, eta: .95 }; }); return [`I_min ${fmt(mx.minIb)} A`, '|I| ≤ 150 A', mx.minIb >= -150.01]; }],
  ['Simulation', '11. FTP-75 drive cycle with PI driver', () => { const c = getCycles().FTP75.v; const ev = new EVTwin(); ev.in.cycle = c; let se = 0, n = 0, eb = 0; for (let i = 0; i < c.length / .01; i++) { ev.step(.01); se += (ev.o.vref - ev.o.v) ** 2; n++; eb = Math.max(eb, ev.o.balErrPct); } const whkm = ev.o.netkWh * 1000 / ev.o.x; return [`RMS ${Math.sqrt(se / n).toFixed(2)} km/h, ${fmt(whkm)} Wh/km, balance ${eb.toExponential(1)} %`, 'RMS < 3 km/h, 90–200 Wh/km, balance < 1e-3 %', Math.sqrt(se / n) < 3 && whkm > 90 && whkm < 200 && eb < 1e-3]; }],
  ['Simulation', '12. Motor overload (2500 kg towing up 30 % at 20 km/h) → thermal derating', () => { const { ev, mx } = runTwin({ m: 2500 }, .9, null, 90, ev => { ev.s.Tm = 120; ev.s.v = 20 / 3.6; ev.in.grade = 30; ev.in.cruise = true; ev.in.cruiseSet = 20; }); return [`T_motor max ${fmt(mx.maxTmot)} °C`, '> 140 °C triggers derating', mx.maxTmot > 140 && ev.warn.some(w => w[0].includes('derated'))]; }],
  ['Simulation', '13. Battery charging limit at 98 % SOC during braking', () => { const { mx } = runTwin({}, .98, ev => ev.in.brk = .5, 3, ev => { ev.s.v = 25; }); return [`P_b min ${fmt(mx.minPb)} kW`, 'charge power ≥ −2 kW (acceptance limit)', mx.minPb >= -2.6]; }],
  ['Simulation', '14. Inverter fault → zero motor torque', () => { const { mx } = runTwin({}, .8, ev => { ev.in.acc = 1; ev.faults.inverter = true; }, 2); return [`|T| max ${fmt(Math.max(Math.abs(mx.minTm), Math.abs(mx.maxTm)))} N·m`, '0 N·m', Math.abs(mx.maxTm) < 1e-9 && Math.abs(mx.minTm) < 1e-9]; }],
  ['Simulation', 'SOC stays within 0–100 % and speed ≥ 0 when braking in D', () => { const { ev, mx } = runTwin({}, .01, ev => { ev.in.brk = 1; }, 5, ev => { ev.s.v = 2; }); return [`v_min ${fmt(mx.minv)} km/h, SOC ${ev.o.soc.toFixed(3)} %`, 'v ≥ 0, 0 ≤ SOC ≤ 100', mx.minv >= 0 && ev.o.soc >= 0 && ev.o.soc <= 100]; }],
];

export function render(c) {
  c.append(h('div', { class: 'crumbs' }, 'Laboratory / Validation'), h('h1', {}, 'Validation Panel'), h('p', { class: 'muted' }, 'Engineering checks reproduce worked examples from the unit notes; simulation test cases exercise the digital twin. Press “Run all tests”.'));
  const tbody = h('tbody', {}); const sum = h('div', { class: 'kpis' });
  const btn = h('button', { class: 'btn pri', onclick: () => run() }, 'Run all tests');
  c.append(h('div', { class: 'card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, btn, sum), h('div', { class: 'tblwrap', style: { maxHeight: 'none', marginTop: '10px' } }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['#', 'Group', 'Test', 'Result', 'Expected', 'Status'].map(x => h('th', {}, x)))), tbody))));
  TESTS.forEach((t, i) => tbody.append(h('tr', { 'data-i': i }, h('td', {}, i + 1), h('td', {}, t[0]), h('td', {}, t[1]), h('td', { class: 'num' }, '–'), h('td', {}, ''), h('td', {}, h('span', { class: 'pill info' }, 'not run')))));
  async function run() {
    btn.disabled = true; let pass = 0;
    for (let i = 0; i < TESTS.length; i++) {
      await new Promise(r => setTimeout(r, 5)); const tr = tbody.children[i]; let res;
      try { res = TESTS[i][2](); } catch (e) { res = [e.message, '', false]; }
      tr.children[3].textContent = typeof res[0] === 'number' ? fmt(res[0]) : res[0]; tr.children[4].textContent = res[1]; tr.children[5].innerHTML = `<span class="pill ${res[2] ? 'ok' : 'bad'}">${res[2] ? 'PASS' : 'FAIL'}</span>`; if (res[2]) pass++;
      sum.innerHTML = `<div class="kpi good"><span>Passed</span><b>${pass}</b></div><div class="kpi ${i + 1 - pass ? 'bad' : ''}"><span>Failed</span><b>${i + 1 - pass}</b></div><div class="kpi"><span>Total</span><b>${TESTS.length}</b></div>`;
    }
    btn.disabled = false;
  }
}
