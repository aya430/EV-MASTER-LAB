// UNIT 1 – Introduction to Electric Vehicles: 13 experiments.
import { kv, lc, S, range, blocks, scope, legend } from './common.js';
import { box, flow, text, hex, arrow, line, car2d, sw, motor, wheel, gear, battery, capacitor, inductor, resistor, rrect } from '../lib/draw.js';
import { ARCH_TYPES, ARCH_MODES, ARCH_INFO, archFlows } from './arch.js';
import { REF1, roadLoad, accelRun, maxSpeed, gradeability, steadyConsumption, backward, tractiveMax, g0 } from '../models/vehicle.js';
import { getCycles, cycleStats, CYCLE_OPTS } from '../models/drivecycles.js';
import { vsi, hysteresis, singlePhasePWM, svDwell, VEC, harmonics, thd } from '../models/inverter.js';
import { ECM, CHEM, ocv } from '../models/battery.js';
import { carView, packView } from '../three/views.js';
import { fmt, h, clamp } from '../lib/ui.js';

const TAU = 2 * Math.PI;
const vehParams = (o = {}) => [
  { h: 'Vehicle' },
  { id: 'm', l: 'Vehicle mass m', u: 'kg', min: 800, max: 3000, step: 10, v: o.m ?? REF1.m },
  { id: 'Cd', l: 'Drag coefficient Cd', min: 0.18, max: 0.5, step: 0.01, v: REF1.Cd },
  { id: 'A', l: 'Frontal area A', u: 'm²', min: 1.6, max: 3.2, step: 0.05, v: REF1.A },
  { id: 'Crr', l: 'Rolling resistance Crr', min: 0.005, max: 0.025, step: 0.001, v: REF1.Crr, d: 3 },
  { id: 'r', l: 'Wheel radius r', u: 'm', min: 0.25, max: 0.4, step: 0.005, v: REF1.r, d: 3 },
  { id: 'G', l: 'Gear ratio G', min: 4, max: 14, step: 0.1, v: REF1.G },
  { id: 'eta', l: 'Transmission efficiency ηtr', min: 0.85, max: 0.99, step: 0.005, v: REF1.eta_tr, d: 3 },
];
const vehOf = p => ({ m: p.m, Cd: p.Cd, A: p.A, Crr: p.Crr, rho: 1.225, r: p.r, G: p.G, eta_tr: p.eta, delta: 1.05, Tpk: p.Tpk, Ppk: (p.Ppk || 100) * 1000, nmax: p.nmax || 12000, eta_m: 0.93, eta_inv: 0.97, Paux: 500 });

