// UNIT 3 – Power Electronics and Electric Drive Train Systems: 17 experiments.
import { kv, lc, S, range, blocks, scope, legend } from './common.js';
import { box, flow, text, hex, arrow, line, rrect, resistor, capacitor, inductor, battery as batSym, sw, motor as motorSym, wheel, gear, car2d } from '../lib/draw.js';
import { imSteady, imThevenin, IM_EX13, IMDrive, IM_TRACTION, PMSMDrive, PMSM_EX20, pmsmTorque, pmsmEnvelope, mtpaId, pmsmVoltage, clarke, park, ipark, iclarke } from '../models/machines.js';
import { vsi, harmonics, thdRms, svDwell } from '../models/inverter.js';
import { REF4, roadLoad, motorTmax } from '../models/vehicle.js';
import { carView, motorView } from '../three/views.js';
import { fmt, clamp, h } from '../lib/ui.js';

const TAU = 2 * Math.PI, S3 = Math.sqrt(3);
// ------------------------------------------------------------------ DC-DC & rectifier switching models
function dcdc(p) {
  const { type, Vin, D, fsw, L, C, R } = p; const T = 1 / fsw, n = 400, dt = T / n; const cyc = Math.max(60, Math.ceil(12 * Math.sqrt(L * C) / T * 2 + 6 * R * C / T));
  let iL = 0, vC = type === 'boost' ? Vin : 0; const keep = { t: [], iL: [], vC: [], S: [], iin: [], vsw: [] };
  const N = Math.min(cyc, 3000) * n; let dcm = false;
  for (let k = 0; k < N; k++) {
    const on = (k % n) < D * n; let diL, dvC, iin;
    if (type === 'buck') { diL = ((on ? Vin : 0) - vC) / L; iin = on ? iL : 0; dvC = (iL - vC / R) / C; }
    else if (type === 'boost') { diL = (Vin - (on ? 0 : vC)) / L; iin = iL; dvC = ((on ? 0 : iL) - vC / R) / C; }
    else { diL = (on ? Vin : -vC) / L; iin = on ? iL : 0; dvC = ((on ? 0 : iL) - vC / R) / C; }
    iL += diL * dt; if (iL < 0) { iL = 0; if (!on && k >= N - 2 * n) dcm = true; } vC += dvC * dt;
    if (k >= N - 2 * n) { keep.t.push((k - (N - 2 * n)) * dt * 1e6); keep.iL.push(iL); keep.vC.push(vC); keep.S.push(on ? 1 : 0); keep.iin.push(iin); keep.vsw.push(type === 'buck' ? (on ? Vin : 0) : type === 'boost' ? (on ? 0 : vC) : (on ? Vin : -vC)); }
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const Vo = avg(keep.vC), IL = avg(keep.iL), Iin = avg(keep.iin);
  const ideal = type === 'buck' ? D * Vin : type === 'boost' ? Vin / (1 - D) : Vin * D / (1 - D);
  return Object.assign(keep, { Vo, IL, Iin, ideal, dIL: Math.max(...keep.iL) - Math.min(...keep.iL), dVo: Math.max(...keep.vC) - Math.min(...keep.vC), Pin: Vin * Iin, Pout: Vo * Vo / R, dcm });
}
function rectifier({ Vrms, f, C, R, Rs, Ls }) {
  const Vm = Vrms * Math.SQRT2, dt = 1 / (f * 4000), N = 4000 * 8; let vC = 0, is = 0; const keep = { t: [], vs: [], vo: [], is: [] };
  for (let k = 0; k < N; k++) { const vs = Vm * Math.sin(TAU * f * k * dt), a = Math.abs(vs); let di = 0; if (a > vC || is > 0) { di = (a - vC - Rs * is) / Ls; } is = Math.max(0, is + di * dt); vC += (is - vC / R) / C * dt; if (k >= N - 4000) { keep.t.push((k - (N - 4000)) * dt * 1000); keep.vs.push(vs); keep.vo.push(vC); keep.is.push(Math.sign(vs) * is); } }
  const H = harmonics(keep.is, 40), Irms = Math.sqrt(keep.is.reduce((a, b) => a + b * b, 0) / keep.is.length);
  const P = keep.vo.reduce((a, b) => a + b * b / R, 0) / keep.vo.length;
  return Object.assign(keep, { H, thd: thdRms(keep.is, H[1]), PF: P / (Vrms * Irms), Vo: keep.vo.reduce((a, b) => a + b, 0) / keep.vo.length, ripple: Math.max(...keep.vo) - Math.min(...keep.vo) });
}

// ------------------------------------------------------------------ drive helpers
function driveBlocks(g, W, H, A, list, active) { // horizontal block chain for control diagrams
  const T = A.T; const n = list.length; const bw = Math.min(118, (W - 40) / n - 14), gap = (W - 20 - n * bw) / (n - 1 || 1);
  list.forEach((b, i) => { const x = 10 + i * (bw + gap), y = 34; box(g, x, y, bw, 52, b[0], { color: b[2] || T.blue, sub: b[1], active: !active || active.includes(i), size: 11.5 }); A.hit && A.hit(x, y, bw, 52, b[0]); if (i < n - 1) flow(g, [[x + bw, y + 26], [x + bw + gap, y + 26]], A.t, .35, T.cyan, { w: 1.5, arrowAt: .6 }); });
}
function vecPlot(g, cx, cy, R, A, vecs, th) {
  const T = A.T; g.strokeStyle = T.line; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  line(g, [[cx - R - 8, cy], [cx + R + 8, cy]], T.muted, 1); line(g, [[cx, cy + R + 8], [cx, cy - R - 8]], T.muted, 1); text(g, 'α', cx + R + 16, cy, { color: T.muted }); text(g, 'β', cx, cy - R - 16, { color: T.muted });
  if (th !== undefined) { const c = Math.cos(th), s = Math.sin(th); line(g, [[cx - c * R, cy + s * R], [cx + c * R, cy - s * R]], hex(T.yellow, .6), 1.5, [5, 4]); line(g, [[cx + s * R, cy + c * R], [cx - s * R, cy - c * R]], hex(T.pink, .6), 1.5, [5, 4]); text(g, 'd', cx + c * (R + 10), cy - s * (R + 10), { color: T.yellow, weight: 800 }); text(g, 'q', cx - s * (R + 10), cy - c * (R + 10), { color: T.pink, weight: 800 }); }
  vecs.forEach(([x, y, col, lab]) => { arrow(g, cx, cy, cx + x * R, cy - y * R, col, 2.6); if (lab) text(g, lab, cx + x * R * 1.08 + 8, cy - y * R * 1.08, { color: col, weight: 700, size: 11.5 }); });
}
const PHC = ['#ef4444', '#facc15', '#3b82f6'];

export const EXPERIMENTS = [
  // =====================================================================================================
  {
    id: '3.1', kind: 'static', stageH: 330,
    aim: 'To study the power electronic converters used in EVs and HEVs: DC-DC (buck, boost, buck-boost, bidirectional), AC-DC rectifier and DC-AC inverter.',
    objectives: ['Simulate each converter at switching level.', 'Observe inductor current, output voltage, switching signal and ripple.', 'Verify the steady-state voltage-conversion ratios and identify CCM/DCM.'],
    theory: `<p>An EV contains several converters: the <b>traction inverter</b> (DC→AC, battery to motor), a <b>bidirectional DC-DC converter</b> (battery to DC link in some architectures, e.g. Toyota hybrid boost converter), the <b>auxiliary DC-DC</b> converter (HV→12 V), and in the charger an <b>AC-DC rectifier with PFC</b> followed by an isolated DC-DC stage.</p>
<p>In continuous conduction mode (CCM) volt-second balance on the inductor gives: buck $V_o = DV_{in}$; boost $V_o = V_{in}/(1-D)$; inverting buck-boost $V_o = V_{in}D/(1-D)$. The inductor ripple is $\\Delta i_L = V_L t_{on}/L$. If the load current is small the inductor current falls to zero before the next cycle – discontinuous mode (DCM) – and the ratios no longer hold. The <b>bidirectional half-bridge</b> uses two active switches so current can flow either way: boost from battery to DC link (motoring), buck from link to battery (regeneration).</p>`,
    eqs: [['V_o^{buck} = DV_{in},\\quad V_o^{boost} = \\frac{V_{in}}{1-D},\\quad V_o^{bb} = \\frac{D}{1-D}V_{in}', 'CCM'], ['\\Delta i_L^{buck} = \\frac{(V_{in}-V_o)D}{Lf_s},\\quad \\Delta v_o^{buck} = \\frac{\\Delta i_L}{8Cf_s}', ''], ['\\bar i_L^{bidir} = \\frac{V_b - (1-D)V_{dc}}{R_L}', 'Bidirectional, sign gives direction']],
    params: [{ id: 'type', l: 'Converter', type: 'select', str: true, v: 'buck', opts: [['buck', 'DC-DC buck'], ['boost', 'DC-DC boost'], ['bb', 'DC-DC buck-boost (inverting)'], ['bidir', 'Bidirectional half-bridge (battery ↔ DC link)'], ['rect', 'AC-DC diode bridge rectifier + C filter'], ['inv', 'DC-AC traction inverter (see Exp 1.8)']] }, { id: 'Vin', l: 'Input voltage / battery V', u: 'V', min: 12, max: 500, step: 1, v: 200 }, { id: 'D', l: 'Duty cycle D', min: 0.05, max: 0.95, step: 0.01, v: 0.5 }, { id: 'fsw', l: 'Switching frequency', u: 'kHz', min: 5, max: 100, step: 1, v: 20 }, { id: 'L', l: 'Inductance L', u: 'µH', min: 10, max: 2000, step: 10, v: 200 }, { id: 'C', l: 'Capacitance C', u: 'µF', min: 10, max: 2000, step: 10, v: 100 }, { id: 'R', l: 'Load resistance', u: 'Ω', min: 1, max: 200, step: 1, v: 10 }, { id: 'Vdc', l: 'DC-link voltage (bidirectional)', u: 'V', min: 200, max: 800, step: 10, v: 500 }],
    compute(p) {
      if (p.type === 'rect') {
        const r = rectifier({ Vrms: 230, f: 50, C: p.C * 1e-6 * 10, R: p.R * 5, Rs: 0.5, Ls: 1e-4 });
        return { kpis: [kv('DC output (avg)', r.Vo, 'V', 'acc'), kv('Peak of supply', 325, 'V'), kv('Output ripple', r.ripple, 'V'), kv('Input current THD', r.thd * 100, '%', 'warn'), kv('Power factor', r.PF, '')], charts: [lc('w', 'Supply voltage, DC output and input current ×20', 'Time (ms)', 'V', [S('v_s', r.t, r.vs), S('v_o', r.t, r.vo, { width: 2.4 }), S('20·i_s', r.t, r.is.map(x => 20 * x))]), lc('h', 'Input current harmonics', 'n', 'A', [S('|I_n|', Array.from({ length: 40 }, (_, i) => i + 1), r.H.slice(1), { type: 'bar' })])], html: '<div class="note warn">A diode rectifier with capacitor filter draws narrow current pulses: high THD and poor PF. EV chargers therefore use a boost PFC stage (Experiment 3.2).</div>', _r: { S: r.is.map(x => x > 0.5 ? 1 : 0), iL: r.is, vC: r.vo, t: r.t } };
      }
      if (p.type === 'inv') return { html: '<div class="note">The traction inverter is studied in detail in <a href="#/exp/1.8">Experiment 1.8</a>, <a href="#/exp/1.10">1.10</a> and <a href="#/exp/1.11">1.11</a>.</div>', kpis: [] };
      if (p.type === 'bidir') {
        const RL = 0.05, I = (p.Vin - (1 - p.D) * p.Vdc) / RL, P = p.Vin * I / 1000; const Iclamp = clamp(I, -400, 400);
        const n = 400, T = 1 / (p.fsw * 1000), Lh = p.L * 1e-6, dI = (p.Vin * p.D * T) / Lh; const t = [], iL = [], Sg = [];
        for (let k = 0; k < 2 * n; k++) { const ph = (k % n) / n, on = ph < p.D; t.push(k * T / n * 1e6); Sg.push(on ? 1 : 0); iL.push(Iclamp + (on ? -dI / 2 + dI * ph / p.D : dI / 2 - dI * (ph - p.D) / (1 - p.D))); }
        return { kpis: [kv('Mode', I >= 0 ? 'BOOST: battery → DC link (motoring)' : 'BUCK: DC link → battery (regeneration)', '', I >= 0 ? 'acc' : 'good'), kv('Avg inductor current', Iclamp, 'A'), kv('Power', p.Vin * Iclamp / 1000, 'kW'), kv('Duty for zero current', 1 - p.Vin / p.Vdc, ''), kv('Ripple Δi_L', dI, 'A')], charts: [lc('il', 'Inductor current (synchronous switching, always CCM)', 'Time (µs)', 'A', [S('i_L', t, iL)]), lc('g', 'Lower-switch gate signal', 'Time (µs)', '', [S('S_low', t, Sg, { type: 'step' })])], steps: [['', `\\bar i_L = \\frac{${p.Vin} - (1-${p.D})\\times${p.Vdc}}{${RL}} = ${fmt(I)}\\,A`], [`Power flow reverses when D < 1 − V<sub>b</sub>/V<sub>dc</sub> = ${fmt(1 - p.Vin / p.Vdc)}.`]], _r: { S: Sg, iL, vC: iL.map(() => p.Vdc), t, I: Iclamp } };
      }
      const r = dcdc({ type: p.type, Vin: p.Vin, D: p.D, fsw: p.fsw * 1000, L: p.L * 1e-6, C: p.C * 1e-6, R: p.R });
      return {
        kpis: [kv('Output voltage (sim)', r.Vo, 'V', 'acc'), kv('Ideal CCM ratio', r.ideal, 'V'), kv('Mode', r.dcm ? 'DCM' : 'CCM', '', r.dcm ? 'warn' : 'good'), kv('Inductor ripple Δi_L', r.dIL, 'A'), kv('Output ripple Δv_o', r.dVo, 'V'), kv('Avg inductor current', r.IL, 'A'), kv('Output power', r.Pout, 'W')],
        charts: [lc('il', 'Inductor current', 'Time (µs)', 'A', [S('i_L', r.t, r.iL)]), lc('vo', 'Output voltage', 'Time (µs)', 'V', [S('v_o', r.t, r.vC)], { noZero: true, zeroY: false }), lc('g', 'Switch gate signal and switch-node voltage', 'Time (µs)', '', [S('gate ×V_in', r.t, r.S.map(x => x * p.Vin), { type: 'step' }), S('v_sw', r.t, r.vsw, { type: 'step', color: '#f59e0b', width: 1 })])],
        steps: [[`Ideal CCM conversion: ${p.type === 'buck' ? '$V_o = DV_{in}$' : p.type === 'boost' ? '$V_o = V_{in}/(1-D)$' : '$V_o = V_{in}D/(1-D)$'} = ${fmt(r.ideal)} V; simulated ${fmt(r.Vo)} V ${r.dcm ? '(DCM: ratio rises above the CCM value)' : ''}`], [`Ripple from simulation: Δi<sub>L</sub> = ${fmt(r.dIL)} A, Δv<sub>o</sub> = ${fmt(r.dVo)} V`]],
        _r: r,
      };
    },
    draw(g, W, H, A) {
      const r = A.R._r; const T = A.T; const tp = A.p.type; if (!r) { text(g, 'See Experiment 1.8 for the inverter.', W / 2, H / 2); return; }
      const k = Math.floor((A.t * 0.25 % 1) * r.S.length), on = r.S[k] === 1, il = r.iL[k] ?? 0, imx = Math.max(1e-6, ...r.iL.map(Math.abs));
      const y1 = 80, y2 = H - 60, xs = 70, xe = W * 0.62;
      batSym(g, xs, (y1 + y2) / 2, 90, T.text, tp === 'rect' ? '' : `${A.p.Vin} V`); line(g, [[xs, y1], [xs, (y1 + y2) / 2 - 45]], T.text, 2); line(g, [[xs, y2], [xs, (y1 + y2) / 2 + 45]], T.text, 2); line(g, [[xs, y2], [W - 70, y2]], T.text, 2);
      if (tp === 'buck') { line(g, [[xs, y1], [xs + 60, y1]], T.text, 2); sw(g, xs + 85, y1, on, 'S'); line(g, [[xs + 100, y1], [xs + 160, y1]], T.text, 2); line(g, [[xs + 160, y1], [xs + 160, y2]], on ? T.line : T.orange, 2); text(g, 'D', xs + 175, (y1 + y2) / 2, { color: on ? T.muted : T.orange, weight: 800 }); inductor(g, xs + 160, y1, xe - 60, T.cyan, 'L'); line(g, [[xe - 60, y1], [W - 70, y1]], T.text, 2); }
      else if (tp === 'boost') { inductor(g, xs, y1, xs + 160, T.cyan, 'L'); line(g, [[xs + 160, y1], [xs + 160, y1 + 40]], T.text, 2); sw(g, xs + 160, (y1 + y2) / 2, on, 'S'); line(g, [[xs + 160, (y1 + y2) / 2 + 15], [xs + 160, y2]], T.text, 2); line(g, [[xs + 160, y1], [xe - 60, y1]], on ? T.line : T.orange, 2); text(g, 'D →', xs + 220, y1 - 14, { color: on ? T.muted : T.orange, weight: 800 }); line(g, [[xe - 60, y1], [W - 70, y1]], T.text, 2); }
      else { line(g, [[xs, y1], [xs + 60, y1]], T.text, 2); sw(g, xs + 85, y1, on, tp === 'bidir' || tp === 'rect' ? 'S_hi' : 'S'); line(g, [[xs + 100, y1], [xs + 180, y1]], T.text, 2); inductor(g, xs + 180, y1 + 10, xs + 180, T.cyan, ''); line(g, [[xs + 180, y1], [xs + 180, y2]], T.cyan, 3); text(g, 'L', xs + 196, (y1 + y2) / 2, { color: T.cyan, weight: 800 }); line(g, [[xs + 180, y1], [xe - 60, y1]], on ? T.line : T.orange, 2); line(g, [[xe - 60, y1], [W - 70, y1]], T.text, 2); }
      capacitor(g, xe, y1, y2, T.text, 'C'); resistor(g, W - 70, y1, W - 70, T.text); line(g, [[W - 70, y1], [W - 70, y2]], T.text, 2); text(g, tp === 'bidir' ? `DC link ${A.p.Vdc} V` : 'Load R', W - 60, (y1 + y2) / 2, { align: 'left', weight: 700 });
      flow(g, [[xs + 20, y1 - 18], [xe - 20, y1 - 18]], A.t, clamp(il / imx, -1, 1) * 0.8, il >= 0 ? T.cyan : T.green, { w: 1.5 });
      text(g, `${tp === 'rect' ? 'i_s' : 'i_L'} = ${il.toFixed(2)} A`, (xs + xe) / 2, y1 - 40, { weight: 800, color: T.cyan });
      text(g, on ? 'Switch ON – inductor charging' : 'Switch OFF – inductor discharging', 14, 18, { align: 'left', weight: 800, color: on ? T.green : T.orange });
      scope(g, W * 0.7, H * 0.4, W * 0.28, H * 0.35, [{ y: r.iL, c: T.cyan }], { cursor: k / r.S.length, label: 'i_L (2 periods)' });
    },
    viva: [['Why does a boost converter output exceed its input?', 'When the switch turns off, the inductor voltage adds to the input voltage; volt-second balance gives Vo = Vin/(1−D).'], ['What is DCM and when does it occur?', 'Inductor current reaches zero within a period; occurs at light load or small L.'], 'Why does the bidirectional converter use two active switches?', 'Why is a capacitor-filtered diode rectifier unacceptable for a charger?'],
    mcq: [{ q: 'A buck converter with D = 0.4 and Vin = 300 V gives (CCM)', o: ['120 V', '180 V', '500 V', '750 V'], a: 0 }, { q: 'Boost converter with D = 0.6 and Vin = 200 V', o: ['120 V', '333 V', '500 V', '80 V'], a: 2 }, { q: 'Regenerated energy flows from the DC link to the battery through the bidirectional converter operating as a', o: ['Boost', 'Buck', 'Rectifier', 'Cuk'], a: 1 }],
  },
  // =====================================================================================================
  {
    id: '3.2', kind: 'static', stageH: 320,
    aim: 'To study EV charger topologies: single- and two-stage, isolated and non-isolated, unidirectional and bidirectional.',
    objectives: ['Compare single-stage and two-stage charger structures.', 'Observe the effect of PFC on input current and power factor.', 'Compute DAB power transfer and LLC voltage gain.'],
    theory: `<p>A <b>two-stage</b> charger uses a front-end <b>PFC</b> (boost or totem-pole bridgeless) that draws sinusoidal current in phase with the grid voltage and regulates an intermediate DC bus (≈400 V), followed by an <b>isolated DC-DC</b> stage (LLC resonant or dual active bridge, DAB) that provides galvanic isolation and regulates battery current/voltage. A <b>single-stage</b> charger merges PFC and isolation (fewer components, but larger low-frequency ripple delivered to the battery). Non-isolated chargers are cheaper but need extra protection against earth faults. Bidirectional chargers use active switches on both sides (e.g. totem-pole PFC + DAB) to allow V2G.</p>
<p><b>DAB power</b>: $P = \\frac{nV_1V_2\\,\\varphi(\\pi-|\\varphi|)}{2\\pi^2 f_s L}$ – the sign of the phase shift φ sets the direction. <b>LLC gain</b> (first harmonic approximation) depends on normalised frequency $f_n = f_s/f_r$, inductance ratio $L_n = L_m/L_r$ and quality factor Q.</p>`,
    eqs: [['PF = \\frac{P}{V_{rms}I_{rms}} = \\cos\\phi\\,\\frac{1}{\\sqrt{1+THD^2}}', ''], ['P_{DAB} = \\frac{nV_1V_2\\,\\varphi(\\pi - |\\varphi|)}{2\\pi^2 f_s L}', ''], ['M_{LLC} = \\frac{L_n f_n^2}{\\sqrt{[(L_n+1)f_n^2 - 1]^2 + [f_n(f_n^2-1)L_nQ]^2}}', 'FHA']],
    params: [{ id: 'top', l: 'Topology', type: 'select', str: true, v: 'two', opts: [['single', 'Single-stage (isolated PFC)'], ['two', 'Two-stage: boost PFC + LLC (isolated)'], ['noniso', 'Non-isolated: PFC + buck'], ['bidir', 'Bidirectional: totem-pole PFC + DAB']] }, { id: 'pfc', l: 'PFC enabled', type: 'check', v: true }, { h: 'Dual active bridge' }, { id: 'phi', l: 'DAB phase shift φ', u: '°', min: -90, max: 90, step: 1, v: 30 }, { id: 'V1', l: 'DC bus V1', u: 'V', min: 300, max: 800, step: 10, v: 400 }, { id: 'V2', l: 'Battery V2', u: 'V', min: 200, max: 800, step: 10, v: 350 }, { id: 'Ld', l: 'DAB inductance', u: 'µH', min: 10, max: 200, step: 1, v: 40 }, { id: 'fd', l: 'DAB frequency', u: 'kHz', min: 20, max: 200, step: 5, v: 100 }, { h: 'LLC' }, { id: 'Ln', l: 'Ln = Lm/Lr', min: 2, max: 10, step: 0.5, v: 5 }, { id: 'Q', l: 'Quality factor Q', min: 0.1, max: 2, step: 0.05, v: 0.4 }],
    compute(p) {
      const r = rectifier({ Vrms: 230, f: 50, C: 1e-3, R: 80, Rs: 0.3, Ls: 1e-4 });
      const t = r.t, ipfc = t.map(tt => 15 * Math.sin(TAU * 50 * tt / 1000));
      const phi = p.phi * Math.PI / 180, Pd = p.V1 * p.V2 * phi * (Math.PI - Math.abs(phi)) / (2 * Math.PI ** 2 * p.fd * 1e3 * p.Ld * 1e-6) / 1000 * (p.V2 / p.V2);
      const fn = range(0.3, 2.5, 120), M = q => fn.map(f => p.Ln * f * f / Math.sqrt(((p.Ln + 1) * f * f - 1) ** 2 + (f * (f * f - 1) * p.Ln * q) ** 2));
      const phis = range(-90, 90, 91);
      return {
        kpis: [kv('Input PF', p.pfc ? 0.995 : r.PF, '', p.pfc ? 'good' : 'warn'), kv('Input current THD', p.pfc ? 3 : r.thd * 100, '%'), kv('DAB power', Pd, 'kW', Pd >= 0 ? 'acc' : 'good'), kv('Power direction', Pd >= 0 ? 'Grid → battery (G2V)' : 'Battery → grid (V2G)'), kv('Isolation', p.top === 'noniso' ? 'No' : 'Yes (HF transformer)'), kv('Stages', p.top === 'single' ? 1 : 2, '')],
        charts: [lc('pf', p.pfc ? 'Input current with PFC (sinusoidal, in phase)' : 'Input current without PFC (diode bridge + C)', 'Time (ms)', 'V, A×10', [S('v_s', t, r.vs), S('10·i_s', t, (p.pfc ? ipfc : r.is).map(x => 10 * x), { width: 2 })]), lc('dab', 'DAB power vs phase shift', 'φ (°)', 'kW', [S('P', phis, phis.map(d => { const f = d * Math.PI / 180; return p.V1 * p.V2 * f * (Math.PI - Math.abs(f)) / (2 * Math.PI ** 2 * p.fd * 1e3 * p.Ld * 1e-6) / 1000; }))], { marks: [{ x: p.phi, y: Pd }] }), lc('llc', 'LLC voltage gain (FHA)', 'f_s / f_r', 'Gain M', [S(`Q = ${p.Q}`, fn, M(p.Q), { width: 2.5 }), S('Q = 0.2', fn, M(.2), { dash: [4, 3] }), S('Q = 1', fn, M(1), { dash: [4, 3] })], { yr: [0, 2.5] })],
        obs: { cols: ['Topology', 'Stages', 'Isolation', 'Bidirectional', 'Pros', 'Cons'], rows: [['Single-stage', '1', 'Yes', 'Optional', 'Fewer parts, lower cost', '100 Hz ripple to battery, harder control'], ['Two-stage (PFC + LLC/DAB)', '2', 'Yes', 'With DAB', 'High PF, tight battery regulation, ZVS', 'More components'], ['Non-isolated (PFC + buck)', '2', 'No', 'Possible', 'Efficient, cheap', 'Safety/earth-fault concerns'], ['Bidirectional (totem-pole + DAB)', '2', 'Yes', 'Yes (V2G)', 'High efficiency, V2G', 'Complex control, SiC/GaN devices']] },
        steps: [['', `P_{DAB} = \\frac{${p.V1}\\times${p.V2}\\times${fmt(phi)}(\\pi - ${fmt(Math.abs(phi))})}{2\\pi^2\\times${p.fd}\\,kHz\\times${p.Ld}\\,\\mu H} = ${fmt(Pd)}\\,kW`]],
      };
    },
    draw(g, W, H, A) {
      const T = A.T, tp = A.p.top; const P = A.R.kpis ? A.R.kpis[2][1] : 1; const m = clamp(P / 20, -1, 1) || .3;
      const N = { grid: [.07, .5, .1, .2, 'Grid', 'AC', T.yellow], pfc: [.24, .5, .14, .24, tp === 'bidir' ? 'Totem-pole PFC' : 'Boost PFC', 'AC→DC, PF≈1', T.orange], bus: [.42, .5, .1, .2, 'DC bus', `${A.p.V1} V`, T.yellow], iso: [.6, .5, .15, .24, tp === 'bidir' ? 'DAB' : tp === 'noniso' ? 'Buck' : 'LLC', tp === 'noniso' ? 'non-isolated' : 'HF transformer', T.violet], batt: [.86, .5, .12, .24, 'Battery', `${A.p.V2} V`, T.green], one: [.42, .5, .3, .26, 'Isolated single-stage PFC', 'flyback / matrix', T.violet] };
      const nodes = tp === 'single' ? { grid: N.grid, one: N.one, batt: N.batt } : { grid: N.grid, pfc: N.pfc, bus: N.bus, iso: N.iso, batt: N.batt };
      const ord = Object.keys(nodes), mm = tp === 'bidir' ? m : Math.abs(m); const edges = ord.slice(0, -1).map((k, i) => [k, ord[i + 1], mm, mm >= 0 ? T.cyan : T.green]);
      blocks(g, W, H, A, nodes, edges);
      if (tp !== 'noniso') { g.setLineDash([4, 4]); line(g, [[W * (tp === 'single' ? .5 : .6), H * .2], [W * (tp === 'single' ? .5 : .6), H * .8]], T.red, 1.5); g.setLineDash([]); text(g, 'galvanic isolation', W * (tp === 'single' ? .5 : .6), H * .17, { color: T.red, size: 11 }); }
      text(g, tp === 'bidir' && m < 0 ? 'Power flow: battery → grid (V2G)' : 'Power flow: grid → battery', 14, 18, { align: 'left', weight: 800, color: m < 0 && tp === 'bidir' ? T.green : T.cyan });
    },
    viva: [['Why is PFC mandatory in chargers?', 'Grid codes (IEC 61000-3-2/-12) limit harmonic currents; PFC gives near-unity PF and low THD.'], ['How is power direction controlled in a DAB?', 'By the sign of the phase shift between the two bridges.'], 'Why use an LLC converter in the second stage?', 'What are the advantages of a two-stage charger?'],
    mcq: [{ q: 'In a DAB, power flows from bridge 1 to bridge 2 when bridge 1', o: ['Lags', 'Leads', 'Has higher frequency', 'Is off'], a: 1 }, { q: 'Galvanic isolation in a charger is provided by', o: ['PFC inductor', 'HF transformer', 'DC-link capacitor', 'Fuse'], a: 1 }],
  },
  // =====================================================================================================
  {
    id: '3.3', kind: 'static', view3d: (host, p) => carView(host, { mode: 'transparent', state: (pp) => ({ speed: pp.v / 3.6, flow: pp.T / 280 }) }), default3d: true, stageH: 440,
    aim: 'To study the complete electric drivetrain and the energy conversion through each component.',
    objectives: ['Identify battery, inverter, motor, gearbox, differential, drive shafts and wheels.', 'Compute voltage/current at electrical stages and torque/speed/power at mechanical stages.', 'Isolate components in 3D.'],
    theory: `<p>The <b>electric drivetrain</b> converts battery DC energy into tractive force: the inverter produces three-phase AC; the motor converts it to shaft torque; the single-speed <b>reduction gearbox</b> multiplies torque by G and divides speed; the <b>differential</b> splits torque between left and right wheels; the <b>drive shafts</b> carry it to the hubs; the <b>wheels</b> convert torque into force $F = T_w/r_w$. Integrated e-axles combine motor, inverter and gearbox in one housing. Use the 3D model (transparent view) to isolate any component, or the 2D view for the numbers at each stage.</p>`,
    eqs: [['T_w = G\\,\\eta_g\\,T_m,\\quad \\omega_w = \\omega_m/G', ''], ['T_{shaft} = T_w/2\\ (\\text{each side, open differential})', ''], ['F_t = T_w/r_w,\\quad P = T\\omega', ''], ['I_{dc} = \\frac{T_m\\omega_m}{\\eta_m\\eta_{inv}V_{dc}}', '']],
    params: [{ id: 'T', l: 'Motor torque', u: 'N·m', min: -280, max: 280, step: 5, v: 150 }, { id: 'v', l: 'Vehicle speed', u: 'km/h', min: 0, max: 150, step: 1, v: 60 }, { id: 'G', l: 'Gear ratio', min: 5, max: 14, step: .1, v: 9 }, { id: 'Vdc', l: 'Battery voltage', u: 'V', min: 200, max: 800, step: 10, v: 350 }, { id: 'eg', l: 'Gear+diff efficiency', min: .9, max: .99, step: .005, v: .97, d: 3 }, { id: 'em', l: 'Motor efficiency', min: .85, max: .97, step: .005, v: .93, d: 3 }, { id: 'ei', l: 'Inverter efficiency', min: .9, max: .99, step: .005, v: .97, d: 3 }],
    compute(p) {
      const r = 0.31, ww = p.v / 3.6 / r, wm = ww * p.G, Pm = p.T * wm, mot = Pm >= 0;
      const Pe = mot ? Pm / p.em : Pm * p.em, Pdc = mot ? Pe / p.ei : Pe * p.ei, Idc = Pdc / p.Vdc;
      const Tw = mot ? p.T * p.G * p.eg : p.T * p.G / p.eg, Ft = Tw / r, Vll = Math.min(p.Vdc * 0.707, 0.75 * wm * 4 * 0.09 * S3 / Math.SQRT2 + 20), Iph = Math.abs(Pe) / (S3 * Math.max(Vll, 1) * 0.92);
      const rows = [['Battery', `${p.Vdc} V`, `${fmt(Idc)} A`, `${fmt(Pdc / 1000)} kW`], ['Inverter output (AC)', `${fmt(Vll)} V_LL rms`, `${fmt(Iph)} A rms`, `${fmt(Pe / 1000)} kW`], ['Motor shaft', `${fmt(wm * 30 / Math.PI)} r/min`, `${fmt(p.T)} N·m`, `${fmt(Pm / 1000)} kW`], ['Gearbox + differential output', `${fmt(ww * 30 / Math.PI)} r/min`, `${fmt(Tw)} N·m`, `${fmt(Tw * ww / 1000)} kW`], ['Each drive shaft', `${fmt(ww * 30 / Math.PI)} r/min`, `${fmt(Tw / 2)} N·m`, `${fmt(Tw * ww / 2000)} kW`], ['Wheels (tractive force)', `${p.v} km/h`, `${fmt(Ft)} N`, `${fmt(Ft * p.v / 3.6 / 1000)} kW`]];
      return { kpis: [kv('Motor speed', wm * 30 / Math.PI, 'r/min'), kv('Motor power', Pm / 1000, 'kW', mot ? 'acc' : 'good'), kv('DC current', Idc, 'A'), kv('Wheel torque', Tw, 'N·m'), kv('Tractive force', Ft, 'N'), kv('Mode', mot ? 'Motoring' : 'Regenerating', '', mot ? 'acc' : 'good')], obs: { cols: ['Stage', 'Voltage / speed', 'Current / torque', 'Power'], rows }, _rows: rows, _m: mot };
    },
    draw(g, W, H, A) {
      const T = A.T, rows = A.R._rows; if (!rows) return; const m = A.R._m ? 1 : -1; const n = rows.length; const bw = W / n - 16;
      const P = Math.abs(A.R.kpis[1][1]) / 110;
      rows.forEach((r, i) => { const x = 8 + i * (bw + 16), y = H / 2 - 60; box(g, x, y, bw, 120, r[0], { color: i < 2 ? T.cyan : T.violet, active: true, size: 11.5 }); text(g, r[1], x + bw / 2, y + 80, { size: 11, color: T.muted }); text(g, r[2], x + bw / 2, y + 96, { size: 11, color: T.muted }); text(g, r[3], x + bw / 2, y + 140, { weight: 800, color: m > 0 ? T.cyan : T.green }); if (i < n - 1) flow(g, [[x + bw, H / 2], [x + bw + 16, H / 2]], A.t, m * (P + .1), m > 0 ? T.cyan : T.green, { w: 3, arrowAt: false }); });
      const ang = A.t * A.p.v / 3.6 / 0.31; gear(g, W * 0.58, 60, 22, 12, ang * A.p.G * 0.1, T.violet); gear(g, W * 0.58 + 50, 60, 34, 18, -ang * 0.1 * A.p.G * 12 / 18, T.violet); wheel(g, W - 50, 60, 30, ang);
      text(g, A.R._m ? 'Motoring: battery → wheels' : 'Regenerating: wheels → battery', 14, 18, { align: 'left', weight: 800 });
    },
    viva: ['Why is a differential needed?', 'What is an e-axle?', 'How does the gear ratio affect wheel torque and motor speed?'],
    mcq: [{ q: 'With T_m = 200 N·m, G = 9, η = 0.97, wheel torque is', o: ['1746 N·m', '1800 N·m', '206 N·m', '22 N·m'], a: 0 }],
  },
  // =====================================================================================================
  {
    id: '3.4', kind: 'sim', stageH: 320,
    aim: 'To study translational and rotational mechanical systems and their equivalence in an EV drivetrain.',
    objectives: ['Write Newton’s laws for linear and rotating systems.', 'Refer vehicle mass and load torque to the motor shaft through the gear.', 'Simulate acceleration of the linear and rotational systems.'],
    theory: `<p>A <b>translational</b> system obeys $F - F_f = m\\,dv/dt$; a <b>rotational</b> system obeys $T - T_f = J\\,d\\omega/dt$. Linear and angular motion are linked by $v = \\omega r$. Through a gear of ratio G (motor faster than wheel) the load seen by the motor is reduced: torque by G and inertia by G². The vehicle mass appears at the motor shaft as an equivalent inertia $J_{veh} = m r^2/G^2$, so the total</p>$$J_{eq} = J_m + \\frac{J_w}{G^2} + \\frac{m r_w^2}{G^2}.$$
<p>Friction is modelled as Coulomb + viscous: $T_f = T_c\\,\\mathrm{sgn}\\,\\omega + B\\omega$. Both systems below are integrated with the same 1 ms step and should give identical vehicle speeds when the equivalence is applied.</p>`,
    eqs: [['F = m\\frac{dv}{dt} + F_f,\\quad T = J\\frac{d\\omega}{dt} + B\\omega + T_c', ''], ['J_{eq} = J_m + \\frac{J_w + m r^2}{G^2},\\quad T_{L,m} = \\frac{T_{L,w}}{G\\eta}', 'Referred to motor shaft'], ['v = \\omega_w r = \\frac{\\omega_m r}{G}', '']],
    params: [{ id: 'm', l: 'Vehicle mass', u: 'kg', min: 500, max: 3000, step: 10, v: 1500 }, { id: 'Tm', l: 'Motor torque', u: 'N·m', min: 0, max: 300, step: 5, v: 150 }, { id: 'G', l: 'Gear ratio', min: 3, max: 14, step: .1, v: 9 }, { id: 'r', l: 'Wheel radius', u: 'm', min: .25, max: .4, step: .005, v: .31, d: 3 }, { id: 'Jm', l: 'Motor inertia Jm', u: 'kg·m²', min: .01, max: .5, step: .01, v: .05 }, { id: 'Jw', l: 'Wheels inertia Jw (total)', u: 'kg·m²', min: .5, max: 10, step: .1, v: 4 }, { id: 'Ff', l: 'Friction (rolling) force', u: 'N', min: 0, max: 600, step: 10, v: 180 }, { id: 'B', l: 'Viscous coefficient (motor)', u: 'N·m·s', min: 0, max: .05, step: .001, v: .005, d: 3 }],
    sim: {
      dt: 1e-3, timeScale: 1, sampleEvery: 0.05,
      init: () => ({ t: 0, v: 0, w: 0, x: 0 }),
      step(s, p, dt) {
        const eta = 0.97;
        // linear system with rotating masses lumped as equivalent mass
        const meq = p.m + (p.Jw + p.Jm * p.G * p.G) / (p.r * p.r);
        const F = p.Tm * p.G * eta / p.r - p.Ff * (s.v > 1e-4 || p.Tm * p.G * eta / p.r > p.Ff ? 1 : 0) - p.B * s.v / p.r * p.G * p.G / p.r;
        s.v = Math.max(0, s.v + F / meq * dt);
        // rotational system referred to the motor shaft
        const Jeq = p.Jm + (p.Jw + p.m * p.r * p.r) / (p.G * p.G) / eta, TL = p.Ff * p.r / (p.G * eta);
        const Tn = p.Tm - (s.w > 1e-4 || p.Tm > TL ? TL : p.Tm) - p.B * s.w; s.w = Math.max(0, s.w + Tn / Jeq * dt);
        s.x += s.v * dt; s.t += dt; if (s.t > 30) s.done = true;
      },
      done: s => s.done,
      sample: (s, p) => ({ kpis: [kv('Vehicle speed (linear model)', s.v * 3.6, 'km/h', 'acc'), kv('Speed from rotating model ωm r/G', s.w * p.r / p.G * 3.6, 'km/h'), kv('Motor speed', s.w * 30 / Math.PI, 'r/min'), kv('Equivalent inertia at motor', p.Jm + (p.Jw + p.m * p.r ** 2) / p.G ** 2, 'kg·m²'), kv('Equivalent mass', p.m + (p.Jw + p.Jm * p.G ** 2) / p.r ** 2, 'kg'), kv('Rotational mass factor δ', 1 + (p.Jw + p.Jm * p.G ** 2) / (p.r ** 2 * p.m), '')], push: { v: [s.t, s.v * 3.6, s.w * p.r / p.G * 3.6], w: [s.t, s.w * 30 / Math.PI] } }),
      charts: [{ id: 'v', title: 'Vehicle speed: linear vs rotational model', xl: 'Time (s)', yl: 'km/h', s: ['Linear (m_eq)', 'Rotational (J_eq)'], dashes: [[], [6, 4]] }, { id: 'w', title: 'Motor speed', xl: 'Time (s)', yl: 'r/min', s: ['n_m'] }],
    },
    compute: p => ({ steps: [['', `J_{eq} = ${p.Jm} + \\frac{${p.Jw} + ${p.m}\\times${p.r}^2}{${p.G}^2} = ${fmt(p.Jm + (p.Jw + p.m * p.r ** 2) / p.G ** 2)}\\,kg\\,m^2`], ['', `T_{L,m} = \\frac{${p.Ff}\\times${p.r}}{${p.G}\\times0.97} = ${fmt(p.Ff * p.r / (p.G * .97))}\\,N\\,m`]] }),
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T; const gy = H * 0.45;
      line(g, [[20, gy], [W / 2 - 20, gy]], T.muted, 2); const x = 40 + (s.x * 4) % (W / 2 - 160);
      rrect(g, x, gy - 50, 100, 50, 6); g.fillStyle = hex(T.blue, .4); g.fill(); g.strokeStyle = T.blue; g.stroke(); text(g, `m = ${A.p.m} kg`, x + 50, gy - 25, { weight: 700 });
      arrow(g, x + 100, gy - 25, x + 160, gy - 25, T.green, 3); text(g, 'F', x + 168, gy - 25, { color: T.green, weight: 800 }); arrow(g, x, gy - 10, x - 40, gy - 10, T.red, 2.5); text(g, 'F_f', x - 50, gy - 22, { color: T.red });
      text(g, 'Translational system', W / 4, 20, { weight: 800 }); text(g, `v = ${(s.v * 3.6).toFixed(1)} km/h`, W / 4, gy + 30, { color: T.cyan, weight: 700 });
      const cx = W * 0.7, cy = H * 0.42; const thm = s.x / A.p.r * A.p.G;
      gear(g, cx - 70, cy, 28, 12, thm, T.cyan); gear(g, cx + 10, cy, 28 * 2.2, Math.round(12 * 2.2), -thm / 2.2, T.violet); wheel(g, cx + 140, cy, 50, s.x / A.p.r);
      text(g, 'Rotational system (motor → gear → wheel)', cx + 30, 20, { weight: 800 }); text(g, `ω_m = ${(s.w * 30 / Math.PI).toFixed(0)} r/min`, cx - 70, cy + 70, { color: T.cyan, weight: 700 }); text(g, `ω_w = ${(s.w / A.p.G * 30 / Math.PI).toFixed(0)} r/min`, cx + 140, cy + 70, { color: T.violet, weight: 700 });
      text(g, `J_eq = ${fmt(A.p.Jm + (A.p.Jw + A.p.m * A.p.r ** 2) / A.p.G ** 2)} kg·m² at the motor shaft`, W / 2, H - 22, { weight: 700, color: T.yellow });
    },
    viva: [['How is vehicle mass reflected to the motor shaft?', 'As inertia m r²/G².'], ['Why does a high gear ratio reduce the inertia seen by the motor?', 'Reflected inertia scales with 1/G².'], 'Write the mechanical equation of a motor–load system.'],
    mcq: [{ q: 'Load inertia reflected through a gear of ratio G scales as', o: ['G', '1/G', 'G²', '1/G²'], a: 3 }],
  },
  loadsExp(), fourQExp(), imMotorExp(), imSteadyExp(), dvcExp(), ivcExp(), focIMExp(), leakageExp(), pmsmExp(), salientExp(), genericExp(), pmsmSteadyExp(), pmsmFocExp(),
];