export const EXPERIMENTS = [
  // =====================================================================================================
  {
    id: '1.1', kind: 'static', view3d: (host, p, api) => carView(host, { state: () => ({ speed: 6, flow: 0.5 }) }), default3d: true, stageH: 460,
    aim: 'To identify the types of electric vehicles and the major components of a battery electric vehicle using an interactive 3D model.',
    objectives: ['Classify EVs as BEV, HEV (series, parallel, series-parallel), PHEV and FCEV.', 'Locate and describe every major component of a BEV powertrain.', 'Compare the energy sources, tailpipe emissions and tank-to-wheel efficiency of each type.'],
    background: 'Basic electrical machines, power electronics and automobile layout.',
    theory: `<h3>What is an electric vehicle?</h3><p>An electric vehicle (EV) is propelled, wholly or partly, by an electric motor drawing energy from an on-board store. EVs are classified by their <b>energy source</b> and <b>degree of electrification</b>:</p>
<ul><li><b>BEV</b> – battery only, charged from the grid; zero tailpipe emission.</li><li><b>HEV</b> – an engine and a motor; the battery is charged only by the engine and by regenerative braking. Series, parallel and series-parallel (power-split) configurations exist.</li><li><b>PHEV</b> – a hybrid with a larger battery that can be charged from the grid, giving a useful electric-only range.</li><li><b>FCEV</b> – a hydrogen fuel cell produces electricity on board; a small battery buffers peaks and stores regenerated energy.</li></ul>
<p>The major BEV components are the traction battery with its BMS, the traction inverter, the traction motor, a single-speed reduction gear with differential, the on-board charger (OBC), the auxiliary DC-DC converter and 12 V battery, the vehicle control unit (VCU) and the thermal management system.</p>
<p>Use the <b>3D view</b> to rotate the vehicle, switch to <b>transparent</b>, <b>X-ray</b> or <b>exploded</b> view, and click any component for its function, working principle, construction, specifications and governing equation. Switch to <b>2D</b> for the energy-source architecture of the selected type.</p>`,
    eqs: [['\\eta_{TTW} = \\frac{E_{wheel}}{E_{onboard}}', 'Tank-to-wheel efficiency compares how much of the stored energy reaches the wheels.'], ['P_{wheel} = F_t\\,v = \\frac{T_m G \\eta_{tr}}{r_w} v', 'Wheel power from motor torque, gear ratio and wheel radius.']],
    params: [{ id: 'type', l: 'EV type', type: 'select', str: true, v: 'BEV', opts: ARCH_TYPES }, { id: 'Pw', l: 'Wheel power demand', u: 'kW', min: 5, max: 120, step: 1, v: 40 }],
    compute(p) {
      const I = ARCH_INFO[p.type];
      const rows = Object.entries(ARCH_INFO).map(([k, a]) => [a.name, a.src, a.ice, a.plug, a.zev, (a.ttw * 100).toFixed(0) + ' %', a.range, a.ex]);
      return {
        kpis: [kv('Type', I.name, '', 'acc'), kv('Energy source', I.src), kv('Engine', I.ice), kv('Grid charging', I.plug), kv('Typical tank-to-wheel η', I.ttw * 100, '%', '', 0), kv('Typical range', I.range)],
        html: `<div class="note">${I.note}</div>`,
        obs: { cols: ['Type', 'Energy source', 'Engine', 'Plug-in', 'Zero emission', 'Typical TTW η', 'Range', 'Examples'], rows },
        charts: [lc('ttw', 'Typical tank-to-wheel efficiency by EV type (indicative)', 'Type index (BEV, SHEV, PHEV, PSHEV, FCEV)', 'η (%)', [S('η TTW', [1, 2, 3, 4, 5], Object.values(ARCH_INFO).map(a => a.ttw * 100), { type: 'bar' })], { xr: [0.4, 5.6] })],
      };
    },
    draw(g, W, H, A) {
      const f = archFlows(A.p.type, A.p.type === 'BEV' ? 'accel' : 'accel', A.p.Pw);
      blocks(g, W, H, A, f.nodes, f.edges);
      text(g, `${ARCH_INFO[A.p.type].name} — energy sources and conversion path (acceleration)`, 12, 16, { align: 'left', weight: 700 });
      legend(g, [[A.T.orange, 'Fuel'], [A.T.cyan, 'Electrical'], [A.T.violet, 'Mechanical'], [A.T.green, 'Regenerative'], [A.T.pink, 'Hydrogen']], 12, H - 82);
    },
    viva: [['Distinguish between an HEV and a PHEV.', 'Both have an engine and a motor; a PHEV has a larger battery that can be charged from the grid and gives an electric-only range, an HEV battery is charged only on board.'], ['Why is a single-speed gearbox sufficient in a BEV?', 'An electric motor gives full torque from zero speed and has a wide constant-power range, so one fixed ratio covers launch to top speed.'], ['What does the BMS do?', 'Monitors cell voltages/temperatures/current, estimates SOC and SOH, balances cells and protects the pack.'], 'Name the components through which energy flows from the battery to the wheels.', 'Why is the FCEV battery small compared with a BEV?'],
    mcq: [{ q: 'Which vehicle has no mechanical connection between the engine and the wheels?', o: ['Parallel HEV', 'Series HEV', 'Power-split HEV', 'Conventional ICE'], a: 1, e: 'In a series HEV the engine only drives a generator.' }, { q: 'The device that converts DC from the battery to variable-frequency AC is the', o: ['OBC', 'DC-DC converter', 'Traction inverter', 'BMS'], a: 2 }, { q: 'Which EV type is refuelled with hydrogen?', o: ['BEV', 'PHEV', 'FCEV', 'HEV'], a: 2 }, { q: 'The highest tank-to-wheel efficiency is achieved by a', o: ['BEV', 'Series HEV', 'FCEV', 'Parallel HEV'], a: 0, e: 'Only one conversion chain (battery → inverter → motor → gear) with ≈85 % efficiency.' }],
  },
  // =====================================================================================================
  {
    id: '1.2', kind: 'static', stageH: 440,
    aim: 'To study the configurations of BEV, series, parallel and power-split HEV, PHEV and FCEV and the power flow in each operating mode.',
    objectives: ['Draw the power-flow architecture of each EV configuration.', 'Identify energy storage and conversion elements and their efficiencies.', 'Trace power flow in EV, engine, combined, regenerative and charging modes.'],
    theory: `<p>The <b>configuration</b> of an EV defines how energy sources, converters and the transmission are interconnected. In a <b>BEV</b> the chain is <i>Battery → Inverter → Motor → Transmission → Wheels</i>. A <b>series HEV</b> adds an engine–generator set that feeds the DC bus; only the motor drives the wheels. A <b>parallel HEV</b> sums engine and motor torque mechanically in a torque coupler. A <b>series-parallel (power-split)</b> hybrid uses a planetary gear set to divide engine power between a mechanical path and an electrical path (generator → motor), acting as an electrically variable transmission. A <b>PHEV</b> is any hybrid with a grid-chargeable battery. An <b>FCEV</b> uses a fuel-cell stack with a boost DC-DC converter and a buffer battery on a bidirectional DC-DC converter.</p>
<p>Select a configuration and an operating mode. Particle speed and density are proportional to the calculated power in each branch; green particles show regenerated energy. The comparison table summarises the configurations.</p>`,
    eqs: [['P_{dc} = \\frac{P_w}{\\eta_g\\eta_m\\eta_{inv}}', 'Motoring: DC power drawn for a wheel power P_w.'], ['P_{rec} = P_w\\,\\eta_g\\eta_m\\eta_{inv}', 'Regeneration: power returned to the DC bus.'], ['P_{fuel} = \\frac{P_{shaft}}{\\eta_{ICE}},\\quad P_{H_2} = \\frac{P_{FC}}{\\eta_{FC}}', 'Chemical power of fuel and hydrogen.']],
    params: [{ id: 'type', l: 'Configuration', type: 'select', str: true, v: 'BEV', opts: ARCH_TYPES }, { id: 'mode', l: 'Operating mode', type: 'select', str: true, v: 'accel', opts: [['ev', 'EV only'], ['drive', 'Cruise'], ['accel', 'Acceleration'], ['regen', 'Regenerative braking'], ['charge', 'Charging'], ['fcchg', 'FC charging battery (FCEV)']] }, { id: 'Pw', l: 'Wheel power', u: 'kW', min: 5, max: 120, step: 1, v: 50 }, { h: 'Efficiencies' }, { id: 'eg', l: 'Gear ηg', min: .9, max: .99, step: .005, v: .97, d: 3 }, { id: 'em', l: 'Motor ηm', min: .85, max: .97, step: .005, v: .93, d: 3 }, { id: 'ei', l: 'Inverter ηinv', min: .9, max: .99, step: .005, v: .97, d: 3 }, { id: 'ee', l: 'Engine ηICE', min: .2, max: .42, step: .01, v: .35 }, { id: 'efc', l: 'Fuel cell ηFC', min: .4, max: .65, step: .01, v: .55 }],
    compute(p) {
      const modes = ARCH_MODES[p.type].map(m => m[0]); const mode = modes.includes(p.mode) ? p.mode : modes[0];
      const f = archFlows(p.type, mode, p.Pw, p);
      const rows = ARCH_TYPES.map(([k, l]) => { const a = ARCH_INFO[k]; return [l, a.src, a.ice, a.plug, ARCH_MODES[k].map(m => m[1]).join(', ')]; });
      return {
        kpis: [kv('Mode', ARCH_MODES[p.type].find(m => m[0] === mode)[1], '', 'acc'), ...Object.entries(f.flows).map(([k, v]) => kv(k, v, k.includes('efficiency') ? '%' : 'kW'))],
        html: mode !== p.mode ? `<div class="note warn">Mode “${p.mode}” is not available for this configuration – showing “${mode}”. Available: ${ARCH_MODES[p.type].map(m => m[1]).join(', ')}.</div>` : '',
        obs: { cols: ['Configuration', 'Energy sources', 'Engine', 'Plug-in', 'Operating modes'], rows },
        _f: f, _mode: mode,
      };
    },
    draw(g, W, H, A) {
      const f = A.R._f; if (!f) return;
      blocks(g, W, H, A, f.nodes, f.edges);
      text(g, `${ARCH_INFO[A.p.type].name}: ${ARCH_MODES[A.p.type].find(m => m[0] === A.R._mode)[1]}`, 12, 16, { align: 'left', weight: 700 });
      legend(g, [[A.T.orange, 'Fuel'], [A.T.cyan, 'Electrical'], [A.T.violet, 'Mechanical'], [A.T.green, 'Regenerative'], [A.T.pink, 'Hydrogen'], [A.T.yellow, 'Grid']], 12, H - 98);
    },
    viva: [['Why does a series HEV suffer from double energy conversion?', 'Engine mechanical power is converted to electrical by the generator and back to mechanical by the motor, each with losses.'], ['What is the function of the planetary gear set in a power-split hybrid?', 'It splits engine power into a mechanical path to the wheels and an electrical path through MG1/MG2, acting as an e-CVT.'], 'Why does an FCEV need a bidirectional DC-DC converter for its battery?', 'In which mode does a parallel HEV operate as a pure EV?'],
    mcq: [{ q: 'In a parallel hybrid, engine and motor outputs are added as', o: ['Voltages', 'Currents', 'Torques', 'Fuels'], a: 2 }, { q: 'Which component makes the Toyota hybrid an e-CVT?', o: ['Clutch', 'Planetary gear set', 'Torque converter', 'Differential'], a: 1 }, { q: 'The FCEV fuel cell is normally interfaced to the DC bus through a', o: ['Buck converter', 'Boost DC-DC converter', 'Cycloconverter', 'Rectifier'], a: 1 }],
  },
  // =====================================================================================================
  {
    id: '1.3', kind: 'static',
    aim: 'To determine the maximum speed, acceleration time, gradeability, tractive effort, power requirement, range and energy consumption of a BEV.',
    objectives: ['Build the tractive-effort/road-load diagram.', 'Compute 0–60 and 0–100 km/h times by numerical integration.', 'Find maximum speed and gradeability and study the influence of each design parameter.'],
    theory: `<p>The vehicle performance is governed by the balance of the <b>tractive effort</b> $F_t$ available at the wheels and the <b>road load</b>. The motor delivers its peak torque $T_{pk}$ up to the base speed and constant power $P_{pk}$ above it, so</p>$$F_t(v)=\\frac{G\\,\\eta_{tr}}{r_w}\\min\\left(T_{pk},\\frac{P_{pk}}{\\omega_m}\\right),\\qquad \\omega_m=\\frac{G v}{r_w}.$$
<p>The road load consists of rolling resistance, aerodynamic drag and grade resistance. The difference between tractive effort and road load accelerates the vehicle (including the rotating-mass factor δ). <b>Maximum speed</b> is the speed at which the two curves meet (or the motor speed limit). <b>Gradeability</b> is the largest grade the drive can climb at a given speed. Range follows from the usable battery energy and the consumption at constant speed.</p>
<p>Defaults reproduce the reference BEV of Table 1.5 in the Unit 1 notes (m = 1600 kg, C<sub>d</sub> = 0.30, A = 2.3 m², C<sub>rr</sub> = 0.010, r = 0.32 m, G = 9.5, η<sub>tr</sub> = 0.95).</p>`,
    eqs: [['F_{rr} = C_{rr} m g\\cos\\theta,\\; F_d = \\tfrac12\\rho C_d A v^2,\\; F_g = m g \\sin\\theta', ''], ['\\delta m \\frac{dv}{dt} = F_t - F_{rr} - F_d - F_g', 'Equation of motion integrated with Δt = 10 ms.'], ['\\text{Gradeability: } F_t - F_d = m g (C_{rr}\\cos\\theta + \\sin\\theta)', ''], ['\\text{Range} = \\frac{E_{usable}}{e_c},\\quad e_c = \\frac{P_b}{v}', '']],
    params: [...vehParams(), { h: 'Motor and battery' }, { id: 'Tpk', l: 'Peak motor torque', u: 'N·m', min: 100, max: 500, step: 5, v: 250 }, { id: 'Ppk', l: 'Peak motor power', u: 'kW', min: 30, max: 250, step: 5, v: 100 }, { id: 'nmax', l: 'Max motor speed', u: 'r/min', min: 6000, max: 18000, step: 100, v: 12000 }, { id: 'Eb', l: 'Battery capacity', u: 'kWh', min: 15, max: 120, step: 1, v: 50 }, { id: 'Vb', l: 'Battery voltage', u: 'V', min: 200, max: 800, step: 10, v: 350 }, { id: 'vc', l: 'Cruise speed for range', u: 'km/h', min: 30, max: 140, step: 5, v: 80 }],
    compute(p) {
      const P = vehOf(p); const run = accelRun(P); const vmax = maxSpeed(P); const g20 = gradeability(20 / 3.6, P);
      const vs = range(0, Math.max(160, vmax * 3.6 + 10), 120);
      const Ft = vs.map(v => tractiveMax(v / 3.6, P));
      const rl = gr => vs.map(v => { const r = roadLoad(v / 3.6, 0, gr, P); return r.Fr + r.Fa + r.Fg; });
      const sc = steadyConsumption(p.vc, P), rangeKm = p.Eb * 0.9 * 1000 / sc.Whkm;
      const wb = Math.PI / 30 * Math.min(p.nmax, P.Ppk / P.Tpk * 30 / Math.PI), vbase = P.Ppk / P.Tpk / P.G * P.r * 3.6;
      const speeds = [30, 50, 70, 90, 110, 130];
      const cons = speeds.map(v => steadyConsumption(v, P).Whkm);
      return {
        kpis: [kv('Max speed', vmax * 3.6, 'km/h', 'acc'), kv('0–60 km/h', run.t60, 's'), kv('0–100 km/h', run.t100, 's'), kv('Gradeability @20 km/h', g20, '%'), kv('Starting tractive effort', Ft[0], 'N'), kv('Base vehicle speed', vbase, 'km/h'), kv(`Power at ${p.vc} km/h (wheel)`, sc.Pw / 1000, 'kW'), kv(`Consumption @${p.vc} km/h`, sc.Whkm, 'Wh/km'), kv('Range (90 % usable)', rangeKm, 'km', 'good'), kv('Peak battery current', P.Ppk / 0.9 / p.Vb, 'A')],
        charts: [
          lc('te', 'Tractive effort and road-load curves', 'Speed (km/h)', 'Force (N)', [S('Tractive effort', vs, Ft, { width: 2.5 }), S('Road load 0 %', vs, rl(0)), S('5 %', vs, rl(5)), S('10 %', vs, rl(10)), S('20 %', vs, rl(20))], { marks: [{ x: vmax * 3.6 }] }),
          lc('acc', 'Full-throttle acceleration', 'Time (s)', 'Speed (km/h)', [S('Speed', run.T, run.V, { width: 2.2 })], { marks: [{ y: 60 }, { y: 100 }] }),
          lc('pw', 'Power requirement at constant speed (level road)', 'Speed (km/h)', 'Power (kW)', [S('Wheel power', vs, vs.map(v => { const r = roadLoad(v / 3.6, 0, 0, P); return r.Ft * v / 3.6 / 1000; })), S('Motor peak power', vs, vs.map(v => Math.min(P.Ppk, tractiveMax(v / 3.6, P) * v / 3.6) / 1000), { dash: [5, 4] })]),
          lc('cons', 'Energy consumption and range vs cruise speed', 'Speed (km/h)', 'Wh/km', [S('Consumption', speeds, cons, { marker: true })]),
          lc('grad', 'Gradeability vs speed', 'Speed (km/h)', 'Grade (%)', [S('Gradeability', vs.slice(1), vs.slice(1).map(v => gradeability(v / 3.6, P)))]),
        ],
        steps: [[`Base motor speed $\\omega_b = P_{pk}/T_{pk} = ${fmt(P.Ppk / P.Tpk)}$ rad/s; vehicle base speed $v_b = \\omega_b r/G$ = ${fmt(vbase)} km/h.`], [`Starting tractive effort $F_t = T_{pk} G \\eta_{tr}/r$`, `F_t = \\frac{${P.Tpk}\\times${P.G}\\times${P.eta_tr}}{${P.r}} = ${fmt(Ft[0])}\\,\\text{N}`], [`At ${p.vc} km/h on level road: $F_{rr}$ = ${fmt(sc.rl.Fr)} N, $F_d$ = ${fmt(sc.rl.Fa)} N; wheel power = ${fmt(sc.Pw / 1000)} kW; battery power (with η<sub>m</sub>=0.93, η<sub>inv</sub>=0.97, 0.5 kW aux) = ${fmt(sc.Pb / 1000)} kW.`], [`Consumption $e_c = P_b/v$ = ${fmt(sc.Whkm)} Wh/km; range = 0.9 × ${p.Eb} kWh / e<sub>c</sub> = ${fmt(rangeKm)} km.`], [`Maximum speed from the intersection of tractive effort and level road load (or motor speed limit ${p.nmax} r/min ⇒ ${fmt(p.nmax * Math.PI / 30 * P.r / P.G * 3.6)} km/h): <b>${fmt(vmax * 3.6)} km/h</b>.`]],
        obs: { cols: ['Cruise speed (km/h)', 'Wheel power (kW)', 'Battery power (kW)', 'Consumption (Wh/km)', 'Range (km)'], rows: speeds.map(v => { const c = steadyConsumption(v, P); return [v, c.Pw / 1000, c.Pb / 1000, c.Whkm, p.Eb * 900 / c.Whkm]; }) },
        _run: run, _vmax: vmax,
      };
    },
    draw(g, W, H, A) {
      const run = A.R._run; if (!run) return;
      const tt = (A.t % (run.T[run.T.length - 1] * 0.6 + 2)); const i = Math.min(run.T.length - 1, Math.floor(tt * 10));
      const v = run.V[i], a = run.A[i];
      const gy = H * 0.72; g.fillStyle = hex(A.T.blue, .08); g.fillRect(0, gy, W, H - gy);
      line(g, [[0, gy], [W, gy]], A.T.muted, 2);
      const off = (tt * v / 3.6 * 18) % 60; for (let x = -off; x < W; x += 60) line(g, [[x, gy + 18], [x + 30, gy + 18]], A.T.muted, 3);
      const cx = W * 0.45; car2d(g, cx, gy, 230, tt * v / 3.6 / 0.32, '#2563eb');
      const P = vehOf(A.p); const rl = roadLoad(v / 3.6, 0, 0, P); const Ft = tractiveMax(v / 3.6, P); const sc = 0.04;
      arrow(g, cx + 30, gy - 30, cx + 30 + Ft * sc, gy - 30, A.T.green, 3); text(g, `Fₜ = ${fmt(Ft)} N`, cx + 40 + Ft * sc / 2, gy - 44, { color: A.T.green, size: 12, weight: 700 });
      arrow(g, cx - 120, gy - 50, cx - 120 - rl.Fa * sc * 3, gy - 50, A.T.orange, 3); text(g, `F_d = ${fmt(rl.Fa)} N`, cx - 130 - rl.Fa * sc * 1.5, gy - 64, { color: A.T.orange, size: 12 });
      arrow(g, cx - 100, gy - 8, cx - 100 - rl.Fr * sc * 3, gy - 8, A.T.red, 3); text(g, `F_rr = ${fmt(rl.Fr)} N`, cx - 110 - rl.Fr * sc * 1.5, gy + 8, { color: A.T.red, size: 12 });
      text(g, `t = ${run.T[i].toFixed(1)} s   v = ${v.toFixed(1)} km/h   a = ${a.toFixed(2)} m/s²`, 14, 20, { align: 'left', weight: 700, size: 14 });
      text(g, `0–100 km/h in ${fmt(A.R.kpis[2][1])} s · top speed ${fmt(A.R._vmax * 3.6)} km/h`, 14, 42, { align: 'left', color: A.T.muted });
    },
    viva: [['Why does acceleration fall as speed rises even with full throttle?', 'Above base speed the motor is power-limited so tractive effort falls as 1/v, while aerodynamic drag rises with v².'], ['What is the rotational inertia factor δ?', 'A multiplier on vehicle mass that accounts for the kinetic energy of rotating parts (wheels, gears, rotor); typically 1.03–1.1 for EVs.'], 'How does gear ratio trade off acceleration against top speed?', 'Why is range lower at high speed?'],
    mcq: [{ q: 'Aerodynamic drag force varies with speed as', o: ['v', 'v²', 'v³', '√v'], a: 1 }, { q: 'Above base speed a traction motor operates in the', o: ['Constant-torque region', 'Constant-power region', 'Constant-current region', 'Braking region'], a: 1 }, { q: 'Increasing gear ratio G (same motor) mainly', o: ['Increases top speed', 'Improves acceleration and gradeability', 'Reduces drag', 'Increases range at all speeds'], a: 1 }],
    numericals: [['Reference BEV of Table 1.5 climbs a 3 % grade at 60 km/h and accelerates at 1.0 m/s². Find total tractive force.', 'F<sub>r</sub>=156.9 N, F<sub>a</sub>=117.4 N, F<sub>g</sub>=470.7 N, F<sub>i</sub>=1680 N ⇒ F<sub>t</sub> ≈ 2.42 kN (Unit 1, Example 1).']],
  },
  // =====================================================================================================
  {
    id: '1.4', kind: 'static', stageH: 470,
    aim: 'To analyse the energy flow and losses in a BEV from the battery to the wheels under different operating conditions.',
    objectives: ['Compute power at every stage: battery, DC link, inverter, motor, gearbox, differential, wheels.', 'Quantify the losses of each component.', 'Observe reversal of power flow in regenerative braking and downhill driving, and the charging path.'],
    theory: `<p>Energy leaves the cells, passes the battery internal resistance, the DC link, the <b>traction inverter</b>, the <b>motor</b>, the <b>gearbox</b> and the <b>differential</b> before reaching the wheels. Each stage has an efficiency, and the losses multiply: $\\eta_{b\\to w}=\\eta_b\\eta_{inv}\\eta_m\\eta_{gb}\\eta_{diff}$. Auxiliary loads (HVAC, 12 V system via the DC-DC converter) draw from the DC link.</p>
<p>When the wheel power becomes negative (braking, or descending a grade faster than gravity wants), the motor operates as a generator and the flow reverses: <i>Wheels → Differential → Gearbox → Motor/Generator → Inverter (rectifying) → Battery</i>. The recoverable fraction is limited at low speed (fade below 15 km/h) and by the battery charge acceptance. In charging mode the grid supplies the pack through the on-board charger.</p>
<p>The animation is driven by the calculated powers: particle speed and density are proportional to power, and direction follows the sign. Click a component to read how it converts energy.</p>`,
    eqs: [['P_w = (F_{rr}+F_d+F_g+\\delta m a)\\,v', ''], ['P_{gb,in}=\\frac{P_w}{\\eta_{diff}\\eta_{gb}},\\; P_{m,el}=\\frac{P_{gb,in}}{\\eta_m},\\; P_{dc}=\\frac{P_{m,el}}{\\eta_{inv}}', 'Motoring (P_w > 0)'], ['P_{dc} = P_w\\,\\eta_{diff}\\eta_{gb}\\eta_m\\eta_{inv}\\,k_r', 'Regeneration (P_w < 0), k_r = recoverable fraction'], ['I_b = \\frac{V_{oc}-\\sqrt{V_{oc}^2-4R_0P_b}}{2R_0},\\quad P_{loss,b}=I_b^2R_0', 'Battery current from terminal power']],
    params: [{ id: 'mode', l: 'Operating mode', type: 'seg', str: true, v: 'accel', opts: [['accel', 'Accelerate'], ['cruise', 'Constant speed'], ['regen', 'Regen braking'], ['hill', 'Hill climb'], ['down', 'Downhill'], ['charge', 'Charging']] },
      { id: 'v', l: 'Vehicle speed', u: 'km/h', min: 5, max: 140, step: 1, v: 60 }, { id: 'a', l: 'Acceleration / deceleration magnitude', u: 'm/s²', min: 0.1, max: 4, step: 0.05, v: 1.5 }, { id: 'gr', l: 'Road grade magnitude', u: '%', min: 0, max: 20, step: 0.5, v: 6 }, { id: 'm', l: 'Vehicle mass', u: 'kg', min: 800, max: 3000, step: 10, v: 1600 },
      { h: 'Component efficiencies' }, { id: 'ei', l: 'Inverter η', min: .9, max: .995, step: .005, v: .97, d: 3 }, { id: 'em', l: 'Motor η', min: .85, max: .97, step: .005, v: .93, d: 3 }, { id: 'egb', l: 'Gearbox η', min: .94, max: .995, step: .005, v: .98, d: 3 }, { id: 'ed', l: 'Differential η', min: .96, max: .998, step: .002, v: .99, d: 3 }, { id: 'kr', l: 'Regenerative fraction kr', min: 0, max: 1, step: .05, v: .9 }, { id: 'aux', l: 'Auxiliary load', u: 'kW', min: 0, max: 5, step: .1, v: .5 }, { id: 'Pc', l: 'Charger power (charging mode)', u: 'kW', min: 3.3, max: 150, step: .1, v: 7.4 }],
    compute(p) {
      const P = Object.assign({}, REF1, { m: p.m });
      let a = 0, grade = 0;
      if (p.mode === 'accel') a = p.a; else if (p.mode === 'regen') a = -p.a; else if (p.mode === 'hill') grade = p.gr; else if (p.mode === 'down') grade = -p.gr;
      const v = p.v / 3.6, rl = roadLoad(v, a, grade, P), Pw = p.mode === 'charge' ? 0 : rl.Ft * v / 1000;
      const Voc = 350, R0 = 0.048;
      const fade = p.v >= 15 ? 1 : p.v <= 5 ? 0 : (p.v - 5) / 10;
      let st, loss, Pb;
      if (p.mode === 'charge') {
        const Pg = p.Pc, eobc = p.Pc > 22 ? 0.95 : 0.93, Pdc = Pg * eobc, Pin = Pdc - p.aux; // aux supplied during charge
        const I = -(-(Voc) + Math.sqrt(Voc * Voc + 4 * R0 * Pin * 1000)) / (2 * R0); // charging current (negative)
        const lb = I * I * R0 / 1000;
        st = { grid: Pg, charger: Pdc, batt_term: Pin, batt_chem: Pin - lb, dc: 0, inv: 0, mot: 0, gb: 0, diff: 0, whl: 0 }; loss = { Charger: Pg - Pdc, Battery: lb, Auxiliary: p.aux }; Pb = -Pin;
        return out();
      }
      if (Pw >= 0) {
        const gb = Pw / p.ed, mot = gb / p.egb, inv = mot / p.em, dc = inv / p.ei; Pb = dc + p.aux;
        st = { whl: Pw, diff: gb, gb: mot, mot: inv, inv: dc, dc: Pb };
        loss = { Differential: gb - Pw, Gearbox: mot - gb, Motor: inv - mot, Inverter: dc - inv, Auxiliary: p.aux };
      } else {
        const brake = -Pw, gb = brake * p.ed, mot = gb * p.egb, el = mot * p.em * p.kr * fade, dc = el * p.ei; Pb = -dc + p.aux;
        st = { whl: Pw, diff: -gb, gb: -mot, mot: -el, inv: -dc, dc: Pb };
        loss = { Differential: brake - gb, Gearbox: gb - mot, 'Motor (gen) + friction share': mot - el, Inverter: el - dc, Auxiliary: p.aux, 'Friction brakes (non-recovered)': mot * (1 - p.kr * fade) * 0 };
      }
      const disc = Voc * Voc - 4 * R0 * Pb * 1000; const I = (Voc - Math.sqrt(Math.max(0, disc))) / (2 * R0); const lb = I * I * R0 / 1000;
      st.batt_term = Pb; st.batt_chem = Pb + lb; loss.Battery = lb;
      return out();
      function out() {
        const I = p.mode === 'charge' ? null : (Voc - Math.sqrt(Math.max(0, Voc * Voc - 4 * R0 * Pb * 1000))) / (2 * R0);
        const eff = p.mode === 'charge' ? st.batt_chem / st.grid : Pw >= 0 ? (Pw / st.batt_chem) : (-st.batt_chem / -Pw);
        const names = Object.keys(loss), vals = names.map(k => loss[k]);
        return {
          kpis: [kv('Wheel power Pw', Pw, 'kW', Pw < 0 ? 'good' : 'acc'), kv('Battery chemical power', st.batt_chem, 'kW'), kv('Battery terminal power', st.batt_term, 'kW'), kv('Battery current', p.mode === 'charge' ? (st.batt_term * 1000 / 350) * -1 : I, 'A'), kv('Total losses', vals.reduce((a, b) => a + b, 0) - (loss.Auxiliary || 0), 'kW', 'warn'), kv(p.mode === 'charge' ? 'Grid-to-battery η' : Pw >= 0 ? 'Battery-to-wheel η' : 'Wheel-to-battery η', eff * 100, '%'), p.mode === 'regen' || p.mode === 'down' ? kv('Regen fade factor', fade, '') : kv('Road grade', grade, '%')],
          charts: [lc('loss', 'Loss distribution (kW)', 'Component', 'Loss (kW)', [S('Loss', names.map((_, i) => i + 1), vals, { type: 'bar', color: '#ef4444' })], { xr: [0.3, names.length + 0.7], legend: false }),
            lc('stage', 'Power at each stage (kW): 1 battery chem … 8 wheels', 'Stage', 'Power (kW)', [S('Power', [1, 2, 3, 4, 5, 6, 7, 8], [st.batt_chem, st.batt_term, st.dc - p.aux, st.inv ?? 0, st.mot ?? 0, st.gb ?? 0, st.diff ?? 0, st.whl ?? 0], { type: 'bar' })], { xr: [0.3, 8.7] })],
          obs: { cols: ['Stage', 'Power (kW)', 'Loss in stage (kW)'], rows: [['Battery (chemical)', st.batt_chem, 0], ['Battery terminals', st.batt_term, loss.Battery || 0], ['Auxiliary load', p.mode === 'charge' ? p.aux : p.aux, 0], ['Inverter input (DC)', st.inv ?? 0, 0], ['Inverter output = motor input', st.mot ?? 0, loss.Inverter || 0], ['Motor shaft', st.gb ?? 0, loss.Motor || loss['Motor (gen) + friction share'] || 0], ['Gearbox output', st.diff ?? 0, loss.Gearbox || 0], ['Wheels', st.whl ?? 0, loss.Differential || 0]].concat(p.mode === 'charge' ? [['Grid input', st.grid, loss.Charger]] : []) },
          html: `<div class="note">Losses (kW): ${names.map((n, i) => `${i + 1}. ${n} = <b>${fmt(vals[i])}</b>`).join(' · ')}${p.mode === 'regen' && p.v < 15 ? ' · <b>Below 15 km/h regeneration fades; friction brakes take over.</b>' : ''}</div>` + (api_sel.v ? compText(api_sel.v) : ''),
          _st: st, _loss: loss, _Pw: Pw, _I: I,
        };
      }
    },
    click(id, api) { api_sel.v = id; api.recompute(); },
    draw(g, W, H, A) {
      const st = A.R._st; if (!st) return; const T = A.T;
      const ch = A.p.mode === 'charge';
      const ids = ['batt', 'dc', 'inv', 'mot', 'gb', 'diff', 'whl'], lab = ['Battery', 'DC link', 'Inverter', 'Motor', 'Gearbox', 'Differential', 'Wheels'];
      const vals = [st.batt_term, st.inv, st.mot, st.gb, st.diff, st.whl];
      const y = H * 0.48, bw = Math.min(100, W / 10.5), gap = (W - 7 * bw) / 8; const xs = ids.map((_, i) => gap + i * (bw + gap));
      const maxP = Math.max(20, ...Object.values(st).map(Math.abs).filter(isFinite));
      for (let i = 0; i < 6; i++) {
        const pv = i === 0 ? st.batt_term - A.p.aux * (ch ? 0 : 1) : vals[i];
        const m = ch ? 0 : (pv ?? 0) / maxP; const col = m < 0 ? T.green : i < 3 ? T.cyan : T.violet;
        flow(g, [[xs[i] + bw, y], [xs[i + 1], y]], A.t, m, col, { w: 4 });
        text(g, `${fmt(Math.abs(pv ?? 0))} kW`, (xs[i] + bw + xs[i + 1]) / 2, y - 52 - (i % 2) * 16, { color: col, weight: 700, size: 12, bg: hex(T.bg, .8) });
      }
      ids.forEach((id, i) => {
        box(g, xs[i], y - 34, bw, 68, lab[i], { color: [T.green, T.yellow, T.orange, T.cyan, T.violet, T.violet, T.blue][i], active: true, glow: api_sel.v === id ? 16 : 0 });
        A.hit(xs[i], y - 34, bw, 68, id);
      });
      // losses (downward red arrows)
      const L = A.R._loss; const lossAt = [L.Battery, 0, L.Inverter, L.Motor ?? L['Motor (gen) + friction share'], L.Gearbox, L.Differential, 0];
      lossAt.forEach((l, i) => { if (!l) return; const x = xs[i] + bw / 2; const len = 14 + 40 * Math.min(1, l / (maxP * 0.12)); arrow(g, x, y + 36, x, y + 36 + len, T.red, 2.5); text(g, `−${fmt(l)} kW`, x, y + 48 + len, { color: T.red, size: 11.5, weight: 700 }); });
      // aux
      if (A.p.aux > 0) { flow(g, [[xs[1] + bw / 2, y + 34], [xs[1] + bw / 2, H - 40]], A.t, A.p.aux / maxP + 0.02, T.pink, { w: 2 }); text(g, `Aux ${fmt(A.p.aux)} kW`, xs[1] + bw / 2, H - 28, { color: T.pink, size: 11.5 }); }
      if (ch) { box(g, xs[0], 24, bw * 1.1, 46, 'Grid + OBC', { color: T.yellow, active: true }); flow(g, [[xs[0] + bw / 2, 70], [xs[0] + bw / 2, y - 34]], A.t, st.charger / maxP, T.yellow, { w: 4 }); text(g, `${fmt(st.grid)} kW AC → ${fmt(st.charger)} kW DC`, xs[0] + bw * 1.3, 48, { align: 'left', color: T.yellow, weight: 700 }); A.hit(xs[0], 24, bw * 1.1, 46, 'obc'); }
      const modeTxt = { accel: 'Acceleration', cruise: 'Constant speed', regen: 'Regenerative braking – power flow reversed', hill: 'Hill climbing', down: 'Downhill driving', charge: 'Vehicle charging' }[A.p.mode];
      text(g, modeTxt, 14, 18, { align: 'left', weight: 800, size: 15, color: A.R._Pw < 0 ? T.green : T.text });
      text(g, 'Click any block for its energy-conversion principle', W - 14, 18, { align: 'right', size: 11, color: T.muted });
    },
    viva: [['Which component usually has the largest loss in a BEV drivetrain?', 'The motor (and at low load, the inverter); battery losses grow with I²R at high power.'], ['Why does regeneration fade at low speed?', 'Back-EMF and available kinetic energy are small; motor/inverter losses would exceed the recovered power, so friction brakes complete the stop.'], 'Explain well-to-wheel and tank-to-wheel efficiency.', 'Why is battery-to-wheel efficiency lower at very light load?'],
    mcq: [{ q: 'During regenerative braking the inverter operates as a', o: ['Rectifier feeding the DC link', 'Cycloconverter', 'Boost converter', 'Open circuit'], a: 0 }, { q: 'If ηinv=0.97, ηm=0.93, ηgb=0.98, ηdiff=0.99 the battery-to-wheel efficiency (excluding battery) is about', o: ['97 %', '87.5 %', '75 %', '93 %'], a: 1, e: '0.97×0.93×0.98×0.99 = 0.875' }, { q: 'Downhill at constant speed on a steep grade, the motor', o: ['Draws more power', 'Generates power', 'Is disconnected', 'Operates at stall'], a: 1 }],
  },
  // =====================================================================================================
  {
    id: '1.5', kind: 'sim', view3d: (host) => { const v = packView(host); v.build(6, 3, 'cylindrical'); return v; }, stageH: 420,
    aim: 'To study the structure of a traction battery and observe cell voltage, current, temperature and SOC during charging and discharging.',
    objectives: ['Identify electrode, electrolyte, separator and current collectors.', 'Visualise lithium-ion and electron movement during charge and discharge.', 'Relate C-rate to terminal voltage, temperature and SOC.'],
    theory: `<p>A traction battery is built hierarchically: <b>cell → module → pack</b>. A lithium-ion cell has a <b>negative electrode</b> (graphite on copper current collector), a <b>positive electrode</b> (metal oxide such as NMC or LFP on aluminium current collector), a porous <b>separator</b> and a liquid <b>electrolyte</b> (LiPF₆ in organic carbonates).</p>
<p>On <b>discharge</b>, Li⁺ ions de-intercalate from the graphite, travel through the electrolyte and separator and intercalate into the cathode, while electrons travel through the external circuit and do work. On <b>charge</b> the process is reversed by the charger. The terminal voltage differs from the open-circuit voltage by the ohmic and polarisation drops: $v_t = OCV(z) - i R_0 - v_{RC}$. Battery specifications include nominal voltage, capacity (Ah), energy (Wh), C-rate, SOC, SOH and DoD.</p>`,
    eqs: [['v_t = OCV(z) - iR_0 - v_1', ''], ['\\dot z = -\\frac{\\eta\\, i}{3600\\,Q}', 'i > 0 on discharge'], ['m c_p \\dot T = i^2R_0 + i v_1 - hA(T-T_{amb})', 'Lumped thermal model'], ['I = C\\text{-rate}\\times Q', '']],
    params: [{ id: 'dir', l: 'Process', type: 'seg', str: true, v: 'dis', opts: [['dis', 'Discharge'], ['chg', 'Charge']] }, { id: 'chem', l: 'Chemistry', type: 'select', str: true, v: 'NMC', opts: Object.keys(CHEM).map(k => [k, CHEM[k].name]) }, { id: 'C', l: 'C-rate', u: 'C', min: 0.2, max: 4, step: 0.1, v: 1 }, { id: 'Q', l: 'Cell capacity', u: 'Ah', min: 2, max: 100, step: 1, v: 50 }, { id: 'z0', l: 'Initial SOC', u: '%', min: 5, max: 100, step: 1, v: 90 }, { id: 'Ta', l: 'Ambient temperature', u: '°C', min: -10, max: 45, step: 1, v: 25 }],
    tools: [{ l: '▶ Start discharging', f: api => { api.set('dir', 'dis'); api.run(); } }, { l: '▶ Start charging', f: api => { api.set('dir', 'chg'); api.set('z0', 10); api.run(); } }],
    sim: {
      dt: 1, timeScale: 60, sampleEvery: 5,
      init: p => ({ c: new ECM({ chem: p.chem, Q: p.Q, R0: 1.5e-3 * 50 / p.Q, R1: 1.0e-3 * 50 / p.Q, C1: 20000 * p.Q / 50, order: 1, z: p.z0 / 100, T: p.Ta, Tamb: p.Ta, mcp: 900 * p.Q / 50, hA: 0.4 }), v: 0, i: 0, done: false }),
      step(s, p, dt) {
        const c = s.c; const I = p.C * p.Q * (p.dir === 'dis' ? 1 : -1);
        const vmax = CHEM[p.chem].Vmax, vmin = CHEM[p.chem].Vmin;
        let i = I;
        if (p.dir === 'chg') { const icv = (c.ocv - c.v1 - vmax) / (c.R0 * c.kR); i = Math.max(I, icv); if (Math.abs(i) < p.Q / 20) s.done = true; }
        s.v = c.step(i, dt); s.i = i; s.t = (s.t || 0) + dt;
        if (p.dir === 'dis' && (s.v <= vmin || c.z <= 0.001)) s.done = true;
      },
      done: s => s.done,
      sample: (s, p) => ({ kpis: [kv('Terminal voltage', s.v, 'V', 'acc', 3), kv('OCV', s.c.ocv, 'V', '', 3), kv('Current', s.i, 'A'), kv('SOC', s.c.z * 100, '%', 'good', 1), kv('Cell temperature', s.c.T, '°C', s.c.T > 45 ? 'bad' : ''), kv('Ah throughput', Math.abs(s.c.Ah), 'Ah'), kv('Heat generated', s.c.Qgen / 1000, 'kJ')], push: { v: [s.t || 0, s.v, s.c.ocv], z: [s.t || 0, s.c.z * 100], T: [s.t || 0, s.c.T], i: [s.t || 0, s.i] } }),
      charts: [{ id: 'v', title: 'Terminal voltage and OCV', xl: 'Time (s)', yl: 'Voltage (V)', s: ['v_t', 'OCV'] }, { id: 'z', title: 'State of charge', xl: 'Time (s)', yl: 'SOC (%)', s: ['SOC'] }, { id: 'i', title: 'Cell current (+ discharge)', xl: 'Time (s)', yl: 'Current (A)', s: ['i'] }, { id: 'T', title: 'Cell temperature', xl: 'Time (s)', yl: 'T (°C)', s: ['T'] }],
    },
    draw(g, W, H, A) { drawCell(g, W, H, A); },
    viva: [['What are current collectors made of on each electrode and why?', 'Copper for the graphite anode (Al alloys with Li at low potential), aluminium for the cathode (Cu would oxidise at high potential).'], ['What is a C-rate?', 'Current normalised to capacity: 1C discharges the full capacity in one hour.'], 'Why does terminal voltage drop instantly when load is applied?', 'Why does a cell heat up more at high C-rate?'],
    mcq: [{ q: 'During discharge, Li⁺ ions move from', o: ['Cathode to anode', 'Anode to cathode through the electrolyte', 'Anode to cathode through the external wire', 'Separator to electrolyte'], a: 1 }, { q: 'A 50 Ah cell discharged at 2C carries', o: ['25 A', '50 A', '100 A', '200 A'], a: 2 }, { q: 'The separator must be', o: ['Electronically conducting', 'Ionically conducting, electronically insulating', 'A current collector', 'Impermeable to ions'], a: 1 }],
  },
  // =====================================================================================================
  {
    id: '1.6', kind: 'sim', view3d: (host, p, api) => carView(host, { scroll: true, state: (pp, R, S) => ({ speed: S ? S.v / 3.6 : 0, flow: S ? S.Pb / 60 : 0, braking: S && S.Pb < 0 }) }), stageH: 380,
    aim: 'To study standard drive cycles, compute their statistics and the resulting energy consumption of a reference BEV.',
    objectives: ['Play standard drive cycles (FTP-75, WLTC, NEDC, UDDS, HWFET, US06, MIDC).', 'Compute distance, duration, average/maximum speed, acceleration distribution.', 'Estimate energy consumption of the reference BEV over each cycle.'],
    theory: `<p>A <b>drive cycle</b> is a standardised speed–time profile used for type-approval, energy-consumption and range testing and for component sizing. Urban cycles (UDDS, MIDC) contain frequent stops and low average speed; highway cycles (HWFET) have high steady speeds; aggressive cycles (US06) have high accelerations. WLTC Class 3b (WLTP) replaced NEDC in Europe; India uses the Modified Indian Driving Cycle (MIDC).</p>
<p>From the speed trace $v(t)$ we compute acceleration $a = \\Delta v/\\Delta t$, distance $s = \\sum v\\,\\Delta t$, the instantaneous tractive force and power, and integrate battery energy. Data sources are noted for each cycle (EPA schedules; UN GTR 15; UNECE R83/R101).</p>`,
    eqs: [['a_k = \\frac{v_{k+1}-v_k}{\\Delta t},\\quad s = \\sum_k v_k\\Delta t', ''], ['P_{w,k} = (F_{rr}+F_d+\\delta m a_k)v_k', ''], ['E_b = \\sum_k P_{b,k}\\Delta t,\\quad e_c = E_b / s', '']],
    params: [{ id: 'cyc', l: 'Drive cycle', type: 'select', str: true, v: 'FTP75', opts: CYCLE_OPTS }, { id: 'm', l: 'Vehicle mass', u: 'kg', min: 800, max: 3000, step: 10, v: 1600 }, { id: 'kr', l: 'Regenerative fraction', min: 0, max: 1, step: .05, v: .65 }, { id: 'aux', l: 'Auxiliary load', u: 'W', min: 0, max: 3000, step: 50, v: 500 }],
    sim: {
      dt: 0.1, timeScale: 10, sampleEvery: 1, live: ['kr', 'aux'],
      init(p) { const c = getCycles()[p.cyc].v; return { c, k: 0, t: 0, v: 0, x: 0, E: 0, Pb: 0, a: 0 }; },
      step(s, p, dt) {
        const n = s.c.length; s.t += dt; const tt = Math.min(s.t, n - 1), k = Math.floor(tt), f = tt - k;
        const v1 = s.c[k], v2 = s.c[Math.min(n - 1, k + 1)]; s.v = v1 + (v2 - v1) * f; s.a = (v2 - v1) / 3.6;
        const P = Object.assign({}, REF1, { m: p.m }); const rl = roadLoad(s.v / 3.6, s.a, 0, P); const Pw = rl.Ft * s.v / 3.6;
        const eta = 0.95 * 0.93 * 0.97; const fade = s.v >= 15 ? 1 : s.v <= 5 ? 0 : (s.v - 5) / 10;
        s.Pb = (Pw >= 0 ? Pw / eta : Pw * eta * p.kr * fade) / 1000 + p.aux / 1000; s.E += s.Pb * dt / 3600; s.x += s.v / 3.6 * dt;
      },
      done: s => s.t >= s.c.length - 1,
      sample: s => ({ kpis: [kv('Time', s.t, 's'), kv('Speed', s.v, 'km/h', 'acc'), kv('Acceleration', s.a, 'm/s²'), kv('Distance', s.x / 1000, 'km'), kv('Battery power', s.Pb, 'kW', s.Pb < 0 ? 'good' : ''), kv('Battery energy used', s.E, 'kWh'), kv('Consumption so far', s.x > 100 ? s.E * 1000 / (s.x / 1000) : 0, 'Wh/km')], push: { pb: [s.t, s.Pb] } }),
      charts: [{ id: 'pb', title: 'Battery power during the cycle (reference BEV)', xl: 'Time (s)', yl: 'P (kW)', s: ['P battery'] }],
    },
    compute(p) {
      const c = getCycles()[p.cyc]; const st = cycleStats(c.v);
      const P = Object.assign({}, REF1, { m: p.m, eta_m: .93, eta_inv: .97 });
      const b = backward(c.v, P, { kr: p.kr, Paux: p.aux });
      const t = c.v.map((_, i) => i);
      const all = CYCLE_OPTS.map(([k]) => { const cc = getCycles()[k], s2 = cycleStats(cc.v), bb = backward(cc.v, P, { kr: p.kr, Paux: p.aux }); return [cc.name, s2.T, s2.dist, s2.vavg, s2.vmax, s2.amax, s2.idlePct, bb.Whkm]; });
      return {
        kpis: [kv('Duration', st.T, 's'), kv('Distance', st.dist, 'km', 'acc'), kv('Average speed', st.vavg, 'km/h'), kv('Avg moving speed', st.vmov, 'km/h'), kv('Max speed', st.vmax, 'km/h'), kv('Max acceleration', st.amax, 'm/s²'), kv('Max deceleration', st.amin, 'm/s²'), kv('Idle time', st.idlePct, '%'), kv('Stops', st.stops, ''), kv('Energy (battery)', b.Enet, 'kWh'), kv('Consumption', b.Whkm, 'Wh/km', 'good'), kv('Recovered (regen)', b.Eneg, 'kWh')],
        charts: [lc('spd', `${c.name} — speed vs time`, 'Time (s)', 'Speed (km/h)', [S('Speed', t, c.v, { width: 1.6 })], { wide: true }), lc('hist', 'Acceleration distribution', 'Acceleration (m/s²)', 'Time (s)', [S('Count', st.bins, st.hist, { type: 'bar' })]), lc('cum', 'Cumulative battery energy', 'Time (s)', 'kWh', [S('Energy', b.t, b.E)])],
        obs: { cols: ['Cycle', 'Duration (s)', 'Distance (km)', 'v avg (km/h)', 'v max (km/h)', 'a max (m/s²)', 'Idle (%)', 'Consumption (Wh/km)'], rows: all },
        html: `<div class="note"><b>Data source:</b> ${c.source}.</div>`,
      };
    },
    draw(g, W, H, A) {
      const S0 = A.S; if (!S0) return; const T = A.T; const v = S0.v;
      const gy = H * 0.66; g.fillStyle = hex(T.green, .06); g.fillRect(0, gy, W, H - gy);
      const off = (S0.x * 12) % 80; for (let x = -off; x < W + 80; x += 80) { line(g, [[x, gy + 22], [x + 40, gy + 22]], T.muted, 3); }
      const toff = (S0.x * 5) % 160; for (let x = -toff; x < W + 160; x += 160) { g.fillStyle = hex(T.green, .5); g.beginPath(); g.arc(x, gy - 70, 24, 0, 7); g.fill(); g.fillStyle = '#7c4a1e'; g.fillRect(x - 4, gy - 48, 8, 48); }
      line(g, [[0, gy], [W, gy]], T.muted, 2);
      car2d(g, W * 0.4, gy, 220, S0.x / 0.32, S0.Pb < 0 ? '#16a34a' : '#2563eb');
      text(g, `${v.toFixed(1)} km/h`, W * 0.4, gy - 110, { size: 26, weight: 800, color: T.cyan });
      text(g, S0.Pb < 0 ? `Regenerating ${fmt(-S0.Pb)} kW` : `Battery ${fmt(S0.Pb)} kW`, W * 0.4, gy - 82, { color: S0.Pb < 0 ? T.green : T.orange, weight: 700 });
      const c = S0.c; const n = c.length; const mx = Math.max(...c);
      const sw = W - 40; g.strokeStyle = T.cyan; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < n; i += 2) { const x = 20 + i / n * sw, y = 70 - c[i] / mx * 50; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      const px = 20 + S0.t / n * sw; line(g, [[px, 16], [px, 74]], T.yellow, 2); text(g, getCycles()[A.p.cyc].name, 20, 10, { align: 'left', size: 11, color: T.muted });
    },
    viva: [['Why are standard drive cycles needed?', 'To compare vehicles under identical, repeatable conditions for certification, consumption and range, and to size components.'], ['Why does an EV show better efficiency on urban cycles than an ICE car?', 'Frequent braking allows regeneration and the motor efficiency stays high at part load; there is no idling loss.'], 'What is the difference between NEDC and WLTC?', 'How is the acceleration distribution used in motor sizing?'],
    mcq: [{ q: 'Which cycle is the aggressive supplemental FTP?', o: ['HWFET', 'UDDS', 'US06', 'NEDC'], a: 2 }, { q: 'The EPA UDDS cycle covers about', o: ['4 km', '12 km', '16.5 km', '23 km'], a: 1 }, { q: 'India uses which cycle for passenger car type approval?', o: ['WLTC', 'MIDC', 'JC08', 'FTP-75'], a: 1 }],
  },
  // =====================================================================================================
  {
    id: '1.7', kind: 'static',
    aim: 'To select the motor, gear ratio, inverter and battery of a BEV for a given drive cycle and performance targets.',
    objectives: ['Size peak and continuous motor power and torque from acceleration, top-speed and grade targets.', 'Select gear ratio, battery voltage/energy and inverter rating.', 'Verify the selected components against the targets and the drive cycle.'],
    theory: `<p>Drive-cycle-based component sizing follows the flowchart of the Unit 1 notes: identify vehicle parameters → compute road loads → peak traction power (acceleration, top speed, gradeability) → continuous power → motor torque/speed → gear ratio → inverter rating → battery voltage and energy → verify on the drive cycle with safety margins.</p>
<p>The acceleration power uses the classic estimate (Ehsani) with base-speed vehicle speed $v_b = v_f/x$ for a motor with speed ratio x:</p>$$P_{acc} = \\frac{\\delta m}{2t_a}(v_f^2+v_b^2) + \\tfrac23 m g C_{rr} v_f + \\tfrac15\\rho C_d A v_f^3.$$
<p>The gear ratio is fixed by the maximum motor speed and target top speed: $G = \\omega_{m,max} r_w / v_{max}$. The battery energy follows from range × drive-cycle consumption divided by usable DoD and battery efficiency, with a design reserve.</p>`,
    eqs: [['P_{top} = (mgC_{rr} + \\tfrac12\\rho C_dAv_{max}^2)v_{max}', ''], ['P_{grade} = (mgC_{rr}\\cos\\theta + mg\\sin\\theta + \\tfrac12\\rho C_dAv_g^2)v_g', ''], ['G = \\frac{\\omega_{m,max}\\,r_w}{v_{max}},\\quad T_{pk} = \\frac{P_{pk}}{\\omega_b}', ''], ['E_b = \\frac{R\\,e_c}{\\text{DoD}\\,\\eta_b}(1+k_{res})', ''], ['I_{b,pk} = \\frac{P_{pk}}{\\eta_m\\eta_{inv}V_b},\\quad S_{inv} = \\frac{P_{pk}}{\\eta_m\\cos\\phi}', '']],
    params: [{ h: 'Vehicle' }, { id: 'm', l: 'Vehicle mass', u: 'kg', min: 800, max: 3000, step: 10, v: 1600 }, { id: 'Cd', l: 'Cd', min: .2, max: .45, step: .01, v: .3 }, { id: 'A', l: 'Frontal area', u: 'm²', min: 1.6, max: 3, step: .05, v: 2.3 }, { id: 'Crr', l: 'Crr', min: .006, max: .02, step: .001, v: .01, d: 3 }, { id: 'r', l: 'Wheel radius', u: 'm', min: .26, max: .4, step: .005, v: .32, d: 3 },
      { h: 'Targets' }, { id: 'vmax', l: 'Target max speed', u: 'km/h', min: 80, max: 220, step: 5, v: 150 }, { id: 'ta', l: '0–100 km/h time', u: 's', min: 4, max: 16, step: .5, v: 9 }, { id: 'grade', l: 'Max gradient (at 15 km/h)', u: '%', min: 5, max: 40, step: 1, v: 25 }, { id: 'cyc', l: 'Drive cycle', type: 'select', str: true, v: 'WLTC3b', opts: CYCLE_OPTS }, { id: 'R', l: 'Desired range', u: 'km', min: 100, max: 700, step: 10, v: 350 },
      { h: 'Components' }, { id: 'Vb', l: 'Battery voltage', u: 'V', min: 200, max: 800, step: 10, v: 350 }, { id: 'x', l: 'Motor speed ratio x = nmax/nb', min: 2, max: 5, step: .1, v: 3.5 }, { id: 'nmax', l: 'Motor max speed', u: 'r/min', min: 6000, max: 20000, step: 500, v: 12000 }, { id: 'em', l: 'Motor efficiency', min: .85, max: .97, step: .005, v: .93, d: 3 }, { id: 'et', l: 'Transmission efficiency', min: .9, max: .99, step: .005, v: .95, d: 3 }, { id: 'sel', l: 'Selected motor power / required', u: '%', min: 60, max: 150, step: 5, v: 100 }],
    compute(p) {
      const rho = 1.225, m = p.m, vf = 100 / 3.6, vb = vf / p.x, vm = p.vmax / 3.6, th = Math.atan(p.grade / 100), vg = 15 / 3.6;
      const Pacc = 1.05 * m / (2 * p.ta) * (vf * vf + vb * vb) + 2 / 3 * m * g0 * p.Crr * vf + 0.2 * rho * p.Cd * p.A * vf ** 3;
      const Ptop = (m * g0 * p.Crr + 0.5 * rho * p.Cd * p.A * vm * vm) * vm;
      const Pgr = (m * g0 * (p.Crr * Math.cos(th) + Math.sin(th)) + 0.5 * rho * p.Cd * p.A * vg * vg) * vg;
      const Ppk = Math.max(Pacc, Ptop, Pgr) / p.et;
      const Pcont = Math.max(Ptop, (m * g0 * (p.Crr + 0.06) + 0.5 * rho * p.Cd * p.A * (80 / 3.6) ** 2) * 80 / 3.6) / p.et; // top speed or 6 % at 80 km/h
      const wmax = p.nmax * Math.PI / 30, G = wmax * p.r / vm, wb = wmax / p.x;
      const Tpk = Ppk / wb, Tcont = Pcont / wb;
      const Tgr_start = m * g0 * (p.Crr * Math.cos(th) + Math.sin(th)) * p.r / (G * p.et);
      const P = Object.assign({}, REF1, { m, Cd: p.Cd, A: p.A, Crr: p.Crr, r: p.r, G, eta_tr: p.et, eta_m: p.em, eta_inv: .97 });
      const bk = backward(getCycles()[p.cyc].v, P, { kr: 0.65, Paux: 500 });
      const Eb = p.R * bk.Whkm / 1000 / (0.9 * 0.95) * 1.1;
      const Ibpk = Ppk / (p.em * 0.97 * p.Vb), Ah = Eb * 1000 / p.Vb;
      const Sinv = Ppk / (p.em * 0.9) / 1000, Iph = Ppk / (p.em * 0.9 * Math.sqrt(3) * 0.612 * p.Vb);
      // verification with selected motor
      const k = p.sel / 100; const Psel = Ppk * k, Tsel = Math.max(Tpk, Tgr_start) * k;
      const PV = Object.assign({}, P, { Tpk: Tsel, Ppk: Psel, nmax: p.nmax });
      const run = accelRun(PV), vmaxA = maxSpeed(PV) * 3.6, gr = gradeability(vg, PV);
      const rangeA = Eb * 0.9 * 0.95 * 1000 / bk.Whkm;
      const ok = (c) => c ? '<span class="ok-t">✓ meets</span>' : '<span class="bad-t">✗ fails</span>';
      return {
        kpis: [kv('Peak motor power', Ppk / 1000, 'kW', 'acc'), kv('Continuous motor power', Pcont / 1000, 'kW'), kv('Peak motor torque', Math.max(Tpk, Tgr_start), 'N·m', 'acc'), kv('Continuous torque', Tcont, 'N·m'), kv('Base speed', wb * 30 / Math.PI, 'r/min'), kv('Gear ratio G', G, '', 'acc'), kv('Wheel torque (peak)', Math.max(Tpk, Tgr_start) * G * p.et, 'N·m'), kv('Inverter rating', Sinv, 'kVA'), kv('Phase current (rms)', Iph, 'A'), kv('Battery energy', Eb, 'kWh', 'good'), kv('Battery capacity', Ah, 'Ah'), kv('Peak battery current', Ibpk, 'A'), kv(`${p.cyc} consumption`, bk.Whkm, 'Wh/km')],
        steps: [[`Acceleration power (0–100 km/h in ${p.ta} s, v<sub>b</sub> = ${fmt(vb * 3.6)} km/h)`, `P_{acc} = ${fmt(Pacc / 1000)}\\,\\text{kW}`], [`Top-speed power at ${p.vmax} km/h`, `P_{top} = ${fmt(Ptop / 1000)}\\,\\text{kW}`], [`Grade power on ${p.grade} % at 15 km/h`, `P_{grade} = ${fmt(Pgr / 1000)}\\,\\text{kW}`], [`Peak motor power = max(...) / η<sub>tr</sub>`, `P_{pk} = ${fmt(Ppk / 1000)}\\,\\text{kW}`], [`Gear ratio from n<sub>max</sub> = ${p.nmax} r/min`, `G = \\frac{${fmt(wmax)}\\times${p.r}}{${fmt(vm)}} = ${fmt(G)}`], [`Peak torque at base speed ${fmt(wb * 30 / Math.PI)} r/min (also ≥ grade start-up torque ${fmt(Tgr_start)} N·m)`, `T_{pk} = ${fmt(Math.max(Tpk, Tgr_start))}\\,\\text{N·m}`], [`Drive-cycle consumption (${p.cyc}, backward model, kr = 0.65) = ${fmt(bk.Whkm)} Wh/km`], [`Battery energy for ${p.R} km with 90 % DoD, η<sub>b</sub> = 0.95, 10 % reserve`, `E_b = ${fmt(Eb)}\\,\\text{kWh} \\Rightarrow ${fmt(Ah)}\\,\\text{Ah at } ${p.Vb}\\,\\text{V}`]],
        obs: { cols: ['Requirement', 'Target', 'With selected motor', 'Status'], rows: [['0–100 km/h (s)', p.ta, +run.t100.toFixed(2), ok(run.t100 <= p.ta * 1.03)], ['Max speed (km/h)', p.vmax, +vmaxA.toFixed(1), ok(vmaxA >= p.vmax * 0.98)], [`Gradeability at 15 km/h (%)`, p.grade, +gr.toFixed(1), ok(gr >= p.grade * 0.98)], ['Range (km)', p.R, +rangeA.toFixed(0), ok(rangeA >= p.R * 0.99)]] },
        charts: [lc('ver', 'Verification: acceleration with the selected motor', 'Time (s)', 'Speed (km/h)', [S('Selected motor', run.T, run.V)], { marks: [{ y: 100 }, { x: p.ta }] }), lc('cyc', `Motor operating points over ${p.cyc}`, 'Motor speed (r/min)', 'Motor torque (N·m)', [S('Operating points', bk.wm, bk.Tm, { type: 'scatter', r: 2 }), S('Peak envelope', range(1, p.nmax, 80), range(1, p.nmax, 80).map(n => Math.min(Math.max(Tpk, Tgr_start) * k, Psel / (n * Math.PI / 30)))), S('Continuous', range(1, p.nmax, 80), range(1, p.nmax, 80).map(n => Math.min(Tcont, Pcont / (n * Math.PI / 30))), { dash: [5, 4] })])],
        html: `<div class="card flat" style="margin-bottom:12px"><h3>Recommended component selection</h3><table class="t"><tr><th>Component</th><th>Specification</th></tr><tr><td>Traction motor</td><td>PMSM, ${fmt(Ppk / 1000 * 1.05)} kW peak / ${fmt(Pcont / 1000 * 1.1)} kW continuous, ${fmt(Math.max(Tpk, Tgr_start) * 1.05)} N·m peak, ${p.nmax} r/min max</td></tr><tr><td>Transmission</td><td>Single-speed, G = ${fmt(G)}, η ≈ ${p.et}</td></tr><tr><td>Inverter</td><td>${p.Vb} V DC link, ≥ ${fmt(Sinv * 1.2)} kVA, ${fmt(Iph * 1.5)} A<sub>rms</sub> device rating (1.5 margin), devices ≥ ${fmt(p.Vb * 1.7 / 50) * 50} V class</td></tr><tr><td>Battery</td><td>${fmt(Eb)} kWh, ${p.Vb} V, ${fmt(Ah)} Ah, ≥ ${fmt(Ibpk * 1.1)} A peak discharge</td></tr></table></div>`,
      };
    },
    viva: [['Why is peak power usually set by acceleration rather than top speed?', 'Short-time acceleration needs high kinetic-energy rate; top speed needs only enough to overcome drag, which is lower for typical targets.'], ['How is the gear ratio selected?', 'From the motor maximum speed and target top speed: G = ω_max r / v_max, then checked for starting torque on the steepest grade.'], 'What is the difference between peak and continuous rating?', 'Why must the battery voltage be chosen together with the inverter devices?'],
    mcq: [{ q: 'If motor max speed is fixed, raising target top speed requires', o: ['Higher G', 'Lower G', 'Same G', 'Larger wheels only'], a: 1 }, { q: 'Battery energy is primarily sized by', o: ['Acceleration', 'Range × consumption', 'Top speed', 'Gear ratio'], a: 1 }, { q: 'Inverter apparent power rating is approximately', o: ['P/(ηm cosφ)', 'P × ηm', 'V × I_dc', 'P/G'], a: 0 }],
  },
  // =====================================================================================================
  inverterExp('1.8'),
  vsiStatesExp(),
  pwmLabExp(),
  svpwmExp(),
  hystExp(),
  compareExp(),
];

// ---------------------------------------------------------------------------------------------------
const api_sel = { v: null };
function compText(id) {
  const D = { batt: ['Battery', 'Chemical → electrical energy (DC). Internal loss = I²R₀ (+ polarisation).'], dc: ['DC link', 'Capacitor bank and busbars smoothing the inverter input; distributes power to the auxiliary DC-DC converter.'], inv: ['Inverter', 'DC → 3-phase AC by PWM switching of six IGBT/SiC devices; losses are conduction + switching losses. Rectifies during regeneration.'], mot: ['Motor', 'Electrical → mechanical energy via electromagnetic torque; copper, iron and mechanical losses. Generator in regeneration.'], gb: ['Gearbox', 'Speed reduction / torque multiplication (fixed ratio); gear-mesh and bearing losses.'], diff: ['Differential', 'Divides torque to left and right wheels and allows different wheel speeds in cornering.'], whl: ['Wheels', 'Torque → tractive force at the tyre–road contact; overcome rolling, aerodynamic, grade and inertia forces.'], obc: ['On-board charger', 'AC grid → DC with power-factor correction and CC-CV control.'] }[id];
  return D ? `<div class="note ok"><b>${D[0]}:</b> ${D[1]}</div>` : '';
}
// cell animation for 1.5 (separate function for clarity)
export function drawCell(g, W, H, A) {
  const S0 = A.S; if (!S0) return; const T = A.T; const dis = A.p.dir === 'dis';
  const x0 = W * 0.08, x1 = W * 0.62, y0 = 92, y1 = H - 46, mid = (x0 + x1) / 2;
  // collectors, electrodes, separator
  g.fillStyle = '#b87333'; g.fillRect(x0, y0, 12, y1 - y0); g.fillStyle = '#cbd5e1'; g.fillRect(x1 - 12, y0, 12, y1 - y0);
  g.fillStyle = hex('#334155', .9); g.fillRect(x0 + 12, y0, (mid - x0) - 30, y1 - y0); g.fillStyle = hex(T.violet, .35); g.fillRect(mid + 18, y0, (x1 - mid) - 30, y1 - y0);
  g.fillStyle = hex(T.cyan, .08); g.fillRect(mid - 18, y0, 36, y1 - y0);
  g.setLineDash([4, 4]); line(g, [[mid, y0], [mid, y1]], T.muted, 2); g.setLineDash([]);
  for (let yy = y0 + 10; yy < y1; yy += 22) for (let xx = x0 + 22; xx < mid - 20; xx += 22) { g.fillStyle = '#475569'; g.fillRect(xx, yy, 14, 3); }
  for (let yy = y0 + 10; yy < y1; yy += 18) for (let xx = mid + 26; xx < x1 - 14; xx += 18) { g.fillStyle = hex(T.violet, .6); g.beginPath(); g.arc(xx, yy, 4, 0, 7); g.fill(); }
  text(g, 'Negative electrode (graphite)', (x0 + mid) / 2, y0 - 14, { size: 11.5, weight: 700 }); text(g, 'Cu collector', x0 + 6, y1 + 14, { size: 10.5, color: T.muted });
  text(g, 'Positive electrode (' + A.p.chem + ')', (mid + x1) / 2, y0 - 14, { size: 11.5, weight: 700 }); text(g, 'Al collector', x1 - 6, y1 + 14, { size: 10.5, color: T.muted });
  text(g, 'Separator', mid, y1 + 14, { size: 10.5, color: T.muted }); text(g, 'Electrolyte (LiPF₆)', mid, y0 - 30, { size: 10.5, color: T.cyan });
  // Li+ ions: drift through electrolyte, density follows SOC
  const z = S0.c.z, n = 26, sp = A.running ? Math.abs(S0.i) / A.p.Q : 0;
  for (let k = 0; k < n; k++) {
    const ph = ((k * 0.618 + A.t * 0.25 * sp) % 1);
    const xx = dis ? x0 + 30 + ph * (x1 - x0 - 60) : x1 - 30 - ph * (x1 - x0 - 60);
    const yy = y0 + 18 + ((k * 37) % (y1 - y0 - 36));
    g.fillStyle = T.green; g.beginPath(); g.arc(xx, yy, 5, 0, 7); g.fill(); text(g, '+', xx, yy, { size: 9, color: '#052e16', weight: 800 });
  }
  // stored lithium indicator
  g.fillStyle = hex(T.green, .25); const fillA = (y1 - y0) * z; g.fillRect(x0 + 12, y1 - fillA, 8, fillA); g.fillRect(x1 - 20, y0 + fillA * 0, 8, (y1 - y0) * (1 - z));
  // external circuit with electrons
  const ext = [[x0 + 6, y0], [x0 + 6, 26], [x1 - 6, 26], [x1 - 6, y0]];
  flow(g, dis ? ext : ext.slice().reverse(), A.t, Math.min(1, sp * 0.5 + 0.05) * (A.running ? 1 : 0.0001), T.yellow, { w: 2, spacing: 22 });
  box(g, mid - 50, 8, 100, 30, dis ? 'Load' : 'Charger', { color: dis ? T.orange : T.yellow, active: true });
  text(g, `e⁻ ${dis ? '→' : '←'}`, mid + 80, 26, { color: T.yellow, weight: 700 });
  // readouts
  const rx = W * 0.68;
  [['Terminal voltage', S0.v.toFixed(3) + ' V', T.cyan], ['Current', (S0.i).toFixed(1) + ' A', T.orange], ['SOC', (z * 100).toFixed(1) + ' %', T.green], ['Temperature', S0.c.T.toFixed(1) + ' °C', T.red], ['Process', dis ? 'DISCHARGING' : 'CHARGING', dis ? T.orange : T.green]].forEach(([l, v, c], i) => { text(g, l, rx, 70 + i * 52, { align: 'left', color: T.muted, size: 12 }); text(g, v, rx, 92 + i * 52, { align: 'left', color: c, size: 20, weight: 800 }); });
  // SOC gauge
  g.strokeStyle = T.line; g.strokeRect(W - 60, 60, 30, H - 120); g.fillStyle = T.green; g.fillRect(W - 58, 60 + (H - 120) * (1 - z), 26, (H - 120) * z - 2);
}