// ===================================================================================================
function loadsExp() {
  return {
    id: '3.5', kind: 'static', stageH: 300,
    aim: 'To study load torque–speed characteristics and the steady-state operating point and stability of a motor–load system.',
    objectives: ['Plot constant-torque, constant-power, fan/pump and traction loads.', 'Find the operating point as the intersection with the motor characteristic.', 'Check steady-state stability.'],
    theory: `<p>Mechanical loads are classified by how their torque varies with speed: <b>constant torque</b> (hoists, conveyors, vehicle on a grade at low speed: $T_L = k$), <b>constant power</b> (winders, machine tools: $T_L = P/\\omega$), <b>fan/pump (variable torque)</b> ($T_L = k\\omega^2$, $P \\propto \\omega^3$) and the <b>vehicle traction load</b> $T_L = (F_{rr}+F_g + \\tfrac12\\rho C_dAv^2)r/G$ – a constant part plus a quadratic part. The operating point is where the motor and load torque curves intersect; it is <b>stable</b> if $\\frac{dT_L}{d\\omega} > \\frac{dT_m}{d\\omega}$ at that point.</p>`,
    eqs: [['T_L = k\\ |\\ \\frac{P}{\\omega}\\ |\\ k\\omega^2\\ |\\ T_0 + k_a\\omega^2', ''], ['\\frac{dT_L}{d\\omega} - \\frac{dT_m}{d\\omega} > 0 \\Rightarrow \\text{stable}', '']],
    params: [{ id: 'load', l: 'Load type', type: 'select', str: true, v: 'trac', opts: [['ct', 'Constant torque'], ['cp', 'Constant power'], ['fan', 'Fan / pump (T ∝ ω²)'], ['trac', 'Vehicle traction load']] }, { id: 'k', l: 'Load level', u: '%', min: 5, max: 150, step: 1, v: 50 }, { id: 'grade', l: 'Road grade (traction)', u: '%', min: 0, max: 30, step: 1, v: 8 }, { id: 'mot', l: 'Motor', type: 'select', str: true, v: 'pmsm', opts: [['pmsm', 'EV PMSM (280 N·m / 110 kW)'], ['im', 'Induction motor at 50 Hz (Ex.13)']] }, { id: 'thr', l: 'Torque command (PMSM)', u: '%', min: 10, max: 100, step: 1, v: 100 }],
    compute(p) {
      const n = range(1, p.mot === 'pmsm' ? 12600 : 1500, 400), w = n.map(x => x * Math.PI / 30);
      const Tm = p.mot === 'pmsm' ? w.map(x => motorTmax(x, REF4) * p.thr / 100) : n.map(x => imSteady(IM_EX13, (1500 - x) / 1500).Te);
      const base = p.mot === 'pmsm' ? 280 : 146;
      const TL = w.map(x => { const k = p.k / 100; if (p.load === 'ct') return k * base; if (p.load === 'cp') return Math.min(base * 1.5, k * base * w[w.length - 1] * .35 / x); if (p.load === 'fan') return k * base * (x / w[w.length - 1]) ** 2 * 1.5; const v = x / REF4.G * REF4.r, rl = roadLoad(v, 0, p.grade, REF4); return (rl.Fr + rl.Fa + rl.Fg) * REF4.r / (REF4.G * .97) * (p.k / 50); });
      let op = null; for (let i = 1; i < n.length; i++) { const d0 = Tm[i - 1] - TL[i - 1], d1 = Tm[i] - TL[i]; if (d0 > 0 && d1 <= 0) { const f = d0 / (d0 - d1); op = { n: n[i - 1] + f * (n[i] - n[i - 1]), T: TL[i - 1] + f * (TL[i] - TL[i - 1]), i }; break; } }
      let stable = null; if (op) { const i = op.i; const dTL = (TL[i] - TL[i - 1]) / (w[i] - w[i - 1]), dTm = (Tm[i] - Tm[i - 1]) / (w[i] - w[i - 1]); stable = dTL - dTm > 0; }
      return { kpis: [kv('Operating speed', op ? op.n : NaN, 'r/min', 'acc'), kv('Operating torque', op ? op.T : NaN, 'N·m'), kv('Power', op ? op.T * op.n * Math.PI / 30 / 1000 : NaN, 'kW'), kv('Stability', op ? (stable ? 'STABLE' : 'UNSTABLE') : 'no intersection', '', stable ? 'good' : 'bad')], charts: [lc('ts', 'Motor and load torque–speed characteristics', 'Speed (r/min)', 'Torque (N·m)', [S('Motor', n, Tm, { width: 2.5 }), S('Load', n, TL, { width: 2.5, color: '#f59e0b' })], { marks: op ? [{ x: op.n, y: op.T, label: 'operating point' }] : [], wide: true }), lc('ps', 'Load power vs speed', 'Speed (r/min)', 'kW', [S('P_L', n, TL.map((t, i) => t * w[i] / 1000))])], _op: op };
    },
    draw(g, W, H, A) { const T = A.T, op = A.R._op; const ang = A.t * (op ? op.n / 600 : 0); motorSym(g, W * .25, H / 2, 60, ang, 'Motor', T.cyan); line(g, [[W * .25 + 60, H / 2], [W * .6, H / 2]], T.muted, 6); const l = A.p.load; if (l === 'fan') { g.save(); g.translate(W * .7, H / 2); g.rotate(ang); for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.fillStyle = hex(T.orange, .7); g.beginPath(); g.ellipse(35, 0, 35, 12, 0, 0, 7); g.fill(); } g.restore(); } else if (l === 'trac') car2d(g, W * .75, H / 2 + 50, 200, ang * .1, '#2563eb'); else { gear(g, W * .7, H / 2, 50, 16, ang, T.orange); } text(g, op ? `${op.n.toFixed(0)} r/min, ${op.T.toFixed(0)} N·m` : 'Motor cannot drive this load', W / 2, 30, { weight: 800, color: op ? T.cyan : T.red }); },
    viva: ['How does the power of a fan load vary with speed?', 'Give an example of a constant-power load.', 'State the condition for steady-state stability.'],
    mcq: [{ q: 'Fan power varies with speed as', o: ['ω', 'ω²', 'ω³', 'constant'], a: 2 }, { q: 'A vehicle on a steep grade at low speed is mainly a', o: ['Constant-power load', 'Constant-torque load', 'Fan load', 'Zero load'], a: 1 }],
  };
}
function fourQExp() {
  const Q = [[1, 1, 'Q-I Forward motoring'], [-1, 1, 'Q-II Forward braking / regeneration'], [-1, -1, 'Q-III Reverse motoring'], [1, -1, 'Q-IV Reverse braking / regeneration']];
  return {
    id: '3.6', kind: 'sim', stageH: 420, autorun: true,
    aim: 'To demonstrate four-quadrant operation of an EV drive on the torque–speed plane.',
    objectives: ['Identify the sign of torque, speed and power in each quadrant.', 'Observe the operating point move between quadrants.', 'Relate quadrant to power flow between battery and motor.'],
    theory: `<p>An EV traction drive must operate in all <b>four quadrants</b> of the torque–speed plane. With speed ω and torque T: <b>Q-I</b> (T>0, ω>0) forward motoring; <b>Q-II</b> (T<0, ω>0) forward braking with regeneration; <b>Q-III</b> (T<0, ω<0) reverse motoring; <b>Q-IV</b> (T>0, ω<0) reverse braking. Mechanical power $P = T\\omega$ is positive (battery → wheels) in Q-I and Q-III and negative (wheels → battery) in Q-II and Q-IV. A VSI with a bidirectional DC source supports all four quadrants without extra hardware.</p>`,
    eqs: [['P_m = T_e\\,\\omega_m', '> 0 motoring, < 0 generating'], ['J\\frac{d\\omega}{dt} = T_e - T_L(\\omega)', '']],
    params: [{ id: 'auto', l: 'Automatic sequence Q-I → Q-II → Q-III → Q-IV', type: 'check', v: true }, { id: 'q', l: 'Quadrant (manual)', type: 'seg', v: 0, opts: Q.map((q, i) => [i, q[2].split(' ')[0]]) }, { id: 'T', l: 'Torque magnitude', u: 'N·m', min: 20, max: 280, step: 5, v: 200 }],
    tools: Q.map((q, i) => ({ l: q[2].split(' ').slice(0, 1).join(' ') + ' ' + q[2].split(' ').slice(1).join(' '), f: a => { a.set('auto', false); a.set('q', i); a.run(); } })),
    sim: {
      dt: 0.005, timeScale: 1, sampleEvery: 0.05, live: ['auto', 'q', 'T'],
      init: () => ({ t: 0, v: 0, T: 0, ph: 0, x: 0 }),
      step(s, p, dt) {
        const m = REF4.m * 1.05, r = REF4.r, G = REF4.G;
        let target = p.auto ? [0, 1, 2, 3][Math.floor(s.t / 8) % 4] : p.q;
        // choose torque sign by quadrant but ensure the speed sign condition is reached first
        const qd = Q[target]; const wantW = qd[1];
        let Tcmd;
        if (Math.sign(s.v) === wantW || Math.abs(s.v) < 0.05) Tcmd = qd[0] * p.T; else Tcmd = -Math.sign(s.v) * p.T;
        if (qd[0] !== qd[1] && Math.abs(s.v) < 0.3 && Math.sign(s.v) === wantW) Tcmd = 0; // braking quadrants end at standstill
        if ((target === 1 || target === 3) && Math.abs(s.v) < 0.05) { Tcmd = wantW * p.T; }
        s.T = Tcmd; const rl = roadLoad(s.v, 0, 0, REF4);
        s.v += (Tcmd * G * .97 / r - rl.Fr * Math.sign(s.v) - rl.Fa) / m * dt; s.v = clamp(s.v, -40 / 3.6, 120 / 3.6); s.x += s.v * dt; s.t += dt; s.q = target;
      },
      sample(s) { const w = s.v / REF4.r * REF4.G, P = s.T * w / 1000; const q = s.v >= 0 ? (s.T >= 0 ? 0 : 1) : (s.T < 0 ? 2 : 3); return { kpis: [kv('Torque', s.T, 'N·m'), kv('Speed', w * 30 / Math.PI, 'r/min'), kv('Mechanical power', P, 'kW', P >= 0 ? 'acc' : 'good'), kv('Power direction', P >= 0 ? 'Battery → wheels' : 'Wheels → battery'), kv('Operating mode', Q[q][2], '', P >= 0 ? 'acc' : 'good')], push: { tw: [s.t, s.T, w * 30 / Math.PI / 30], p: [s.t, P] } }; },
      charts: [{ id: 'tw', title: 'Torque and speed vs time', xl: 'Time (s)', yl: 'N·m, r/min÷30', s: ['T', 'n/30'] }, { id: 'p', title: 'Mechanical power (+ motoring, − regenerating)', xl: 'Time (s)', yl: 'kW', s: ['P'] }],
    },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T; const cx = W * 0.32, cy = H / 2, R = Math.min(W * 0.28, H * 0.42);
      const cols = [hex(T.cyan, .12), hex(T.green, .12), hex(T.cyan, .12), hex(T.green, .12)];
      [[1, -1], [-1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], k) => { g.fillStyle = cols[k]; g.fillRect(cx + (sx > 0 ? 0 : -R), cy + (sy > 0 ? 0 : -R), R, R); });
      arrow(g, cx - R - 10, cy, cx + R + 16, cy, T.text, 2); arrow(g, cx, cy + R + 10, cx, cy - R - 16, T.text, 2); text(g, 'Torque T', cx + R + 10, cy + 16, { align: 'right', color: T.muted }); text(g, 'Speed ω', cx + 10, cy - R - 12, { align: 'left', color: T.muted });
      text(g, 'Q-I  Forward motoring', cx + R / 2, cy - R + 18, { weight: 700, color: T.cyan, size: 11.5 }); text(g, 'Q-II  Forward braking', cx - R / 2, cy - R + 18, { weight: 700, color: T.green, size: 11.5 }); text(g, 'Q-III  Reverse motoring', cx - R / 2, cy + R - 14, { weight: 700, color: T.cyan, size: 11.5 }); text(g, 'Q-IV  Reverse braking', cx + R / 2, cy + R - 14, { weight: 700, color: T.green, size: 11.5 });
      const w = s.v / REF4.r * REF4.G; const px = cx + s.T / 280 * R, py = cy - w / 1300 * R;
      g.fillStyle = T.yellow; g.shadowColor = T.yellow; g.shadowBlur = 16; g.beginPath(); g.arc(px, py, 9, 0, 7); g.fill(); g.shadowBlur = 0;
      const P = s.T * w; const bx = W * 0.68; box(g, bx, 40, W * 0.28, 60, 'Battery', { color: T.green, active: true }); box(g, bx, H - 120, W * 0.28, 60, 'Motor / wheels', { color: T.cyan, active: true });
      flow(g, [[bx + W * .14, 100], [bx + W * .14, H - 120]], A.t, clamp(P / 80000, -1, 1), P >= 0 ? T.cyan : T.green, { w: 4 });
      car2d(g, bx + W * .14, H - 14, 160, s.x / .31, s.v < 0 ? '#a78bfa' : '#2563eb'); if (s.v < -0.1) text(g, '◀ reverse', bx + W * .14, H - 70, { color: T.violet, weight: 700 });
    },
    viva: [['In which quadrants is energy returned to the battery?', 'Q-II and Q-IV (torque opposes speed, P < 0).'], ['How does a VSI-fed PMSM enter Q-II?', 'The controller commands negative q-axis current; the inverter rectifies and power flows to the DC link.'], 'Why do braking quadrants end at zero speed?'],
    mcq: [{ q: 'Forward regenerative braking lies in quadrant', o: ['I', 'II', 'III', 'IV'], a: 1 }, { q: 'In quadrant III', o: ['T>0, ω>0', 'T<0, ω>0', 'T<0, ω<0', 'T>0, ω<0'], a: 2 }],
  };
}
function imMotorExp() {
  return {
    id: '3.7', kind: 'sim', view3d: (host) => motorView(host, { type: 'IM', poles: 4, state: (p, R, S) => S ? { thetaE: S.the, thetaM: S.thm, ia: Math.cos(S.the), ib: Math.cos(S.the - TAU / 3), ic: Math.cos(S.the + TAU / 3) } : {} }), default3d: true, stageH: 440, autorun: true,
    aim: 'To study the construction and working principle of the induction motor used in EV powertrains.',
    objectives: ['Identify stator, three-phase windings, rotor bars, end rings, air gap.', 'Visualise the rotating magnetic field produced by balanced three-phase currents.', 'Understand slip and induced rotor currents.'],
    theory: `<p>Three windings displaced by 120° in space and fed by currents displaced by 120° in time produce an MMF of constant amplitude rotating at <b>synchronous speed</b> $n_s = 120f/P$. The field cuts the <b>squirrel-cage rotor</b> bars (aluminium or copper, short-circuited by <b>end rings</b>) and induces EMFs and currents in them (Faraday), whose interaction with the field produces torque (Lorentz). The rotor must run slower than the field – the <b>slip</b> $s = (n_s - n_r)/n_s$ – otherwise no EMF is induced. Induction motors are robust, magnet-free and cheap, with good high-speed capability (no back-EMF problem), and were used in early Tesla Model S/X drives.</p>
<p>The animation is slowed down: the field (cyan arrow) rotates at the synchronous speed and the rotor at $(1-s)$ times that speed. In 2D the three phase MMF vectors and their resultant are shown.</p>`,
    eqs: [['n_s = \\frac{120 f}{P},\\quad s = \\frac{n_s - n_r}{n_s}', ''], ['f_r = s f', 'Rotor current frequency'], ['\\vec F(t) = F_a + aF_b + a^2F_c = \\tfrac32 F_m e^{j\\omega t}', 'Resultant rotating MMF']],
    params: [{ id: 'f', l: 'Supply frequency', u: 'Hz', min: 5, max: 100, step: 1, v: 50 }, { id: 'P', l: 'Number of poles', type: 'seg', v: 4, opts: [[2, '2'], [4, '4'], [6, '6'], [8, '8']] }, { id: 's', l: 'Slip', u: '%', min: 0, max: 100, step: 0.5, v: 4 }, { id: 'slow', l: 'Animation slow-down factor', min: 10, max: 200, step: 5, v: 50 }],
    sim: { dt: 1e-3, live: ['f', 's', 'slow', 'P'], sampleEvery: 0.02, init: () => ({ t: 0, the: 0, thm: 0 }), step(s, p, dt) { const we = TAU * p.f / p.slow; s.the += we * dt; s.thm += we / (p.P / 2) * (1 - p.s / 100) * dt * (p.P / 2); s.t += dt; }, sample: (s, p) => ({ kpis: [kv('Synchronous speed', 120 * p.f / p.P, 'r/min', 'acc'), kv('Rotor speed', 120 * p.f / p.P * (1 - p.s / 100), 'r/min'), kv('Slip speed', 120 * p.f / p.P * p.s / 100, 'r/min'), kv('Rotor frequency', p.s / 100 * p.f, 'Hz')], push: { i: [s.t, Math.cos(s.the), Math.cos(s.the - TAU / 3), Math.cos(s.the + TAU / 3)] } }), charts: [{ id: 'i', title: 'Stator phase currents (normalised, slowed time)', xl: 'Time (s)', yl: 'p.u.', s: ['i_a', 'i_b', 'i_c'], colors: PHC, max: 800 }] },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T; const cx = W * .3, cy = H / 2, R = Math.min(W * .22, H * .4);
      g.strokeStyle = T.line; g.lineWidth = 16; g.beginPath(); g.arc(cx, cy, R + 14, 0, 7); g.stroke(); g.lineWidth = 1;
      const slots = 24; for (let k = 0; k < slots; k++) { const a = k / slots * TAU, ph = Math.floor(k / (slots / 6)) % 3, sign = Math.floor(k / (slots / 6)) % 2 ? -1 : 1; const ic = Math.cos(s.the - ph * TAU / 3) * (Math.floor(k / (slots / 3)) % 2 ? -1 : 1); g.fillStyle = PHC[ph]; g.globalAlpha = .3 + .7 * Math.abs(ic); g.beginPath(); g.arc(cx + (R + 6) * Math.cos(a), cy - (R + 6) * Math.sin(a), 5, 0, 7); g.fill(); g.globalAlpha = 1; text(g, ic > 0 ? '•' : '×', cx + (R + 6) * Math.cos(a), cy - (R + 6) * Math.sin(a), { size: 9, color: '#000', weight: 800 }); }
      g.fillStyle = hex('#475569', .6); g.beginPath(); g.arc(cx, cy, R * .82, 0, 7); g.fill();
      for (let k = 0; k < 20; k++) { const a = s.thm + k / 20 * TAU; g.fillStyle = '#d97706'; g.beginPath(); g.arc(cx + R * .72 * Math.cos(a), cy - R * .72 * Math.sin(a), 4, 0, 7); g.fill(); }
      const fa = s.the / (A.p.P / 2); arrow(g, cx, cy, cx + R * .95 * Math.cos(fa), cy - R * .95 * Math.sin(fa), T.cyan, 4); text(g, 'Resultant field', cx + R * 1.05 * Math.cos(fa), cy - R * 1.05 * Math.sin(fa), { color: T.cyan, weight: 700, size: 11 });
      // phasor diagram of three MMFs
      const px = W * .75, py = H / 2, r2 = Math.min(W * .17, H * .35); g.strokeStyle = T.line; g.beginPath(); g.arc(px, py, r2, 0, 7); g.stroke();
      let sx = 0, sy = 0; [0, 1, 2].forEach(k => { const mag = Math.cos(s.the - k * TAU / 3) * .66, ax = k * TAU / 3; const vx = mag * Math.cos(ax), vy = mag * Math.sin(ax); arrow(g, px, py, px + vx * r2, py - vy * r2, PHC[k], 2); sx += vx; sy += vy; });
      arrow(g, px, py, px + sx * r2, py - sy * r2, T.cyan, 3.5); text(g, 'F_a + F_b + F_c = constant amplitude, rotating', px, py + r2 + 20, { size: 11.5, color: T.cyan });
      text(g, `n_s = ${(120 * A.p.f / A.p.P).toFixed(0)} r/min · rotor slower by ${A.p.s} % slip`, 14, 18, { align: 'left', weight: 800 });
    },
    viva: [['Why can an induction motor never run at synchronous speed on its own?', 'At zero slip no EMF is induced in the rotor, so there is no rotor current and no torque.'], ['What is the function of the end rings?', 'They short-circuit the rotor bars to form the cage.'], 'Calculate n_s for a 4-pole motor at 100 Hz.'],
    mcq: [{ q: 'A 4-pole motor on 50 Hz has synchronous speed', o: ['3000 r/min', '1500 r/min', '1000 r/min', '750 r/min'], a: 1 }, { q: 'At slip 4 % and 50 Hz, rotor current frequency is', o: ['50 Hz', '2 Hz', '48 Hz', '0 Hz'], a: 1 }],
  };
}
function imSteadyExp() {
  return {
    id: '3.8', kind: 'static', stageH: 300,
    aim: 'To analyse the steady-state performance of an induction motor drive using the per-phase equivalent circuit.',
    objectives: ['Compute currents, power factor, power flow, torque and efficiency at any slip.', 'Plot torque–speed, current and efficiency characteristics.', 'Study constant V/f operation and the effect of load torque.'],
    theory: `<p>The per-phase equivalent circuit (core loss neglected) consists of $R_s + jX_{ls}$ in series with the parallel combination of $jX_m$ and $R_r'/s + jX_{lr}'$. The air-gap power is $P_{ag} = 3I_r'^2R_r'/s$, the rotor copper loss $sP_{ag}$, the mechanical power $(1-s)P_{ag}$ and the torque $T = P_{ag}/\\omega_s$. Using the Thevenin equivalent seen from the rotor, the maximum (breakdown) torque occurs at $s_{max} = R_r'/\\sqrt{R_{th}^2 + (X_{th}+X_{lr}')^2}$. With constant V/f below base frequency the torque–speed curve shifts horizontally, keeping approximately constant breakdown torque.</p>
<p>Defaults are the machine of <b>Example 13</b> in the Unit 3 notes (400 V, 50 Hz, 4-pole, R<sub>s</sub>=0.2, R'<sub>r</sub>=0.18, X<sub>ls</sub>=0.5, X'<sub>lr</sub>=0.6, X<sub>m</sub>=18 Ω, P<sub>rot</sub>=800 W): at s = 3 % the model reproduces I<sub>s</sub> = 38.8 A, PF = 0.889, P<sub>ag</sub> = 23.0 kW.</p>`,
    eqs: [['\\bar Z = R_s + jX_{ls} + \\frac{jX_m(R_r^{\\prime}/s + jX_{lr}^{\\prime})}{R_r^{\\prime}/s + j(X_m + X_{lr}^{\\prime})}', ''], ['T = \\frac{3 I_r^{\\prime 2} R_r^{\\prime}}{s\\,\\omega_s}', ''], ['s_{max} = \\frac{R_r^{\\prime}}{\\sqrt{R_{th}^2 + (X_{th}+X_{lr}^{\\prime})^2}},\\quad T_{max} = \\frac{3V_{th}^2}{2\\omega_s[R_{th}+\\sqrt{R_{th}^2+(X_{th}+X_{lr}^{\\prime})^2}]}', '']],
    params: [{ id: 'V', l: 'Line voltage', u: 'V', min: 100, max: 500, step: 5, v: 400 }, { id: 'f', l: 'Frequency', u: 'Hz', min: 5, max: 100, step: 1, v: 50 }, { id: 'vf', l: 'Constant V/f below 50 Hz', type: 'check', v: true }, { id: 'P', l: 'Poles', type: 'seg', v: 4, opts: [[2, '2'], [4, '4'], [6, '6']] }, { id: 's', l: 'Slip', u: '%', min: 0.2, max: 100, step: 0.1, v: 3 }, { id: 'TL', l: 'Load torque (for operating point)', u: 'N·m', min: 0, max: 300, step: 1, v: 120 }, { h: 'Equivalent circuit' }, { id: 'Rs', l: 'Rs', u: 'Ω', min: .01, max: 2, step: .01, v: .2 }, { id: 'Rr', l: "R'r", u: 'Ω', min: .01, max: 2, step: .01, v: .18 }, { id: 'Xls', l: 'Xls', u: 'Ω', min: .05, max: 3, step: .05, v: .5 }, { id: 'Xlr', l: "X'lr", u: 'Ω', min: .05, max: 3, step: .05, v: .6 }, { id: 'Xm', l: 'Xm', u: 'Ω', min: 5, max: 60, step: 1, v: 18 }],
    compute(p) {
      const M = { V: 400, f: 50, poles: p.P, Rs: p.Rs, Rr: p.Rr, Xls: p.Xls, Xlr: p.Xlr, Xm: p.Xm, Prot: 800 };
      const V = p.vf && p.f < 50 ? p.V * p.f / 50 : p.V;
      const op = imSteady(M, p.s / 100, V, p.f); const th = imThevenin(Object.assign({}, M, { V }), p.f);
      const ss = range(1, -0.3, 300).filter(x => Math.abs(x) > 1e-4); const ns = 120 * p.f / p.P;
      const cur = ss.map(s => imSteady(M, s, V, p.f));
      const fam = [10, 25, 40, 50, 70].map(f => { const Vf = p.vf && f < 50 ? p.V * f / 50 : p.V; const n0 = 120 * f / p.P; const sl = range(1, 0.001, 150); return S(`${f} Hz`, sl.map(s => n0 * (1 - s)), sl.map(s => imSteady(M, s, Vf, f).Te), { width: f === p.f ? 2.6 : 1.2 }); });
      let opL = null; for (let i = cur.length - 1; i > 0; i--) { if (ss[i] > 0 && cur[i].Te < p.TL && cur[i - 1].Te >= p.TL && ss[i - 1] < th.smax * 1.0001 + 1e-9 + 1) { opL = { s: ss[i], n: ns * (1 - ss[i]), T: cur[i].Te }; break; } }
      return {
        kpis: [kv('Synchronous speed', ns, 'r/min'), kv('Rotor speed', ns * (1 - p.s / 100), 'r/min'), kv('Stator current', op.Is, 'A', 'acc'), kv('Rotor current', op.Ir, 'A'), kv('Power factor', op.PF, '', '', 3), kv('Torque', op.Te, 'N·m', 'acc'), kv('Air-gap power', op.Pag / 1000, 'kW'), kv('Output power', op.Pout / 1000, 'kW'), kv('Efficiency', op.eta * 100, '%'), kv('s at T_max', th.smax * 100, '%'), kv('T_max', th.Tmax, 'N·m', 'warn'), kv(`Speed at T_L = ${p.TL} N·m`, opL ? opL.n : NaN, 'r/min')],
        charts: [lc('ts', 'Torque–speed characteristic (motoring and generating)', 'Speed (r/min)', 'Torque (N·m)', [S('T_e', ss.map(s => ns * (1 - s)), cur.map(c => c.Te), { width: 2.4 }), S('Load', [0, ns * 1.3], [p.TL, p.TL], { dash: [4, 4], color: '#f59e0b' })], { marks: [{ x: ns * (1 - p.s / 100), y: op.Te, label: 'present slip' }] }), lc('ie', 'Stator current, PF and efficiency vs speed', 'Speed (r/min)', 'A, %', [S('I_s (A)', ss.map(s => ns * (1 - s)), cur.map(c => c.Is)), S('PF×100', ss.map(s => ns * (1 - s)), cur.map(c => c.PF * 100)), S('η (%)', ss.filter(s => s > 0).map(s => ns * (1 - s)), cur.filter((c, i) => ss[i] > 0).map(c => c.eta * 100))]), lc('vf', 'Constant V/f family of torque–speed curves', 'Speed (r/min)', 'Torque (N·m)', fam)],
        steps: [['', `V_s = ${fmt(V)}/\\sqrt3 = ${fmt(V / S3)}\\,V,\\quad Z_r = ${fmt(p.Rr / (p.s / 100))} + j${p.Xlr}\\,\\Omega`], ['', `|I_s| = ${fmt(op.Is)}\\,A,\\ PF = ${fmt(op.PF)}\\ \\text{lagging},\\ |I_r'| = ${fmt(op.Ir)}\\,A`], ['', `P_{ag} = 3\\times${fmt(op.Ir)}^2\\times${fmt(p.Rr / (p.s / 100))} = ${fmt(op.Pag / 1000)}\\,kW`], ['', `P_{rc} = sP_{ag} = ${fmt(op.Prc)}\\,W,\\ P_{mech} = ${fmt(op.Pmech / 1000)}\\,kW,\\ T = ${fmt(op.Te)}\\,N\\,m`], ['', `V_{th} = ${fmt(th.Vth)}\\,V,\\ s_{max} = ${fmt(th.smax)},\\ T_{max} = ${fmt(th.Tmax)}\\,N\\,m`]],
        obs: { cols: ['Slip (%)', 'Speed (r/min)', 'I_s (A)', 'PF', 'Torque (N·m)', 'P_out (kW)', 'η (%)'], rows: [1, 2, 3, 4, 5, 8, 12, 20, 50, 100].map(s => { const c = imSteady(M, s / 100, V, p.f); return [s, ns * (1 - s / 100), c.Is, c.PF, c.Te, c.Pout / 1000, c.eta * 100]; }) },
        _op: op,
      };
    },
    draw(g, W, H, A) {
      const T = A.T, p = A.p, op = A.R._op; if (!op) return; const y1 = 70, y2 = H - 50, x0 = 60;
      text(g, 'Per-phase equivalent circuit', 14, 18, { align: 'left', weight: 800 });
      g.strokeStyle = T.text; g.lineWidth = 2; g.beginPath(); g.arc(x0, (y1 + y2) / 2, 22, 0, 7); g.stroke(); text(g, '~', x0, (y1 + y2) / 2, { size: 20 }); text(g, `${fmt(p.V / S3)} V`, x0, (y1 + y2) / 2 + 40, { size: 11 });
      line(g, [[x0, y1], [x0, (y1 + y2) / 2 - 22]], T.text); line(g, [[x0, y2], [x0, (y1 + y2) / 2 + 22]], T.text);
      resistor(g, x0, y1, x0 + 120, T.orange, `Rs ${p.Rs} Ω`); inductor(g, x0 + 120, y1, x0 + 230, T.cyan, `jXls ${p.Xls}`);
      const xm = x0 + 260; line(g, [[x0 + 230, y1], [W - 60, y1]], T.text); line(g, [[xm, y1], [xm, (y1 + y2) / 2 - 30]], T.text); g.save(); g.translate(xm, (y1 + y2) / 2); g.rotate(Math.PI / 2); inductor(g, -30, 0, 30, T.violet, ''); g.restore(); text(g, `jXm ${p.Xm}`, xm + 14, (y1 + y2) / 2, { align: 'left', size: 11.5, color: T.violet }); line(g, [[xm, (y1 + y2) / 2 + 30], [xm, y2]], T.text);
      inductor(g, xm + 60, y1, xm + 170, T.cyan, `jX'lr ${p.Xlr}`); g.fillStyle = T.panel; const xr = W - 60; line(g, [[xr, y1], [xr, (y1 + y2) / 2 - 30]], T.text); g.save(); g.translate(xr, (y1 + y2) / 2); g.rotate(Math.PI / 2); resistor(g, -30, 0, 30, T.orange, ''); g.restore(); text(g, `R'r/s = ${fmt(p.Rr / (p.s / 100))} Ω`, xr - 10, (y1 + y2) / 2, { align: 'right', size: 11.5, color: T.orange }); line(g, [[xr, (y1 + y2) / 2 + 30], [xr, y2]], T.text); line(g, [[x0, y2], [xr, y2]], T.text);
      flow(g, [[x0 + 10, y1 - 14], [xm - 10, y1 - 14]], A.t, .5, T.yellow, { w: 1 }); text(g, `I_s = ${fmt(op.Is)} A`, (x0 + xm) / 2, y1 - 30, { color: T.yellow, weight: 700 });
      flow(g, [[xm + 20, y1 - 14], [xr - 10, y1 - 14]], A.t, .45, T.green, { w: 1 }); text(g, `I'r = ${fmt(op.Ir)} A`, (xm + xr) / 2, y1 - 30, { color: T.green, weight: 700 });
      text(g, `P_ag = ${fmt(op.Pag / 1000)} kW → P_mech = ${fmt(op.Pmech / 1000)} kW, T = ${fmt(op.Te)} N·m`, W / 2, y2 + 24, { weight: 700, color: T.cyan });
    },
    viva: [['Why is R’r/s used in the rotor branch?', 'It represents both rotor copper loss (R’r) and mechanical power R’r(1−s)/s.'], ['How does constant V/f keep breakdown torque constant?', 'Air-gap flux ∝ V/f stays constant, so T_max ≈ constant (except at low f where Rs drop matters).'], 'What is the region of stable operation?'],
    mcq: [{ q: 'Rotor copper loss equals', o: ['P_ag', 'sP_ag', '(1−s)P_ag', 'P_ag/s'], a: 1 }, { q: 'Slip at maximum torque is proportional to', o: ['R’r', 'Xm', 'Rs only', 'V'], a: 0 }],
  };
}
// -------------------- IM vector control family (3.9 – 3.11) --------------------
function imSim(mode, extra = {}) {
  return {
    dt: mode === 'DTC' ? 25e-6 : 50e-6, timeScale: 0.25, sampleEvery: 2e-3, maxSteps: 20000, live: ['wref', 'TL', 'kpw', 'kiw', 'bw', 'rr'],
    init(p) { const d = new IMDrive(IM_TRACTION, { mode, psiRef: 0.2, rrErr: (p.rr || 0) / 100 }); d.premagnetize(); return { d, t: 0, ns: 0 }; },
    step(s, p, dt) { const d = s.d; d.c.wRef = p.wref * Math.PI / 30; d.c.TL = p.TL; if (p.kpw !== undefined) { d.c.kpw = p.kpw; d.c.kiw = p.kiw; } if (p.bw) d.c.bwI = p.bw; d.c.rrErr = (p.rr || 0) / 100; d.step(dt); s.t += dt; },
    sample(s, p) {
      const d = s.d, ab = d.iabc; const mode = d.c.mode;
      return { kpis: [kv('Speed', d.wm * 30 / Math.PI, 'r/min', 'acc'), kv('Speed ref', p.wref, 'r/min'), kv('Torque Te', d.Te, 'N·m'), kv('Torque ref', d.Teref, 'N·m'), kv('Rotor flux |ψr|', d.psiR, 'Wb', '', 3), kv(mode === 'DTC' ? 'Stator flux est.' : 'Flux estimate', mode === 'DTC' ? d.psiS : d.psiHat, 'Wb', '', 3), kv('i_d', d.id, 'A'), kv('i_q', d.iq, 'A'), ...(mode === 'DTC' ? [kv('Sector', d.sector, ''), kv('Voltage vector', `V${d.dtcVec}`, ''), kv('Avg switching freq', s.t > 0 ? d.nsw / 6 / s.t : 0, 'Hz')] : [kv('Slip frequency', (d.wsl || 0) / TAU, 'Hz'), kv('Pull-out-safe', 'yes')])],
        push: { w: [s.t, d.wm * 30 / Math.PI, p.wref], T: [s.t, d.Te, d.Teref], f: [s.t, d.psiR, mode === 'DTC' ? d.psiS : d.psiHat], iabc: [s.t, ab.a, ab.b, ab.c], dq: [s.t, d.id, d.iq] } };
    },
    charts: [{ id: 'w', title: 'Speed: actual and reference', xl: 'Time (s)', yl: 'r/min', s: ['n', 'n*'], dashes: [[], [5, 4]] }, { id: 'T', title: 'Electromagnetic torque and reference', xl: 'Time (s)', yl: 'N·m', s: ['Te', 'Te*'], dashes: [[], [5, 4]] }, { id: 'f', title: 'Flux magnitude', xl: 'Time (s)', yl: 'Wb', s: ['|ψr| actual', mode === 'DTC' ? '|ψs| estimated' : '|ψr| estimated'] }, { id: 'dq', title: 'd-q currents', xl: 'Time (s)', yl: 'A', s: ['i_d', 'i_q'] }, { id: 'iabc', title: 'Three-phase stator currents', xl: 'Time (s)', yl: 'A', s: ['i_a', 'i_b', 'i_c'], colors: PHC, max: 3000 }],
    ...extra,
  };
}
function imParams(o = {}) { return [{ id: 'wref', l: 'Speed reference', u: 'r/min', min: -4000, max: 6000, step: 50, v: o.w ?? 2000 }, { id: 'TL', l: 'Load torque', u: 'N·m', min: -150, max: 200, step: 5, v: o.TL ?? 50 }, { id: 'kpw', l: 'Speed PI Kp', min: 0.5, max: 30, step: 0.5, v: 6 }, { id: 'kiw', l: 'Speed PI Ki', min: 0, max: 600, step: 5, v: 120 }, ...(o.extra || [])]; }
function dvcExp() {
  return {
    id: '3.9', kind: 'sim', stageH: 300,
    aim: 'To study direct vector control (flux-angle from a flux estimator) and direct torque control (hysteresis comparators + switching table) of an induction motor.',
    objectives: ['Estimate flux and torque from terminal quantities.', 'Observe hysteresis comparators and switching-table vector selection (DTC).', 'Compare flux and torque responses of DFOC and DTC.'],
    theory: `<p>In <b>direct vector control</b> the rotor-flux angle used for the Park transformation is obtained directly from a flux estimator (or sensor). Here a current-model estimator in the stationary frame $\\dot{\\hat\\psi}_r = \\frac{L_m}{\\tau_r}i_s - \\frac{1}{\\tau_r}\\hat\\psi_r + j\\omega_r\\hat\\psi_r$ gives $\\theta_e = \\angle\\hat\\psi_r$.</p>
<p>In <b>direct torque control (DTC)</b> the stator flux is estimated by the voltage model $\\hat\\psi_s = \\int(v_s - R_si_s)dt$ and the torque by $T_e = \\tfrac32p(\\psi_{s\\alpha}i_{s\\beta} - \\psi_{s\\beta}i_{s\\alpha})$. Two hysteresis comparators (flux: two-level, torque: three-level) and the flux sector index select one of the eight inverter voltage vectors from the classical <b>switching table</b>: e.g. in sector k, increase flux and torque → $V_{k+1}$; decrease flux, increase torque → $V_{k+2}$; zero torque error → zero vector. DTC needs no current controllers or PWM modulator; it has fast torque response but variable switching frequency and torque ripple. The torque command is limited below the stator-flux pull-out torque.</p>`,
    eqs: [['\\hat\\psi_s = \\int (v_s - R_s i_s)\\,dt', 'Voltage model'], ['\\hat T_e = \\tfrac32 p\\,(\\hat\\psi_{s\\alpha} i_{s\\beta} - \\hat\\psi_{s\\beta} i_{s\\alpha})', ''], ['V = \\text{table}(H_\\psi, H_T, \\text{sector})', 'Switching table']],
    params: [{ id: 'mode', l: 'Method', type: 'seg', str: true, v: 'DTC', opts: [['DFOC', 'Direct FOC (flux estimator)'], ['DTC', 'Direct torque control']] }, ...imParams({ w: 1500, TL: 60 })],
    tools: [{ l: 'Load step +100 N·m', f: a => a.set('TL', 100) }, { l: 'Speed reversal', f: a => a.set('wref', -a.p.wref) }],
    sim: null,
    view: null,
    compute(p) { return { html: p.mode === 'DTC' ? '<div class="note">DTC switching table (sector k): flux↑ torque↑ → V<sub>k+1</sub>; flux↓ torque↑ → V<sub>k+2</sub>; flux↑ torque↓ → V<sub>k−1</sub>; flux↓ torque↓ → V<sub>k−2</sub>; torque within band → V<sub>0</sub>/V<sub>7</sub>.</div>' : '' }; },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const d = s.d, T = A.T;
      if (A.p.mode === 'DTC') {
        driveBlocks(g, W, H, A, [['Speed PI', 'T*', T.violet], ['Torque comparator', `H_T = ${d.Teref - d.TeHat > 2 ? '+1' : d.Teref - d.TeHat < -2 ? '−1' : '0'}`, T.orange], ['Flux comparator', `H_ψ = ${d.fF}`, T.orange], ['Switching table', `sector ${d.sector} → V${d.dtcVec}`, T.green], ['VSI', `(${d.S.join('')})`, T.cyan], ['IM', '', T.cyan], ['ψ, T estimator', 'voltage model', T.pink]]);
        const cx = W * .25, cy = H * .63, R = Math.min(90, H * .3); vecPlot(g, cx, cy, R, A, [[d.psaH / .25, d.psbH / .25, T.green, 'ψ̂s'], [d.pra / .25, d.prb / .25, T.cyan, 'ψr']]);
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const on = d.dtcVec === k + 1; arrow(g, cx, cy, cx + R * .8 * Math.cos(a), cy - R * .8 * Math.sin(a), on ? T.yellow : hex(T.muted, .3), on ? 2.5 : 1); }
        const tx = W * .5; text(g, 'Switching table (rows: H_ψ, H_T)', tx, H * .4, { align: 'left', weight: 700 });
        const tab = [['1, +1', 'V k+1'], ['1, 0', 'V0/V7'], ['1, −1', 'V k−1'], ['0, +1', 'V k+2'], ['0, 0', 'V0/V7'], ['0, −1', 'V k−2']];
        const HT = d.Teref - d.TeHat > 2 ? '+1' : d.Teref - d.TeHat < -2 ? '−1' : '0';
        tab.forEach(([c, v], k) => { const y = H * .46 + k * 22; const on = c === `${d.fF}, ${HT}`; g.fillStyle = on ? hex(T.green, .25) : 'transparent'; g.fillRect(tx, y - 10, 260, 20); text(g, c, tx + 8, y, { align: 'left', color: on ? T.green : T.muted }); text(g, v, tx + 120, y, { align: 'left', color: on ? T.green : T.muted, weight: 700 }); });
      } else {
        driveBlocks(g, W, H, A, [['Speed PI', `T* = ${d.Teref.toFixed(0)}`, T.violet], ['i_d*, i_q*', `${d.idRef.toFixed(0)}, ${d.iqRef.toFixed(0)} A`, T.violet], ['Current PI', 'd-q + decoupling', T.orange], ['dq→αβ', `θ = ${((d.the % TAU + TAU) % TAU * 180 / Math.PI).toFixed(0)}°`, T.orange], ['VSI', '', T.cyan], ['IM', '', T.cyan], ['Flux estimator', 'θe = ∠ψ̂r', T.pink]]);
        vecPlot(g, W * .3, H * .63, Math.min(90, H * .3), A, [[d.praH / .25, d.prbH / .25, T.pink, 'ψ̂r'], [d.pra / .25, d.prb / .25, T.cyan, 'ψr'], [d.isa / 400, d.isb / 400, T.orange, 'is']], d.the);
      }
    },
    viva: [['How does DTC differ from FOC?', 'DTC directly selects inverter voltage vectors from flux/torque errors via hysteresis and a table; FOC regulates d-q currents with PI controllers and a PWM modulator.'], ['Why is the torque command limited in DTC?', 'Beyond the pull-out torque for the given stator flux the flux vector cannot hold synchronism and torque collapses.'], 'What causes torque ripple in DTC?', 'What does the flux estimator need in direct FOC?'],
    mcq: [{ q: 'In DTC, if flux must increase and torque must increase in sector k, the vector applied is', o: ['V k−1', 'V k+1', 'V k+2', 'zero vector'], a: 1 }, { q: 'DTC uses', o: ['PI current controllers', 'Hysteresis comparators and a switching table', 'A carrier', 'Rotor position encoder only'], a: 1 }],
  };
}
function ivcExp() {
  return {
    id: '3.10', kind: 'sim', stageH: 300,
    aim: 'To study indirect (feed-forward slip) vector control of an induction motor and the effect of rotor time-constant detuning.',
    objectives: ['Compute slip frequency and flux angle from the references.', 'Observe decoupled flux and torque control in the synchronous frame.', 'Study detuning when the rotor resistance changes.'],
    theory: `<p>Indirect field orientation does not estimate the flux; it imposes the <b>slip frequency</b> required for rotor-flux orientation. With $\\psi_r = L_m i_{ds}$ in steady state, $\\omega_{sl} = \\frac{L_m i_{qs}^*}{\\tau_r \\psi_r^*}$ and the flux angle is $\\theta_e = \\int(\\omega_r + \\omega_{sl})dt$ where $\\omega_r = p\\omega_m$ from the encoder. The method is simple and works down to zero speed, but depends on the rotor time constant $\\tau_r = L_r/R_r$; if $R_r$ rises with temperature and the controller is not updated, the orientation is lost and torque and flux deviate from their references (detuning). Click the block diagram blocks for explanations.</p>`,
    eqs: [['\\omega_{sl}^* = \\frac{L_m}{\\tau_r}\\frac{i_{qs}^*}{\\psi_r^*} = \\frac{1}{\\tau_r}\\frac{i_{qs}^*}{i_{ds}^*}', ''], ['\\theta_e = \\int (p\\,\\omega_m + \\omega_{sl}^*)\\,dt', ''], ['T_e = \\tfrac32 p \\frac{L_m}{L_r}\\psi_r i_{qs}', '']],
    params: [...imParams({ w: 2500, TL: 100 }), { id: 'rr', l: 'Rotor resistance change (not known to controller)', u: '%', min: -40, max: 80, step: 5, v: 0 }],
    tools: [{ l: 'Rr +30 % (heating)', f: a => a.set('rr', 30) }, { l: 'Tuned (0 %)', f: a => a.set('rr', 0) }],
    sim: null,
    click(id, api) { const D = { 'Speed PI': 'Generates the torque reference from the speed error.', 'i_ds* / i_qs*': 'Flux-producing and torque-producing current references: i_ds* = ψr*/Lm, i_qs* = T*/(1.5 p (Lm/Lr) ψr*).', 'Slip calc.': 'ω_sl* = Lm i_qs*/(τr ψr*): the slip that guarantees rotor-flux orientation.', '∫ θe': 'Integrates rotor electrical speed plus slip to obtain the flux angle θe.', 'Current PI': 'PI controllers in the synchronous frame regulate i_ds, i_qs; feed-forward decoupling cancels cross-coupling.', 'VSI + IM': 'The inverter applies the commanded voltages to the motor (average model).', Encoder: 'Measures rotor mechanical speed ωm; ωr = p ωm.' }; if (id && D[id]) api.toast(`${id}: ${D[id]}`, 6000); },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const d = s.d, T = A.T;
      driveBlocks(g, W, H, A, [['Speed PI', `T* = ${d.Teref.toFixed(0)} N·m`, T.violet], ['i_ds* / i_qs*', `${d.idRef.toFixed(0)} / ${d.iqRef.toFixed(0)} A`, T.violet], ['Slip calc.', `ω_sl = ${(d.wsl || 0).toFixed(1)} rad/s`, T.pink], ['∫ θe', `${((d.the % TAU + TAU) % TAU * 180 / Math.PI).toFixed(0)}°`, T.pink], ['Current PI', 'decoupled', T.orange], ['VSI + IM', '', T.cyan], ['Encoder', `${(d.wm * 30 / Math.PI).toFixed(0)} r/min`, T.green]]);
      const ang = Math.atan2(d.prb, d.pra); const err = ((ang - d.the + Math.PI) % TAU + TAU) % TAU - Math.PI;
      vecPlot(g, W * .25, H * .64, Math.min(90, H * .3), A, [[d.pra / .25, d.prb / .25, T.cyan, 'ψr (actual)'], [d.isa / 400, d.isb / 400, T.orange, 'is']], d.the);
      text(g, `Orientation error ∠ψr − θe = ${(err * 180 / Math.PI).toFixed(1)}°`, W * .55, H * .55, { align: 'left', weight: 800, color: Math.abs(err) > .05 ? T.red : T.green });
      text(g, `|ψr| = ${d.psiR.toFixed(3)} Wb (ref 0.200)`, W * .55, H * .55 + 26, { align: 'left', color: T.muted }); text(g, A.p.rr ? `Controller uses nominal Rr; actual Rr ${A.p.rr > 0 ? '+' : ''}${A.p.rr} % ⇒ detuned` : 'Controller tuned (τr correct)', W * .55, H * .55 + 50, { align: 'left', color: A.p.rr ? T.orange : T.green });
    },
    viva: [['Why is indirect vector control sensitive to rotor resistance?', 'The slip calculation uses τr = Lr/Rr; wrong Rr gives a wrong slip and the flux is no longer aligned with the d axis.'], ['Compare direct and indirect vector control.', 'Direct: flux angle from sensor/estimator; indirect: from slip feed-forward and speed sensor.'], 'Compute ω_sl for Example 17.'],
    mcq: [{ q: 'In IFOC, θe is obtained from', o: ['Hall flux sensors', '∫(ωr + ω_sl)', 'Voltage model', 'Back-EMF zero crossings'], a: 1 }],
    numericals: [['Example 17: ψr = 0.2 Wb, ids = 50 A, iqs = 262.5 A, Lm = 4 mH, Lr = 4.2 mH, Rr = 0.012 Ω, ωm = 300 rad/s, p = 2. Find ω_sl and ωe.', 'τr = 0.35 s; ω_sl = (1/0.35)(262.5/50) = 15 rad/s; ωe = 600 + 15 = 615 rad/s (97.9 Hz).']],
  };
}
function focIMExp() {
  return {
    id: '3.11', kind: 'sim', stageH: 320,
    aim: 'To implement field-oriented control of an induction motor with Clarke and Park transformations and PI current and speed controllers.',
    objectives: ['Observe Clarke (abc→αβ) and Park (αβ→dq) transformations live.', 'Tune PI controllers.', 'Apply speed and load-torque steps and observe Id, Iq, torque, speed, flux and phase currents.'],
    theory: `<p>FOC transforms the stator currents into a frame rotating with the rotor flux. In that frame the flux-producing current $i_d$ and torque-producing current $i_q$ are DC quantities and decoupled, like the field and armature currents of a DC motor: $T_e = \\tfrac32p\\frac{L_m}{L_r}\\psi_r i_q$, $\\tau_r\\dot\\psi_r + \\psi_r = L_m i_d$.</p>
<p>Signal chain: measured $i_{abc}$ → <b>Clarke</b> → $i_{\\alpha\\beta}$ → <b>Park</b>(θe) → $i_{dq}$ → <b>PI controllers</b> (+ decoupling feed-forward) → $v_{dq}^*$ → <b>inverse Park</b> → $v_{\\alpha\\beta}^*$ → <b>PWM</b> (SVPWM) → three-phase inverter → motor. A speed PI loop generates $i_q^*$; $i_d^*$ sets the flux. Here θe is obtained by the indirect method.</p>`,
    eqs: [['i_\\alpha = \\tfrac{2}{3}(i_a - \\tfrac12 i_b - \\tfrac12 i_c),\\; i_\\beta = \\tfrac{1}{\\sqrt3}(i_b - i_c)', 'Clarke'], ['i_d = i_\\alpha\\cos\\theta + i_\\beta\\sin\\theta,\\; i_q = -i_\\alpha\\sin\\theta + i_\\beta\\cos\\theta', 'Park'], ['v_d^* = PI(i_d^*-i_d) - \\omega_e\\sigma L_s i_q,\\; v_q^* = PI(i_q^*-i_q) + \\omega_e\\sigma L_s i_d + \\omega_e\\frac{L_m}{L_r}\\psi_r', 'Decoupled current control']],
    params: [...imParams({ w: 2000, TL: 80 }), { id: 'bw', l: 'Current-loop bandwidth', u: 'rad/s', min: 200, max: 4000, step: 50, v: 1500 }],
    tools: [{ l: 'Speed step 1000 → 4000', f: a => a.set('wref', a.p.wref > 2500 ? 1000 : 4000) }, { l: 'Load torque step', f: a => a.set('TL', a.p.TL > 60 ? 20 : 150) }],
    sim: null,
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const d = s.d, T = A.T, ab = d.iabc, Imx = 400;
      driveBlocks(g, W, H, A, [['Speed PI', `i_q* ${d.iqRef.toFixed(0)} A`, T.violet], ['Current PI', `v_d ${d.vd.toFixed(0)}, v_q ${d.vq.toFixed(0)}`, T.orange], ['Inverse Park', 'dq→αβ', T.orange], ['SVPWM + VSI', '', T.cyan], ['IM', `${(d.wm * 30 / Math.PI).toFixed(0)} r/min`, T.cyan], ['Clarke', 'abc→αβ', T.pink], ['Park', 'αβ→dq', T.pink]]);
      const y = H * .62, R = Math.min(70, H * .25);
      // abc bars
      [ab.a, ab.b, ab.c].forEach((v, k) => { const x = 40 + k * 30; g.fillStyle = PHC[k]; const hh = v / Imx * R; g.fillRect(x, y - Math.max(0, hh), 20, Math.abs(hh)); text(g, 'abc'[k], x + 10, y + R + 14, { size: 11, color: PHC[k] }); }); line(g, [[30, y], [140, y]], T.muted, 1);
      text(g, 'i_abc', 85, y - R - 14, { weight: 700 }); arrow(g, 150, y, 190, y, T.muted, 1.5); text(g, 'Clarke', 170, y - 12, { size: 10.5, color: T.pink });
      vecPlot(g, 290, y, R, A, [[d.isa / Imx, d.isb / Imx, T.orange, 'i_s']]); text(g, 'αβ (stationary)', 290, y + R + 22, { size: 11, color: T.muted });
      arrow(g, 380, y, 430, y, T.muted, 1.5); text(g, 'Park θe', 405, y - 12, { size: 10.5, color: T.pink });
      vecPlot(g, 530, y, R, A, [[d.isa / Imx, d.isb / Imx, T.orange, 'i_s'], [d.pra / .25, d.prb / .25, T.cyan, 'ψr']], d.the); text(g, 'dq frame rotates with ψr', 530, y + R + 22, { size: 11, color: T.muted });
      const bx = 640; [['i_d', d.id, T.yellow], ['i_q', d.iq, T.pink]].forEach(([l, v], k) => { g.fillStyle = hex(v >= 0 ? (k ? T.pink : T.yellow) : T.red, .7); const hh = v / Imx * R; g.fillRect(bx + k * 50, y - Math.max(0, hh), 30, Math.abs(hh)); text(g, `${l} = ${v.toFixed(0)} A`, bx + 15 + k * 50, y + R + 14, { size: 11, weight: 700 }); }); line(g, [[bx - 6, y], [bx + 86, y]], T.muted, 1); text(g, 'DC quantities', bx + 40, y - R - 14, { weight: 700 });
    },
    viva: [['Why are id and iq DC in steady state?', 'The dq frame rotates synchronously with the current/flux vectors, so constant-amplitude sinusoids appear as constants.'], ['What is the purpose of decoupling feed-forward terms?', 'To cancel the speed-dependent cross-coupling between d and q axes so each PI loop sees a simple RL plant.'], 'How is flux weakened above base speed?', 'What happens if the current bandwidth is too low?'],
    mcq: [{ q: 'In rotor-flux-oriented FOC, torque is proportional to', o: ['i_d only', 'ψr · i_q', 'i_a', 'v_d'], a: 1 }, { q: 'The Park transformation requires', o: ['Rotor resistance', 'The reference-frame angle θ', 'DC-link voltage', 'Slip only'], a: 1 }],
  };
}
function leakageExp() {
  return {
    id: '3.12', kind: 'static', stageH: 300,
    aim: 'To study the induction-machine model with leakage inductances, flux-linkage equations and their effect on machine characteristics.',
    objectives: ['Relate self, mutual and leakage inductances.', 'Compute the leakage coefficient σ and the flux linkages.', 'Observe the effect of leakage on torque–speed and transient inductance.'],
    theory: `<p>Each winding's flux has a <b>mutual</b> part linking both stator and rotor (magnetising inductance $L_m$) and a <b>leakage</b> part linking only itself ($L_{ls}$, $L_{lr}$): $L_s = L_{ls} + L_m$, $L_r = L_{lr} + L_m$. In the dq frame</p>$$\\psi_{ds} = L_si_{ds} + L_mi_{dr},\\; \\psi_{dr} = L_ri_{dr} + L_mi_{ds}$$
<p>and similarly for q. The <b>leakage coefficient</b> $\\sigma = 1 - L_m^2/(L_sL_r)$ sets the <b>transient inductance</b> $\\sigma L_s$ seen by the current controllers. Larger leakage reduces breakdown torque (since $T_{max} \\propto 1/(X_{ls}+X_{lr})$) and power factor. Defaults: Examples 17–19 of the Unit 3 notes.</p>`,
    eqs: [['L_s = L_{ls} + L_m,\\; L_r = L_{lr} + L_m,\\; \\sigma = 1 - \\frac{L_m^2}{L_sL_r}', ''], ['\\psi_{dr} = L_r i_{dr} + L_m i_{ds},\\quad \\psi_{qr} = L_r i_{qr} + L_m i_{qs}', ''], ['T_e = \\tfrac32 p\\frac{L_m}{L_r}(\\psi_{dr}i_{qs} - \\psi_{qr}i_{ds})', '']],
    params: [{ id: 'Lm', l: 'Magnetising inductance Lm', u: 'mH', min: 1, max: 10, step: 0.05, v: 4.0 }, { id: 'Lls', l: 'Stator leakage Lls', u: 'mH', min: 0.02, max: 1, step: 0.01, v: 0.2 }, { id: 'Llr', l: 'Rotor leakage Llr', u: 'mH', min: 0.02, max: 1, step: 0.01, v: 0.2 }, { id: 'Rs', l: 'Rs', u: 'mΩ', min: 5, max: 100, step: 1, v: 15 }, { id: 'Rr', l: 'Rr', u: 'mΩ', min: 5, max: 100, step: 1, v: 12 }, { id: 'ids', l: 'i_ds (operating point)', u: 'A', min: 10, max: 150, step: 1, v: 50 }, { id: 'iqs', l: 'i_qs', u: 'A', min: 0, max: 400, step: 1, v: 262.5 }, { id: 'p', l: 'Pole pairs', type: 'seg', v: 2, opts: [[1, '1'], [2, '2'], [3, '3'], [4, '4']] }],
    compute(p) {
      const Lm = p.Lm / 1000, Ls = Lm + p.Lls / 1000, Lr = Lm + p.Llr / 1000, sig = 1 - Lm * Lm / (Ls * Lr);
      // rotor-flux-oriented steady state: i_dr = 0, i_qr = -(Lm/Lr) i_qs
      const idr = 0, iqr = -Lm / Lr * p.iqs; const pdr = Lr * idr + Lm * p.ids, pqr = Lr * iqr + Lm * p.iqs, pds = Ls * p.ids + Lm * idr, pqs = Ls * p.iqs + Lm * iqr;
      const Te = 1.5 * p.p * Lm / Lr * (pdr * p.iqs - pqr * p.ids);
      const w = TAU * 50, mk = (lls, llr) => ({ V: 400, f: 50, poles: 2 * p.p, Rs: p.Rs / 1000 * 30, Rr: p.Rr / 1000 * 30, Xls: w * lls / 1000 * 30, Xlr: w * llr / 1000 * 30, Xm: w * Lm * 30, Prot: 0 });
      const ss = range(1, 0.002, 200), ns = 3000 / p.p;
      const curves = [[p.Lls, p.Llr, 'present'], [p.Lls * .5, p.Llr * .5, '½ leakage'], [p.Lls * 2, p.Llr * 2, '2× leakage']].map(([a, b, l]) => S(l, ss.map(s => ns * (1 - s)), ss.map(s => imSteady(mk(a, b), s).Te), { width: l === 'present' ? 2.5 : 1.3 }));
      return {
        kpis: [kv('Ls', Ls * 1000, 'mH'), kv('Lr', Lr * 1000, 'mH'), kv('σ', sig, '', 'acc', 4), kv('Transient σLs', sig * Ls * 1000, 'mH'), kv('τr = Lr/Rr', Lr / (p.Rr / 1000), 's'), kv('ψdr', pdr, 'Wb', '', 3), kv('ψds', pds, 'Wb', '', 3), kv('ψqs', pqs, 'Wb', '', 3), kv('Torque', Te, 'N·m', 'good')],
        steps: [['', `\\sigma = 1 - \\frac{${p.Lm}^2}{${fmt(Ls * 1000)}\\times${fmt(Lr * 1000)}} = ${fmt(sig)}`], ['', `\\psi_{dr} = L_m i_{ds} = ${fmt(pdr)}\\,Wb\\ (i_{dr}=0)`], ['', `i_{qr} = -\\frac{L_m}{L_r} i_{qs} = ${fmt(iqr)}\\,A,\\ \\psi_{qr} = 0`], ['', `T_e = \\tfrac32\\times${p.p}\\times\\frac{${p.Lm}}{${fmt(Lr * 1000)}}\\times${fmt(pdr)}\\times${p.iqs} = ${fmt(Te)}\\,N\\,m`]],
        charts: [lc('lk', 'Effect of leakage on torque–speed (machine scaled to 400 V, 50 Hz)', 'Speed (r/min)', 'Torque (N·m)', curves)],
      };
    },
    draw(g, W, H, A) {
      const T = A.T, p = A.p; const y1 = 70, y2 = H - 60; text(g, 'T-equivalent circuit (d-axis, synchronous frame)', 14, 18, { align: 'left', weight: 800 });
      line(g, [[40, y1], [40, y2]], T.text); resistor(g, 40, y1, 130, T.orange, `Rs ${p.Rs} mΩ`); inductor(g, 130, y1, 240, T.cyan, `Lls ${p.Lls} mH`);
      const xm = 270; line(g, [[240, y1], [W - 260, y1]], T.text); g.save(); g.translate(xm, (y1 + y2) / 2); g.rotate(Math.PI / 2); inductor(g, -40, 0, 40, T.violet, ''); g.restore(); line(g, [[xm, y1], [xm, (y1 + y2) / 2 - 40]], T.text); line(g, [[xm, (y1 + y2) / 2 + 40], [xm, y2]], T.text); text(g, `Lm ${p.Lm} mH`, xm + 16, (y1 + y2) / 2, { align: 'left', color: T.violet, weight: 700 });
      inductor(g, xm + 60, y1, xm + 170, T.cyan, `Llr ${p.Llr} mH`); resistor(g, xm + 170, y1, xm + 260, T.orange, `Rr ${p.Rr} mΩ`); line(g, [[W - 260 + 0, y1], [xm + 260, y1]], T.text); line(g, [[xm + 260, y1], [xm + 260, y2]], T.text); line(g, [[40, y2], [xm + 260, y2]], T.text);
      flow(g, [[60, y1 - 14], [xm - 6, y1 - 14]], A.t, .4, T.yellow, { w: 1 }); text(g, 'mutual flux path', xm, y2 + 18, { size: 11, color: T.violet });
      const bx = W * .7; text(g, 'Flux linkages', bx, 70, { align: 'left', weight: 800 }); const k = A.R.kpis || []; [5, 6, 7].forEach((i, j) => { if (k[i]) text(g, `${k[i][0]} = ${fmt(k[i][1])} Wb`, bx, 100 + j * 26, { align: 'left', color: T.cyan }); }); if (k[2]) text(g, `σ = ${fmt(k[2][1])}`, bx, 190, { align: 'left', color: T.yellow, weight: 700 });
    },
    viva: ['Define the leakage coefficient σ.', 'Why does the current controller see σLs rather than Ls?', 'How does leakage affect breakdown torque?'],
    mcq: [{ q: 'With Lm = 4 mH, Ls = Lr = 4.2 mH, σ ≈', o: ['0.093', '0.5', '0.95', '0.01'], a: 0 }],
  };
}
function pmsmExp() {
  return {
    id: '3.13', kind: 'sim', view3d: (host) => motorView(host, { type: 'PMSM', poles: 8, state: (p, R, S) => S ? { thetaE: S.th * 4 + S.delta * 0 + S.d, thetaM: S.th, ia: Math.cos(S.th * 4 + S.d), ib: Math.cos(S.th * 4 + S.d - TAU / 3), ic: Math.cos(S.th * 4 + S.d + TAU / 3) } : {} }), default3d: true, stageH: 440, autorun: true,
    aim: 'To explore the construction and operating principle of the permanent-magnet synchronous motor used in EV powertrains.',
    objectives: ['Identify stator, windings, rotor, magnets, air gap, shaft and bearings.', 'Observe the synchronously rotating field locked to the rotor with a load angle.', 'Relate torque to the angle between stator MMF and rotor flux.'],
    theory: `<p>A <b>PMSM</b> has a stator like an induction motor (laminated core with distributed three-phase winding) and a rotor carrying <b>permanent magnets</b> (NdFeB). The rotor runs exactly at synchronous speed $n = 120f/P$. Torque arises from the interaction between the stator MMF and the magnet flux and is maximum when the stator current vector is 90° electrical ahead of the magnet axis ($i_d=0$ control). PMSMs give the highest efficiency and power density, which is why most current EVs use them (often interior-magnet IPMSMs that add reluctance torque). Drawbacks: rare-earth magnet cost and supply, demagnetisation risk at high temperature, and high back-EMF at high speed requiring field weakening.</p>`,
    eqs: [['n = \\frac{120f}{P}', 'Synchronous'], ['T_e = \\tfrac32 p\\lambda_m I_s\\sin\\delta', 'Non-salient, δ = angle between current vector and magnet axis'], ['E = \\omega_e\\lambda_m', 'Back-EMF (peak, per phase)']],
    params: [{ id: 'n', l: 'Speed (animation slowed ×100)', u: 'r/min', min: 0, max: 12000, step: 100, v: 3000 }, { id: 'T', l: 'Load torque', u: 'N·m', min: 0, max: 220, step: 5, v: 120 }, { id: 'lam', l: 'Magnet flux λm', u: 'Wb', min: 0.03, max: 0.2, step: 0.005, v: 0.09, d: 3 }, { id: 'I', l: 'Current magnitude', u: 'A', min: 50, max: 400, step: 5, v: 300 }],
    sim: { dt: 1e-3, live: ['n', 'T', 'lam', 'I'], sampleEvery: .02, init: () => ({ t: 0, th: 0, d: Math.PI / 2 }), step(s, p, dt) { s.th += p.n * Math.PI / 30 / 100 * dt; const sd = clamp(p.T / (1.5 * 4 * p.lam * p.I), -1, 1); s.d = Math.asin(sd); s.t += dt; }, sample: (s, p) => ({ kpis: [kv('Electrical frequency', p.n / 60 * 4, 'Hz'), kv('Back-EMF (peak)', p.n * Math.PI / 30 * 4 * p.lam, 'V'), kv('Load angle δ', s.d * 180 / Math.PI, '°', 'acc'), kv('Max torque at this current', 1.5 * 4 * p.lam * p.I, 'N·m'), kv('Power', p.T * p.n * Math.PI / 30 / 1000, 'kW')], push: { i: [s.t, Math.cos(s.th * 4 + s.d), Math.cos(s.th * 4 + s.d - TAU / 3), Math.cos(s.th * 4 + s.d + TAU / 3)] } }), charts: [{ id: 'i', title: 'Phase currents (normalised, slowed)', xl: 'Time (s)', yl: 'p.u.', s: ['i_a', 'i_b', 'i_c'], colors: PHC, max: 800 }] },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T; const cx = W * .32, cy = H / 2, R = Math.min(W * .24, H * .4);
      g.strokeStyle = T.line; g.lineWidth = 18; g.beginPath(); g.arc(cx, cy, R + 14, 0, 7); g.stroke(); g.lineWidth = 1;
      const th = s.th * 4; for (let k = 0; k < 8; k++) { const a = s.th + k * TAU / 8; g.fillStyle = k % 2 ? T.red : T.blue; g.save(); g.translate(cx + R * .75 * Math.cos(a), cy - R * .75 * Math.sin(a)); g.rotate(-a); g.fillRect(-8, -18, 16, 36); g.restore(); text(g, k % 2 ? 'S' : 'N', cx + R * .55 * Math.cos(a), cy - R * .55 * Math.sin(a), { weight: 800, size: 11 }); }
      g.fillStyle = '#e5e7eb'; g.beginPath(); g.arc(cx, cy, R * .14, 0, 7); g.fill();
      const ma = s.th; arrow(g, cx, cy, cx + R * .45 * Math.cos(ma), cy - R * .45 * Math.sin(ma), T.blue, 3); text(g, 'magnet axis (d)', cx + R * .5 * Math.cos(ma), cy - R * .5 * Math.sin(ma) - 14, { size: 11, color: T.blue });
      const fa = s.th + s.d / 4; arrow(g, cx, cy, cx + R * .95 * Math.cos(fa), cy - R * .95 * Math.sin(fa), T.cyan, 3.5); text(g, 'stator MMF', cx + R * 1.02 * Math.cos(fa), cy - R * 1.02 * Math.sin(fa), { size: 11, color: T.cyan, weight: 700 });
      text(g, `Rotor locked to the rotating field · load angle δ = ${(s.d * 180 / Math.PI).toFixed(1)}° (electrical)`, 14, 18, { align: 'left', weight: 800 });
      const bx = W * .62; text(g, 'Torque vs load angle', bx, 60, { align: 'left', weight: 700 }); const gw = W * .34, gh = H * .5;
      g.strokeStyle = T.line; g.strokeRect(bx, 80, gw, gh); g.strokeStyle = T.cyan; g.lineWidth = 2; g.beginPath(); for (let k = 0; k <= 90; k++) { const d = k * Math.PI / 90; const x = bx + k / 90 * gw, y = 80 + gh - Math.sin(d) * gh * .95; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.lineWidth = 1;
      g.fillStyle = T.yellow; g.beginPath(); g.arc(bx + s.d / Math.PI * gw, 80 + gh - Math.sin(s.d) * gh * .95, 6, 0, 7); g.fill(); text(g, '0°', bx, 80 + gh + 12, { size: 10 }); text(g, '90°', bx + gw / 2, 80 + gh + 12, { size: 10 }); text(g, '180°', bx + gw, 80 + gh + 12, { size: 10 });
    },
    viva: [['Why does a PMSM run at exactly synchronous speed?', 'The rotor field is fixed to the rotor (magnets) and must lock to the rotating stator field to produce average torque.'], ['What limits a PMSM at high speed?', 'Back-EMF λmωe approaches the inverter voltage limit; field weakening (negative id) is required.'], 'Why are interior magnets preferred in EVs?'],
    mcq: [{ q: 'A PMSM with 8 poles at 3000 r/min has electrical frequency', o: ['50 Hz', '100 Hz', '200 Hz', '400 Hz'], a: 2 }, { q: 'Maximum torque per ampere in an SPMSM occurs at δ =', o: ['0°', '45°', '90°', '180°'], a: 2 }],
  };
}
function salientExp() {
  return {
    id: '3.14', kind: 'static', view3d: (host, p) => { let v = motorView(host, { type: 'PMSM', salient: p.sal, poles: 8, state: () => ({ thetaM: performance.now() / 2000, thetaE: performance.now() / 500 }) }); return v; }, stageH: 340,
    aim: 'To compare non-salient (surface) and salient (interior) PMSMs: inductances, magnet and reluctance torque, and torque–speed capability.',
    objectives: ['Understand why Ld < Lq in an IPMSM.', 'Separate magnet and reluctance torque versus current angle.', 'Find the MTPA angle and compare torque–speed envelopes.'],
    theory: `<p>In a <b>surface-mounted PMSM (SPMSM)</b> the magnets (relative permeability ≈ 1) form part of the air gap uniformly, so $L_d = L_q$ – the machine is <b>non-salient</b> and torque is only magnet torque $\\tfrac32p\\lambda_m i_q$. In an <b>interior PMSM (IPMSM)</b> the magnets are buried; the d-axis flux path crosses magnets (low permeance) while the q-axis path is through iron, so $L_q > L_d$ – the machine is <b>salient</b> and gains <b>reluctance torque</b> $\\tfrac32p(L_d-L_q)i_di_q$, positive for negative $i_d$. The current angle for maximum torque per ampere (MTPA) therefore exceeds 90° (β > 0 measured from the q axis), and the negative $i_d$ also helps field weakening, giving a wider constant-power speed range.</p>`,
    eqs: [['T_e = \\tfrac32 p\\left[\\lambda_m i_q + (L_d - L_q) i_d i_q\\right]', ''], ['i_d = I_s\\sin(-\\beta),\\; i_q = I_s\\cos\\beta', 'β measured from the q axis'], ['i_d^{MTPA} = \\frac{\\lambda_m}{2(L_q-L_d)} - \\sqrt{\\frac{\\lambda_m^2}{4(L_q-L_d)^2} + i_q^2}', '']],
    params: [{ id: 'sal', l: 'Show in 3D', type: 'seg', v: true, opts: [[false, 'Surface PM'], [true, 'Interior PM']] }, { id: 'Ld', l: 'Ld (IPMSM)', u: 'mH', min: 0.05, max: 1, step: 0.01, v: 0.2 }, { id: 'Lq', l: 'Lq (IPMSM)', u: 'mH', min: 0.05, max: 1.5, step: 0.01, v: 0.5 }, { id: 'lam', l: 'λm', u: 'Wb', min: 0.03, max: 0.15, step: 0.005, v: 0.09, d: 3 }, { id: 'I', l: 'Current magnitude', u: 'A', min: 50, max: 400, step: 5, v: 270 }, { id: 'p', l: 'Pole pairs', min: 2, max: 8, step: 1, v: 4 }],
    compute(p) {
      const P = { p: p.p, Ld: p.Ld / 1000, Lq: p.Lq / 1000, lam: p.lam, Rs: .02, Vdc: 400, Imax: p.I }, Pn = Object.assign({}, P, { Ld: (P.Ld + P.Lq) / 2, Lq: (P.Ld + P.Lq) / 2 });
      const b = range(0, 90, 91); const mag = b.map(x => 1.5 * p.p * p.lam * p.I * Math.cos(x * Math.PI / 180)), rel = b.map(x => { const r = x * Math.PI / 180; return 1.5 * p.p * (P.Ld - P.Lq) * (-p.I * Math.sin(r)) * p.I * Math.cos(r); });
      const tot = mag.map((m, i) => m + rel[i]); const bi = tot.indexOf(Math.max(...tot));
      const ns = range(200, 14000, 70), e1 = pmsmEnvelope(P, ns), e2 = pmsmEnvelope(Pn, ns);
      return {
        kpis: [kv('Saliency ratio Lq/Ld', p.Lq / p.Ld, ''), kv('MTPA angle β', b[bi], '°', 'acc'), kv('Max torque IPMSM', tot[bi], 'N·m', 'good'), kv('Torque at β = 0 (id = 0)', tot[0], 'N·m'), kv('Reluctance share at MTPA', 100 * rel[bi] / tot[bi], '%'), kv('Non-salient max torque', 1.5 * p.p * p.lam * p.I, 'N·m')],
        charts: [lc('tb', 'Torque components vs current angle β (salient machine)', 'β (°)', 'N·m', [S('Magnet torque', b, mag), S('Reluctance torque', b, rel), S('Total', b, tot, { width: 2.6 })], { marks: [{ x: b[bi], y: tot[bi], label: 'MTPA' }] }), lc('env', 'Torque–speed envelope: salient vs non-salient (same Is, Vdc = 400 V)', 'Speed (r/min)', 'N·m', [S('Salient IPMSM', ns, e1.map(e => e.T), { width: 2.4 }), S('Non-salient (Ld = Lq)', ns, e2.map(e => e.T), { dash: [5, 4] })]), lc('penv', 'Power–speed envelope', 'Speed (r/min)', 'kW', [S('Salient', ns, e1.map(e => e.P / 1000)), S('Non-salient', ns, e2.map(e => e.P / 1000), { dash: [5, 4] })])],
        obs: { cols: ['Property', 'Non-salient (SPMSM)', 'Salient (IPMSM)'], rows: [['Magnet location', 'Rotor surface', 'Buried in rotor'], ['Inductances', 'Ld = Lq', 'Lq > Ld'], ['Torque', 'Magnet only', 'Magnet + reluctance'], ['MTPA', 'id = 0 (β = 0)', 'id < 0 (β > 0)'], ['Field weakening range', 'Limited', 'Wide'], ['Magnet protection at high speed', 'Needs retaining sleeve', 'Mechanically protected'], ['EV usage', 'Some in-wheel motors', 'Most EV traction motors']] },
      };
    },
    draw(g, W, H, A) {
      const T = A.T; [false, true].forEach((sal, k) => { const cx = W * (k ? .72 : .25), cy = H / 2 + 10, R = Math.min(W * .17, H * .38); g.strokeStyle = T.line; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, R + 12, 0, 7); g.stroke(); g.lineWidth = 1; g.fillStyle = '#475569'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); const rot = A.t * .5;
        for (let j = 0; j < 8; j++) { const a = rot + j * TAU / 8; g.save(); g.translate(cx + (sal ? R * .62 : R * .93) * Math.cos(a), cy - (sal ? R * .62 : R * .93) * Math.sin(a)); g.rotate(-a); g.fillStyle = j % 2 ? T.red : T.blue; if (sal) { g.rotate(Math.PI / 2); g.fillRect(-R * .2, -4, R * .4, 8); } else g.fillRect(-5, -R * .2, 10, R * .4); g.restore(); }
        const da = rot; line(g, [[cx, cy], [cx + R * 1.2 * Math.cos(da), cy - R * 1.2 * Math.sin(da)]], T.yellow, 2, [5, 3]); line(g, [[cx, cy], [cx + R * 1.2 * Math.cos(da + TAU / 16), cy - R * 1.2 * Math.sin(da + TAU / 16)]], T.pink, 2, [5, 3]);
        text(g, sal ? 'Interior PM (salient): Lq > Ld' : 'Surface PM (non-salient): Ld = Lq', cx, 20, { weight: 800 }); text(g, 'd', cx + R * 1.3 * Math.cos(da), cy - R * 1.3 * Math.sin(da), { color: T.yellow, weight: 800 }); text(g, 'q', cx + R * 1.3 * Math.cos(da + TAU / 16), cy - R * 1.3 * Math.sin(da + TAU / 16), { color: T.pink, weight: 800 }); });
    },
    viva: [['Why is Lq > Ld in an IPMSM?', 'The d-axis flux crosses the magnets (permeability ≈ air) while the q-axis path is through rotor iron.'], ['Why must id be negative to get reluctance torque?', '(Ld − Lq) < 0, so the term (Ld − Lq) id iq is positive only when id < 0 (iq > 0).'], 'Why do IPMSMs have a wider constant-power region?'],
    mcq: [{ q: 'For an SPMSM the MTPA condition is', o: ['id = 0', 'iq = 0', 'id = iq', 'id > 0'], a: 0 }, { q: 'Reluctance torque exists when', o: ['Ld = Lq', 'Ld ≠ Lq', 'λm = 0 only', 'never'], a: 1 }],
  };
}
function genericExp() {
  return {
    id: '3.15', kind: 'sim', stageH: 360, autorun: true,
    aim: 'To develop the generic PMSM model in abc, αβ and dq frames and visualise the coordinate transformations.',
    objectives: ['Transform three-phase quantities to αβ and dq frames.', 'Write voltage, flux-linkage, torque and mechanical equations.', 'Verify the dq model numerically (Example 20).'],
    theory: `<p>In the <b>abc frame</b> the PMSM inductances depend on rotor position, making the model time-varying. The <b>Clarke</b> transform reduces it to two orthogonal stationary axes (αβ) and the <b>Park</b> transform rotates them with the rotor (dq, d aligned with the magnet). In the dq frame, for a balanced machine,</p>$$v_d = R_si_d + \\frac{d\\psi_d}{dt} - \\omega_e\\psi_q,\\quad v_q = R_si_q + \\frac{d\\psi_q}{dt} + \\omega_e\\psi_d,$$ $$\\psi_d = L_di_d + \\lambda_m,\\quad \\psi_q = L_qi_q,$$ $$T_e = \\tfrac32 p(\\psi_di_q - \\psi_qi_d),\\quad J\\frac{d\\omega_m}{dt} = T_e - T_L - B\\omega_m.$$
<p>The animation shows sinusoidal abc currents producing a rotating space vector in αβ, which is stationary in the rotating dq frame – i.e. constant $i_d$, $i_q$. Defaults reproduce Example 20 (p = 4, R<sub>s</sub> = 0.02 Ω, L<sub>d</sub> = 0.2 mH, L<sub>q</sub> = 0.5 mH, λ<sub>m</sub> = 0.09 Wb, 3000 r/min, I<sub>d</sub> = −100 A, I<sub>q</sub> = 250 A).</p>`,
    eqs: [['v_d = R_si_d - \\omega_eL_qi_q,\\quad v_q = R_si_q + \\omega_e(L_di_d + \\lambda_m)', 'Steady state'], ['T_e = \\tfrac32 p[\\lambda_m i_q + (L_d - L_q)i_di_q]', ''], ['P_e = \\tfrac32(v_di_d + v_qi_q)', '']],
    params: [{ id: 'n', l: 'Speed', u: 'r/min', min: 0, max: 10000, step: 50, v: 3000 }, { id: 'id', l: 'i_d', u: 'A', min: -300, max: 100, step: 5, v: -100 }, { id: 'iq', l: 'i_q', u: 'A', min: -300, max: 300, step: 5, v: 250 }, { id: 'Ld', l: 'Ld', u: 'mH', min: .05, max: 1, step: .01, v: .2 }, { id: 'Lq', l: 'Lq', u: 'mH', min: .05, max: 1.5, step: .01, v: .5 }, { id: 'lam', l: 'λm', u: 'Wb', min: .03, max: .2, step: .005, v: .09, d: 3 }, { id: 'Rs', l: 'Rs', u: 'Ω', min: .005, max: .1, step: .001, v: .02, d: 3 }, { id: 'p', l: 'Pole pairs', min: 1, max: 8, step: 1, v: 4 }, { id: 'slow', l: 'Animation electrical Hz', min: .05, max: 2, step: .05, v: .3 }],
    sim: { dt: 2e-3, live: ['n', 'id', 'iq', 'Ld', 'Lq', 'lam', 'Rs', 'p', 'slow'], sampleEvery: .02, init: () => ({ t: 0, th: 0 }), step(s, p, dt) { s.th += TAU * p.slow * dt; s.t += dt; }, sample(s, p) { const ab = ipark(p.id, p.iq, s.th), c = iclarke(ab.al, ab.be); return { kpis: [kv('θe', (s.th * 180 / Math.PI) % 360, '°'), kv('i_a', c.a, 'A'), kv('i_α', ab.al, 'A'), kv('i_β', ab.be, 'A'), kv('i_d (recovered)', park(ab.al, ab.be, s.th).d, 'A'), kv('i_q (recovered)', park(ab.al, ab.be, s.th).q, 'A')], push: { abc: [s.t, c.a, c.b, c.c], ab: [s.t, ab.al, ab.be], dq: [s.t, p.id, p.iq] } }; }, charts: [{ id: 'abc', title: 'abc frame currents', xl: 'Time (s)', yl: 'A', s: ['i_a', 'i_b', 'i_c'], colors: PHC, max: 1500 }, { id: 'ab', title: 'αβ (stationary) currents', xl: 'Time (s)', yl: 'A', s: ['i_α', 'i_β'], max: 1500 }, { id: 'dq', title: 'dq (rotor) currents – DC', xl: 'Time (s)', yl: 'A', s: ['i_d', 'i_q'], max: 1500 }] },
    compute(p) {
      const P = { p: p.p, Rs: p.Rs, Ld: p.Ld / 1000, Lq: p.Lq / 1000, lam: p.lam }; const we = p.n * Math.PI / 30 * p.p; const v = pmsmVoltage(P, p.id, p.iq, we); const Te = pmsmTorque(P, p.id, p.iq); const Pm = Te * p.n * Math.PI / 30, Pe = 1.5 * (v.vd * p.id + v.vq * p.iq);
      return { kpis: [kv('f_e', we / TAU, 'Hz'), kv('Back-EMF ωeλm', we * p.lam, 'V'), kv('v_d', v.vd, 'V'), kv('v_q', v.vq, 'V'), kv('|V| (peak phase)', v.V, 'V', v.V > 400 / S3 ? 'bad' : 'good'), kv('Limit Vdc/√3 (400 V)', 400 / S3, 'V'), kv('Torque', Te, 'N·m', 'acc'), kv('Mechanical power', Pm / 1000, 'kW'), kv('Electrical power', Pe / 1000, 'kW'), kv('Copper loss', 1.5 * p.Rs * (p.id ** 2 + p.iq ** 2) / 1000, 'kW')],
        steps: [['', `\\omega_e = p\\,\\omega_m = ${p.p}\\times${fmt(p.n * Math.PI / 30)} = ${fmt(we)}\\,rad/s`], ['', `v_d = ${p.Rs}\\times${p.id} - ${fmt(we)}\\times${p.Lq}\\,mH\\times${p.iq} = ${fmt(v.vd)}\\,V`], ['', `v_q = ${p.Rs}\\times${p.iq} + ${fmt(we)}(${p.Ld}\\,mH\\times${p.id} + ${p.lam}) = ${fmt(v.vq)}\\,V`], ['', `T_e = 1.5\\times${p.p}[${p.lam}\\times${p.iq} + (${p.Ld}-${p.Lq})10^{-3}\\times${p.id}\\times${p.iq}] = ${fmt(Te)}\\,N\\,m`], [`|V| = ${fmt(v.V)} V ${v.V > 400 / S3 ? '> 230.9 V ⇒ not feasible with a 400 V link (field weakening needed)' : '≤ 230.9 V ⇒ feasible with a 400 V link'}`]] };
    },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T, p = A.p; const Im = Math.max(50, Math.hypot(p.id, p.iq)); const ab = ipark(p.id, p.iq, s.th), c = iclarke(ab.al, ab.be);
      const y = H / 2, R = Math.min(W * .13, H * .36);
      text(g, 'abc', W * .14, 24, { weight: 800 }); [0, 1, 2].forEach(k => { const a = k * TAU / 3, v = [c.a, c.b, c.c][k] / Im; line(g, [[W * .14, y], [W * .14 + R * Math.cos(a), y - R * Math.sin(a)]], hex(PHC[k], .3), 1, [3, 3]); arrow(g, W * .14, y, W * .14 + v * R * Math.cos(a), y - v * R * Math.sin(a), PHC[k], 3); text(g, 'abc'[k], W * .14 + 1.12 * R * Math.cos(a), y - 1.12 * R * Math.sin(a), { color: PHC[k], weight: 800 }); });
      arrow(g, W * .27, y, W * .33, y, T.muted, 2); text(g, 'Clarke', W * .3, y - 14, { size: 11, color: T.pink });
      text(g, 'αβ (stationary)', W * .47, 24, { weight: 800 }); vecPlot(g, W * .47, y, R, A, [[ab.al / Im, ab.be / Im, T.orange, 'i_s']]);
      arrow(g, W * .61, y, W * .67, y, T.muted, 2); text(g, 'Park (θe)', W * .64, y - 14, { size: 11, color: T.pink });
      text(g, 'dq (rotating with rotor)', W * .82, 24, { weight: 800 }); const cx = W * .82; g.strokeStyle = T.line; g.beginPath(); g.arc(cx, y, R, 0, 7); g.stroke(); arrow(g, cx, y, cx + R * 1.05, y, T.yellow, 1.5); arrow(g, cx, y, cx, y - R * 1.05, T.pink, 1.5); text(g, 'd', cx + R * 1.15, y, { color: T.yellow, weight: 800 }); text(g, 'q', cx, y - R * 1.15, { color: T.pink, weight: 800 }); arrow(g, cx, y, cx + p.id / Im * R, y - p.iq / Im * R, T.orange, 3); text(g, 'stationary in dq', cx, y + R + 18, { size: 11, color: T.muted });
    },
    viva: [['Why is the dq model preferred for control?', 'Inductances become constant and sinusoidal quantities become DC, so linear PI control works.'], ['What are the speed-voltage terms in the dq equations?', '−ωeψq in vd and +ωeψd in vq.'], 'Verify Example 20 torque.'],
    mcq: [{ q: 'In the dq frame of a PMSM at steady state, currents are', o: ['Sinusoidal at fe', 'DC', 'Square waves', 'Zero'], a: 1 }],
    numericals: [['Example 20: p = 4, Rs = 0.02 Ω, Ld = 0.2 mH, Lq = 0.5 mH, λm = 0.09 Wb, 3000 r/min, Id = −100 A, Iq = 250 A. Find Te.', 'Te = 1.5×4×[0.09×250 + (0.2−0.5)×10⁻³×(−100)×250] = 6×(22.5 + 7.5) = 180 N·m.']],
  };
}
function pmsmSteadyExp() {
  return {
    id: '3.16', kind: 'static', stageH: 260,
    aim: 'To compute the steady-state torque–speed, power–speed, efficiency, current and voltage characteristics of a PMSM drive under current and voltage limits.',
    objectives: ['Apply MTPA below base speed and flux weakening above.', 'Plot the capability envelope and operating variables vs speed.', 'Check feasibility of a given operating point.'],
    theory: `<p>A PMSM drive is limited by the inverter current $I_s \\le I_{max}$ (current circle) and voltage $\\sqrt{v_d^2+v_q^2} \\le V_{max} = V_{dc}/\\sqrt3$ (voltage ellipse, shrinking as speed rises). Below <b>base speed</b> only the current limit is active and MTPA is used; above it the controller injects negative $i_d$ (<b>field weakening</b>) so the voltage stays within the limit, trading torque for speed. For each speed the envelope is found here by searching the current angle β and magnitude that maximise torque subject to both limits (95 % voltage margin). Efficiency includes copper loss and an iron + mechanical loss model $P_{fe} = k_{fe}\\omega_e^{1.5} + k_m\\omega_m^3$ (illustrative coefficients).</p>`,
    eqs: [['i_d^2 + i_q^2 \\le I_{max}^2', 'Current limit'], ['(R_si_d - \\omega_eL_qi_q)^2 + (R_si_q + \\omega_e(L_di_d+\\lambda_m))^2 \\le V_{max}^2', 'Voltage limit'], ['\\omega_{base} \\approx \\frac{V_{max}}{p\\sqrt{(L_qi_q)^2 + (L_di_d+\\lambda_m)^2}}', '']],
    params: [{ id: 'Rs', l: 'Rs', u: 'Ω', min: .005, max: .1, step: .001, v: .02, d: 3 }, { id: 'Ld', l: 'Ld', u: 'mH', min: .05, max: 1, step: .01, v: .2 }, { id: 'Lq', l: 'Lq', u: 'mH', min: .05, max: 1.5, step: .01, v: .5 }, { id: 'lam', l: 'λm', u: 'Wb', min: .03, max: .2, step: .005, v: .09, d: 3 }, { id: 'p', l: 'Pole pairs', min: 1, max: 8, step: 1, v: 4 }, { id: 'Vdc', l: 'DC-bus voltage', u: 'V', min: 200, max: 800, step: 10, v: 400 }, { id: 'Imax', l: 'Current limit', u: 'A', min: 50, max: 600, step: 10, v: 300 }, { id: 'nop', l: 'Operating speed', u: 'r/min', min: 100, max: 15000, step: 100, v: 6000 }, { id: 'Top', l: 'Requested torque', u: 'N·m', min: 0, max: 300, step: 5, v: 120 }],
    compute(p) {
      const P = { p: p.p, Rs: p.Rs, Ld: p.Ld / 1000, Lq: p.Lq / 1000, lam: p.lam, Vdc: p.Vdc, Imax: p.Imax };
      const ns = range(100, 15000, 90); const E = pmsmEnvelope(P, ns); const op = pmsmEnvelope(P, [p.nop])[0];
      let nb = ns[0]; for (let i = 1; i < E.length; i++) if (E[i].T < E[0].T * 0.98) { nb = ns[i - 1]; break; }
      const feas = p.Top <= op.T;
      return {
        kpis: [kv('Peak torque (MTPA)', E[0].T, 'N·m', 'acc'), kv('Base speed', nb, 'r/min'), kv('Peak power', Math.max(...E.map(e => e.P)) / 1000, 'kW'), kv(`Max torque at ${p.nop} r/min`, op.T, 'N·m'), kv('i_d / i_q there', `${op.id.toFixed(0)} / ${op.iq.toFixed(0)}`, 'A'), kv('Requested point', feas ? 'FEASIBLE' : 'NOT FEASIBLE', '', feas ? 'good' : 'bad'), kv('Efficiency at envelope', op.eta * 100, '%')],
        charts: [lc('ts', 'Torque–speed envelope', 'Speed (r/min)', 'N·m', [S('T max', ns, E.map(e => e.T), { width: 2.5 })], { marks: [{ x: p.nop, y: p.Top, label: feas ? 'request ✓' : 'request ✗', color: feas ? '#22c55e' : '#ef4444' }, { x: nb }] }), lc('ps', 'Power–speed envelope', 'Speed (r/min)', 'kW', [S('P max', ns, E.map(e => e.P / 1000))]), lc('es', 'Efficiency along the envelope', 'Speed (r/min)', '%', [S('η', ns, E.map(e => e.eta * 100))], { yr: [80, 100] }), lc('is', 'Current components vs speed', 'Speed (r/min)', 'A', [S('i_d', ns, E.map(e => e.id)), S('i_q', ns, E.map(e => e.iq)), S('|I_s|', ns, E.map(e => e.Is), { dash: [4, 3] })]), lc('vs', 'Voltage vs speed', 'Speed (r/min)', 'V (peak phase)', [S('|V|', ns, E.map(e => e.V)), S('V_max', ns, ns.map(() => p.Vdc / S3), { dash: [5, 4], color: '#ef4444' })])],
        obs: { cols: ['Speed (r/min)', 'T max (N·m)', 'P (kW)', 'i_d (A)', 'i_q (A)', '|V| (V)', 'η (%)'], rows: [1000, 2000, 3000, 4000, 6000, 8000, 10000, 12000, 14000].map(n => { const e = pmsmEnvelope(P, [n])[0]; return [n, e.T, e.P / 1000, e.id, e.iq, e.V, e.eta * 100]; }) },
        _op: op,
      };
    },
    draw(g, W, H, A) {
      const T = A.T, op = A.R._op, p = A.p; if (!op) return; const cx = W * .3, cy = H / 2, sc = Math.min(W * .22, H * .42) / p.Imax;
      text(g, `Current plane at ${p.nop} r/min: current circle (I_max) and voltage ellipse`, 14, 18, { align: 'left', weight: 800 });
      line(g, [[cx - p.Imax * sc * 1.1, cy], [cx + p.Imax * sc * .4, cy]], T.muted, 1); line(g, [[cx, cy + p.Imax * sc * .3], [cx, cy - p.Imax * sc * 1.1]], T.muted, 1); text(g, 'i_d', cx - p.Imax * sc * 1.1 - 12, cy, { color: T.yellow }); text(g, 'i_q', cx, cy - p.Imax * sc * 1.1 - 10, { color: T.pink });
      g.strokeStyle = T.cyan; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, p.Imax * sc, 0, 7); g.stroke();
      const we = p.nop * Math.PI / 30 * p.p, Vm = p.Vdc / S3 * .95; g.strokeStyle = T.red; g.beginPath(); const cxE = cx - p.lam / (p.Ld / 1000) * sc; for (let k = 0; k <= 100; k++) { const a = k / 100 * TAU; const x = cxE + Vm / (we * p.Ld / 1000) * sc * Math.cos(a), y = cy - Vm / (we * p.Lq / 1000) * sc * Math.sin(a); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.lineWidth = 1;
      // MTPA locus
      g.strokeStyle = T.green; g.setLineDash([4, 3]); g.beginPath(); for (let k = 0; k <= 40; k++) { const iq = k / 40 * p.Imax; const id = mtpaId({ lam: p.lam, Ld: p.Ld / 1000, Lq: p.Lq / 1000 }, iq); if (Math.hypot(id, iq) > p.Imax) break; k ? g.lineTo(cx + id * sc, cy - iq * sc) : g.moveTo(cx + id * sc, cy - iq * sc); } g.stroke(); g.setLineDash([]);
      g.fillStyle = T.yellow; g.beginPath(); g.arc(cx + op.id * sc, cy - op.iq * sc, 7, 0, 7); g.fill();
      legend(g, [[T.cyan, 'Current limit circle'], [T.red, 'Voltage limit ellipse'], [T.green, 'MTPA locus'], [T.yellow, 'Max-torque operating point']], W * .62, H * .35);
    },
    viva: [['What determines base speed?', 'The speed at which the voltage needed at maximum torque reaches the inverter limit.'], ['How does field weakening extend the speed range?', 'Negative id reduces the d-axis flux Ld id + λm, lowering the back-EMF.'], 'Why does the voltage ellipse shrink with speed?'],
    mcq: [{ q: 'Above base speed a PMSM operates in', o: ['MTPA', 'Field weakening', 'DC braking', 'Six-step only'], a: 1 }, { q: 'Maximum phase voltage with SVPWM is', o: ['Vdc/2', 'Vdc/√3', 'Vdc', '2Vdc'], a: 1 }],
  };
}
function pmsmFocExp() {
  return {
    id: '3.17', kind: 'sim', stageH: 330,
    aim: 'To implement and tune a complete field-oriented control of a PMSM drive with SVPWM.',
    objectives: ['Run the cascaded speed and current loops.', 'Observe speed, torque, id, iq, phase currents, DC-bus quantities and inverter switching signals.', 'Tune PI gains; compare id = 0 and MTPA; enable field weakening.'],
    theory: `<p>PMSM FOC uses the rotor position θe (encoder/resolver) for the Park transformation. The <b>speed controller</b> (PI) outputs the torque reference; the reference currents are $i_q^* = T^*/(1.5p\\lambda_m)$ with $i_d^* = 0$, or the MTPA pair for an IPMSM; a voltage-feedback loop adds negative $i_d$ when the voltage saturates (<b>field weakening</b>). <b>Current controllers</b> (PI with gains $K_p = \\omega_cL$, $K_i = \\omega_cR_s$ and decoupling feed-forward) produce $v_d^*, v_q^*$, which are transformed by <b>inverse Park</b> and synthesised by <b>SVPWM</b> in the <b>three-phase inverter</b>. The DC-link current is $i_{dc} = \\tfrac32(v_di_d+v_qi_q)/V_{dc}$. The machine is the IPMSM of Example 20; the inverter is modelled by its average (SVPWM-limited) voltage, and the gate signals are generated from the instantaneous duty ratios.</p>`,
    eqs: [['T^* = K_{p\\omega}e_\\omega + K_{i\\omega}\\int e_\\omega dt', ''], ['v_d^* = PI(i_d^* - i_d) - \\omega_eL_qi_q,\\quad v_q^* = PI(i_q^*-i_q) + \\omega_e(L_di_d + \\lambda_m)', ''], ['L_d\\frac{di_d}{dt} = v_d - R_si_d + \\omega_eL_qi_q,\\quad L_q\\frac{di_q}{dt} = v_q - R_si_q - \\omega_e(L_di_d+\\lambda_m)', ''], ['J\\dot\\omega_m = T_e - T_L - B\\omega_m', '']],
    params: [{ id: 'wref', l: 'Speed reference', u: 'r/min', min: -6000, max: 12000, step: 100, v: 3000 }, { id: 'TL', l: 'Load torque', u: 'N·m', min: -150, max: 200, step: 5, v: 60 }, { id: 'kpw', l: 'Speed Kp', min: .5, max: 20, step: .5, v: 4 }, { id: 'kiw', l: 'Speed Ki', min: 0, max: 400, step: 5, v: 80 }, { id: 'bw', l: 'Current-loop bandwidth ωc', u: 'rad/s', min: 300, max: 6000, step: 100, v: 2000 }, { id: 'strat', l: 'Current reference', type: 'seg', str: true, v: 'mtpa', opts: [['id0', 'i_d = 0'], ['mtpa', 'MTPA']] }, { id: 'fw', l: 'Field weakening', type: 'check', v: true }, { id: 'Vdc', l: 'DC-bus voltage', u: 'V', min: 200, max: 800, step: 10, v: 400 }],
    tools: [{ l: 'Speed step → 8000 r/min', f: a => a.set('wref', 8000) }, { l: 'Speed → 3000', f: a => a.set('wref', 3000) }, { l: 'Load step 150 N·m', f: a => a.set('TL', 150) }, { l: 'Regenerate (TL = −100)', f: a => a.set('TL', -100) }],
    sim: {
      dt: 50e-6, timeScale: 0.25, sampleEvery: 2e-3, maxSteps: 20000, live: ['wref', 'TL', 'kpw', 'kiw', 'bw', 'strat', 'fw', 'Vdc'],
      init: () => ({ d: new PMSMDrive(PMSM_EX20, {}), t: 0 }),
      step(s, p, dt) { const d = s.d; Object.assign(d.c, { wRef: p.wref * Math.PI / 30, TL: p.TL, kpw: p.kpw, kiw: p.kiw, bwI: p.bw, strategy: p.strat, fw: p.fw }); d.P.Vdc = p.Vdc; d.step(dt); s.t += dt; },
      sample(s, p) { const d = s.d, c = d.iabc, idc = 1.5 * (d.vd * d.id + d.vq * d.iq) / p.Vdc; return { kpis: [kv('Speed', d.wm * 30 / Math.PI, 'r/min', 'acc'), kv('Torque Te', d.Te, 'N·m'), kv('T*', d.Teref, 'N·m'), kv('i_d / i_d*', `${d.id.toFixed(0)} / ${d.idRef.toFixed(0)}`, 'A'), kv('i_q / i_q*', `${d.iq.toFixed(0)} / ${d.iqRef.toFixed(0)}`, 'A'), kv('|v| / limit', `${Math.hypot(d.vd, d.vq).toFixed(0)} / ${(p.Vdc / S3).toFixed(0)}`, 'V', d.vsat ? 'warn' : ''), kv('DC current', idc, 'A', idc < 0 ? 'good' : ''), kv('DC power', idc * p.Vdc / 1000, 'kW'), kv('Mode', d.vsat ? 'Field weakening' : 'Constant torque', '')], push: { w: [s.t, d.wm * 30 / Math.PI, p.wref], T: [s.t, d.Te, d.Teref], dq: [s.t, d.id, d.iq, d.idRef, d.iqRef], abc: [s.t, c.a, c.b, c.c], dc: [s.t, p.Vdc, idc] } }; },
      charts: [{ id: 'w', title: 'Actual and reference speed', xl: 'Time (s)', yl: 'r/min', s: ['n', 'n*'], dashes: [[], [5, 4]] }, { id: 'T', title: 'Electromagnetic torque', xl: 'Time (s)', yl: 'N·m', s: ['Te', 'T*'], dashes: [[], [5, 4]] }, { id: 'dq', title: 'i_d and i_q (actual and reference)', xl: 'Time (s)', yl: 'A', s: ['i_d', 'i_q', 'i_d*', 'i_q*'], dashes: [[], [], [4, 3], [4, 3]] }, { id: 'abc', title: 'Three-phase currents', xl: 'Time (s)', yl: 'A', s: ['i_a', 'i_b', 'i_c'], colors: PHC, max: 3000 }, { id: 'dc', title: 'DC-bus voltage and current', xl: 'Time (s)', yl: 'V / A', s: ['V_dc', 'i_dc'] }],
    },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const d = s.d, T = A.T;
      driveBlocks(g, W, H, A, [['Speed PI', `T* ${d.Teref.toFixed(0)}`, T.violet], ['i_d*, i_q*', A.p.strat === 'mtpa' ? 'MTPA' : 'i_d = 0', T.violet], ['Current PI', 'decoupled', T.orange], ['Inv. Park', '', T.orange], ['SVPWM', '', T.cyan], ['VSI', `${A.p.Vdc} V`, T.cyan], ['PMSM', `${(d.wm * 30 / Math.PI).toFixed(0)} r/min`, T.green], ['Clarke/Park', 'θe encoder', T.pink]]);
      // SVPWM gate signals over one switching period from instantaneous references
      const vab = d.vab, va = vab.al, vb = -vab.al / 2 + S3 / 2 * vab.be, vc = -vab.al / 2 - S3 / 2 * vab.be, mx = Math.max(va, vb, vc), mn = Math.min(va, vb, vc), v0 = -(mx + mn) / 2;
      const duty = [va, vb, vc].map(v => clamp(0.5 + (v + v0) / A.p.Vdc, 0, 1)); const x0 = 30, w = W * .42, y0 = H * .42;
      text(g, 'Gate signals in one switching period (SVPWM, centre-aligned)', x0, y0 - 14, { align: 'left', weight: 700 });
      duty.forEach((dd, k) => { const y = y0 + 16 + k * 40; line(g, [[x0, y + 22], [x0 + w * (1 - dd) / 2, y + 22], [x0 + w * (1 - dd) / 2, y], [x0 + w * (1 + dd) / 2, y], [x0 + w * (1 + dd) / 2, y + 22], [x0 + w, y + 22]], PHC[k], 2); text(g, `S${[1, 3, 5][k]}  d = ${dd.toFixed(2)}`, x0 + w + 10, y + 11, { align: 'left', color: PHC[k], size: 11.5 }); });
      const sv = svDwell(Math.hypot(vab.al, vab.be), Math.atan2(vab.be, vab.al), A.p.Vdc, 1); text(g, `Sector ${sv.sector} · T1 = ${(sv.T1 * 100).toFixed(0)} % · T2 = ${(sv.T2 * 100).toFixed(0)} % · T0 = ${(sv.T0 * 100).toFixed(0)} %`, x0, y0 + 145, { align: 'left', color: T.muted, size: 11.5 });
      vecPlot(g, W * .8, H * .66, Math.min(80, H * .27), A, [[vab.al / 240, vab.be / 240, T.cyan, 'v_s*'], [ipark(d.id, d.iq, d.th).al / 320, ipark(d.id, d.iq, d.th).be / 320, T.orange, 'i_s']], d.th);
    },
    viva: [['Why is the speed loop much slower than the current loop?', 'Cascaded control requires the inner loop to settle before the outer loop acts; typically 5–10× bandwidth separation.'], ['How is regenerative braking achieved in PMSM FOC?', 'The speed controller commands negative torque (negative iq); power flows back to the DC link (i_dc < 0).'], 'What is the effect of a too-high speed Kp?', 'Why does the voltage saturate at high speed?'],
    mcq: [{ q: 'For an SPMSM with id = 0, torque is proportional to', o: ['i_d', 'i_q', 'v_q', 'θe'], a: 1 }, { q: 'Negative DC-link current during deceleration indicates', o: ['A fault', 'Regeneration to the battery', 'Field weakening', 'Overmodulation'], a: 1 }],
  };
}
// wire IM sims (they need the mode at definition time)
for (const e of EXPERIMENTS) {
  if (e.id === '3.9') e.sim = Object.assign(imSim('DTC'), { init(p) { const d = new IMDrive(IM_TRACTION, { mode: p.mode, psiRef: 0.2 }); d.premagnetize(); return { d, t: 0 }; } });
  if (e.id === '3.10') e.sim = imSim('IFOC');
  if (e.id === '3.11') e.sim = imSim('IFOC');
}