// ================= inverter family (1.8 – 1.13) =================
function invParams(o = {}) {
  return [{ id: 'Vdc', l: 'DC-link voltage Vdc', u: 'V', min: 100, max: 800, step: 10, v: o.Vdc ?? 400 }, { id: 'fc', l: 'Switching (carrier) frequency', u: 'Hz', min: 500, max: 10000, step: 100, v: o.fc ?? 2500 }, { id: 'm', l: 'Modulation index ma', min: 0.05, max: o.mmax ?? 1.3, step: 0.01, v: o.m ?? 0.8 }, { id: 'f1', l: 'Fundamental frequency', u: 'Hz', min: 5, max: 200, step: 1, v: o.f1 ?? 50 },
    { h: 'Load' }, { id: 'load', l: 'Load type', type: 'select', str: true, v: o.load ?? 'RL', opts: [['R', 'Resistive (R)'], ['RL', 'Inductive (R-L)'], ['motor', 'Motor (R-L + back-EMF)']] }, { id: 'R', l: 'Load resistance R', u: 'Ω', min: 0.5, max: 50, step: 0.5, v: o.R ?? 5 }, { id: 'L', l: 'Load inductance L', u: 'mH', min: 0.5, max: 50, step: 0.5, v: o.L ?? 10 }, { id: 'E', l: 'Back-EMF (motor load), peak', u: 'V', min: 0, max: 300, step: 5, v: o.E ?? 120 }];
}
function runVsi(p, method) {
  const L = p.load === 'R' ? 1e-6 : p.L / 1000;
  return vsi({ Vdc: p.Vdc, m: p.m, f1: p.f1, fc: p.fc, method, R: p.R, L, Em: p.load === 'motor' ? p.E : 0, phiE: 0.25 });
}
function drawVSI(g, W, H, A, S, iNow) {
  const T = A.T; const xL = 60, xR = W * 0.62, yT = 50, yB = H - 50, legs = [0.32, 0.5, 0.68].map(f => xL + (xR - xL) * f / 0.8 * 0.8 + 40);
  line(g, [[xL + 40, yT], [legs[2] + 30, yT]], T.red, 3); line(g, [[xL + 40, yB], [legs[2] + 30, yB]], T.blue, 3);
  battery(g, xL, (yT + yB) / 2, 90, T.text, ''); text(g, `Vdc = ${A.p.Vdc} V`, xL, yB + 22, { size: 12, weight: 700 });
  line(g, [[xL, yT], [xL + 40, yT]], T.red, 3); line(g, [[xL, yB], [xL + 40, yB]], T.blue, 3); line(g, [[xL, yT], [xL, (yT + yB) / 2 - 45]], T.red, 2); line(g, [[xL, yB], [xL, (yT + yB) / 2 + 45]], T.blue, 2);
  capacitor(g, xL + 40 + 30, yT, yB, T.text, 'C_dc');
  const names = ['a', 'b', 'c'], cols = [T.red, T.yellow, T.blue];
  legs.forEach((x, k) => {
    const on = S[k];
    line(g, [[x, yT], [x, yB]], T.line, 2);
    sw(g, x, yT + (yB - yT) * 0.27, on === 1, `S${k + 1}`); sw(g, x, yT + (yB - yT) * 0.73, on === 0, `S${k + 4}`);
    const ym = (yT + yB) / 2; g.fillStyle = cols[k]; g.beginPath(); g.arc(x, ym, 5, 0, 7); g.fill();
    flow(g, [[x, ym], [xR + 40, ym - 40 + k * 40]], A.t, iNow ? iNow[k] : 0, cols[k], { w: 2, arrowAt: .7 });
    text(g, `v${names[k]}`, x - 18, ym - 10, { size: 11, color: cols[k], weight: 700 });
  });
  motor(g, xR + 90, (yT + yB) / 2, 46, A.t * 2, 'Motor / load', T.cyan);
}

function inverterExp(id) {
  return {
    id, kind: 'static', stageH: 380,
    aim: 'To study the operation of a two-level three-phase voltage source inverter with sinusoidal PWM and analyse its output voltages, currents and harmonics.',
    objectives: ['Identify DC supply, DC-link capacitor, six switches and three-phase output.', 'Observe gate signals, pole, phase and line voltages and phase currents.', 'Measure fundamental voltage, harmonic spectrum and THD versus modulation index, switching frequency and load.'],
    theory: `<p>The three-phase two-level VSI has three legs, each with an upper and a lower switch (IGBT or SiC MOSFET with antiparallel diode). The two switches of a leg are operated complementarily (with dead time in practice). Each leg connects its output either to the positive or negative DC rail, giving pole voltages $v_{xO} = \\pm V_{dc}/2$ referred to the DC mid-point O.</p>
<p>For a star-connected balanced load the phase voltage is $v_{aN} = v_{aO} - v_{NO}$ with $v_{NO}=(v_{aO}+v_{bO}+v_{cO})/3$, giving the familiar six-level staircase per carrier period; line voltages are $v_{ab}=v_{aO}-v_{bO}$. With sinusoidal PWM the fundamental phase voltage amplitude is $m_a V_{dc}/2$ in the linear range ($m_a\\le1$). Harmonics appear as side-bands around multiples of the carrier frequency $m_f f_1$; the load inductance filters the current.</p>
<p>The simulation integrates the RL(+EMF) load exactly at each sample and analyses one steady-state fundamental period by Fourier series.</p>`,
    eqs: [['v_{xO} = (S_x - \\tfrac12)V_{dc},\\quad v_{aN} = \\tfrac{V_{dc}}{3}(2S_a - S_b - S_c)', ''], ['\\hat V_{aN,1} = m_a \\frac{V_{dc}}{2},\\quad V_{LL,1,rms} = \\frac{\\sqrt3}{2\\sqrt2}m_aV_{dc} \\approx 0.612\\,m_aV_{dc}', 'Linear SPWM, m_a ≤ 1'], ['THD = \\frac{\\sqrt{\\sum_{n\\ge2}V_n^2}}{V_1}', ''], ['L\\frac{di_a}{dt} = v_{aN} - Ri_a - e_a', 'Load model']],
    params: invParams(), tools: [{ l: 'Overmodulation (ma = 1.2)', f: api => api.set('m', 1.2) }, { l: 'Linear (ma = 0.8)', f: api => api.set('m', 0.8) }],
    compute(p) {
      const r = runVsi(p, 'spwm'); const n = Math.min(r.t.length, 2400), st = Math.max(1, Math.floor(r.t.length / n));
      const ds = a => a.filter((_, i) => i % st === 0); const t = ds(r.t);
      const nh = Array.from({ length: 120 }, (_, i) => i + 1);
      const v1th = p.m <= 1 ? p.m * p.Vdc / 2 : NaN;
      return {
        kpis: [kv('Output frequency', p.f1, 'Hz', 'acc'), kv('Frequency ratio mf', p.fc / p.f1, ''), kv('V₁ phase (peak)', r.V1ph, 'V'), kv('Theory ma·Vdc/2', v1th, 'V'), kv('V₁ line (rms)', r.V1ll / Math.SQRT2, 'V'), kv('THD line voltage', r.thdV * 100, '%', 'warn'), kv('THD phase current', r.thdI * 100, '%'), kv('I₁ (peak)', r.I1, 'A'), kv('Switching freq / leg', r.fsw, 'Hz'), kv('Avg DC current', r.Idc, 'A')],
        charts: [
          lc('mod', 'Reference signals and triangular carrier', 'Time (ms)', 'p.u.', [S('v*a', t, ds(r.ra)), S('v*b', t, ds(r.rb)), S('v*c', t, ds(r.rc)), S('Carrier', t, ds(r.car), { color: '#94a3b8', width: 1 })]),
          lc('gate', 'Gate signals S1, S3, S5 (offset)', 'Time (ms)', 'State', [S('S1 (a)', t, ds(r.Sa).map(v => v + 3), { type: 'step', color: '#ef4444' }), S('S3 (b)', t, ds(r.Sb).map(v => v + 1.5), { type: 'step', color: '#facc15' }), S('S5 (c)', t, ds(r.Sc), { type: 'step', color: '#3b82f6' })], { yr: [-0.3, 4.3] }),
          lc('vph', 'Phase voltage v_aN', 'Time (ms)', 'V', [S('v_aN', t, ds(r.vaN), { type: 'step', width: 1 })]),
          lc('vll', 'Line voltage v_ab', 'Time (ms)', 'V', [S('v_ab', t, ds(r.vab), { type: 'step', width: 1, color: '#f59e0b' })]),
          lc('iph', 'Phase currents', 'Time (ms)', 'A', [S('i_a', t, ds(r.ia), { color: '#ef4444' }), S('i_b', t, ds(r.ib), { color: '#facc15' }), S('i_c', t, ds(r.ic), { color: '#3b82f6' })]),
          lc('spec', 'Harmonic spectrum of v_ab (peak)', 'Harmonic order n', 'V', [S('|V_n|', nh, r.Hv.slice(1), { type: 'bar' })]),
        ],
        steps: [[`Frequency modulation ratio $m_f = f_c/f_1$ = ${fmt(p.fc / p.f1)}`], [`Fundamental phase voltage (theory, linear) $\\hat V_1 = m_a V_{dc}/2$`, `\\hat V_1 = ${p.m}\\times${p.Vdc}/2 = ${fmt(p.m * p.Vdc / 2)}\\,\\text{V}`], [`From the simulated waveform (Fourier) $\\hat V_1$ = ${fmt(r.V1ph)} V; line rms = ${fmt(r.V1ll / Math.SQRT2)} V`], [`Line-voltage THD = ${fmt(r.thdV * 100)} %; current THD = ${fmt(r.thdI * 100)} %`]],
        obs: { cols: ['Harmonic n', '|V_ab,n| (V)', '% of fundamental'], rows: r.Hv.map((v, i) => [i, v, 100 * v / r.Hv[1]]).filter((x, i) => i > 0 && (i === 1 || x[2] > 1)).slice(0, 20) },
        _r: r,
      };
    },
    draw(g, W, H, A) {
      const r = A.R._r; if (!r) return;
      const ph = (A.t * 0.15) % 1, k = Math.floor(ph * r.t.length);
      const S = [r.Sa[k], r.Sb[k], r.Sc[k]]; const im = Math.max(1e-6, r.I1);
      drawVSI(g, W, H, A, S, [r.ia[k] / im, r.ib[k] / im, r.ic[k] / im]);
      const sx = W * 0.74, sw2 = W * 0.24;
      scope(g, sx, 40, sw2, 90, [{ y: r.vab.filter((_, i) => i % 4 === 0), c: A.T.orange, w: 1 }], { cursor: ph, label: 'v_ab' });
      scope(g, sx, 150, sw2, 90, [{ y: r.ia.filter((_, i) => i % 4 === 0), c: A.T.red }, { y: r.ib.filter((_, i) => i % 4 === 0), c: A.T.yellow }, { y: r.ic.filter((_, i) => i % 4 === 0), c: A.T.blue }], { cursor: ph, label: 'i_abc' });
      text(g, `Switching state (Sa Sb Sc) = (${S.join(' ')})`, sx, 270, { align: 'left', weight: 700 });
      text(g, `ma = ${A.p.m}, mf = ${fmt(A.p.fc / A.p.f1)}, f₁ = ${A.p.f1} Hz`, sx, 292, { align: 'left', color: A.T.muted });
      text(g, 'Animation is slowed: one fundamental cycle ≈ 6.7 s at 1×', sx, 314, { align: 'left', size: 10.5, color: A.T.muted });
    },
    viva: [['Why are the two switches of a leg never on together?', 'It would short-circuit the DC link (shoot-through); dead time is inserted.'], ['What limits the linear range of SPWM?', 'm_a ≤ 1; beyond that the reference exceeds the carrier peak (overmodulation) and low-order harmonics appear.'], 'Where do the dominant harmonics of SPWM appear?', 'How does load inductance affect current THD?'],
    mcq: [{ q: 'For SPWM with ma = 0.8 and Vdc = 400 V the peak fundamental phase voltage is', o: ['160 V', '200 V', '320 V', '400 V'], a: 0, e: 'ma·Vdc/2 = 160 V.' }, { q: 'Number of switching states of a two-level three-phase VSI', o: ['6', '8', '9', '27'], a: 1 }, { q: 'Dominant SPWM harmonics are clustered around', o: ['3rd harmonic', 'mf and 2mf', '5th and 7th', 'DC'], a: 1 }],
  };
}
function vsiStatesExp() {
  return {
    id: '1.9', kind: 'static', stageH: 420,
    aim: 'To study the eight switching states of a three-phase VSI, its active and zero voltage vectors and six-step (180° conduction) operation.',
    objectives: ['Tabulate the eight switching combinations and resulting phase/line voltages.', 'Identify the six active and two zero vectors in the αβ plane.', 'Compare DC-bus utilisation of six-step, SPWM and SVPWM.'],
    theory: `<p>With complementary switching each leg has two states, so the three-phase VSI has $2^3 = 8$ switching states $(S_a S_b S_c)$. Six of them (100, 110, 010, 011, 001, 101) apply a non-zero voltage to the load – the <b>active vectors</b> $V_1…V_6$ of magnitude $\\tfrac23 V_{dc}$, spaced 60° apart; two (000, 111) short the load terminals to one rail – the <b>zero vectors</b> $V_0, V_7$.</p>
<p>In <b>six-step (180° conduction)</b> operation the inverter steps through the six active vectors once per cycle; each switch conducts for 180°. This gives the highest fundamental voltage, $\\hat V_{aN,1} = \\tfrac{2}{\\pi}V_{dc}$, but with 5th, 7th, 11th… harmonics. DC-bus utilisation is compared as the fundamental phase peak divided by $V_{dc}/2$: SPWM 1.0, SVPWM 1.155, six-step 1.273.</p>`,
    eqs: [['\\vec v_s = \\tfrac23 (v_{aN} + a v_{bN} + a^2 v_{cN}),\\; a = e^{j2\\pi/3}', 'Space vector (amplitude invariant)'], ['|\\vec V_{1..6}| = \\tfrac23 V_{dc},\\quad \\vec V_0 = \\vec V_7 = 0', ''], ['\\hat V_{aN,1}^{six-step} = \\frac{2V_{dc}}{\\pi}', '']],
    params: [{ id: 'Vdc', l: 'DC-link voltage', u: 'V', min: 100, max: 800, step: 10, v: 400 }, { id: 'st', l: 'Switching state (manual)', type: 'seg', v: 1, opts: VEC.map((v, i) => [i, `${v.join('')}`]) }, { id: 'auto', l: 'Auto-step (six-step sequence)', type: 'check', v: true }, { id: 'f1', l: 'Six-step frequency', u: 'Hz', min: 5, max: 200, step: 5, v: 50 }],
    tools: [{ l: '◀ Previous state', f: api => { api.set('auto', false); api.set('st', (api.p.st + 7) % 8); } }, { l: 'Next state ▶', f: api => { api.set('auto', false); api.set('st', (api.p.st + 1) % 8); } }],
    compute(p) {
      const rows = VEC.map((s, i) => { const vaN = p.Vdc / 3 * (2 * s[0] - s[1] - s[2]), vbN = p.Vdc / 3 * (2 * s[1] - s[0] - s[2]), vcN = p.Vdc / 3 * (2 * s[2] - s[0] - s[1]); const al = 2 / 3 * (vaN - vbN / 2 - vcN / 2), be = 2 / 3 * Math.sqrt(3) / 2 * (vbN - vcN); return [`V${i}`, s.join(' '), vaN, vbN, vcN, p.Vdc * (s[0] - s[1]), p.Vdc * (s[1] - s[2]), p.Vdc * (s[2] - s[0]), Math.hypot(al, be), (Math.atan2(be, al) * 180 / Math.PI + 360) % 360 * (Math.hypot(al, be) > 1 ? 1 : 0)]; });
      const six = vsi({ Vdc: p.Vdc, m: 1, f1: p.f1, fc: 1000, method: 'sixstep', R: 5, L: 0.01 });
      const t = six.t.filter((_, i) => i % 6 === 0), ds = a => a.filter((_, i) => i % 6 === 0);
      return {
        kpis: [kv('Selected state', `V${p.st} (${VEC[p.st].join('')})`, '', 'acc'), kv('|V| of active vector', 2 / 3 * p.Vdc, 'V'), kv('Six-step V₁ phase peak', six.V1ph, 'V'), kv('Theory 2Vdc/π', 2 * p.Vdc / Math.PI, 'V'), kv('Six-step THD (v_ab)', six.thdV * 100, '%'), kv('Bus utilisation six-step', six.V1ph / (p.Vdc / 2), '')],
        obs: { cols: ['Vector', 'Sa Sb Sc', 'v_aN (V)', 'v_bN (V)', 'v_cN (V)', 'v_ab (V)', 'v_bc (V)', 'v_ca (V)', '|v_s| (V)', 'Angle (°)'], rows },
        charts: [lc('six', 'Six-step (180°) phase and line voltages', 'Time (ms)', 'V', [S('v_aN', t, ds(six.vaN), { type: 'step' }), S('v_ab', t, ds(six.vab), { type: 'step', color: '#f59e0b' })]), lc('util', 'DC-bus utilisation: fundamental phase peak / (Vdc/2)', 'Technique (1 SPWM, 2 SVPWM, 3 six-step)', 'Ratio', [S('Utilisation', [1, 2, 3], [1, 2 / Math.sqrt(3), 4 / Math.PI], { type: 'bar' })], { xr: [0.4, 3.6] }), lc('sixh', 'Six-step harmonic spectrum (v_aN)', 'n', 'V', [S('|V_n|', Array.from({ length: 40 }, (_, i) => i + 1), six.Hp.slice(1, 41), { type: 'bar' })])],
        html: '<div class="note">Truth table: see the Observations tab. Use “Next state” to step manually, or enable auto-step to run the six-step sequence V1→V2→…→V6.</div>',
      };
    },
    draw(g, W, H, A) {
      const T = A.T; let st = A.p.st;
      if (A.p.auto) { const seq = [1, 2, 3, 4, 5, 6]; st = seq[Math.floor(A.t * 1.2) % 6]; }
      const s = VEC[st]; drawVSI(g, W * 0.62, H, A, s, null);
      const cx = W * 0.8, cy = H / 2, R = Math.min(W * 0.16, H * 0.38);
      g.strokeStyle = T.line; g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; g[k ? 'lineTo' : 'moveTo'](cx + R * Math.cos(a), cy - R * Math.sin(a)); } g.stroke();
      line(g, [[cx - R - 10, cy], [cx + R + 14, cy]], T.muted, 1); line(g, [[cx, cy + R + 10], [cx, cy - R - 14]], T.muted, 1); text(g, 'α', cx + R + 22, cy, { color: T.muted }); text(g, 'β', cx, cy - R - 22, { color: T.muted });
      for (let k = 1; k <= 6; k++) { const a = (k - 1) * Math.PI / 3, on = k === st; arrow(g, cx, cy, cx + R * Math.cos(a), cy - R * Math.sin(a), on ? T.green : hex(T.cyan, .4), on ? 3.5 : 1.5); text(g, `V${k} (${VEC[k].join('')})`, cx + (R + 30) * Math.cos(a), cy - (R + 18) * Math.sin(a), { size: 11, weight: on ? 800 : 500, color: on ? T.green : T.muted }); }
      g.fillStyle = st === 0 || st === 7 ? T.yellow : T.muted; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill(); text(g, 'V0, V7', cx + 26, cy + 14, { size: 11, color: st === 0 || st === 7 ? T.yellow : T.muted });
      text(g, `State V${st} = (${s.join(' ')})  ${st === 0 || st === 7 ? 'ZERO vector' : 'ACTIVE vector'}`, 14, 18, { align: 'left', weight: 800 });
    },
    viva: [['Why are 000 and 111 called zero vectors?', 'All three outputs are tied to the same rail so the line voltages are zero.'], ['What is the magnitude of an active vector?', '2Vdc/3 (amplitude-invariant transformation).'], 'Which harmonics are present in six-step operation?', 'Why is six-step not used at low speed in EV drives?'],
    mcq: [{ q: 'Active vectors of a two-level VSI are spaced by', o: ['30°', '45°', '60°', '120°'], a: 2 }, { q: 'State 110 corresponds to', o: ['V1', 'V2', 'V3', 'V0'], a: 1 }, { q: 'Six-step peak fundamental phase voltage is', o: ['Vdc/2', 'Vdc/√3', '2Vdc/π', 'Vdc'], a: 2 }],
  };
}
function pwmLabExp() {
  return {
    id: '1.10', kind: 'static',
    aim: 'To compare single-pulse, multiple-pulse, sinusoidal and space-vector PWM and their output voltage spectra.',
    objectives: ['Generate switching pulses for each technique.', 'Observe the effect of modulation index and carrier frequency on output voltage and harmonics.', 'Relate pulse pattern to harmonic content.'],
    theory: `<p><b>Pulse-width modulation</b> controls the average output voltage by varying the width of constant-amplitude pulses. In <b>single-pulse PWM</b> one pulse per half cycle, centred at 90°, of width 2d is used: the fundamental is controlled but low-order harmonics are large. <b>Multiple-pulse (uniform) PWM</b> uses N equal pulses per half cycle, pushing harmonics to higher orders. In <b>sinusoidal PWM</b> the pulse widths follow a sinusoidal reference compared with a triangular carrier, giving a nearly sinusoidal average voltage with harmonics around the carrier frequency. <b>SVPWM</b> synthesises the reference space vector from the two adjacent active vectors and zero vectors; it is equivalent to SPWM with a min-max zero-sequence injection and gives 15.5 % more linear voltage. <b>Hysteresis</b> control is treated in Experiment 1.12.</p>
<p>Key definitions: amplitude modulation ratio $m_a = \\hat V_{ref}/\\hat V_{car}$, frequency ratio $m_f = f_c/f_1$.</p>`,
    eqs: [['V_{o,rms}^{single} = V_{dc}\\sqrt{\\frac{2d}{\\pi}}', 'Single pulse of width 2d'], ['V_n = \\frac{4V_{dc}}{n\\pi}\\sin(nd)\\ \\text{(single pulse, odd n)}', ''], ['m_a = \\frac{\\hat V_r}{\\hat V_c},\\quad m_f = \\frac{f_c}{f_1}', '']],
    params: [{ id: 'tech', l: 'Technique', type: 'select', str: true, v: 'spwm', opts: [['single', 'Single-pulse PWM (1-φ bridge)'], ['multi', 'Multiple-pulse PWM (1-φ bridge)'], ['spwm', 'Sinusoidal PWM (3-φ)'], ['svpwm', 'Space-vector PWM (3-φ)']] }, { id: 'm', l: 'Modulation index (pulse width ratio)', min: 0.05, max: 1.15, step: 0.01, v: 0.8 }, { id: 'N', l: 'Pulses per half cycle (multiple PWM)', min: 2, max: 15, step: 1, v: 5 }, { id: 'fc', l: 'Carrier frequency (SPWM/SVPWM)', u: 'Hz', min: 450, max: 6000, step: 50, v: 1050 }, { id: 'Vdc', l: 'DC voltage', u: 'V', min: 100, max: 800, step: 10, v: 400 }, { id: 'f1', l: 'Fundamental', u: 'Hz', min: 10, max: 100, step: 1, v: 50 }],
    compute(p) {
      if (p.tech === 'single' || p.tech === 'multi') {
        const r = singlePhasePWM({ Vdc: p.Vdc, m: Math.min(1, p.m), N: p.tech === 'single' ? 1 : p.N, f1: p.f1 });
        const n = Array.from({ length: 60 }, (_, i) => i + 1);
        return { kpis: [kv('Fundamental V₁ (peak)', r.H[1], 'V', 'acc'), kv('Output rms', r.Vrms, 'V'), kv('THD', r.thd * 100, '%', 'warn'), kv('3rd harmonic', 100 * r.H[3] / r.H[1], '% of V₁'), kv('5th harmonic', 100 * r.H[5] / r.H[1], '% of V₁')],
          charts: [lc('ref', 'Reference (level) and carrier', 'Time (ms)', 'p.u.', [S('Reference', r.t, r.ref), S('Carrier', r.t, r.car, { color: '#94a3b8', width: 1 })]), lc('vo', 'Output voltage', 'Time (ms)', 'V', [S('v_o', r.t, r.v, { type: 'step' })]), lc('sp', 'Harmonic spectrum', 'n', 'V', [S('|V_n|', n, r.H.slice(1), { type: 'bar' })])],
          obs: { cols: ['Harmonic', 'V_n (V)', '% of V₁'], rows: [1, 3, 5, 7, 9, 11, 13, 15].map(k => [k, r.H[k], 100 * r.H[k] / r.H[1]]) }, _w: { y: r.v, ref: r.ref, car: r.car } };
      }
      const r = vsi({ Vdc: p.Vdc, m: p.m, f1: p.f1, fc: p.fc, method: p.tech, R: 5, L: 0.015 });
      const st = Math.max(1, Math.floor(r.t.length / 2400)), ds = a => a.filter((_, i) => i % st === 0), t = ds(r.t), n = Array.from({ length: 120 }, (_, i) => i + 1);
      return { kpis: [kv('V₁ phase (peak)', r.V1ph, 'V', 'acc'), kv('ma·Vdc/2', p.m * p.Vdc / 2, 'V'), kv('THD v_ab', r.thdV * 100, '%', 'warn'), kv('THD i_a', r.thdI * 100, '%'), kv('mf', p.fc / p.f1, '')],
        charts: [lc('ref', p.tech === 'svpwm' ? 'Modulating signals with min-max injection (SVPWM) and carrier' : 'Sinusoidal references and carrier', 'Time (ms)', 'p.u.', [S('a', t, ds(r.ra)), S('b', t, ds(r.rb)), S('c', t, ds(r.rc)), S('Carrier', t, ds(r.car), { color: '#94a3b8', width: 1 })]), lc('vo', 'Line voltage v_ab and phase current i_a ×10', 'Time (ms)', 'V / A', [S('v_ab', t, ds(r.vab), { type: 'step', width: 1 }), S('10·i_a', t, ds(r.ia).map(x => x * 10), { color: '#ef4444', width: 2 })]), lc('sp', 'Harmonic spectrum of v_ab', 'n', 'V', [S('|V_n|', n, r.Hv.slice(1), { type: 'bar' })])],
        obs: { cols: ['Harmonic', 'V_n (V)', '% of V₁'], rows: r.Hv.map((v, i) => [i, v, 100 * v / r.Hv[1]]).filter((x, i) => i > 0 && (i === 1 || x[2] > 2)).slice(0, 18) }, _w: { y: r.vab, ref: r.ra, car: r.car } };
    },
    draw(g, W, H, A) {
      const w = A.R._w; if (!w) return; const T = A.T;
      const ph = (A.t * 0.2) % 1;
      scope(g, 40, 30, W - 80, (H - 90) / 2, [{ y: w.car.filter((_, i) => i % 2 === 0), c: '#94a3b8', w: 1 }, { y: w.ref.filter((_, i) => i % 2 === 0), c: T.cyan, w: 2 }], { cursor: ph, label: 'Comparator inputs: reference vs carrier' });
      scope(g, 40, 50 + (H - 90) / 2, W - 80, (H - 90) / 2, [{ y: w.y.filter((_, i) => i % 2 === 0), c: T.orange, w: 1.2 }], { cursor: ph, label: 'Output voltage' });
    },
    viva: [['Why does multiple-pulse PWM reduce low-order harmonics?', 'It distributes the volt-seconds over several narrower pulses so the dominant harmonics move to around 2N.'], ['Why is SPWM output current nearly sinusoidal?', 'The motor inductance filters the high-frequency harmonics clustered around the carrier frequency.'], 'What is the effect of choosing mf as an odd multiple of 3?', 'Define overmodulation.'],
    mcq: [{ q: 'In single-pulse PWM, the dominant harmonic for a wide pulse is the', o: ['2nd', '3rd', '20th', 'carrier'], a: 1 }, { q: 'In SPWM, harmonics appear around', o: ['f1', 'mf·f1', '3f1 only', 'DC'], a: 1 }, { q: 'SVPWM increases the linear output voltage by about', o: ['5 %', '15.5 %', '27 %', '50 %'], a: 1 }],
  };
}
function svpwmExp() {
  return {
    id: '1.11', stageH: 440,
    aim: 'To study space-vector PWM: sector identification, dwell-time calculation and the seven-segment switching sequence.',
    objectives: ['Represent the three-phase reference as a rotating vector in the αβ plane.', 'Compute T1, T2 and T0 for any reference.', 'Observe the switching sequence and output waveforms; find the linear-range limit.'],
    theory: `<p>SVPWM treats the three-phase reference as a single space vector $\\vec V_{ref}=V_{ref}e^{j\\theta}$ rotating at $\\omega = 2\\pi f_1$. The αβ plane is divided by the six active vectors into six <b>sectors</b>. In each switching period $T_s$, the reference is synthesised by the volt-second balance of the two adjacent active vectors and the zero vectors:</p>$$\\vec V_{ref}T_s = \\vec V_k T_1 + \\vec V_{k+1}T_2 + \\vec V_{0/7}T_0 .$$
<p>For angle α within the sector, $T_1 = \\frac{\\sqrt3 T_s V_{ref}}{V_{dc}}\\sin(60^\\circ-\\alpha)$, $T_2 = \\frac{\\sqrt3 T_s V_{ref}}{V_{dc}}\\sin\\alpha$, $T_0=T_s-T_1-T_2$. The symmetric <b>seven-segment</b> sequence (e.g. V0-V1-V2-V7-V2-V1-V0 in sector I) minimises switching (one leg changes per transition). The inscribed circle of the hexagon gives the linear limit $V_{ref,max} = V_{dc}/\\sqrt3$, i.e. $m_a = 2V_{ref}/V_{dc} \\le 1.155$.</p>`,
    eqs: [['T_1 = \\frac{\\sqrt3 T_sV_{ref}}{V_{dc}}\\sin\\left(\\frac{\\pi}{3}-\\alpha\\right),\\; T_2 = \\frac{\\sqrt3 T_sV_{ref}}{V_{dc}}\\sin\\alpha', ''], ['T_0 = T_s - T_1 - T_2', ''], ['V_{ref,max} = \\frac{V_{dc}}{\\sqrt3}', 'Linear range (circle inscribed in the hexagon)']],
    params: [{ id: 'Vdc', l: 'DC voltage', u: 'V', min: 100, max: 800, step: 10, v: 400 }, { id: 'Vr', l: 'Reference magnitude Vref', u: 'V', min: 10, max: 260, step: 1, v: 180 }, { id: 'f1', l: 'Reference frequency', u: 'Hz', min: 5, max: 100, step: 1, v: 50 }, { id: 'fs', l: 'Switching frequency', u: 'Hz', min: 1000, max: 10000, step: 100, v: 5000 }, { id: 'slow', l: 'Animation: vector revolutions per second', min: 0.02, max: 1, step: 0.01, v: 0.12 }],
    kind: 'sim', autorun: true,
    sim: {
      dt: 0.005, live: ['slow', 'Vr', 'Vdc', 'fs'], sampleEvery: 0.05,
      init: () => ({ th: 0, t: 0 }),
      step(s, p, dt) { s.t += dt; s.th = (s.th + TAU * p.slow * dt) % TAU; },
      sample(s, p) { const d = svDwell(p.Vr, s.th, p.Vdc, 1 / p.fs); s.d = d; return { kpis: [kv('Sector', d.sector, '', 'acc'), kv('Angle θ', s.th * 180 / Math.PI, '°', '', 1), kv('α in sector', d.alpha * 180 / Math.PI, '°', '', 1), kv('T1', d.T1 * 1e6, 'µs'), kv('T2', d.T2 * 1e6, 'µs'), kv('T0', d.T0 * 1e6, 'µs', d.T0 < 0.5e-6 ? 'bad' : '')], push: { th: [s.t, d.T1 * 1e6, d.T2 * 1e6, d.T0 * 1e6] } }; },
      charts: [{ id: 'th', title: 'Live dwell times as the vector rotates', xl: 'Time (s)', yl: 'µs', s: ['T1', 'T2', 'T0'], max: 2000 }],
    },
    compute(p) {
      const Ts = 1 / p.fs;
      const r = vsi({ Vdc: p.Vdc, m: 2 * p.Vr / p.Vdc, f1: p.f1, fc: p.fs, method: 'svpwm', R: 5, L: .015 });
      const st = Math.max(1, Math.floor(r.t.length / 2400)), ds = a => a.filter((_, i) => i % st === 0), t = ds(r.t);
      const ang = range(0, 360, 181); const dw = ang.map(a => svDwell(p.Vr, a * Math.PI / 180, p.Vdc, Ts));
      const d30 = svDwell(p.Vr, Math.PI / 9, p.Vdc, Ts);
      return {
        kpis: [kv('ma = 2Vref/Vdc', 2 * p.Vr / p.Vdc, '', 2 * p.Vr / p.Vdc > 1.155 ? 'bad' : 'good'), kv('Linear limit Vdc/√3', p.Vdc / Math.sqrt(3), 'V'), kv('V₁ phase (sim)', r.V1ph, 'V'), kv('THD v_ab', r.thdV * 100, '%')],
        charts: [lc('dw', 'Dwell times over one revolution', 'θ (°)', 'µs', [S('T1', ang, dw.map(x => x.T1 * 1e6)), S('T2', ang, dw.map(x => x.T2 * 1e6)), S('T0', ang, dw.map(x => x.T0 * 1e6))]), lc('vo', 'SVPWM output: modulating signal (×Vdc/2) and v_ab', 'Time (ms)', 'V', [S('v_ab', t, ds(r.vab), { type: 'step', width: 1, color: '#f59e0b' }), S('v*a', t, ds(r.ra).map(x => x * p.Vdc / 2), { width: 2 })]), lc('ia', 'Phase currents', 'Time (ms)', 'A', [S('i_a', t, ds(r.ia)), S('i_b', t, ds(r.ib)), S('i_c', t, ds(r.ic))])],
        steps: [['Worked example at θ = 20° (sector I, α = 20°):'], ['', `T_1 = \\frac{\\sqrt3\\times${fmt(Ts * 1e6)}\\mu s\\times${p.Vr}}{${p.Vdc}}\\sin(40^\\circ) = ${fmt(d30.T1 * 1e6)}\\,\\mu s`], ['', `T_2 = \\frac{\\sqrt3 T_s V_{ref}}{V_{dc}}\\sin(20^\\circ) = ${fmt(d30.T2 * 1e6)}\\,\\mu s,\\quad T_0 = ${fmt(d30.T0 * 1e6)}\\,\\mu s`]],
        obs: { cols: ['θ (°)', 'Sector', 'T1 (µs)', 'T2 (µs)', 'T0 (µs)'], rows: [0, 15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => { const d = svDwell(p.Vr, a * Math.PI / 180, p.Vdc, Ts); return [a, d.sector, d.T1 * 1e6, d.T2 * 1e6, d.T0 * 1e6]; }) },
      };
    },
    draw(g, W, H, A) {
      if (!A.S) return; const th = A.S.th, d = svDwell(A.p.Vr, th, A.p.Vdc, 1 / A.p.fs); const T = A.T;
      const cx = W * 0.27, cy = H * 0.5, R = Math.min(W * 0.22, H * 0.42), Vs = 2 / 3 * A.p.Vdc, sc = R / Vs;
      g.fillStyle = hex(T.cyan, .05); g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; g[k ? 'lineTo' : 'moveTo'](cx + R * Math.cos(a), cy - R * Math.sin(a)); } g.fill(); g.strokeStyle = T.line; g.stroke();
      // highlight sector
      const k0 = d.sector - 1; g.fillStyle = hex(T.green, .15); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(k0 * Math.PI / 3), cy - R * Math.sin(k0 * Math.PI / 3)); g.lineTo(cx + R * Math.cos((k0 + 1) * Math.PI / 3), cy - R * Math.sin((k0 + 1) * Math.PI / 3)); g.closePath(); g.fill();
      g.setLineDash([4, 4]); g.strokeStyle = T.muted; g.beginPath(); g.arc(cx, cy, A.p.Vdc / Math.sqrt(3) * sc, 0, 7); g.stroke(); g.setLineDash([]);
      for (let k = 1; k <= 6; k++) { const a = (k - 1) * Math.PI / 3; const on = k === d.sector || k === (d.sector % 6) + 1; arrow(g, cx, cy, cx + R * Math.cos(a), cy - R * Math.sin(a), on ? T.green : hex(T.cyan, .35), on ? 2.5 : 1.2); text(g, `V${k}`, cx + (R + 16) * Math.cos(a), cy - (R + 16) * Math.sin(a), { size: 11.5, weight: 700, color: on ? T.green : T.muted }); }
      ['I', 'II', 'III', 'IV', 'V', 'VI'].forEach((s, k) => text(g, s, cx + R * .55 * Math.cos((k + .5) * Math.PI / 3), cy - R * .55 * Math.sin((k + .5) * Math.PI / 3), { size: 12, color: T.muted, weight: 700 }));
      const vx = cx + A.p.Vr * sc * Math.cos(th), vy = cy - A.p.Vr * sc * Math.sin(th);
      g.strokeStyle = hex(T.yellow, .4); g.beginPath(); g.arc(cx, cy, A.p.Vr * sc, 0, 7); g.stroke();
      arrow(g, cx, cy, vx, vy, T.yellow, 3.5); text(g, 'V_ref', vx + 14, vy - 10, { color: T.yellow, weight: 800 });
      // decomposition
      const a1 = k0 * Math.PI / 3, a2 = (k0 + 1) * Math.PI / 3, Ts = 1 / A.p.fs;
      const l1 = Vs * d.T1 / Ts * sc, l2 = Vs * d.T2 / Ts * sc;
      const p1 = [cx + l1 * Math.cos(a1), cy - l1 * Math.sin(a1)]; arrow(g, cx, cy, ...p1, T.orange, 2); arrow(g, ...p1, p1[0] + l2 * Math.cos(a2), p1[1] - l2 * Math.sin(a2), T.pink, 2);
      // seven-segment sequence
      const x0 = W * 0.56, w = W * 0.4, y0 = 50; const seq = sevenSeg(d.sector);
      const segs = [d.T0 / 4, d.T1 / 2, d.T2 / 2, d.T0 / 2, d.T2 / 2, d.T1 / 2, d.T0 / 4];
      const order = d.sector % 2 ? [0, 1, 2, 3, 2, 1, 0] : [0, 2, 1, 3, 1, 2, 0];
      text(g, `Seven-segment sequence in sector ${d.sector} (one Ts = ${fmt(Ts * 1e6)} µs)`, x0, 22, { align: 'left', weight: 700 });
      ['Sa', 'Sb', 'Sc'].forEach((nm, leg) => {
        const yy = y0 + 30 + leg * 58; text(g, nm, x0 - 6, yy - 12, { align: 'right', weight: 700, color: [T.red, T.yellow, T.blue][leg] });
        let x = x0; g.beginPath(); g.strokeStyle = [T.red, T.yellow, T.blue][leg]; g.lineWidth = 2;
        segs.forEach((tt, i) => { const v = seq[order[i]][leg]; const ww = tt / Ts * w; const yv = yy - v * 26; if (i === 0) g.moveTo(x, yv); else g.lineTo(x, yv); g.lineTo(x + ww, yv); x += ww; });
        g.stroke();
      });
      let x = x0; segs.forEach((tt, i) => { const ww = tt / Ts * w; const vi = seq[order[i]]; const lbl = vi.join('') === '000' ? 'V0' : vi.join('') === '111' ? 'V7' : 'V' + (VEC.findIndex(v => v.join('') === vi.join(''))); text(g, lbl, x + ww / 2, y0 + 200, { size: 10.5, color: T.muted }); line(g, [[x, y0 + 4], [x, y0 + 190]], hex(T.muted, .3), 1); x += ww; });
      [['T1', d.T1, T.orange], ['T2', d.T2, T.pink], ['T0', d.T0, T.muted]].forEach(([l, v, c], i) => { g.fillStyle = c; g.fillRect(x0, y0 + 230 + i * 26, v / Ts * w, 14); text(g, `${l} = ${fmt(v * 1e6)} µs`, x0 + v / Ts * w + 8, y0 + 237 + i * 26, { align: 'left', size: 11.5, color: c }); });
      text(g, `Sector ${d.sector} · θ = ${fmt(th * 180 / Math.PI)}°`, 14, 18, { align: 'left', weight: 800 });
    },
    viva: [['Why does SVPWM give 15.5 % more voltage than SPWM?', 'Its linear range is the circle inscribed in the hexagon, radius Vdc/√3, versus Vdc/2 for SPWM (ratio 2/√3).'], ['Why split T0 between V0 and V7?', 'To make the pattern symmetric with only one switch transition per change, reducing switching loss and harmonics.'], 'How is the sector found from vα and vβ?', 'What happens when T1+T2 > Ts?'],
    mcq: [{ q: 'The maximum reference vector in linear SVPWM is', o: ['Vdc/2', 'Vdc/√3', '2Vdc/3', 'Vdc'], a: 1 }, { q: 'Number of sectors in SVPWM', o: ['3', '4', '6', '8'], a: 2 }, { q: 'At α = 30° in a sector, T1 and T2 are', o: ['T1 > T2', 'T1 = T2', 'T1 < T2', 'both zero'], a: 1 }],
  };
}
function sevenSeg(sec) { const a = VEC[sec], b = VEC[(sec % 6) + 1]; return [[0, 0, 0], a, b, [1, 1, 1]]; }
function hystExp() {
  return {
    id: '1.12', kind: 'static', stageH: 360,
    aim: 'To study hysteresis (bang-bang) current control of a three-phase VSI and the effect of band width on ripple and switching frequency.',
    objectives: ['Observe the reference and actual currents within the hysteresis band.', 'Measure average switching frequency and current ripple.', 'Study the band-width trade-off.'],
    theory: `<p>In <b>hysteresis current control</b> each phase current is compared with its sinusoidal reference. When the current exceeds $i^* + h/2$ the upper switch is turned off (lower on) and the current falls; when it drops below $i^* - h/2$ the upper switch is turned on. The current is thus confined to a band of width h around the reference. The method is simple, robust and has very fast dynamic response, but the switching frequency varies with the operating point (back-EMF, DC voltage, inductance) and, in a three-phase isolated-neutral load, the phases interact.</p>
<p>An approximate average switching frequency is $f_{sw}\\approx\\frac{V_{dc}}{4hL}\\left(1-\\frac{4e^2}{V_{dc}^2}\\right)$ (single phase, e = back-EMF); halving h roughly doubles $f_{sw}$.</p>`,
    eqs: [['S_x = \\begin{cases}1 & i_x < i_x^* - h/2\\\\ 0 & i_x > i_x^* + h/2\\\\ S_x(k-1) & \\text{otherwise}\\end{cases}', ''], ['f_{sw} \\approx \\frac{V_{dc}}{4hL}\\left(1 - \\frac{4e^2}{V_{dc}^2}\\right)', 'Approximate (half-bridge, mid-point referenced)']],
    params: [{ id: 'band', l: 'Hysteresis band h', u: 'A', min: 0.2, max: 10, step: 0.1, v: 2 }, { id: 'Ipk', l: 'Reference current peak', u: 'A', min: 2, max: 60, step: 1, v: 20 }, { id: 'f1', l: 'Reference frequency', u: 'Hz', min: 5, max: 200, step: 1, v: 50 }, { id: 'Vdc', l: 'DC voltage', u: 'V', min: 100, max: 800, step: 10, v: 400 }, { id: 'L', l: 'Load inductance', u: 'mH', min: 1, max: 50, step: 0.5, v: 10 }, { id: 'R', l: 'Load resistance', u: 'Ω', min: 0.1, max: 10, step: 0.1, v: 1 }, { id: 'E', l: 'Back-EMF peak', u: 'V', min: 0, max: 250, step: 5, v: 100 }, { id: 'zoom', l: 'Plot window (fraction of period)', min: 0.05, max: 1, step: 0.05, v: 0.25 }],
    compute(p) {
      const r = hysteresis({ Vdc: p.Vdc, Ipk: p.Ipk, f1: p.f1, band: p.band, R: p.R, L: p.L / 1000, Em: p.E, dt: Math.min(2e-6, 1 / (p.f1 * 20000)) });
      const n = Math.floor(r.t.length * p.zoom); const sl = a => a.slice(0, n);
      const bands = [0.5, 1, 2, 3, 5, 8].map(b => { const q = hysteresis({ Vdc: p.Vdc, Ipk: p.Ipk, f1: p.f1, band: b, R: p.R, L: p.L / 1000, Em: p.E, cycles: 2, dt: 4e-6 }); return [b, q.fsw, q.ripple, q.thdI * 100]; });
      const nh = Array.from({ length: 60 }, (_, i) => i + 1);
      return {
        kpis: [kv('Average switching freq', r.fsw, 'Hz', 'acc'), kv('Approx. formula', p.Vdc / (4 * p.band * p.L / 1000) * Math.max(0, 1 - 4 * (p.E / 2) ** 2 / p.Vdc ** 2) / 2, 'Hz'), kv('RMS current error', r.ripple, 'A'), kv('Current THD', r.thdI * 100, '%'), kv('Fundamental I₁', r.Hi[1], 'A')],
        charts: [lc('cur', 'Reference, actual current and hysteresis band (phase a)', 'Time (ms)', 'A', [S('i*', sl(r.t), sl(r.ir), { color: '#facc15', width: 2 }), S('i_a', sl(r.t), sl(r.ia), { color: '#22d3ee' }), S('upper', sl(r.t), sl(r.up), { color: '#ef4444', dash: [4, 3], width: 1 }), S('lower', sl(r.t), sl(r.lo), { color: '#ef4444', dash: [4, 3], width: 1 })], { wide: true }),
          lc('sw', 'Switching signal Sa and phase voltage', 'Time (ms)', '', [S('Sa', sl(r.t), sl(r.Sa).map(v => v * p.Vdc / 2), { type: 'step' }), S('v_aN', sl(r.t), sl(r.vaN), { type: 'step', width: 1, color: '#f59e0b' })]),
          lc('abc', 'Three-phase motor currents', 'Time (ms)', 'A', [S('i_a', r.t, r.ia), S('i_b', r.t, r.ib), S('i_c', r.t, r.ic)]),
          lc('bandf', 'Band width vs switching frequency', 'Band h (A)', 'f_sw (Hz)', [S('f_sw', bands.map(b => b[0]), bands.map(b => b[1]), { marker: true })]),
          lc('bandr', 'Band width vs ripple', 'Band h (A)', 'RMS error (A)', [S('ripple', bands.map(b => b[0]), bands.map(b => b[2]), { marker: true, color: '#ef4444' })]),
          lc('hs', 'Current harmonic spectrum', 'n', 'A', [S('|I_n|', nh, r.Hi.slice(1, 61), { type: 'bar' })])],
        obs: { cols: ['Band h (A)', 'Avg f_sw (Hz)', 'RMS ripple (A)', 'Current THD (%)'], rows: bands },
        _r: r,
      };
    },
    draw(g, W, H, A) {
      const r = A.R._r; if (!r) return; const T = A.T; const n = r.t.length; const k = Math.floor((A.t * 0.15 % 1) * n);
      box(g, 30, H / 2 - 40, 110, 80, 'i*', { color: T.yellow, sub: 'reference', val: `${fmt(r.ir[k])} A` });
      g.strokeStyle = T.text; g.beginPath(); g.arc(200, H / 2, 18, 0, 7); g.stroke(); text(g, 'Σ', 200, H / 2, { size: 16, weight: 800 }); flow(g, [[140, H / 2], [182, H / 2]], A.t, .3, T.yellow); text(g, '+', 176, H / 2 - 14); text(g, '−', 208, H / 2 + 28);
      const err = r.ir[k] - r.ia[k];
      box(g, 250, H / 2 - 50, 150, 100, 'Hysteresis comparator', { color: T.violet, sub: `e = ${fmt(err)} A, h = ${A.p.band} A` });
      // hysteresis symbol
      const hx = 290, hy = H / 2 + 28; line(g, [[hx, hy], [hx + 30, hy], [hx + 30, hy - 14], [hx + 70, hy - 14]], T.text, 1.5); line(g, [[hx + 70, hy - 14], [hx + 40, hy - 14], [hx + 40, hy], [hx, hy]], T.text, 1.5);
      flow(g, [[218, H / 2], [250, H / 2]], A.t, .3, T.cyan);
      flow(g, [[400, H / 2], [450, H / 2]], A.t, .3, T.green); sw(g, 480, H / 2 - 30, r.Sa[k] === 1, 'S1'); sw(g, 480, H / 2 + 30, r.Sa[k] === 0, 'S4');
      motor(g, W - 110, H / 2, 46, A.t * 3, 'R-L-e load', T.cyan); flow(g, [[500, H / 2], [W - 160, H / 2]], A.t, r.ia[k] / A.p.Ipk, T.cyan);
      flow(g, [[W - 110, H / 2 + 46], [W - 110, H - 30], [200, H - 30], [200, H / 2 + 18]], A.t, .2, T.cyan); text(g, 'i_a (measured)', W / 2, H - 42, { color: T.cyan });
      text(g, `Average switching frequency ${fmt(r.fsw)} Hz`, 14, 18, { align: 'left', weight: 800 });
    },
    viva: [['Why is the switching frequency of hysteresis control not constant?', 'The current slope depends on (Vdc ± e)/L, which varies over the cycle and with speed.'], ['Give one advantage and one drawback of hysteresis control.', 'Very fast, simple and robust; variable switching frequency makes filter design and loss prediction harder.'], 'How does phase interaction arise in a three-phase system with isolated neutral?', 'What happens to ripple if L is doubled?'],
    mcq: [{ q: 'Halving the hysteresis band approximately', o: ['Halves f_sw', 'Doubles f_sw', 'Does not change f_sw', 'Quadruples ripple'], a: 1 }, { q: 'Hysteresis control directly regulates', o: ['Voltage', 'Current', 'Flux', 'Speed'], a: 1 }, { q: 'A key drawback of hysteresis control is', o: ['Slow response', 'Variable switching frequency', 'Needs a carrier', 'Needs a PI controller'], a: 1 }],
  };
}
function compareExp() {
  return {
    id: '1.13', kind: 'static',
    aim: 'To compare SPWM, SVPWM and hysteresis current control under identical DC bus, load and fundamental output conditions.',
    objectives: ['Compare DC-bus utilisation, switching frequency, THD, ripple and switching losses.', 'Interpret the trade-offs for EV motor drives.'],
    theory: `<p>All three techniques are evaluated with the same DC-link voltage, R-L-EMF load and fundamental current. SPWM and SVPWM use the same carrier frequency; the hysteresis band is automatically tuned so that its average switching frequency matches (optional). Switching loss is estimated as $P_{sw} = f_{sw}(E_{on}+E_{off})\\frac{V_{dc}}{V_{ref}}\\frac{I}{I_{ref}}\\cdot\\frac{2}{\\pi}\\cdot 6$ with device datasheet-type energies (illustrative values).</p>
<p><b>SVPWM</b> is preferred in EV traction inverters because of its 15.5 % better bus utilisation and lower current ripple at equal switching frequency; <b>hysteresis</b> gives the fastest dynamic response but variable frequency; <b>SPWM</b> is the simplest carrier-based method.</p>`,
    eqs: [['\\text{Bus utilisation} = \\frac{\\hat V_{ph,1,max}}{V_{dc}/2}:\\ 1\\ (\\text{SPWM}),\\ 1.155\\ (\\text{SVPWM})', ''], ['P_{sw} \\propto f_{sw} V_{dc} I', '']],
    params: [{ id: 'Vdc', l: 'DC voltage', u: 'V', min: 200, max: 800, step: 10, v: 400 }, { id: 'I1', l: 'Fundamental current target (peak)', u: 'A', min: 5, max: 60, step: 1, v: 20 }, { id: 'f1', l: 'Fundamental frequency', u: 'Hz', min: 10, max: 150, step: 1, v: 50 }, { id: 'fc', l: 'Carrier frequency', u: 'Hz', min: 1000, max: 10000, step: 100, v: 5000 }, { id: 'L', l: 'Load L', u: 'mH', min: 2, max: 30, step: 1, v: 10 }, { id: 'R', l: 'Load R', u: 'Ω', min: 0.2, max: 5, step: 0.1, v: 1 }, { id: 'E', l: 'Back-EMF peak', u: 'V', min: 0, max: 200, step: 5, v: 100 }, { id: 'match', l: 'Match hysteresis f_sw to carrier', type: 'check', v: true }],
    compute(p) {
      const L = p.L / 1000, w = TAU * p.f1;
      // required fundamental voltage for target current (phasor, EMF in phase with current approx.)
      const Vreq = Math.hypot(p.R * p.I1 + p.E, w * L * p.I1);
      const mS = 2 * Vreq / p.Vdc;
      const sp = vsi({ Vdc: p.Vdc, m: mS, f1: p.f1, fc: p.fc, method: 'spwm', R: p.R, L, Em: p.E, phiE: Math.atan2(w * L * p.I1, p.R * p.I1 + p.E) });
      const sv = vsi({ Vdc: p.Vdc, m: mS, f1: p.f1, fc: p.fc, method: 'svpwm', R: p.R, L, Em: p.E, phiE: Math.atan2(w * L * p.I1, p.R * p.I1 + p.E) });
      let band = 2, hy;
      if (p.match) { let lo = 0.05, hi = 20; for (let k = 0; k < 12; k++) { band = Math.sqrt(lo * hi); hy = hysteresis({ Vdc: p.Vdc, Ipk: p.I1, f1: p.f1, band, R: p.R, L, Em: p.E, cycles: 2, dt: 2e-6 }); if (hy.fsw > p.fc) lo = band; else hi = band; } }
      hy = hysteresis({ Vdc: p.Vdc, Ipk: p.I1, f1: p.f1, band, R: p.R, L, Em: p.E, cycles: 3, dt: 2e-6 });
      const ripple = r => { let s = 0; const n = r.ia.length; const fund = fitSine(r.ia); for (let i = 0; i < n; i++) s += (r.ia[i] - fund[i]) ** 2; return Math.sqrt(s / n); };
      const Esw = 2.5e-3, Vref = 400, Iref = 100; const loss = (f, I) => 6 * f * Esw * (p.Vdc / Vref) * (I / Iref) * 2 / Math.PI;
      const rows = [['DC-bus utilisation (max linear V₁/(Vdc/2))', 1.0, 1.155, '≈1.15 (current-regulated)'], ['Modulation index needed', +mS.toFixed(3), +mS.toFixed(3), '–'], ['Average switching freq (Hz)', +sp.fsw.toFixed(0), +sv.fsw.toFixed(0), +hy.fsw.toFixed(0)], ['Line voltage THD (%)', +(sp.thdV * 100).toFixed(1), +(sv.thdV * 100).toFixed(1), '–'], ['Current THD (%)', +(sp.thdI * 100).toFixed(2), +(sv.thdI * 100).toFixed(2), +(hy.thdI * 100).toFixed(2)], ['RMS current ripple (A)', +ripple(sp).toFixed(3), +ripple(sv).toFixed(3), +hy.ripple.toFixed(3)], ['Fundamental current I₁ (A)', +sp.I1.toFixed(2), +sv.I1.toFixed(2), +hy.Hi[1].toFixed(2)], ['Switching loss estimate (W)', +loss(sp.fsw, sp.I1).toFixed(1), +loss(sv.fsw, sv.I1).toFixed(1), +loss(hy.fsw, hy.Hi[1]).toFixed(1)], ['Computational complexity', 'Low (comparator)', 'Medium (sector, dwell times)', 'Very low (comparator)'], ['Dynamic response', 'Limited by current PI', 'Limited by current PI', 'Fastest (inherent)'], ['Switching frequency', 'Fixed', 'Fixed', 'Variable'], ['Harmonic content', 'Side-bands at mf', 'Side-bands at mf, lower', 'Spread spectrum']];
      const n = Array.from({ length: 120 }, (_, i) => i + 1); const st = a => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / 1500)) === 0);
      return {
        kpis: [kv('Required V₁ (peak)', Vreq, 'V'), kv('ma required', mS, '', mS > 1 ? 'warn' : ''), kv('Matched hysteresis band', band, 'A'), kv('SPWM I-THD', sp.thdI * 100, '%'), kv('SVPWM I-THD', sv.thdI * 100, '%', 'good'), kv('Hysteresis I-THD', hy.thdI * 100, '%')],
        obs: { cols: ['Criterion', 'SPWM', 'SVPWM', 'Hysteresis'], rows },
        charts: [lc('cur', 'Phase-a current (one cycle)', 'Sample', 'A', [S('SPWM', null, st(sp.ia)), S('SVPWM', null, st(sv.ia)), S('Hysteresis', null, st(hy.ia))]), lc('spec', 'Current spectra', 'n', 'A', [S('SPWM', n, sp.Hi.slice(1), { type: 'bar' }), S('SVPWM', n, sv.Hi.slice(1), { type: 'bar' }), S('Hyst.', n, hy.Hi.slice(1), { type: 'bar' })], { logy: true, yr: [1e-3, null] }), lc('bar', 'Current THD (%)', 'Technique (1 SPWM, 2 SVPWM, 3 Hyst.)', '%', [S('THD', [1, 2, 3], [sp.thdI * 100, sv.thdI * 100, hy.thdI * 100], { type: 'bar' })], { xr: [.4, 3.6] })],
        html: '<div class="note">The full comparison table is in the <b>Observations & Result</b> tab.</div>',
      };
    },
    viva: [['Which technique is preferred for EV traction inverters and why?', 'SVPWM: higher DC bus utilisation (15.5 %), lower harmonics at equal frequency, easy digital implementation.'], ['Why does hysteresis control give the fastest dynamic response?', 'It acts directly on the current error every sample without a PI delay.'], 'Compare the computational burden of the three methods.'],
    mcq: [{ q: 'Which technique has a fixed switching frequency?', o: ['Hysteresis only', 'SPWM and SVPWM', 'None', 'All'], a: 1 }, { q: 'Best DC-bus utilisation in the linear range', o: ['SPWM', 'SVPWM', 'Single-pulse', 'Hysteresis band'], a: 1 }],
  };
}
function fitSine(y) { const n = y.length; let a = 0, b = 0; for (let k = 0; k < n; k++) { a += y[k] * Math.cos(TAU * k / n); b += y[k] * Math.sin(TAU * k / n); } a *= 2 / n; b *= 2 / n; return y.map((_, k) => a * Math.cos(TAU * k / n) + b * Math.sin(TAU * k / n)); }
