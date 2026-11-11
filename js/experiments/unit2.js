// UNIT 2 – Energy Storage Systems: 17 experiments.
import { kv, lc, S, range, blocks, scope, legend } from './common.js';
import { box, flow, text, hex, arrow, line, rrect, resistor, capacitor, battery as batSym } from '../lib/draw.js';
import { ECM, CHEM, ocv, docv, socFromOcv, rTemp, qTemp, ageing, EKF, LKF, pack } from '../models/battery.js';
import { REF4, backward } from '../models/vehicle.js';
import { getCycles, CYCLE_OPTS } from '../models/drivecycles.js';
import { drawCell } from './unit1.js';
import { packView } from '../three/views.js';
import { fmt, clamp, rng, h } from '../lib/ui.js';

const chemOpts = Object.keys(CHEM).map(k => [k, CHEM[k].name]);
// Ragone data: indicative ranges (cell/system level). Clearly labelled as indicative in the experiment.
const RAGONE = [
  ['Lead-acid', [30, 50], [75, 300], '#94a3b8'], ['NiMH', [60, 120], [250, 1000], '#f472b6'], ['Li-ion (NMC/NCA)', [150, 270], [300, 3000], '#22d3ee'], ['LFP', [90, 180], [200, 2000], '#22c55e'], ['LTO', [50, 90], [1500, 4000], '#f59e0b'], ['Supercapacitor', [2, 10], [1000, 10000], '#a78bfa'], ['Fuel cell system (incl. H₂ tank)', [300, 1000], [100, 500], '#ef4444'],
];
function ellipse(e, p, n = 60) { const lx0 = Math.log10(e[0]), lx1 = Math.log10(e[1]), ly0 = Math.log10(p[0]), ly1 = Math.log10(p[1]); const cx = (lx0 + lx1) / 2, cy = (ly0 + ly1) / 2, rx = (lx1 - lx0) / 2, ry = (ly1 - ly0) / 2; const X = [], Y = []; for (let i = 0; i <= n; i++) { const a = i / n * 2 * Math.PI; X.push(10 ** (cx + rx * Math.cos(a))); Y.push(10 ** (cy + ry * Math.sin(a))); } return [X, Y]; }
// current profile generator shared by SOC / waveform / ECM experiments (cell level, A; + = discharge)
function profileCurrent(kind, t, Q) {
  if (kind === 'cc') return Q;
  if (kind === 'pulse') { const ph = t % 120; return ph < 30 ? 2 * Q : ph < 60 ? 0 : ph < 90 ? -Q : 0; }
  if (kind === 'step') return t < 20 ? 0 : t < 220 ? Q : 0;
  if (kind === 'chg') return -0.7 * Q;
  // dynamic: cell current derived from the UDDS battery power of the Unit 4 reference BEV (96s3p pack)
  if (!profileCurrent.ud) { const b = backward(getCycles().UDDS.v, REF4, { kr: 1, Pregen: 50e3, Paux: 600 }); profileCurrent.ud = b.Pb.map(P => P * 1000 / (96 * 3.65) / 3); }
  const u = profileCurrent.ud, k = Math.floor(t) % u.length; return u[k] * Q / 48;
}
const profOpts = [['dyn', 'Dynamic (UDDS-derived)'], ['pulse', 'Pulse train (2C / rest / −1C)'], ['cc', 'Constant 1C discharge'], ['step', 'Single 1C step and rest'], ['chg', 'Constant 0.7C charge']];

export const EXPERIMENTS = [
  // =====================================================================================================
  {
    id: '2.1', kind: 'static', stageH: 300,
    aim: 'To compare energy-storage technologies on a Ragone plot and select a technology for given energy and power requirements.',
    objectives: ['Read specific energy and specific power on log–log axes.', 'Understand iso-discharge-time lines.', 'Place an application requirement on the plot and select suitable technologies.'],
    theory: `<p>A <b>Ragone plot</b> shows <b>specific power</b> (W/kg) against <b>specific energy</b> (Wh/kg) on logarithmic axes. Diagonal lines are lines of constant discharge time $t = E/P$. Batteries sit in the high-energy, moderate-power region; supercapacitors in the high-power, low-energy region; fuel-cell systems (including the hydrogen tank) offer high energy but limited power, which is why FCEVs need a buffer battery.</p>
<p>The regions plotted here are <b>indicative ranges</b> compiled from the literature cited in the Unit 2 notes (cell or system level as labelled) – individual products differ. Enter a vehicle requirement to find the technologies that can meet both energy and power within a mass budget.</p>`,
    eqs: [['e = \\frac{E}{m}\\ (\\text{Wh/kg}),\\quad p = \\frac{P}{m}\\ (\\text{W/kg})', ''], ['t_{discharge} = \\frac{e}{p}\\ (\\text{h})', 'Iso-time lines on the Ragone plot']],
    params: [{ h: 'Application requirement' }, { id: 'E', l: 'Required energy', u: 'kWh', min: 0.5, max: 120, step: 0.5, v: 50 }, { id: 'P', l: 'Required peak power', u: 'kW', min: 5, max: 400, step: 5, v: 110 }, { id: 'M', l: 'Mass budget for storage', u: 'kg', min: 20, max: 800, step: 5, v: 350 }, { h: 'Technologies shown' }, ...RAGONE.map((r, i) => ({ id: 'show' + i, l: r[0], type: 'check', v: true }))],
    compute(p) {
      const e = p.E * 1000 / p.M, pw = p.P * 1000 / p.M;
      const series = [];
      RAGONE.forEach((r, i) => { if (!p['show' + i]) return; const [X, Y] = ellipse(r[1], r[2]); series.push(S(r[0], X, Y, { color: r[3], width: 2.2, fill: true })); });
      [[1 / 360, '10 s'], [1 / 60, '1 min'], [0.1, '6 min'], [1, '1 h'], [10, '10 h']].forEach(([t, l]) => series.push(S(`t = ${l}`, [0.5, 5000], [0.5 / t, 5000 / t], { color: '#64748b', dash: [3, 4], width: 1 })));
      series.push(S('Requirement', [e], [pw], { type: 'scatter', r: 7, color: '#facc15' }));
      const ok = RAGONE.map(r => [r[0], `${r[1][0]}–${r[1][1]}`, `${r[2][0]}–${r[2][1]}`, e <= r[1][1] && pw <= r[2][1] ? '<span class="ok-t">✓ feasible</span>' : `<span class="bad-t">✗ ${e > r[1][1] ? 'energy' : ''}${e > r[1][1] && pw > r[2][1] ? ' & ' : ''}${pw > r[2][1] ? 'power' : ''}</span>`, (r[1][0] + r[1][1]) / 2 / ((r[2][0] + r[2][1]) / 2) * 60]);
      return {
        kpis: [kv('Required specific energy', e, 'Wh/kg', 'acc'), kv('Required specific power', pw, 'W/kg', 'acc'), kv('P/E ratio', p.P / p.E, '1/h (C-rate)'), kv('Discharge time at peak', p.E / p.P * 60, 'min')],
        charts: [lc('rag', 'Ragone plot (indicative ranges)', 'Specific energy (Wh/kg)', 'Specific power (W/kg)', series, { logx: true, logy: true, xr: [1, 3000], yr: [30, 20000], wide: true, tall: true })],
        obs: { cols: ['Technology', 'Wh/kg', 'W/kg', 'Meets requirement within mass budget', 'Typical discharge time (min)'], rows: ok },
        _ok: ok,
      };
    },
    draw(g, W, H, A) {
      const T = A.T; const rows = RAGONE.map((r, i) => [r, i]).filter(([r, i]) => A.p['show' + i]);
      text(g, `Time each technology can sustain ${A.p.P} kW from a ${A.p.M} kg pack (energy-limited, if power-capable)`, 14, 16, { align: 'left', weight: 700 });
      const bh = Math.min(30, (H - 50) / rows.length - 6);
      rows.forEach(([r, i], k) => {
        const Emax = r[1][1] * A.p.M / 1000, Pmax = r[2][1] * A.p.M / 1000; const can = Pmax >= A.p.P;
        const tmin = can ? Emax / A.p.P * 60 : 0; const y = 40 + k * (bh + 8);
        text(g, r[0], 14, y + bh / 2, { align: 'left', size: 11.5 });
        const x0 = 230, wmax = W - x0 - 100, frac = Math.min(1, tmin / 120);
        const rem = A.running ? Math.max(0, 1 - (A.t * 4 % 120) / Math.max(tmin, 1e-6)) : 1;
        g.fillStyle = hex(r[3], .15); g.fillRect(x0, y, wmax, bh); g.fillStyle = r[3]; g.fillRect(x0, y, wmax * frac * rem, bh);
        text(g, can ? `${fmt(tmin)} min` : 'power too low', x0 + wmax + 8, y + bh / 2, { align: 'left', size: 11.5, color: can ? T.text : T.red, weight: 700 });
      });
    },
    viva: [['Why does an FCEV need a battery or supercapacitor?', 'The fuel-cell system has high specific energy but low specific power and slow dynamics; the buffer supplies peaks and absorbs regeneration.'], ['What do diagonal lines on a Ragone plot represent?', 'Constant discharge time t = E/P.'], 'Why are axes logarithmic?', 'Why is a Ragone comparison at cell level misleading for pack design?'],
    mcq: [{ q: 'Which device has the highest specific power?', o: ['Lead-acid', 'Supercapacitor', 'Fuel cell', 'NMC cell'], a: 1 }, { q: 'Specific energy is expressed in', o: ['W/kg', 'Wh/kg', 'Wh/L', 'Ah'], a: 1 }, { q: 'A point on the 1-hour line has P/E equal to', o: ['1 h⁻¹', '60 h⁻¹', '0.1 h⁻¹', '10 h⁻¹'], a: 0 }],
  },
  // =====================================================================================================
  {
    id: '2.2', kind: 'static', view3d: (host, p) => { const v = packView(host); return Object.assign(v, { update: (pp) => v.build(pp.s, pp.p, pp.fmt) }); }, default3d: true, stageH: 420,
    aim: 'To study cylindrical, prismatic and pouch cells and to build a battery pack by series and parallel connection.',
    objectives: ['Compare cell formats.', 'Construct a pack from cell counts and compute voltage, capacity, energy, current rating and mass.', 'Understand module and pack assembly.'],
    theory: `<p>Traction cells come in three formats. <b>Cylindrical</b> cells (18650, 21700, 4680) are mechanically robust and cheap but leave packing voids. <b>Prismatic</b> cells (hard aluminium case) give good packing and large capacity per cell. <b>Pouch</b> cells (laminated foil) have the best gravimetric density but need external compression and support.</p>
<p>Connecting $n_s$ cells in series multiplies the voltage; $n_p$ strings in parallel multiply capacity and current capability. Pack energy is $E = n_s n_p V_{cell} Q_{cell}$. Cells are first grouped into <b>modules</b> (with monitoring, busbars, cooling) and modules into the <b>pack</b> (with BMS, contactors, fuses, enclosure). A pack-level mass factor (cells ≈ 60–70 % of pack mass) accounts for structure and thermal system.</p>`,
    eqs: [['V_{pack} = n_s V_{cell},\\quad Q_{pack} = n_p Q_{cell}', ''], ['E_{pack} = n_s n_p V_{cell} Q_{cell},\\quad R_{pack} = \\frac{n_s}{n_p}R_{cell}', ''], ['I_{max} = n_p I_{cell,max},\\quad m_{pack} = \\frac{n_s n_p m_{cell}}{k_{cell}}', '']],
    params: [{ id: 'fmt', l: 'Cell format', type: 'seg', str: true, v: 'cylindrical', opts: [['cylindrical', 'Cylindrical'], ['prismatic', 'Prismatic'], ['pouch', 'Pouch']] }, { id: 's', l: 'Cells in series ns', min: 1, max: 200, step: 1, v: 12 }, { id: 'p', l: 'Cells in parallel np', min: 1, max: 80, step: 1, v: 4 }, { h: 'Cell data (auto-filled per format, editable)' }, { id: 'Vc', l: 'Cell nominal voltage', u: 'V', min: 1.2, max: 4.2, step: 0.01, v: 3.6 }, { id: 'Qc', l: 'Cell capacity', u: 'Ah', min: 1, max: 200, step: 0.5, v: 5 }, { id: 'Ic', l: 'Cell max continuous current', u: 'A', min: 1, max: 600, step: 1, v: 15 }, { id: 'mc', l: 'Cell mass', u: 'g', min: 20, max: 3000, step: 5, v: 70 }, { id: 'Rc', l: 'Cell resistance', u: 'mΩ', min: 0.2, max: 60, step: 0.1, v: 15 }, { id: 'kc', l: 'Cell-to-pack mass ratio', min: 0.4, max: 0.9, step: 0.01, v: 0.65 }],
    tools: [{ l: '21700 cell', f: a => { a.set('fmt', 'cylindrical'); a.set('Vc', 3.6); a.set('Qc', 5); a.set('Ic', 15); a.set('mc', 70); a.set('Rc', 15); } }, { l: 'Prismatic 50 Ah', f: a => { a.set('fmt', 'prismatic'); a.set('Vc', 3.65); a.set('Qc', 50); a.set('Ic', 150); a.set('mc', 900); a.set('Rc', 1.2); } }, { l: 'Pouch 60 Ah', f: a => { a.set('fmt', 'pouch'); a.set('Vc', 3.65); a.set('Qc', 60); a.set('Ic', 180); a.set('mc', 850); a.set('Rc', 1.0); } }, { l: 'Unit 4 pack (96s3p)', f: a => { a.set('fmt', 'prismatic'); a.set('Vc', 3.65); a.set('Qc', 48); a.set('Ic', 150); a.set('mc', 860); a.set('Rc', 1.5); a.set('s', 96); a.set('p', 3); } }],
    compute(p) {
      const pk = pack({ s: p.s, p: p.p, Vcell: p.Vc, Ah: p.Qc, R: p.Rc / 1000, kg: p.mc / 1000, Imax: p.Ic });
      const mPack = pk.kg / p.kc;
      return {
        kpis: [kv('Pack voltage', pk.V, 'V', 'acc'), kv('Pack capacity', pk.Ah, 'Ah'), kv('Pack energy', pk.kWh, 'kWh', 'good'), kv('Number of cells', pk.n, ''), kv('Max continuous current', pk.I, 'A'), kv('Max continuous power', pk.I * pk.V / 1000, 'kW'), kv('Pack resistance', pk.R * 1000, 'mΩ'), kv('Cell mass', pk.kg, 'kg'), kv('Approx. pack mass', mPack, 'kg'), kv('Pack specific energy', pk.kWh * 1000 / mPack, 'Wh/kg')],
        steps: [['', `V_{pack} = ${p.s}\\times${p.Vc} = ${fmt(pk.V)}\\,V`], ['', `Q_{pack} = ${p.p}\\times${p.Qc} = ${fmt(pk.Ah)}\\,Ah`], ['', `E = ${fmt(pk.V)}\\times${fmt(pk.Ah)} = ${fmt(pk.kWh)}\\,kWh`], ['', `R_{pack} = \\frac{${p.s}}{${p.p}}\\times${p.Rc}\\,m\\Omega = ${fmt(pk.R * 1000)}\\,m\\Omega`], ['', `m_{pack} \\approx \\frac{${pk.n}\\times${p.mc}\\,g}{${p.kc}} = ${fmt(mPack)}\\,kg`]],
        obs: { cols: ['Format', 'Packing efficiency', 'Gravimetric density', 'Thermal management', 'Mechanical', 'Typical EVs'], rows: [['Cylindrical', 'Low (voids)', 'Medium–high', 'Easy (side/bottom cooling)', 'Robust can', 'Tesla (2170/4680)'], ['Prismatic', 'High', 'Medium', 'Base-plate cooling', 'Rigid Al case', 'BYD Blade (LFP), many Chinese EVs'], ['Pouch', 'High', 'Highest', 'Needs cooling fins', 'Needs compression/support', 'Hyundai, GM Ultium']] },
      };
    },
    draw(g, W, H, A) {
      const T = A.T; const s = Math.min(A.p.s, 16), pp = Math.min(A.p.p, 6);
      const cw = Math.min(46, (W - 140) / s), ch = Math.min(46, (H - 120) / pp);
      const x0 = (W - s * cw) / 2, y0 = 70;
      text(g, `${A.p.s}s${A.p.p}p  –  ${fmt(A.p.s * A.p.Vc)} V, ${fmt(A.p.p * A.p.Qc)} Ah${A.p.s > 16 || A.p.p > 6 ? '  (first 16 × 6 cells drawn)' : ''}`, W / 2, 24, { weight: 800, size: 15 });
      for (let j = 0; j < pp; j++) {
        for (let i = 0; i < s; i++) { const x = x0 + i * cw, y = y0 + j * ch; rrect(g, x + 4, y + 6, cw - 8, ch - 12, 5); g.fillStyle = hex(T.blue, .3); g.fill(); g.strokeStyle = T.blue; g.stroke(); text(g, '+', x + cw - 10, y + ch / 2, { size: 10, color: T.red }); }
        flow(g, [[x0 - 30, y0 + j * ch + ch / 2], [x0 + s * cw + 30, y0 + j * ch + ch / 2]], A.t, 0.35 / pp + .05, T.cyan, { w: 1.5, arrowAt: false });
      }
      line(g, [[x0 - 30, y0 + ch / 2], [x0 - 30, y0 + (pp - .5) * ch]], T.orange, 4); line(g, [[x0 + s * cw + 30, y0 + ch / 2], [x0 + s * cw + 30, y0 + (pp - .5) * ch]], T.orange, 4);
      text(g, '−', x0 - 44, y0 + pp * ch / 2, { size: 20, weight: 800, color: T.blue }); text(g, '+', x0 + s * cw + 44, y0 + pp * ch / 2, { size: 20, weight: 800, color: T.red });
      text(g, `Series → voltage adds (${A.p.s} × ${A.p.Vc} V)`, W / 2, y0 + pp * ch + 22, { color: T.cyan }); text(g, `Parallel ↓ capacity adds (${A.p.p} × ${A.p.Qc} Ah)`, W / 2, y0 + pp * ch + 42, { color: T.orange });
    },
    viva: [['What changes when cells are connected in parallel?', 'Capacity and current capability multiply; voltage stays the same; resistance divides.'], ['Why is pack specific energy lower than cell specific energy?', 'Housing, busbars, BMS, cooling and structure add mass (cell-to-pack ratio ≈ 0.6–0.7).'], 'Compare cylindrical and pouch cells for thermal management.', 'Why are modules used between cell and pack levels?'],
    mcq: [{ q: 'A 96s3p pack of 3.65 V, 48 Ah cells has energy', o: ['16.8 kWh', '50.5 kWh', '35 kWh', '144 kWh'], a: 1, e: '96×3×3.65×48 = 50.46 kWh' }, { q: 'Pack resistance of ns series and np parallel cells is', o: ['ns·np·R', 'R·ns/np', 'R·np/ns', 'R/(ns·np)'], a: 1 }, { q: 'Highest gravimetric density format is usually', o: ['Cylindrical', 'Prismatic', 'Pouch', 'Lead-acid block'], a: 2 }],
  },
  // =====================================================================================================
  {
    id: '2.3', kind: 'sim', stageH: 420,
    aim: 'To study the electrochemical operation of a battery cell during charging and discharging.',
    objectives: ['Describe the half-cell reactions.', 'Visualise electron flow in the external circuit and ion flow in the electrolyte.', 'Observe terminal voltage, current, internal resistance drop, temperature and SOC.'],
    theory: `<p>A cell converts chemical energy into electrical energy by a <b>redox</b> reaction split into two half-reactions at physically separated electrodes. During <b>discharge</b>, oxidation occurs at the negative electrode (anode), releasing electrons to the external circuit, while positive ions travel through the electrolyte to the positive electrode (cathode) where reduction occurs. During <b>charge</b> the external source forces the reverse reactions.</p>
<p>For a graphite / NMC lithium-ion cell:<br>Negative: $\\mathrm{Li_xC_6 \\rightleftharpoons C_6 + x Li^+ + x e^-}$<br>Positive: $\\mathrm{Li_{1-x}MO_2 + x Li^+ + x e^- \\rightleftharpoons LiMO_2}$</p>
<p>The terminal voltage is the open-circuit voltage less the drop across the internal resistance: $v_t = OCV(z) - i R_{int}$ (discharge) and $v_t = OCV(z) + |i| R_{int}$ (charge). The internal loss $i^2R$ heats the cell. Here the internal resistance can be varied to see its effect.</p>`,
    eqs: [['v_t = OCV(z) - i\\,R_{int}', ''], ['z(t) = z_0 - \\frac{1}{3600Q}\\int_0^t i\\,d\\tau', ''], ['P_{loss} = i^2 R_{int}', '']],
    params: [{ id: 'dir', l: 'Process', type: 'seg', str: true, v: 'dis', opts: [['dis', 'Discharge'], ['chg', 'Charge']] }, { id: 'chem', l: 'Chemistry', type: 'select', str: true, v: 'NMC', opts: chemOpts }, { id: 'C', l: 'Current (C-rate)', u: 'C', min: 0.1, max: 5, step: 0.1, v: 1 }, { id: 'Q', l: 'Capacity', u: 'Ah', min: 2, max: 100, step: 1, v: 50 }, { id: 'R', l: 'Internal resistance', u: 'mΩ', min: 0.5, max: 20, step: 0.1, v: 1.5 }, { id: 'z0', l: 'Initial SOC', u: '%', min: 2, max: 100, step: 1, v: 80 }, { id: 'Ta', l: 'Ambient temperature', u: '°C', min: -10, max: 45, step: 1, v: 25 }],
    tools: [{ l: '▶ Discharge', f: a => { a.set('dir', 'dis'); a.run(); } }, { l: '▶ Charge', f: a => { a.set('dir', 'chg'); a.set('z0', 20); a.run(); } }],
    sim: {
      dt: 1, timeScale: 60, sampleEvery: 5,
      init: p => ({ c: new ECM({ chem: p.chem, Q: p.Q, R0: p.R / 1000, order: 0, z: p.z0 / 100, T: p.Ta, Tamb: p.Ta, mcp: 18 * p.Q, hA: 0.01 * p.Q }), v: ocv(p.z0 / 100, p.chem), i: 0, t: 0, done: false }),
      step(s, p, dt) {
        const c = s.c; let i = p.C * p.Q * (p.dir === 'dis' ? 1 : -1);
        if (p.dir === 'chg') { const icv = (c.ocv - CHEM[p.chem].Vmax) / (c.R0 * c.kR); i = Math.max(i, icv); if (Math.abs(i) < p.Q / 20) s.done = true; }
        s.v = c.step(i, dt); s.i = i; s.t += dt;
        if (p.dir === 'dis' && (s.v <= CHEM[p.chem].Vmin || c.z <= 0.001)) s.done = true;
      },
      done: s => s.done,
      sample: (s, p) => ({ kpis: [kv('Terminal voltage', s.v, 'V', 'acc', 3), kv('OCV', s.c.ocv, 'V', '', 3), kv('i·R drop', s.i * p.R / 1000 * s.c.kR, 'V', '', 3), kv('Current', s.i, 'A'), kv('SOC', s.c.z * 100, '%', 'good', 1), kv('Temperature', s.c.T, '°C'), kv('I²R loss', s.i * s.i * p.R / 1000 * s.c.kR, 'W')], push: { v: [s.t, s.v, s.c.ocv], z: [s.t, s.c.z * 100], T: [s.t, s.c.T] } }),
      charts: [{ id: 'v', title: 'Terminal voltage and OCV', xl: 'Time (s)', yl: 'V', s: ['v_t', 'OCV'] }, { id: 'z', title: 'SOC', xl: 'Time (s)', yl: '%', s: ['SOC'] }, { id: 'T', title: 'Temperature', xl: 'Time (s)', yl: '°C', s: ['T'] }],
    },
    compute(p) { return { html: `<div class="note"><b>Step-by-step (${p.dir === 'dis' ? 'discharge' : 'charge'}):</b> ${p.dir === 'dis' ? '① Li atoms in the graphite (negative) are oxidised: Li → Li⁺ + e⁻. ② Electrons leave through the copper collector and do work in the load. ③ Li⁺ ions cross the electrolyte and separator. ④ At the positive electrode Li⁺ and e⁻ recombine and intercalate into the metal oxide (reduction).' : '① The charger pushes electrons into the negative terminal. ② Li⁺ ions leave the metal-oxide lattice (oxidation at the positive). ③ Ions cross the separator. ④ Li⁺ and e⁻ combine and intercalate between graphene layers of the negative electrode (reduction).'}</div>` }; },
    draw(g, W, H, A) { drawCell(g, W, H, A); },
    viva: [['At which electrode does oxidation occur during discharge?', 'At the negative electrode (anode).'], ['Why is the terminal voltage higher than OCV while charging?', 'The charger must also supply the drop across the internal resistance: v_t = OCV + |i|R.'], 'What carries charge inside the cell and what outside?', 'How does temperature affect internal resistance?'],
    mcq: [{ q: 'Electrons flow from negative to positive terminal through', o: ['Electrolyte', 'Separator', 'External circuit', 'Current collector only'], a: 2 }, { q: 'With OCV = 3.7 V, i = 50 A discharge and R = 2 mΩ, v_t =', o: ['3.8 V', '3.6 V', '3.7 V', '3.5 V'], a: 1 }],
  },
  // =====================================================================================================
  {
    id: '2.4', kind: 'static', stageH: 360,
    aim: 'To compare lithium-ion chemistries (LFP, NMC, NCA, LCO, LTO) and visualise lithium intercalation.',
    objectives: ['Identify cathode/anode materials of each chemistry.', 'Compare voltage, energy, power, cycle life, thermal stability, cost and charging characteristics.', 'Relate OCV curve shape to SOC estimation difficulty.'],
    theory: `<p>All lithium-ion cells shuttle Li⁺ between two <b>intercalation</b> hosts. The <b>cathode</b> material sets most of the cell properties: layered oxides (<b>NMC</b> LiNi<sub>x</sub>Mn<sub>y</sub>Co<sub>z</sub>O₂, <b>NCA</b>, <b>LCO</b> LiCoO₂) give high voltage and energy; olivine <b>LFP</b> (LiFePO₄) is safer, longer-lived and cheaper, with a flat 3.2–3.3 V plateau; <b>LTO</b> replaces graphite with lithium titanate as the anode, giving 2.4 V nominal, very high power, fast charging and extreme cycle life at low energy.</p>
<p>The <b>electrolyte</b> is LiPF₆ in ethylene/dimethyl carbonates; the <b>separator</b> is a microporous polyolefin film. A flat OCV curve (LFP) makes OCV-based SOC estimation difficult; a sloping curve (NMC, LTO) is easier to estimate. Values below are <b>indicative commercial cell-level ranges</b>, as in Table 2.2 of the notes.</p>`,
    eqs: [['\\mathrm{LiFePO_4 \\rightleftharpoons FePO_4 + Li^+ + e^-}', 'LFP cathode reaction'], ['\\mathrm{LiC_6 \\rightleftharpoons C_6 + Li^+ + e^-}', 'Graphite anode'], ['E_{cell} = E_{cathode} - E_{anode}', '']],
    params: [{ id: 'chem', l: 'Highlight chemistry', type: 'select', str: true, v: 'NMC', opts: chemOpts }, { id: 'dir', l: 'Intercalation animation', type: 'seg', str: true, v: 'chg', opts: [['chg', 'Charging (into graphite)'], ['dis', 'Discharging (into cathode)']] }, { id: 'prop', l: 'Compare property', type: 'select', str: true, v: 'E', opts: [['E', 'Specific energy'], ['P', 'Specific power'], ['C', 'Cycle life'], ['V', 'Nominal voltage']] }],
    compute(p) {
      const zs = range(0, 1, 101); const ks = Object.keys(CHEM);
      const val = (c, k) => k === 'E' ? (CHEM[c].Ewh[0] + CHEM[c].Ewh[1]) / 2 : k === 'P' ? (CHEM[c].Pw[0] + CHEM[c].Pw[1]) / 2 : k === 'C' ? (CHEM[c].cyc[0] + CHEM[c].cyc[1]) / 2 : CHEM[c].Vnom;
      const C = CHEM[p.chem];
      return {
        kpis: [kv('Chemistry', C.name, '', 'acc'), kv('Nominal voltage', C.Vnom, 'V'), kv('Voltage window', `${C.Vmin}–${C.Vmax}`, 'V'), kv('Specific energy', `${C.Ewh[0]}–${C.Ewh[1]}`, 'Wh/kg'), kv('Cycle life', `${C.cyc[0]}–${C.cyc[1]}`, 'cycles'), kv('dOCV/dz at 50 %', docv(.5, p.chem), 'V'), kv('Thermal stability', C.thermal), kv('Cost', C.cost)],
        charts: [lc('ocv', 'OCV versus SOC (illustrative curves)', 'SOC (%)', 'OCV (V)', ks.map(k => S(k, zs.map(z => z * 100), zs.map(z => ocv(z, k)), { color: CHEM[k].color, width: k === p.chem ? 3.2 : 1.4 }))), lc('cmp', { E: 'Specific energy (Wh/kg, mid-range)', P: 'Specific power (W/kg, mid-range)', C: 'Cycle life (mid-range)', V: 'Nominal voltage (V)' }[p.prop], 'Chemistry (1 NMC 2 NCA 3 LFP 4 LCO 5 LTO)', '', [S('value', [1, 2, 3, 4, 5], ks.map(k => val(k, p.prop)), { type: 'bar' })], { xr: [.4, 5.6] })],
        obs: { cols: ['Chemistry', 'Nominal V', 'Wh/kg', 'W/kg', 'Cycle life', 'Thermal stability', 'Cost', 'Charging'], rows: ks.map(k => [CHEM[k].name, CHEM[k].Vnom, `${CHEM[k].Ewh[0]}–${CHEM[k].Ewh[1]}`, `${CHEM[k].Pw[0]}–${CHEM[k].Pw[1]}`, `${CHEM[k].cyc[0]}–${CHEM[k].cyc[1]}`, CHEM[k].thermal, CHEM[k].cost, CHEM[k].charge]) },
      };
    },
    draw(g, W, H, A) {
      const T = A.T, chg = A.p.dir === 'chg'; const cx = W / 2;
      // graphite layers (left) and layered oxide (right)
      const L = 40, R = W - 40, y0 = 60, y1 = H - 40;
      text(g, A.p.chem === 'LTO' ? 'Li₄Ti₅O₁₂ anode (spinel)' : 'Graphite anode: graphene layers', (L + cx - 30) / 2, 30, { weight: 700 });
      text(g, `${A.p.chem} cathode lattice`, (cx + 30 + R) / 2, 30, { weight: 700 });
      for (let k = 0; k < 7; k++) { const y = y0 + k * (y1 - y0) / 6; for (let x = L; x < cx - 40; x += 18) { g.strokeStyle = '#64748b'; g.beginPath(); for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3; g.lineTo(x + 7 * Math.cos(a), y + 5 * Math.sin(a)); } g.closePath(); g.stroke(); } }
      for (let k = 0; k < 7; k++) { const y = y0 + k * (y1 - y0) / 6; for (let x = cx + 40; x < R; x += 22) { g.fillStyle = hex(CHEM[A.p.chem].color, .55); g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.fillStyle = hex('#ef4444', .6); g.beginPath(); g.arc(x + 11, y + 6, 3, 0, 7); g.fill(); } }
      g.fillStyle = hex(T.cyan, .08); g.fillRect(cx - 30, y0 - 10, 60, y1 - y0 + 20); text(g, 'separator', cx, y1 + 22, { size: 11, color: T.muted });
      const n = 30, ph = (A.t * 0.18) % 1;
      for (let k = 0; k < n; k++) {
        const f = (k / n + ph) % 1; const lane = k % 6; const y = y0 + (lane + .5) * (y1 - y0) / 6;
        const xs = chg ? R - 20 - f * (R - L - 40) : L + 20 + f * (R - L - 40);
        g.fillStyle = T.green; g.beginPath(); g.arc(xs, y, 4.5, 0, 7); g.fill();
      }
      text(g, chg ? '← Li⁺ de-intercalate from cathode and intercalate between graphene layers' : 'Li⁺ leave graphite and intercalate into the cathode lattice →', cx, H - 14, { color: T.green, weight: 700 });
    },
    viva: [['Why is LFP preferred for low-cost, long-life EVs and buses?', 'Very stable olivine structure: high thermal stability, 2000–6000 cycles, no cobalt/nickel, low cost; at the expense of energy density.'], ['Why is SOC estimation from OCV harder for LFP?', 'Its OCV curve is very flat between 20 and 90 % SOC so small voltage errors produce large SOC errors.'], 'What is the role of the SEI layer?', 'Why does LTO allow very fast charging?'],
    mcq: [{ q: 'Which chemistry has the lowest nominal voltage?', o: ['NMC', 'LFP', 'LTO', 'LCO'], a: 2 }, { q: 'Which chemistry contains no cobalt or nickel?', o: ['NMC', 'NCA', 'LFP', 'LCO'], a: 2 }, { q: 'The intercalation host in the negative electrode of most EV cells is', o: ['Lithium metal', 'Graphite', 'Cobalt oxide', 'Silicon only'], a: 1 }],
  },
  // =====================================================================================================
  {
    id: '2.5', kind: 'static', stageH: 300,
    aim: 'To evaluate battery charge, discharge and round-trip efficiency and losses versus temperature, current, SOC and internal resistance.',
    objectives: ['Compute voltage drop, I²R loss and heat generation.', 'Evaluate coulombic, voltage and energy efficiency.', 'Study the effect of C-rate and temperature on efficiency and available capacity.'],
    theory: `<p>Battery losses are dominated by the internal resistance, which rises sharply at low temperature (Arrhenius behaviour). For a current $I$, the <b>voltage efficiency</b> on discharge is $\\eta_{v,d} = V_t/V_{oc} = 1 - IR/V_{oc}$ and on charge $\\eta_{v,c} = V_{oc}/V_t = V_{oc}/(V_{oc}+IR)$. With coulombic efficiency $\\eta_C$ (≈ 0.995–0.999 for Li-ion) the <b>round-trip energy efficiency</b> is $\\eta_E = \\eta_C \\eta_{v,d}\\eta_{v,c}$. Heat generation is $\\dot Q = I^2R$ (plus a small reversible entropic term, neglected).</p>
<p>At low temperature the usable capacity also falls and the voltage reaches the cut-off earlier; at high C-rate the polarisation increases. The temperature model here is illustrative: $R(T) = R_{25}\\exp[3000(1/T - 1/298)]$.</p>`,
    eqs: [['\\eta_{v,d} = 1 - \\frac{IR}{V_{oc}},\\quad \\eta_{v,c} = \\frac{V_{oc}}{V_{oc} + IR}', ''], ['\\eta_E = \\eta_C\\,\\eta_{v,d}\\,\\eta_{v,c}', ''], ['\\dot Q = I^2 R(T)', '']],
    params: [{ id: 'chem', l: 'Chemistry', type: 'select', str: true, v: 'NMC', opts: chemOpts }, { id: 'T', l: 'Cell temperature', u: '°C', min: -20, max: 50, step: 1, v: 25 }, { id: 'C', l: 'C-rate', u: 'C', min: 0.1, max: 5, step: 0.1, v: 1 }, { id: 'z', l: 'SOC', u: '%', min: 5, max: 100, step: 1, v: 50 }, { id: 'R', l: 'Internal resistance at 25 °C', u: 'mΩ', min: 0.5, max: 10, step: 0.1, v: 1.5 }, { id: 'Q', l: 'Capacity', u: 'Ah', min: 2, max: 100, step: 1, v: 50 }, { id: 'etaC', l: 'Coulombic efficiency', min: 0.95, max: 1, step: 0.001, v: 0.997, d: 3 }],
    compute(p) {
      const R = p.R / 1000 * rTemp(p.T), I = p.C * p.Q, Voc = ocv(p.z / 100, p.chem);
      const evd = 1 - I * R / Voc, evc = Voc / (Voc + I * R), eE = p.etaC * evd * evc;
      const Cs = range(0.1, 5, 50), Ts = range(-20, 50, 71);
      const eff = (c, T) => { const r = p.R / 1000 * rTemp(T), i = c * p.Q; return p.etaC * (1 - i * r / Voc) * Voc / (Voc + i * r) * 100; };
      const disc = c => { const e = new ECM({ chem: p.chem, Q: p.Q, R0: p.R / 1000, R1: 0.8e-3 * 50 / p.Q, C1: 25000 * p.Q / 50, order: 1, T: p.T, Tamb: p.T, mcp: 1e9, z: 1 }); const X = [], Y = []; let ah = 0; for (let k = 0; k < 20000; k++) { const v = e.step(c * p.Q, 5); ah += c * p.Q * 5 / 3600; if (k % 6 === 0) { X.push(ah); Y.push(v); } if (v < CHEM[p.chem].Vmin || e.z <= 0) break; } return [X, Y, ah]; };
      const curves = [0.5, 1, 2, 3].map(c => [c, disc(c)]);
      return {
        kpis: [kv('Current', I, 'A'), kv('R at T', R * 1000, 'mΩ'), kv('OCV', Voc, 'V', '', 3), kv('Voltage drop IR', I * R, 'V', '', 3), kv('Discharge η (voltage)', evd * 100, '%'), kv('Charge η (voltage)', evc * 100, '%'), kv('Round-trip energy η', eE * 100, '%', 'good'), kv('Internal loss / heat', I * I * R, 'W', 'warn'), kv('Available capacity factor', qTemp(p.T) * 100, '%')],
        charts: [lc('ec', 'Round-trip efficiency vs C-rate', 'C-rate', 'η (%)', [S(`${p.T} °C`, Cs, Cs.map(c => eff(c, p.T))), S('25 °C', Cs, Cs.map(c => eff(c, 25)), { dash: [4, 4] }), S('0 °C', Cs, Cs.map(c => eff(c, 0)), { dash: [2, 3] })]), lc('et', 'Effect of temperature on resistance and capacity', 'Temperature (°C)', 'Normalised', [S('R/R25', Ts, Ts.map(rTemp)), S('Q/Q25', Ts, Ts.map(qTemp))]), lc('dc', 'Discharge curves at different C-rates (1-RC model)', 'Discharged capacity (Ah)', 'Terminal voltage (V)', curves.map(([c, d]) => S(`${c}C`, d[0], d[1])))],
        steps: [['', `R(T) = ${p.R}\\,m\\Omega\\times e^{3000(1/${(p.T + 273.15).toFixed(2)} - 1/298.15)} = ${fmt(R * 1000)}\\,m\\Omega`], ['', `\\eta_{v,d} = 1 - \\frac{${fmt(I)}\\times${fmt(R)}}{${fmt(Voc)}} = ${fmt(evd)}`], ['', `\\eta_{v,c} = \\frac{${fmt(Voc)}}{${fmt(Voc)} + ${fmt(I * R)}} = ${fmt(evc)}`], ['', `\\eta_E = ${p.etaC}\\times${fmt(evd)}\\times${fmt(evc)} = ${fmt(eE)}`]],
        obs: { cols: ['C-rate', 'Delivered capacity (Ah)', 'Capacity utilisation (%)'], rows: curves.map(([c, d]) => [c, d[2], 100 * d[2] / p.Q]) },
      };
    },
    draw(g, W, H, A) {
      const T = A.T; const R = A.R; if (!R.kpis) return;
      const eE = R.kpis[6][1] / 100, loss = R.kpis[7][1];
      text(g, 'Energy round trip: 100 units charged → delivered', 14, 18, { align: 'left', weight: 700 });
      const x0 = 40, w = W - 80, y = 70;
      g.fillStyle = hex(T.cyan, .25); g.fillRect(x0, y, w, 34); text(g, 'Energy into battery 100 %', x0 + w / 2, y + 17, { weight: 700 });
      flow(g, [[x0 + w * eE / 2, y + 36], [x0 + w * eE / 2, y + 100]], A.t, eE, T.green, { w: 3 }); flow(g, [[x0 + w * (1 + eE) / 2, y + 36], [x0 + w * (1 + eE) / 2, y + 100]], A.t, 1 - eE + .05, T.red, { w: 3 });
      g.fillStyle = hex(T.green, .3); g.fillRect(x0, y + 104, w * eE, 34); text(g, `Delivered ${fmt(eE * 100)} %`, x0 + w * eE / 2, y + 121, { weight: 700 });
      g.fillStyle = hex(T.red, .3); g.fillRect(x0 + w * eE, y + 104, w * (1 - eE), 34); text(g, `Heat ${fmt(100 - eE * 100)} %`, x0 + w * (1 + eE) / 2, y + 150, { color: T.red, weight: 700 });
      text(g, `Instantaneous heat generation at ${A.p.C}C: ${fmt(loss)} W per cell`, W / 2, H - 30, { color: T.orange, weight: 700 });
    },
    viva: [['Why does battery efficiency drop at low temperature?', 'Electrolyte conductivity and charge-transfer kinetics fall, so internal resistance rises and I²R losses grow.'], ['Define coulombic efficiency.', 'Ratio of charge delivered on discharge to charge supplied on charge (Ah out / Ah in).'], 'Why is less capacity delivered at higher C-rate?', 'How does heat generation scale with current?'],
    mcq: [{ q: 'Doubling the current at constant R increases I²R loss by', o: ['2×', '4×', '√2×', 'no change'], a: 1 }, { q: 'Typical coulombic efficiency of Li-ion', o: ['80 %', '90 %', '>99 %', '70 %'], a: 2 }],
  },
  // =====================================================================================================
  {
    id: '2.6', kind: 'static', stageH: 260,
    aim: 'To calculate the nominal battery capacity required for a target range.',
    objectives: ['Compute the energy needed for a range and consumption.', 'Apply usable SOC window, battery efficiency and design reserve.', 'Convert energy to Ah at the chosen voltage.'],
    theory: `<p>The required <b>usable energy</b> equals range × consumption. Not all nominal energy is usable: the BMS restricts SOC to a window (e.g. 5–95 %), the battery delivers only $\\eta_b$ of its stored energy as terminal energy, and a design reserve covers ageing (end-of-life capacity 80 %) and cold weather. Hence</p>$$E_{nom} = \\frac{R\\,e_c}{\\Delta SOC\\,\\eta_b}\\,(1+k_{res}),\\qquad Q = \\frac{E_{nom}}{V_{nom}}.$$
<p>If consumption is unknown it is estimated from vehicle mass with a simple road-load model at a representative mixed-cycle speed.</p>`,
    eqs: [['E_{use} = R\\,e_c', ''], ['E_{nom} = \\frac{E_{use}}{\\Delta SOC\\,\\eta_b}(1+k_{res})', ''], ['Q_{Ah} = \\frac{1000\\,E_{nom}}{V_{nom}}', '']],
    params: [{ id: 'R', l: 'Target range', u: 'km', min: 50, max: 800, step: 10, v: 300 }, { id: 'auto', l: 'Estimate consumption from mass', type: 'check', v: false }, { id: 'ec', l: 'Energy consumption', u: 'Wh/km', min: 60, max: 350, step: 1, v: 150 }, { id: 'm', l: 'Vehicle mass (for estimate)', u: 'kg', min: 800, max: 3000, step: 10, v: 1600 }, { id: 'V', l: 'Battery voltage', u: 'V', min: 48, max: 800, step: 1, v: 350 }, { id: 'dsoc', l: 'Usable SOC window', u: '%', min: 50, max: 100, step: 1, v: 90 }, { id: 'eb', l: 'Battery efficiency', min: .85, max: 1, step: .005, v: .95, d: 3 }, { id: 'res', l: 'Design reserve (ageing, cold)', u: '%', min: 0, max: 40, step: 1, v: 10 }],
    tools: [{ l: 'Example: compact EV (Nexon-class)', f: a => { a.set('R', 300); a.set('ec', 135); a.set('V', 320); a.set('dsoc', 90); a.set('res', 10); } }, { l: 'Example: e-scooter', f: a => { a.set('R', 100); a.set('ec', 30); a.set('V', 60); a.set('dsoc', 90); a.set('res', 15); } }],
    compute(p) {
      const ec = p.auto ? (0.012 * p.m * 9.81 + 0.5 * 1.2 * 0.3 * 2.2 * (50 / 3.6) ** 2) / 3.6 / (0.95 * 0.93 * 0.97) * 1.15 + 15 : p.ec;
      const Eu = p.R * ec / 1000, En = Eu / (p.dsoc / 100 * p.eb) * (1 + p.res / 100), Q = En * 1000 / p.V;
      const Rs = range(50, 800, 40);
      return {
        kpis: [kv('Consumption used', ec, 'Wh/km'), kv('Usable energy', Eu, 'kWh'), kv('Nominal energy required', En, 'kWh', 'good'), kv('Capacity at ' + p.V + ' V', Q, 'Ah', 'acc'), kv('Cells (3.65 V, 50 Ah) ≈', Math.ceil(p.V / 3.65) * Math.ceil(Q / 50), '')],
        steps: [[`Consumption e<sub>c</sub> = ${fmt(ec)} Wh/km${p.auto ? ' (estimated from mass at 50 km/h + 15 % transients)' : ''}`], ['', `E_{use} = ${p.R}\\times${fmt(ec)} = ${fmt(Eu)}\\,kWh`], ['', `E_{nom} = \\frac{${fmt(Eu)}}{${p.dsoc / 100}\\times${p.eb}}(1+${p.res / 100}) = ${fmt(En)}\\,kWh`], ['', `Q = \\frac{1000\\times${fmt(En)}}{${p.V}} = ${fmt(Q)}\\,Ah`]],
        charts: [lc('er', 'Required nominal energy vs range', 'Range (km)', 'kWh', [100, 150, 200].map(e => S(`${e} Wh/km`, Rs, Rs.map(r => r * e / 1000 / (p.dsoc / 100 * p.eb) * (1 + p.res / 100)))), { marks: [{ x: p.R, y: En, label: 'design' }] })],
        obs: { cols: ['Range (km)', 'Usable (kWh)', 'Nominal (kWh)', 'Ah'], rows: [100, 200, 300, 400, 500].map(r => { const eu = r * ec / 1000, en = eu / (p.dsoc / 100 * p.eb) * (1 + p.res / 100); return [r, eu, en, en * 1000 / p.V]; }) },
        _f: [Eu, En],
      };
    },
    draw(g, W, H, A) {
      const T = A.T; const [Eu, En] = A.R._f || [0, 1]; const x = 60, w = W - 120, y = 80, hh = 70;
      const lo = (1 - A.p.dsoc / 100) / 2;
      g.strokeStyle = T.line; g.strokeRect(x, y, w, hh);
      g.fillStyle = hex(T.red, .25); g.fillRect(x, y, w * lo, hh); g.fillRect(x + w * (1 - lo), y, w * lo, hh);
      const uf = Eu / En; const fill = A.running ? 1 - ((A.t * 0.1) % 1) : 1;
      g.fillStyle = hex(T.green, .45); g.fillRect(x + w * lo, y, w * uf * fill, hh);
      g.fillStyle = hex(T.yellow, .3); g.fillRect(x + w * lo + w * uf, y, w * (1 - 2 * lo) - w * uf, hh);
      text(g, `Usable for range: ${fmt(Eu)} kWh`, x + w * lo + w * uf / 2, y + hh / 2, { weight: 700 });
      text(g, 'Reserve + losses', x + w * (1 - lo) - 60, y - 12, { color: T.yellow, size: 11 }); text(g, 'Outside SOC window', x + 50, y - 12, { color: T.red, size: 11 });
      text(g, `Nominal pack energy ${fmt(En)} kWh`, W / 2, y + hh + 30, { size: 15, weight: 800, color: T.cyan });
    },
    viva: ['Why is the full nominal capacity not used?', 'What is the purpose of the design reserve?', 'How does battery voltage choice affect the Ah rating?'],
    mcq: [{ q: 'For 300 km at 150 Wh/km, 90 % window, η = 0.95, 10 % reserve, nominal energy ≈', o: ['45 kWh', '52.6 kWh', '58.0 kWh', '62 kWh'], a: 2, e: '45/(0.9×0.95)×1.1 = 57.9 kWh' }],
  },
  // =====================================================================================================
  socExp(), sohExp(), waveExp(), paramsExp(), sizingExp(), ecmExp(), balanceExp(), bmsExp(), chargerArchExp(), ccCvExp(), standardsExp(),
];

// =========================================================================================================
function socExp() {
  return {
    id: '2.7', kind: 'sim', stageH: 300,
    aim: 'To estimate battery state of charge by Coulomb counting, OCV look-up, Kalman filter, extended Kalman filter and a model-based observer, and compare their errors.',
    objectives: ['Implement each SOC estimation method on a simulated cell with sensor noise and bias.', 'Study the effect of initial SOC error, current-sensor bias and measurement noise.', 'Compare estimation errors.'],
    theory: `<p>SOC cannot be measured directly. <b>Coulomb counting</b> integrates current: accurate short-term but drifts with current-sensor bias and cannot correct an initial error. The <b>OCV method</b> inverts the OCV(SOC) curve: accurate only after long rest; under load the terminal voltage includes $IR$ and polarisation drops. <b>Model-based observers</b> run an equivalent-circuit model in parallel with the cell and correct the SOC using the voltage error: a fixed-gain (Luenberger) observer, a linear <b>Kalman filter</b> (KF, linearised OCV) and the <b>extended Kalman filter</b> (EKF), which linearises the nonlinear OCV at each step and weights the correction by the estimated uncertainty. The reference SOC here is the true state of the simulated cell (1-RC NMC model).</p>
<p>Noise is generated by a seeded pseudo-random generator so every run is reproducible.</p>`,
    eqs: [['\\hat z_k = \\hat z_{k-1} - \\frac{\\eta (i_k + b)\\Delta t}{3600Q}', 'Coulomb counting (b = sensor bias)'], ['\\hat z = OCV^{-1}(v_t)', 'OCV method'], ['\\hat x_k^- = f(\\hat x_{k-1}, i_k),\\; K_k = P_k^-H^T(HP_k^-H^T+R)^{-1}', 'EKF predict / gain'], ['\\hat x_k = \\hat x_k^- + K_k\\,(v_k - h(\\hat x_k^-, i_k))', 'EKF update']],
    params: [{ id: 'prof', l: 'Current profile', type: 'select', str: true, v: 'dyn', opts: profOpts }, { id: 'z0', l: 'True initial SOC', u: '%', min: 20, max: 100, step: 1, v: 90 }, { id: 'zh0', l: 'Estimator initial SOC', u: '%', min: 0, max: 100, step: 1, v: 60 }, { id: 'Q', l: 'Cell capacity', u: 'Ah', min: 5, max: 100, step: 1, v: 48 }, { id: 'Qerr', l: 'Capacity error in estimator', u: '%', min: -20, max: 20, step: 1, v: 0 }, { id: 'sv', l: 'Voltage noise σ', u: 'mV', min: 0, max: 30, step: 0.5, v: 5 }, { id: 'si', l: 'Current noise σ', u: 'A', min: 0, max: 5, step: 0.1, v: 0.5 }, { id: 'bi', l: 'Current sensor bias', u: 'A', min: -2, max: 2, step: 0.05, v: 0.3 }, { id: 'scale', l: 'Profile amplitude', min: 0.2, max: 3, step: 0.1, v: 1.5 }],
    sim: {
      dt: 1, timeScale: 120, sampleEvery: 10,
      init(p) {
        const Qe = p.Q * (1 + p.Qerr / 100), R0 = 1.5e-3 * 48 / p.Q, R1 = 1e-3 * 48 / p.Q, C1 = 25000 * p.Q / 48;
        return { t: 0, cell: new ECM({ chem: 'NMC', Q: p.Q, R0, R1, C1, order: 1, z: p.z0 / 100, tempEffects: false, mcp: 1e9 }), r: rng(42), cc: p.zh0 / 100, ekf: new EKF({ chem: 'NMC', Q: Qe, R0, R1, C1, z: p.zh0 / 100, Rn: Math.max(1e-6, (p.sv / 1000) ** 2) }), kf: new LKF({ chem: 'NMC', Q: Qe, R0, z: p.zh0 / 100, Rn: Math.max(1e-4, (p.sv / 1000) ** 2 * 10) }), lu: { z: p.zh0 / 100, v1: 0 }, ocvz: p.zh0 / 100, Qe, R0, R1, C1, e: { cc: 0, ocv: 0, kf: 0, ekf: 0, lu: 0, n: 0 }, done: false, i: 0, v: 0 };
      },
      step(s, p, dt) {
        let i = profileCurrent(p.prof, s.t, p.Q) * p.scale; if (s.cell.z < 0.03 && i > 0) { i = 0; s.done = true; } if (s.cell.z > 0.99 && i < 0) i = 0;
        const v = s.cell.step(i, dt); s.t += dt; s.i = i; s.v = v;
        const im = i + p.bi + p.si * s.r.gauss(), vm = v + p.sv / 1000 * s.r.gauss();
        s.cc = clamp(s.cc - im * dt / (3600 * s.Qe), 0, 1);
        s.ocvz = socFromOcv(vm, 'NMC');
        s.kf.step(im, vm, dt); s.ekf.step(im, vm, dt);
        // Luenberger observer (fixed gain) on the 1-RC model
        const a = Math.exp(-dt / (s.R1 * s.C1)); s.lu.z = clamp(s.lu.z - im * dt / (3600 * s.Qe), 0, 1); s.lu.v1 = a * s.lu.v1 + s.R1 * (1 - a) * im;
        const ey = vm - (ocv(s.lu.z) - s.R0 * im - s.lu.v1); s.lu.z = clamp(s.lu.z + 0.002 * ey / Math.max(0.2, docv(s.lu.z)), 0, 1);
        const zt = s.cell.z; const E = s.e; E.n++; E.cc += (s.cc - zt) ** 2; E.ocv += (s.ocvz - zt) ** 2; E.kf += (s.kf.z - zt) ** 2; E.ekf += (s.ekf.z - zt) ** 2; E.lu += (s.lu.z - zt) ** 2;
        if (s.t > 30000) s.done = true;
      },
      done: s => s.done,
      sample(s) {
        const zt = s.cell.z * 100, r = k => Math.sqrt(s.e[k] / Math.max(1, s.e.n)) * 100;
        return { kpis: [kv('True SOC', zt, '%', 'acc'), kv('Coulomb counting', s.cc * 100, '%'), kv('EKF', s.ekf.z * 100, '%', 'good'), kv('RMS err: CC', r('cc'), '%'), kv('RMS err: OCV', r('ocv'), '%'), kv('RMS err: KF', r('kf'), '%'), kv('RMS err: EKF', r('ekf'), '%', 'good'), kv('RMS err: observer', r('lu'), '%'), kv('Current', s.i, 'A')], push: { z: [s.t / 60, zt, s.cc * 100, s.ocvz * 100, s.kf.z * 100, s.ekf.z * 100, s.lu.z * 100], e: [s.t / 60, (s.cc - s.cell.z) * 100, (s.kf.z - s.cell.z) * 100, (s.ekf.z - s.cell.z) * 100, (s.lu.z - s.cell.z) * 100], iv: [s.t / 60, s.i, s.v] } };
      },
      charts: [{ id: 'z', title: 'Reference SOC and estimates', xl: 'Time (min)', yl: 'SOC (%)', s: ['True', 'Coulomb count', 'OCV method', 'KF', 'EKF', 'Observer'], colors: ['#ffffff', '#f59e0b', '#64748b', '#a78bfa', '#22c55e', '#22d3ee'], dashes: [[], [], [2, 3], [], [], [4, 3]], wide: true }, { id: 'e', title: 'Estimation error', xl: 'Time (min)', yl: 'Error (%)', s: ['CC', 'KF', 'EKF', 'Observer'], colors: ['#f59e0b', '#a78bfa', '#22c55e', '#22d3ee'] }, { id: 'iv', title: 'Cell current and terminal voltage', xl: 'Time (min)', yl: 'A / V', s: ['Current (A)', 'Voltage (V)'] }],
    },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T;
      const items = [['True SOC', s.cell.z, '#e6ecf7'], ['Coulomb counting', s.cc, T.orange], ['OCV look-up', s.ocvz, '#64748b'], ['Kalman filter', s.kf.z, T.violet], ['Extended KF', s.ekf.z, T.green], ['Observer', s.lu.z, T.cyan]];
      const bw = (W - 80) / items.length;
      items.forEach(([l, z, c], k) => { const x = 40 + k * bw, y0 = 40, hh = H - 100; rrect(g, x + 12, y0, bw - 24, hh, 8); g.strokeStyle = c; g.lineWidth = 2; g.stroke(); g.fillStyle = hex(c, .35); g.fillRect(x + 14, y0 + hh * (1 - z), bw - 28, hh * z - 2); text(g, `${(z * 100).toFixed(1)} %`, x + bw / 2, y0 + hh + 18, { weight: 800, color: c }); text(g, l, x + bw / 2, y0 + hh + 38, { size: 11, color: T.muted }); });
      line(g, [[40, 40 + (H - 100) * (1 - s.cell.z)], [W - 40, 40 + (H - 100) * (1 - s.cell.z)]], '#ffffff', 1, [5, 4]);
    },
    viva: [['Why can Coulomb counting not correct an initial SOC error?', 'It only integrates current changes; without a voltage-based correction the initial offset persists and sensor bias accumulates.'], ['Why does the EKF converge quickly?', 'Initial covariance is large, so the Kalman gain weights the voltage measurement strongly until uncertainty reduces.'], 'Why is OCV-based estimation inaccurate under load?', 'What happens to the estimators if the capacity in the model is wrong?'],
    mcq: [{ q: 'The main weakness of Coulomb counting is', o: ['Noise sensitivity', 'Drift due to bias and unknown initial SOC', 'Needs OCV curve', 'Too complex'], a: 1 }, { q: 'The EKF linearises', o: ['The current sensor', 'The OCV–SOC relationship', 'The temperature', 'The capacity'], a: 1 }],
  };
}
function sohExp() {
  return {
    id: '2.8', kind: 'sim', stageH: 280,
    aim: 'To study battery ageing (capacity fade and resistance growth) and estimate SOH by capacity and resistance methods.',
    objectives: ['Model cycle and calendar ageing with a semi-empirical law.', 'Compute capacity-based and resistance-based SOH.', 'Estimate SOH from a virtual capacity test and a pulse test, and predict remaining useful life.'],
    theory: `<p>Batteries age by <b>cycle ageing</b> (SEI growth, particle cracking, lithium plating) and <b>calendar ageing</b> (SEI growth at rest, accelerated by high SOC and temperature). Two common definitions are</p>$$SOH_C = \\frac{Q_{act}}{Q_{nom}}\\times100\\%,\\qquad SOH_R = \\frac{R_{EoL} - R_{act}}{R_{EoL} - R_{new}}\\times100\\%.$$
<p>End of life (EoL) for EV traction is usually 80 % capacity. The model here is a <b>semi-empirical, illustrative</b> square-root-of-throughput law, $\\Delta Q/Q = k_T k_{DoD} k_C\\,a\\sqrt{N} + b\\,k_T\\sqrt{t}$ with Arrhenius-type temperature acceleration; it reproduces the shape of measured trends but is not fitted to a specific cell. The virtual tests estimate SOH exactly as a BMS or test bench would: a full C/3 discharge measures capacity, and a 1C current pulse measures $R = \\Delta V/\\Delta I$.</p>`,
    eqs: [['SOH_C = \\frac{Q_{act}}{Q_{nom}}', ''], ['SOH_R = \\frac{R_{EoL}-R}{R_{EoL}-R_{new}},\\quad R_{EoL} = 2R_{new}', ''], ['\\frac{\\Delta Q}{Q} = a k_T k_D k_C\\sqrt{N} + b k_T\\sqrt{t}', 'Illustrative semi-empirical model'], ['R = \\frac{\\Delta V}{\\Delta I}', 'Pulse test']],
    params: [{ id: 'dod', l: 'Depth of discharge per cycle', u: '%', min: 10, max: 100, step: 5, v: 80 }, { id: 'T', l: 'Average cell temperature', u: '°C', min: 0, max: 50, step: 1, v: 25 }, { id: 'cr', l: 'Average C-rate', u: 'C', min: 0.2, max: 3, step: 0.1, v: 1 }, { id: 'cpy', l: 'Cycles per year', min: 50, max: 600, step: 10, v: 300 }, { id: 'Q', l: 'Nominal capacity', u: 'Ah', min: 5, max: 100, step: 1, v: 50 }, { id: 'R0', l: 'New-cell resistance', u: 'mΩ', min: 0.5, max: 10, step: 0.1, v: 1.5 }],
    sim: {
      dt: 1, timeScale: 50, sampleEvery: 5, // 1 step = 10 equivalent cycles
      init: p => ({ N: 0, done: false }),
      step(s, p) { s.N += 10; if (s.N >= 4000) s.done = true; },
      done: s => s.done,
      sample(s, p) {
        const yrs = s.N / p.cpy, a = ageing({ cycles: s.N, years: yrs, dod: p.dod / 100, T: p.T, crate: p.cr });
        const R = p.R0 * a.SOHr, sohR = 100 * (2 * p.R0 - R) / (p.R0);
        return { kpis: [kv('Equivalent cycles', s.N, ''), kv('Years', yrs, 'y'), kv('Capacity', p.Q * a.SOHc, 'Ah'), kv('SOH (capacity)', a.SOHc * 100, '%', a.SOHc < .8 ? 'bad' : 'good'), kv('Resistance', R, 'mΩ'), kv('SOH (resistance)', Math.max(0, sohR), '%')], push: { q: [s.N, a.SOHc * 100], r: [s.N, a.SOHr * 100] } };
      },
      charts: [{ id: 'q', title: 'Capacity fade: SOH_C vs cycles', xl: 'Equivalent full cycles', yl: 'SOH (%)', s: ['SOH_C'] }, { id: 'r', title: 'Resistance growth vs cycles', xl: 'Equivalent full cycles', yl: 'R / R_new (%)', s: ['R'] }],
    },
    compute(p) {
      const Ns = range(0, 4000, 81); const f = (dod, T) => Ns.map(n => ageing({ cycles: n, years: n / p.cpy, dod, T, crate: p.cr }).SOHc * 100);
      let NE = NaN; for (const n of range(0, 8000, 801)) if (ageing({ cycles: n, years: n / p.cpy, dod: p.dod / 100, T: p.T, crate: p.cr }).SOHc < 0.8) { NE = n; break; }
      // virtual tests at the end of the present simulated age are shown in the results table
      const ages = [0, 500, 1000, 2000, 3000];
      const rows = ages.map(n => { const a = ageing({ cycles: n, years: n / p.cpy, dod: p.dod / 100, T: p.T, crate: p.cr }); const Qa = p.Q * a.SOHc, Ra = p.R0 * a.SOHr / 1000; const c = new ECM({ chem: 'NMC', Q: Qa, R0: Ra, order: 1, R1: Ra * .6, C1: 20000, z: 1, tempEffects: false, mcp: 1e9 }); let ah = 0; for (let k = 0; k < 40000; k++) { const v = c.step(Qa / 3, 10); ah += Qa / 3 * 10 / 3600; if (v < 3.0) break; } const c2 = new ECM({ chem: 'NMC', Q: Qa, R0: Ra, order: 1, R1: Ra * .6, C1: 20000, z: .5, tempEffects: false }); const v0 = c2.vt(0); const v1 = c2.step(p.Q, 0.01); const Rm = (v0 - v1) / p.Q; return [n, +(n / p.cpy).toFixed(2), ah, 100 * ah / p.Q, Rm * 1000, Math.max(0, 100 * (2 * p.R0 - Rm * 1000) / p.R0)]; });
      return {
        kpis: [kv('Cycles to 80 % (EoL)', NE, 'cycles', 'acc'), kv('Years to EoL', NE / p.cpy, 'y'), kv('Remaining useful life (from new)', NE * p.dod / 100 * 300 / 1000, '×1000 km (300 km/full cycle)')],
        charts: [lc('cmp', 'Effect of DoD and temperature on capacity fade', 'Cycles', 'SOH_C (%)', [S(`DoD ${p.dod} %, ${p.T} °C`, Ns, f(p.dod / 100, p.T), { width: 2.6 }), S('DoD 50 %, 25 °C', Ns, f(.5, 25), { dash: [4, 3] }), S('DoD 100 %, 25 °C', Ns, f(1, 25), { dash: [4, 3] }), S('DoD 80 %, 40 °C', Ns, f(.8, 40), { dash: [2, 3] })], { marks: [{ y: 80, label: 'EoL 80 %' }] })],
        obs: { cols: ['Cycles', 'Years', 'Measured capacity, C/3 test (Ah)', 'SOH_C (%)', 'Pulse-test R (mΩ)', 'SOH_R (%)'], rows },
      };
    },
    draw(g, W, H, A) {
      const T = A.T; const N = A.S ? A.S.N : 0; const a = ageing({ cycles: N, years: N / A.p.cpy, dod: A.p.dod / 100, T: A.p.T, crate: A.p.cr });
      const x = W * .1, w = W * .5, y = 40, hh = H - 80;
      g.fillStyle = '#334155'; g.fillRect(x, y, w * .2, hh); g.fillStyle = hex(T.violet, .4); g.fillRect(x + w * .8, y, w * .2, hh);
      const sei = (1 - a.SOHc) * w * 0.6; g.fillStyle = hex(T.orange, .7); g.fillRect(x + w * .2, y, sei, hh); text(g, 'SEI growth', x + w * .2 + sei / 2 + 30, y + 14, { size: 11, color: T.orange });
      const plating = Math.max(0, (A.p.cr - 1.5)) * (1 - a.SOHc) * 400; for (let k = 0; k < plating; k++) { g.fillStyle = '#e2e8f0'; g.beginPath(); g.arc(x + w * .2 + sei + 4, y + (k * 37) % hh, 2.5, 0, 7); g.fill(); }
      text(g, 'Anode', x + w * .1, y + hh + 16, { size: 11, color: T.muted }); text(g, 'Cathode', x + w * .9, y + hh + 16, { size: 11, color: T.muted });
      for (let k = 0; k < 40 * a.SOHc; k++) { g.fillStyle = T.green; g.beginPath(); g.arc(x + w * .32 + (k * 53) % (w * .45), y + 10 + (k * 29) % (hh - 20), 3.5, 0, 7); g.fill(); }
      text(g, `Cyclable lithium: ${(a.SOHc * 100).toFixed(1)} %`, x + w / 2, y - 12, { weight: 700, color: T.green });
      const gx = W * .7; text(g, 'SOH', gx + 60, 40, { weight: 800 }); g.strokeStyle = T.line; g.strokeRect(gx + 40, 54, 40, hh - 30); g.fillStyle = a.SOHc < .8 ? T.red : T.green; g.fillRect(gx + 42, 54 + (hh - 30) * (1 - a.SOHc), 36, (hh - 30) * a.SOHc - 2); text(g, `${(a.SOHc * 100).toFixed(1)} %`, gx + 60, hh + 40, { weight: 800 });
      line(g, [[gx + 30, 54 + (hh - 30) * .2], [gx + 90, 54 + (hh - 30) * .2]], T.red, 2, [4, 3]); text(g, 'EoL', gx + 108, 54 + (hh - 30) * .2, { color: T.red, size: 11 });
    },
    viva: [['Define SOH by two methods.', 'Capacity-based: present/nominal capacity. Resistance-based: (R_EoL − R)/(R_EoL − R_new).'], ['Why does high temperature accelerate ageing?', 'Side reactions (SEI growth, electrolyte decomposition) follow Arrhenius kinetics.'], 'Why does high DoD shorten cycle life?', 'What is the usual EoL criterion for EV batteries?'],
    mcq: [{ q: 'EV battery end-of-life is commonly defined at', o: ['50 % capacity', '80 % capacity', '95 % capacity', '0 % capacity'], a: 1 }, { q: 'Calendar ageing occurs', o: ['Only during cycling', 'Even at rest', 'Only below 0 °C', 'Never in LFP'], a: 1 }],
  };
}
function waveExp() {
  return {
    id: '2.9', kind: 'sim', stageH: 220,
    aim: 'To observe battery voltage, current, power, SOC and temperature waveforms for different charge/discharge profiles using the governing equations.',
    objectives: ['Relate each waveform to the governing equations.', 'Observe instantaneous and polarisation voltage responses to pulses.', 'Study charging and dynamic load waveforms.'],
    theory: `<p>The battery state is governed by charge conservation, the equivalent-circuit voltage equation and a lumped energy balance. All five waveforms are produced by the same 2-RC model integrated with a fixed 1 s step, so they are mutually consistent: power is $p = v_t i$, SOC integrates current, the instantaneous voltage jump at a current step equals $\\Delta i R_0$ and the slow recovery after the step follows the RC time constants $\\tau_1 = R_1C_1$, $\\tau_2 = R_2C_2$.</p>`,
    eqs: [['v_t = OCV(z) - R_0 i - v_1 - v_2', ''], ['\\dot v_j = -\\frac{v_j}{R_jC_j} + \\frac{i}{C_j}', 'j = 1, 2'], ['\\dot z = -\\frac{i}{3600Q},\\quad p = v_t i', ''], ['mc_p\\dot T = i^2R_0 + i(v_1+v_2) - hA(T - T_a)', '']],
    params: [{ id: 'prof', l: 'Profile', type: 'select', str: true, v: 'pulse', opts: profOpts }, { id: 'scale', l: 'Amplitude scale', min: 0.2, max: 3, step: 0.1, v: 1 }, { id: 'Q', l: 'Capacity', u: 'Ah', min: 5, max: 100, step: 1, v: 48 }, { id: 'z0', l: 'Initial SOC', u: '%', min: 5, max: 100, step: 1, v: 80 }, { id: 'Ta', l: 'Ambient', u: '°C', min: -10, max: 45, step: 1, v: 25 }, { id: 'hA', l: 'Cooling hA', u: 'W/K', min: 0.05, max: 5, step: 0.05, v: 0.5 }],
    sim: {
      dt: 1, timeScale: 30, sampleEvery: 2,
      init: p => ({ t: 0, c: new ECM({ chem: 'NMC', Q: p.Q, R0: 1.5e-3 * 48 / p.Q, R1: 1e-3 * 48 / p.Q, C1: 25000 * p.Q / 48, R2: 0.8e-3 * 48 / p.Q, C2: 300000 * p.Q / 48, order: 2, z: p.z0 / 100, T: p.Ta, Tamb: p.Ta, mcp: 900 * p.Q / 48, hA: p.hA }), i: 0, v: 0, done: false }),
      step(s, p, dt) { let i = profileCurrent(p.prof, s.t, p.Q) * p.scale; if (s.c.z < .02 && i > 0) i = 0; if (s.c.z > .99 && i < 0) i = 0; s.v = s.c.step(i, dt); s.i = i; s.t += dt; if (s.t > 20000) s.done = true; },
      done: s => s.done,
      sample: (s) => ({ kpis: [kv('Voltage', s.v, 'V', 'acc', 3), kv('Current', s.i, 'A'), kv('Power', s.v * s.i, 'W'), kv('SOC', s.c.z * 100, '%'), kv('Temperature', s.c.T, '°C'), kv('v₁ + v₂', s.c.v1 + s.c.v2, 'V', '', 4)], push: { v: [s.t, s.v, s.c.ocv], i: [s.t, s.i], p: [s.t, s.v * s.i], z: [s.t, s.c.z * 100], T: [s.t, s.c.T] } }),
      charts: [{ id: 'v', title: 'Voltage waveform', xl: 'Time (s)', yl: 'V', s: ['v_t', 'OCV'] }, { id: 'i', title: 'Current waveform', xl: 'Time (s)', yl: 'A', s: ['i'] }, { id: 'p', title: 'Power waveform', xl: 'Time (s)', yl: 'W', s: ['p'] }, { id: 'z', title: 'SOC waveform', xl: 'Time (s)', yl: '%', s: ['SOC'] }, { id: 'T', title: 'Temperature waveform', xl: 'Time (s)', yl: '°C', s: ['T'] }],
    },
    draw(g, W, H, A) { const s = A.S; if (!s) return; const T = A.T; const vals = [['v_t', s.v.toFixed(3) + ' V', T.cyan], ['i', s.i.toFixed(1) + ' A', T.orange], ['p', (s.v * s.i).toFixed(0) + ' W', T.violet], ['SOC', (s.c.z * 100).toFixed(1) + ' %', T.green], ['T', s.c.T.toFixed(1) + ' °C', T.red]]; const bw = W / 5; vals.forEach(([l, v, c], k) => { box(g, k * bw + 10, 30, bw - 20, H - 60, l, { color: c, active: true }); text(g, v, k * bw + bw / 2, H / 2 + 26, { size: 18, weight: 800, color: c }); }); },
    viva: ['How do you identify R0 from a pulse response?', 'Why does voltage keep recovering after the current is removed?', 'Which waveform reveals the thermal time constant?'],
    mcq: [{ q: 'The instantaneous voltage step at a current step equals', o: ['ΔI·R1', 'ΔI·R0', 'ΔI·(R0+R1)', 'zero'], a: 1 }],
  };
}
function paramsExp() {
  const DATA = [['Lead-acid', 2.0, '1–200', '30–50', '75–300', '3–20', '70–85', '300–800', '−20 to 50', '0.1–0.3C', '3–5C'], ['NiMH', 1.2, '1–100', '60–120', '250–1000', '10–40', '65–80', '500–1500', '−20 to 50', '0.5–1C', '5–10C'], ['LFP', 3.2, '10–300', '90–180', '200–2000', '0.5–2', '95–98', '2000–6000', '−20 to 60', '1–3C', '3–10C'], ['NMC', 3.65, '2–100', '150–260', '300–1500', '0.5–3', '95–98', '1000–2500', '−20 to 55', '0.5–2C', '2–5C'], ['NCA', 3.6, '2–6', '200–280', '300–1500', '1–3', '95–98', '500–1500', '−20 to 55', '0.5–1C', '2–5C'], ['LTO', 2.4, '10–40', '50–90', '1500–4000', '0.5–2', '96–98', '7000–20000', '−30 to 60', '5–10C', '10C+']];
  return {
    id: '2.10', kind: 'static', stageH: 320,
    aim: 'To compare battery technologies by their key parameters and interpret the trade-offs for EV applications.',
    objectives: ['Define every battery parameter and its unit.', 'Compare technologies interactively.', 'Select a technology for an application profile.'],
    theory: `<p>Battery datasheets specify <b>nominal voltage</b> (V), <b>capacity</b> (Ah), <b>energy density</b> (Wh/kg, Wh/L), <b>power density</b> (W/kg), <b>internal resistance</b> (mΩ), <b>efficiency</b> (%), <b>cycle life</b> (cycles to 80 %), <b>temperature limits</b> and maximum <b>charge/discharge rates</b>. Values in this table are indicative cell-level ranges consistent with Tables 2.5–2.9 of the notes. The radar chart normalises five figures of merit (higher is better) so that technologies can be compared at a glance. Select an application profile to see a weighted score.</p>`,
    eqs: [['\\text{Score} = \\sum_k w_k\\,\\hat x_k', 'Weighted figure of merit (normalised parameters)']],
    params: [{ id: 'app', l: 'Application profile', type: 'select', str: true, v: 'car', opts: [['car', 'Long-range passenger car (energy)'], ['bus', 'City bus (life, safety, cost)'], ['hev', 'Hybrid (power)'], ['two', 'Two-wheeler (cost, energy)']] }, ...DATA.map((d, i) => ({ id: 'c' + i, l: d[0], type: 'check', v: i >= 2 }))],
    compute(p) {
      const merit = { 'Lead-acid': [1, 1, 1, 3, 5], NiMH: [2, 3, 2, 3, 3], LFP: [3, 3, 4, 5, 4], NMC: [5, 4, 3, 3, 3], NCA: [5, 4, 2, 2, 3], LTO: [1, 5, 5, 5, 1] }; // energy, power, life, safety, cost
      const w = { car: [.45, .15, .15, .15, .1], bus: [.15, .1, .3, .25, .2], hev: [.05, .5, .25, .1, .1], two: [.3, .1, .15, .15, .3] }[p.app];
      const rows = DATA.map(d => [...d, +(merit[d[0]].reduce((a, v, k) => a + v * w[k], 0)).toFixed(2)]);
      const best = rows.slice().sort((a, b) => b[11] - a[11])[0];
      return { kpis: [kv('Best match', best[0], '', 'good'), kv('Weighted score', best[11], '/5')], obs: { cols: ['Technology', 'Nominal V', 'Capacity (Ah)', 'Wh/kg', 'W/kg', 'R (mΩ, cell)', 'Efficiency (%)', 'Cycle life', 'Temperature (°C)', 'Charge rate', 'Discharge rate', 'Score'], rows }, charts: [lc('sc', 'Weighted score for the selected application', 'Technology (1 Pb 2 NiMH 3 LFP 4 NMC 5 NCA 6 LTO)', 'Score /5', [S('score', [1, 2, 3, 4, 5, 6], rows.map(r => r[11]), { type: 'bar' })], { xr: [.4, 6.6] })], _m: merit, html: '<div class="note">Full parameter table in the Observations tab. Ratings for the radar chart are qualitative 1–5 scores derived from the ranges.</div>' };
    },
    draw(g, W, H, A) {
      const T = A.T, M = A.R._m; if (!M) return; const cx = W / 2, cy = H / 2 + 10, R = Math.min(W, H) * 0.36; const ax = ['Energy', 'Power', 'Life', 'Safety', 'Cost (low)'];
      for (let r = 1; r <= 5; r++) { g.strokeStyle = T.line; g.beginPath(); for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 5; g[k ? 'lineTo' : 'moveTo'](cx + R * r / 5 * Math.cos(a), cy + R * r / 5 * Math.sin(a)); } g.stroke(); }
      ax.forEach((l, k) => { const a = -Math.PI / 2 + k * 2 * Math.PI / 5; text(g, l, cx + (R + 28) * Math.cos(a), cy + (R + 18) * Math.sin(a), { weight: 700, size: 12 }); });
      const cols = ['#94a3b8', '#f472b6', '#22c55e', '#22d3ee', '#a78bfa', '#f59e0b']; const pulse = 1 + 0.03 * Math.sin(A.t * 3);
      DATA.forEach((d, i) => { if (!A.p['c' + i]) return; const v = M[d[0]]; g.beginPath(); v.forEach((x, k) => { const a = -Math.PI / 2 + k * 2 * Math.PI / 5; g[k ? 'lineTo' : 'moveTo'](cx + R * x / 5 * pulse * Math.cos(a), cy + R * x / 5 * pulse * Math.sin(a)); }); g.closePath(); g.fillStyle = hex(cols[i], .15); g.fill(); g.strokeStyle = cols[i]; g.lineWidth = 2; g.stroke(); });
      legend(g, DATA.map((d, i) => A.p['c' + i] ? [cols[i], d[0]] : null).filter(Boolean), 14, 20);
    },
    viva: ['Define energy density and power density.', 'Why does LTO have the longest cycle life?', 'Which parameter limits fast charging?'],
    mcq: [{ q: 'Which has the highest nominal cell voltage?', o: ['LFP', 'NMC', 'NiMH', 'LTO'], a: 1 }, { q: 'Lead-acid specific energy is about', o: ['30–50 Wh/kg', '150 Wh/kg', '250 Wh/kg', '5 Wh/kg'], a: 0 }],
  };
}
function sizingExp() {
  return {
    id: '2.11', kind: 'static', view3d: (host) => { const v = packView(host); return Object.assign(v, { update: (pp, R) => { if (R && R._s) v.build(Math.min(R._s, 24), Math.min(R._p, 6), pp.fmt); } }); }, default3d: true, stageH: 400,
    aim: 'To size a BEV battery pack from drive-cycle energy consumption, target range and power demand.',
    objectives: ['Compute energy-based and power-based pack requirements.', 'Select series and parallel cell counts.', 'Estimate pack mass, volume, peak discharge and charging current.'],
    theory: `<p>Battery sizing combines an <b>energy</b> criterion (range × drive-cycle consumption, with SOC window, efficiency and ageing margin) and a <b>power</b> criterion (peak motor electrical power must be delivered at end of life, low SOC and low temperature, without exceeding the cell discharge-current limit). The series count is $n_s = \\lceil V_{target}/V_{cell}\\rceil$; the parallel count is the larger of the energy and power requirements. Pack mass and volume follow from the cell values divided by cell-to-pack factors.</p>`,
    eqs: [['n_s = \\left\\lceil \\frac{V_{target}}{V_{cell}} \\right\\rceil', ''], ['n_{p,E} = \\left\\lceil \\frac{E_{nom}}{n_s V_{cell} Q_{cell}} \\right\\rceil,\\quad n_{p,P} = \\left\\lceil \\frac{P_{pk}/(\\eta V_{min})}{I_{cell,max}} \\right\\rceil', ''], ['n_p = \\max(n_{p,E}, n_{p,P})', '']],
    params: [{ id: 'cyc', l: 'Drive cycle', type: 'select', str: true, v: 'WLTC3b', opts: CYCLE_OPTS }, { id: 'R', l: 'Target range', u: 'km', min: 100, max: 700, step: 10, v: 350 }, { id: 'm', l: 'Vehicle mass', u: 'kg', min: 800, max: 3000, step: 10, v: 1500 }, { id: 'Ppk', l: 'Peak motor power', u: 'kW', min: 30, max: 300, step: 5, v: 110 }, { id: 'V', l: 'Target pack voltage', u: 'V', min: 200, max: 850, step: 5, v: 350 }, { id: 'fmt', l: 'Cell format', type: 'seg', str: true, v: 'prismatic', opts: [['cylindrical', '21700'], ['prismatic', 'Prismatic 48 Ah'], ['pouch', 'Pouch 60 Ah']] }, { id: 'dc', l: 'DC fast-charge C-rate', u: 'C', min: 0.5, max: 3, step: 0.1, v: 1.5 }],
    compute(p) {
      const cell = { cylindrical: { V: 3.6, Q: 5, I: 15, kg: .07, L: .0243 }, prismatic: { V: 3.65, Q: 48, I: 150, kg: .86, L: .38 }, pouch: { V: 3.65, Q: 60, I: 180, kg: .85, L: .4 } }[p.fmt];
      const P = Object.assign({}, REF4, { m: p.m }); const b = backward(getCycles()[p.cyc].v, P, { kr: 1, Pregen: 50e3, Paux: 600 });
      const Eu = p.R * b.Whkm / 1000, En = Eu / (0.9 * 0.95) * 1.1;
      const ns = Math.ceil(p.V / cell.V), npE = Math.ceil(En * 1000 / (ns * cell.V * cell.Q)), Vmin = ns * 3.2, Ipk = p.Ppk * 1000 / (0.9 * Vmin), npP = Math.ceil(Ipk / cell.I), np = Math.max(npE, npP);
      const n = ns * np, E = n * cell.V * cell.Q / 1000, mass = n * cell.kg / 0.65, vol = n * cell.L / 0.5;
      return {
        kpis: [kv(`${p.cyc} consumption`, b.Whkm, 'Wh/km'), kv('Required nominal energy', En, 'kWh'), kv('Series cells ns', ns, '', 'acc'), kv('Parallel cells np', np, '', 'acc'), kv('Total cells', n, ''), kv('Pack voltage', ns * cell.V, 'V'), kv('Pack capacity', np * cell.Q, 'Ah'), kv('Pack energy', E, 'kWh', 'good'), kv('Max discharge current', np * cell.I, 'A'), kv('Peak current needed', Ipk, 'A', Ipk > np * cell.I ? 'bad' : ''), kv('DC charging current', p.dc * np * cell.Q, 'A'), kv('Pack mass', mass, 'kg'), kv('Pack volume', vol, 'L'), kv('Achieved range', E * 0.9 * 0.95 * 1000 / b.Whkm, 'km')],
        steps: [[`Consumption from backward model over ${p.cyc}: ${fmt(b.Whkm)} Wh/km`], ['', `E_{nom} = \\frac{${p.R}\\times${fmt(b.Whkm)}/1000}{0.9\\times0.95}\\times1.1 = ${fmt(En)}\\,kWh`], ['', `n_s = \\lceil ${p.V}/${cell.V} \\rceil = ${ns}`], ['', `n_{p,E} = \\lceil \\frac{${fmt(En * 1000)}}{${ns}\\times${cell.V}\\times${cell.Q}} \\rceil = ${npE}`], ['', `I_{pk} = \\frac{${p.Ppk}\\,kW}{0.9\\times${fmt(Vmin)}} = ${fmt(Ipk)}\\,A \\Rightarrow n_{p,P} = ${npP}`], [`Selected n<sub>p</sub> = max(${npE}, ${npP}) = <b>${np}</b> (${npE >= npP ? 'energy-limited' : 'power-limited'} design)`]],
        obs: { cols: ['Quantity', 'Energy-based', 'Power-based', 'Selected'], rows: [['Parallel strings', npE, npP, np], ['Pack energy (kWh)', ns * npE * cell.V * cell.Q / 1000, ns * npP * cell.V * cell.Q / 1000, E]] },
        _s: ns, _p: np,
      };
    },
    viva: ['Why may a small pack be power-limited rather than energy-limited?', 'Why is Vmin (not Vnom) used for peak current?', 'How does the cell format influence pack volume?'],
    mcq: [{ q: 'If ns = 96 and np = 3 with 48 Ah cells, pack capacity is', o: ['48 Ah', '144 Ah', '96 Ah', '4608 Ah'], a: 1 }],
  };
}
function ecmExp() {
  return {
    id: '2.12', kind: 'sim', stageH: 360,
    aim: 'To model a lithium-ion cell with Rint, 1-RC, 2-RC and 3-RC equivalent circuits and analyse the terminal-voltage response.',
    objectives: ['Build each equivalent circuit and state the sign convention.', 'Observe ohmic and polarisation voltages for pulse and dynamic loads.', 'Compare model orders.'],
    theory: `<p>Equivalent-circuit models (ECMs) represent a cell by an SOC-dependent voltage source OCV(z), a series resistance $R_0$ (ohmic, instantaneous response) and one or more parallel $R_jC_j$ branches (charge-transfer and diffusion polarisation with time constants $\\tau_j = R_jC_j$). <b>Sign convention: battery current is positive on discharge.</b></p>
<p>The <b>Rint</b> model captures only the instantaneous drop. The <b>1-RC (Thevenin)</b> model adds one time constant (seconds to tens of seconds). The <b>2-RC</b> model separates a fast (τ₁ ≈ 10–30 s) and a slow (τ₂ ≈ minutes) polarisation and fits pulse tests much better. Higher orders give diminishing improvement. The discrete-time exact solution used here for a zero-order-hold current is $v_j[k+1] = e^{-\\Delta t/\\tau_j}v_j[k] + R_j(1-e^{-\\Delta t/\\tau_j})i[k]$.</p>`,
    eqs: [['v_t = OCV(z) - R_0 i - \\sum_j v_j', 'i > 0 discharge'], ['\\frac{dv_j}{dt} = -\\frac{v_j}{R_jC_j} + \\frac{i}{C_j}', ''], ['v_j[k+1] = e^{-\\Delta t/\\tau_j}v_j[k] + R_j\\left(1 - e^{-\\Delta t/\\tau_j}\\right) i[k]', 'Exact discretisation'], ['z[k+1] = z[k] - \\frac{\\eta\\,i[k]\\,\\Delta t}{3600Q}', '']],
    params: [{ id: 'ord', l: 'Model', type: 'seg', v: 2, opts: [[0, 'Rint'], [1, '1-RC'], [2, '2-RC'], [3, '3-RC']] }, { id: 'prof', l: 'Current profile', type: 'select', str: true, v: 'step', opts: profOpts }, { id: 'scale', l: 'Current scale', min: 0.2, max: 3, step: 0.1, v: 1 }, { h: 'Parameters' }, { id: 'R0', l: 'R0', u: 'mΩ', min: 0.2, max: 10, step: 0.05, v: 1.5 }, { id: 'R1', l: 'R1', u: 'mΩ', min: 0.1, max: 10, step: 0.05, v: 1.0 }, { id: 'C1', l: 'C1', u: 'kF', min: 1, max: 100, step: 1, v: 20 }, { id: 'R2', l: 'R2', u: 'mΩ', min: 0.1, max: 10, step: 0.05, v: 0.8 }, { id: 'C2', l: 'C2', u: 'kF', min: 20, max: 1000, step: 10, v: 300 }, { id: 'R3', l: 'R3 (3-RC)', u: 'mΩ', min: 0.1, max: 5, step: 0.05, v: 0.4 }, { id: 'C3', l: 'C3 (3-RC)', u: 'kF', min: 100, max: 5000, step: 50, v: 2500 }, { id: 'z0', l: 'Initial SOC', u: '%', min: 5, max: 100, step: 1, v: 80 }, { id: 'Q', l: 'Capacity', u: 'Ah', min: 5, max: 100, step: 1, v: 48 }],
    sim: {
      dt: 0.5, timeScale: 10, sampleEvery: 1,
      init: p => ({ t: 0, z: p.z0 / 100, v: [0, 0, 0], i: 0, vt: ocv(p.z0 / 100), done: false }),
      step(s, p, dt) {
        let i = profileCurrent(p.prof, s.t, p.Q) * p.scale; if (s.z < .02 && i > 0) i = 0; if (s.z > .995 && i < 0) i = 0;
        const R = [p.R1, p.R2, p.R3].map(x => x / 1000), C = [p.C1, p.C2, p.C3].map(x => x * 1000);
        for (let j = 0; j < 3; j++) { if (j >= p.ord) { s.v[j] = 0; continue; } const a = Math.exp(-dt / (R[j] * C[j])); s.v[j] = a * s.v[j] + R[j] * (1 - a) * i; }
        s.z = clamp(s.z - (i < 0 ? .995 : 1) * i * dt / (3600 * p.Q), 0, 1); s.i = i; s.t += dt;
        s.vt = ocv(s.z) - i * p.R0 / 1000 - s.v[0] - s.v[1] - s.v[2]; if (s.t > 15000) s.done = true;
      },
      done: s => s.done,
      sample: (s, p) => ({ kpis: [kv('Terminal voltage', s.vt, 'V', 'acc', 4), kv('OCV(z)', ocv(s.z), 'V', '', 4), kv('Ohmic drop R0·i', s.i * p.R0 / 1000, 'V', '', 4), kv('v1', s.v[0], 'V', '', 4), kv('v2', s.v[1], 'V', '', 4), kv('v3', s.v[2], 'V', '', 4), kv('Current', s.i, 'A'), kv('SOC', s.z * 100, '%', '', 2), kv('τ1 = R1C1', p.R1 * p.C1, 's'), kv('τ2 = R2C2', p.R2 * p.C2, 's')], push: { vt: [s.t, s.vt, ocv(s.z)], pol: [s.t, s.i * p.R0 / 1000, s.v[0], s.v[1], s.v[2]], i: [s.t, s.i], z: [s.t, s.z * 100] } }),
      charts: [{ id: 'vt', title: 'Terminal voltage and OCV', xl: 'Time (s)', yl: 'V', s: ['v_t', 'OCV'] }, { id: 'pol', title: 'Ohmic and polarisation voltages', xl: 'Time (s)', yl: 'V', s: ['R0·i', 'v1', 'v2', 'v3'] }, { id: 'i', title: 'Battery current (+ discharge)', xl: 'Time (s)', yl: 'A', s: ['i'] }, { id: 'z', title: 'SOC', xl: 'Time (s)', yl: '%', s: ['SOC'] }],
    },
    compute(p) { return { html: `<div class="note"><b>Sign convention:</b> i &gt; 0 discharge, i &lt; 0 charge. With ${['Rint', '1-RC', '2-RC', '3-RC'][p.ord]} the model has ${p.ord + 1} state${p.ord ? 's' : ''} (z${p.ord ? ', ' + ['v1', 'v1, v2', 'v1, v2, v3'][p.ord - 1] : ''}).</div>` }; },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T, p = A.p; const y = H * 0.42, x0 = 70;
      // OCV source
      g.strokeStyle = T.green; g.lineWidth = 2; g.beginPath(); g.arc(x0, y + 40, 26, 0, 7); g.stroke(); text(g, 'OCV', x0, y + 40, { weight: 800, color: T.green }); text(g, `${ocv(s.z).toFixed(3)} V`, x0, y + 82, { size: 11, color: T.green });
      line(g, [[x0, y + 14], [x0, y], [x0 + 40, y]], T.text, 2); line(g, [[x0, y + 66], [x0, H - 40], [W - 80, H - 40]], T.text, 2);
      resistor(g, x0 + 40, y, x0 + 130, T.orange, `R0 = ${p.R0} mΩ`); text(g, `${(s.i * p.R0 / 1000).toFixed(4)} V`, x0 + 85, y + 22, { size: 11, color: T.orange });
      let x = x0 + 130; const cols = [T.cyan, T.violet, T.pink];
      for (let j = 0; j < 3; j++) {
        const on = j < p.ord, w = 150; if (!on) { line(g, [[x, y], [x + 40, y]], T.text, 2); x += 40; continue; }
        line(g, [[x, y], [x + 15, y], [x + 15, y - 40], [x + 35, y - 40]], T.text, 2); line(g, [[x + 15, y], [x + 15, y + 40], [x + 60, y + 40]], T.text, 2);
        resistor(g, x + 35, y - 40, x + w - 35, cols[j], `R${j + 1}`); capacitor(g, x + 60, x + w - 60, y + 40, cols[j], `C${j + 1}`, true);
        line(g, [[x + w - 35, y - 40], [x + w - 15, y - 40], [x + w - 15, y + 40], [x + w - 60, y + 40]], T.text, 2); line(g, [[x + w - 15, y], [x + w, y]], T.text, 2);
        const vmax = Math.max(1e-6, Math.abs(p.scale * p.Q * [p.R1, p.R2, p.R3][j] / 1000));
        g.fillStyle = hex(cols[j], .5); const fh = 30 * clamp(Math.abs(s.v[j]) / vmax, 0, 1); g.fillRect(x + w / 2 - 6, y + 70 - fh, 12, fh); text(g, `v${j + 1} = ${(s.v[j] * 1000).toFixed(2)} mV`, x + w / 2, y + 84, { size: 11, color: cols[j] });
        x += w;
      }
      line(g, [[x, y], [W - 80, y]], T.text, 2); g.fillStyle = T.red; g.beginPath(); g.arc(W - 80, y, 5, 0, 7); g.fill(); g.fillStyle = T.blue; g.beginPath(); g.arc(W - 80, H - 40, 5, 0, 7); g.fill();
      text(g, `v_t = ${s.vt.toFixed(4)} V`, W - 80, (y + H - 40) / 2, { size: 15, weight: 800, color: T.cyan, align: 'right' });
      flow(g, [[x0 + 40, y - 8], [W - 90, y - 8]], A.t, clamp(s.i / (p.Q * 2), -1, 1), s.i >= 0 ? T.orange : T.green, { w: 1, arrowAt: .95 });
      text(g, `i = ${s.i.toFixed(1)} A ${s.i > 0 ? '(discharge)' : s.i < 0 ? '(charge)' : '(rest)'}`, 14, 18, { align: 'left', weight: 800 });
    },
    viva: [['What physical processes do R0, R1C1 and R2C2 represent?', 'R0: ohmic (electrolyte, contacts); fast RC: charge-transfer/double layer; slow RC: solid-state diffusion.'], ['How are R0 and τ1 identified from a pulse test?', 'R0 = instantaneous ΔV/ΔI; τ from the exponential relaxation (63 % point).'], 'Why is the exact discretisation preferred over Euler?', 'When is a Rint model sufficient?'],
    mcq: [{ q: 'In the 1-RC model, after a current step the polarisation voltage reaches 63 % of its final value at', o: ['t = R0C1', 't = R1C1', 't = 5R1C1', 't = 0'], a: 1 }, { q: 'With i > 0 defined as discharge, v_t =', o: ['OCV + iR0 + v1', 'OCV − iR0 − v1', 'iR0', 'OCV − v1 only'], a: 1 }],
  };
}
function balanceExp() {
  const N = 8;
  return {
    id: '2.13', kind: 'sim', stageH: 360,
    aim: 'To demonstrate passive (resistive) and active (charge-shuttling) cell balancing in a series string.',
    objectives: ['Introduce SOC/capacity imbalance between cells.', 'Observe resistor bleeding versus energy transfer.', 'Compare balancing time and energy loss.'],
    theory: `<p>In a series string the same current flows through every cell, so cells with lower capacity or higher self-discharge drift apart in SOC. The pack is then limited by the weakest cell: the first cell to reach the upper voltage stops charging and the first to reach the lower voltage stops discharging. <b>Passive balancing</b> connects a bleed resistor across cells whose voltage exceeds the lowest cell by a threshold, dissipating their excess charge as heat. <b>Active balancing</b> moves charge from high to low cells through a switched capacitor, inductor or transformer with efficiency $\\eta_{bal}$ (typically 80–95 %), wasting little energy.</p>`,
    eqs: [['I_{bleed} = \\frac{v_{cell}}{R_{bal}},\\quad P_{loss} = \\frac{v_{cell}^2}{R_{bal}}', 'Passive'], ['\\Delta Q_{low} = \\eta_{bal}\\,\\Delta Q_{high}', 'Active charge shuttle']],
    params: [{ id: 'meth', l: 'Method', type: 'seg', str: true, v: 'passive', opts: [['passive', 'Passive (resistor)'], ['active', 'Active (shuttle)'], ['off', 'Off']] }, { id: 'spread', l: 'Initial SOC spread', u: '%', min: 0, max: 30, step: 1, v: 12 }, { id: 'Rb', l: 'Bleed resistor (passive)', u: 'Ω', min: 1, max: 100, step: 1, v: 10 }, { id: 'Ia', l: 'Shuttle current (active)', u: 'A', min: 0.1, max: 10, step: 0.1, v: 2 }, { id: 'eta', l: 'Active efficiency', min: .6, max: .98, step: .01, v: .9 }, { id: 'th', l: 'Balancing threshold', u: 'mV', min: 1, max: 50, step: 1, v: 5 }, { id: 'mode', l: 'Pack condition', type: 'select', str: true, v: 'rest', opts: [['rest', 'At rest'], ['chg', 'Charging at 0.3C']] }, { id: 'Q', l: 'Cell capacity', u: 'Ah', min: 2, max: 60, step: 1, v: 5 }],
    tools: [{ l: 'Introduce imbalance (cell 3 low)', f: a => { a.L.S.z[2] = Math.max(0.05, a.L.S.z[2] - 0.15); } }],
    sim: {
      dt: 1, timeScale: 300, sampleEvery: 30,
      init(p) { const z = Array.from({ length: N }, (_, k) => clamp(0.6 + p.spread / 100 * (((k * 5) % N) / (N - 1) - 0.5), 0.01, 0.99)); return { t: 0, z, Eloss: 0, Emoved: 0, bal: Array(N).fill(0) }; },
      step(s, p, dt) {
        const v = s.z.map(z => ocv(z)); const vmin = Math.min(...v), vmax = Math.max(...v);
        s.bal.fill(0);
        if (p.meth === 'passive') v.forEach((vv, k) => { if (vv - vmin > p.th / 1000) { const I = vv / p.Rb; s.z[k] -= I * dt / (3600 * p.Q); s.Eloss += vv * I * dt; s.bal[k] = I; } });
        if (p.meth === 'active' && vmax - vmin > p.th / 1000) { const hi = v.indexOf(vmax), lo = v.indexOf(vmin); const dq = p.Ia * dt / 3600; s.z[hi] -= dq / p.Q; s.z[lo] += dq * p.eta / p.Q; s.Eloss += vmax * p.Ia * dt * (1 - p.eta); s.Emoved += vmax * p.Ia * dt; s.bal[hi] = p.Ia; s.bal[lo] = -p.Ia * p.eta; }
        if (p.mode === 'chg') { const I = 0.3 * p.Q; if (Math.max(...s.z.map(z => ocv(z))) < 4.2) s.z = s.z.map(z => Math.min(1, z + I * dt / (3600 * p.Q))); }
        s.t += dt;
      },
      sample(s, p) { const v = s.z.map(z => ocv(z)); const d = (Math.max(...v) - Math.min(...v)) * 1000; const zs = (Math.max(...s.z) - Math.min(...s.z)) * 100; return { kpis: [kv('Voltage spread', d, 'mV', d <= p.th ? 'good' : 'warn'), kv('SOC spread', zs, '%'), kv('Usable pack capacity', (1 - zs / 100) * 100, '% of ideal'), kv('Energy dissipated', s.Eloss / 3600, 'Wh', 'warn'), kv('Energy transferred', s.Emoved / 3600, 'Wh'), kv('Time', s.t / 3600, 'h')], push: { v: [s.t / 3600, ...v], sp: [s.t / 3600, d] } }; },
      charts: [{ id: 'v', title: 'Cell voltages', xl: 'Time (h)', yl: 'V', s: Array.from({ length: N }, (_, k) => 'Cell ' + (k + 1)) }, { id: 'sp', title: 'Voltage spread', xl: 'Time (h)', yl: 'mV', s: ['max − min'] }],
    },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T; const bw = (W - 80) / N; const v = s.z.map(z => ocv(z)); const vmin = Math.min(...v);
      v.forEach((vv, k) => {
        const x = 40 + k * bw, y0 = 50, hh = H - 140; rrect(g, x + 14, y0, bw - 28, hh, 8); g.strokeStyle = T.line; g.stroke();
        const col = vv - vmin > A.p.th / 1000 ? T.orange : T.green; g.fillStyle = hex(col, .45); g.fillRect(x + 16, y0 + hh * (1 - s.z[k]), bw - 32, hh * s.z[k] - 2);
        text(g, `${vv.toFixed(3)} V`, x + bw / 2, y0 + hh + 16, { size: 11.5, weight: 700 }); text(g, `${(s.z[k] * 100).toFixed(1)} %`, x + bw / 2, y0 + hh + 32, { size: 11, color: T.muted });
        if (A.p.meth === 'passive' && s.bal[k] > 0) { resistor(g, x + 18, y0 + hh + 54, x + bw - 18, T.red, ''); text(g, '🔥', x + bw / 2, y0 + hh + 74, { size: 13 }); }
      });
      if (A.p.meth === 'active') { const hi = s.bal.findIndex(b => b > 0), lo = s.bal.findIndex(b => b < 0); if (hi >= 0 && lo >= 0) { const x1 = 40 + hi * bw + bw / 2, x2 = 40 + lo * bw + bw / 2; flow(g, [[x1, 40], [x1, 20], [x2, 20], [x2, 40]], A.t, 0.6, T.cyan, { w: 2 }); text(g, `Shuttling ${A.p.Ia} A from cell ${hi + 1} → cell ${lo + 1}`, W / 2, 10, { size: 11.5, color: T.cyan, weight: 700 }); } }
      if (A.p.meth === 'passive') text(g, 'Orange cells are above threshold and bleed through their resistor', W / 2, 18, { size: 11.5, color: T.orange });
    },
    viva: [['Why does imbalance reduce usable pack capacity?', 'Charging stops when the highest cell is full and discharging when the lowest is empty, so the spread is unusable.'], ['Compare passive and active balancing.', 'Passive is cheap but wastes energy and is slow; active transfers energy with high efficiency but is costly and complex.'], 'When is passive balancing usually performed?'],
    mcq: [{ q: 'Passive balancing removes charge from', o: ['Lowest cells', 'Highest cells', 'All cells equally', 'The charger'], a: 1 }, { q: 'Active balancing energy loss is determined by', o: ['Bleed resistor', 'Converter efficiency', 'Cell capacity only', 'Nothing'], a: 1 }],
  };
}
function bmsExp() {
  const NS = 12;
  return {
    id: '2.14', kind: 'sim', stageH: 400,
    aim: 'To operate a battery management system: monitoring, estimation, balancing, protection and fault handling.',
    objectives: ['Monitor cell voltages, pack current and temperatures (heat map).', 'Observe BMS SOC/SOH estimates and balancing.', 'Inject faults and verify protective responses (derating, contactor opening).'],
    theory: `<p>A BMS has three layers: <b>sensing</b> (cell voltages, temperatures, pack current, isolation), <b>estimation</b> (SOC, SOH, power limits) and <b>control/protection</b> (balancing, thermal management requests, current limits, contactor control). Protection follows a two-stage strategy: a <b>warning</b> threshold reduces the allowed current (derating) and a <b>fault</b> threshold opens the main contactors. Typical NMC limits: cell over-voltage 4.25 V, under-voltage 2.8 V, over-temperature 60 °C, over-current 3C.</p>
<p>Use the fault buttons to create controlled faults; the event log records the BMS response with time stamps.</p>`,
    eqs: [['I_{lim} = I_{max}\\,k_T(T)\\,k_V(v_{min}, v_{max})', 'Derating'], ['\\text{Fault} \\Rightarrow \\text{contactors open}, I = 0', '']],
    params: [{ id: 'load', l: 'Load profile', type: 'select', str: true, v: 'dyn', opts: [['dyn', 'Driving (UDDS)'], ['chg', 'DC charging 1C'], ['rest', 'Rest']] }, { id: 'cool', l: 'Cooling', type: 'check', v: true }, { id: 'Ta', l: 'Ambient', u: '°C', min: -10, max: 45, step: 1, v: 30 }, { id: 'scale', l: 'Load scale', min: 0.5, max: 4, step: 0.1, v: 1.5 }],
    tools: [{ l: '⚡ Cell 5 over-voltage', cls: 'bad', f: a => { a.L.S.f.ov = true; } }, { l: '⚡ Cell 9 under-voltage', cls: 'bad', f: a => { a.L.S.f.uv = true; } }, { l: '🔥 Over-temperature', cls: 'bad', f: a => { a.L.S.f.ot = true; } }, { l: '⚡ Over-current', cls: 'bad', f: a => { a.L.S.f.oc = true; } }, { l: '📡 Sensor fault', cls: 'warn', f: a => { a.L.S.f.sens = true; } }, { l: '✓ Clear faults & reset contactor', cls: 'go', f: a => { const s = a.L.S; s.f = {}; s.contactor = true; s.log.push([s.t, 'Faults cleared, contactors re-closed after pre-charge', 'ok']); } }],
    sim: {
      dt: 1, timeScale: 20, sampleEvery: 2,
      init(p) { const r = rng(7); return { t: 0, cells: Array.from({ length: NS }, (_, k) => new ECM({ chem: 'NMC', Q: 48 * (1 - 0.02 * r()), R0: 1.5e-3 * (1 + .1 * r()), order: 1, z: 0.7 + 0.03 * (r() - .5), T: p.Ta, Tamb: p.Ta, mcp: 1100, hA: 0.8 })), f: {}, contactor: true, log: [[0, 'BMS initialised, contactors closed', 'ok']], i: 0, ilim: 150, zEst: 0.7, bal: [] }; },
      step(s, p, dt) {
        let i = p.load === 'rest' ? 0 : p.load === 'chg' ? -48 : profileCurrent('dyn', s.t, 48) * p.scale;
        if (s.f.oc) i = 250;
        const vs = s.cells.map(c => c.vt(0)), Ts = s.cells.map(c => c.T);
        const vmax = Math.max(...vs), vmin = Math.min(...vs), Tmax = Math.max(...Ts);
        // derating
        let lim = 150; if (Tmax > 50) lim *= 0.5; if (vmin < 3.2 && i > 0) lim *= 0.5; s.ilim = lim;
        if (i > 0) i = Math.min(i, lim); if (i < 0 && vmax > 4.15) i = i * 0.3;
        const log = (m, c) => { if (!s.log.length || s.log[s.log.length - 1][1] !== m) s.log.push([s.t, m, c]); };
        if (s.contactor) {
          if (vmax > 4.25) { s.contactor = false; log(`Cell ${vs.indexOf(vmax) + 1} OVER-VOLTAGE ${vmax.toFixed(3)} V → contactors OPEN`, 'bad'); }
          else if (vmin < 2.8) { s.contactor = false; log(`Cell ${vs.indexOf(vmin) + 1} UNDER-VOLTAGE ${vmin.toFixed(3)} V → contactors OPEN`, 'bad'); }
          else if (Tmax > 60) { s.contactor = false; log(`OVER-TEMPERATURE ${Tmax.toFixed(1)} °C → contactors OPEN`, 'bad'); }
          else if (Math.abs(i) > 3 * 48) { s.contactor = false; log(`OVER-CURRENT ${i.toFixed(0)} A > 144 A → contactors OPEN`, 'bad'); }
          else if (Tmax > 50) log(`High temperature ${Tmax.toFixed(1)} °C → current derated to ${lim.toFixed(0)} A`, 'warn');
        }
        if (!s.contactor) i = 0;
        s.i = i;
        s.cells.forEach((c, k) => {
          c.hA = (p.cool ? 1.6 : 0.2) * (s.f.ot ? 0.05 : 1); c.Tamb = p.Ta;
          let ik = i;
          if (s.f.ov && k === 4) ik = i - 25;   // cell 5 receives extra charge (shorted balancing switch)
          if (s.f.uv && k === 8) ik = i + 25;   // cell 9 internal leakage
          if (s.f.ot) c.T += 0.08 * dt;
          // passive balancing during charge/rest
          const bal = vs[k] - vmin > 0.01 && i <= 0 ? 0.4 : 0; s.bal[k] = bal;
          c.step(ik + bal, dt);
        });
        // BMS estimate (coulomb counting with OCV correction at rest) — frozen on sensor fault
        if (!s.f.sens) { const zt = s.cells.reduce((a, c) => a + c.z, 0) / NS; s.zEst += (-i * dt / (3600 * 48)); if (Math.abs(i) < 1) s.zEst += 0.05 * (zt - s.zEst); s.zEst = clamp(s.zEst + 0.0005 * (zt - s.zEst), 0, 1); } else log('Current-sensor fault: SOC estimate frozen, limp-home current 30 A', 'warn');
        if (s.f.sens) s.ilim = 30;
        s.t += dt;
      },
      sample(s) { const vs = s.cells.map(c => c.vt(s.i)), Ts = s.cells.map(c => c.T); return { kpis: [kv('Contactors', s.contactor ? 'CLOSED' : 'OPEN', '', s.contactor ? 'good' : 'bad'), kv('Pack voltage', vs.reduce((a, b) => a + b, 0), 'V'), kv('Pack current', s.i, 'A'), kv('Current limit', s.ilim, 'A'), kv('SOC (BMS)', s.zEst * 100, '%'), kv('SOH (BMS)', 100 * Math.min(...s.cells.map(c => c.Q)) / 48, '%'), kv('V max / min', `${Math.max(...vs).toFixed(3)} / ${Math.min(...vs).toFixed(3)}`, 'V'), kv('T max', Math.max(...Ts), '°C', Math.max(...Ts) > 50 ? 'bad' : ''), kv('Balancing cells', s.bal.filter(b => b > 0).length, '')], push: { v: [s.t, Math.max(...vs), Math.min(...vs)], T: [s.t, Math.max(...Ts), Math.min(...Ts)], i: [s.t, s.i, s.ilim] } }; },
      charts: [{ id: 'v', title: 'Max / min cell voltage', xl: 'Time (s)', yl: 'V', s: ['v max', 'v min'] }, { id: 'T', title: 'Max / min temperature', xl: 'Time (s)', yl: '°C', s: ['T max', 'T min'] }, { id: 'i', title: 'Pack current and BMS limit', xl: 'Time (s)', yl: 'A', s: ['I', 'I limit'] }],
    },
    compute(p, st) { return {}; },
    extraUI(api) { const box = h('div', { class: 'card', style: { marginBottom: '12px', maxHeight: '180px', overflow: 'auto' } }); api.extra.append(box); const upd = () => { if (!api.L.S) return; box.innerHTML = '<h3 style="margin:0 0 6px">BMS event log</h3>' + api.L.S.log.slice(-30).reverse().map(([t, m, c]) => `<div class="fault ${c === 'bad' ? 'act' : ''}"><span class="pill ${c === 'bad' ? 'bad' : c === 'warn' ? 'warn' : 'ok'}">${t.toFixed(0)} s</span> ${m}</div>`).join(''); }; const iv = setInterval(upd, 500); api.onLeave(() => clearInterval(iv)); },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T; const cols = 6, rows = 2, cw = (W * 0.62) / cols, ch = (H - 90) / rows;
      text(g, 'Battery pack heat map (cell temperature) with cell voltage', 14, 16, { align: 'left', weight: 700 });
      s.cells.forEach((c, k) => {
        const x = 14 + (k % cols) * cw, y = 34 + Math.floor(k / cols) * ch; const tn = clamp((c.T - 20) / 45, 0, 1);
        const col = `hsl(${(1 - tn) * 220},85%,${45 + tn * 5}%)`; rrect(g, x + 4, y + 4, cw - 8, ch - 8, 10); g.fillStyle = col; g.globalAlpha = .75; g.fill(); g.globalAlpha = 1;
        const v = c.vt(s.i); const bad = v > 4.2 || v < 2.9 || c.T > 55; if (bad) { g.strokeStyle = T.red; g.lineWidth = 3; g.stroke(); }
        text(g, `Cell ${k + 1}`, x + cw / 2, y + 22, { weight: 700, color: '#06122a' }); text(g, `${v.toFixed(3)} V`, x + cw / 2, y + ch / 2, { size: 16, weight: 800, color: '#06122a' }); text(g, `${c.T.toFixed(1)} °C · ${(c.z * 100).toFixed(0)} %`, x + cw / 2, y + ch / 2 + 22, { size: 11.5, color: '#06122a' });
        if (s.bal[k] > 0) text(g, 'BAL', x + cw - 22, y + 18, { size: 10, weight: 800, color: '#7c2d12' });
      });
      const bx = W * 0.66; box(g, bx, 40, W * 0.3, 70, 'BMS master', { color: T.cyan, active: true, sub: `SOC ${(s.zEst * 100).toFixed(1)} % · limit ${s.ilim.toFixed(0)} A` });
      box(g, bx, 140, W * 0.13, 56, 'Contactor +', { color: s.contactor ? T.green : T.red, active: true, sub: s.contactor ? 'closed' : 'OPEN' }); box(g, bx + W * 0.17, 140, W * 0.13, 56, 'Contactor −', { color: s.contactor ? T.green : T.red, active: true, sub: s.contactor ? 'closed' : 'OPEN' });
      flow(g, [[bx + W * .065, 196], [bx + W * .065, H - 30]], A.t, s.contactor ? s.i / 150 : 0, s.i >= 0 ? T.orange : T.green, { w: 3 });
      text(g, s.contactor ? `Pack current ${s.i.toFixed(0)} A` : 'HV bus isolated', bx + W * .08, H - 18, { align: 'left', color: s.contactor ? T.text : T.red, weight: 700 });
    },
    viva: [['What is the difference between a warning and a fault threshold?', 'Warning → derate current; fault → open contactors to isolate the pack.'], ['Why is a pre-charge circuit needed?', 'To charge the inverter DC-link capacitor slowly before closing the main contactor, avoiding inrush that would weld contacts.'], 'Name the inputs measured by a BMS.', 'What should the BMS do if the current sensor fails?'],
    mcq: [{ q: 'On detecting a cell over-voltage during charging, the BMS first', o: ['Increases current', 'Opens contactors / stops charge', 'Ignores it', 'Turns on heater'], a: 1 }, { q: 'Which BMS function equalises cell SOC?', o: ['Thermal management', 'Cell balancing', 'Isolation monitoring', 'Pre-charge'], a: 1 }],
  };
}
function chargerArchExp() {
  const ARCH = {
    l1: ['AC Level 1 / Mode 2 (portable, 230 V 10–16 A)', 3.3, ['grid', 'evse', 'obc', 'batt'], 'Onboard', 'Conductive AC'], l2: ['AC Level 2 / Mode 3 (wallbox, 7.4–22 kW)', 7.4, ['grid', 'evse', 'obc', 'batt'], 'Onboard', 'Conductive AC'], dc: ['DC fast charging (CCS2, 50–350 kW)', 60, ['grid', 'evse', 'batt'], 'Offboard', 'Conductive DC'], wpt: ['Wireless (inductive) charging', 11, ['grid', 'evse', 'coil', 'obc', 'batt'], 'Offboard + onboard rectifier', 'Wireless'], v2g: ['Bidirectional (V2G / V2H)', 11, ['grid', 'evse', 'obc', 'batt'], 'Onboard bidirectional', 'Conductive, bidirectional'],
  };
  return {
    id: '2.15', kind: 'static', stageH: 360,
    aim: 'To study onboard and offboard chargers, AC and DC charging, conductive, wireless and bidirectional charging architectures.',
    objectives: ['Trace the complete charging power path for each architecture.', 'Compare power level, efficiency, location of conversion and charging time.', 'Understand vehicle-to-grid power flow.'],
    theory: `<p>In <b>AC charging</b> the EVSE (wallbox) only supplies protected AC power and signals the available current; the <b>on-board charger (OBC)</b> performs AC→DC conversion with power-factor correction and CC-CV control (3.3–22 kW, limited by cost, mass and cooling inside the car). In <b>DC fast charging</b> the conversion is done by a large <b>off-board</b> charger in the station, and DC is delivered directly to the pack through the DC pins of the inlet (50–350 kW), under control of the vehicle BMS via a communication protocol. <b>Wireless (inductive) charging</b> transfers power across an air gap between a ground transmitter coil and a vehicle receiver coil (resonant compensation, 85–93 % efficiency). <b>Bidirectional</b> chargers allow V2G/V2H: the converter can reverse power so the battery supports the grid or a home.</p>`,
    eqs: [['t_{charge} \\approx \\frac{E_{batt}(z_2 - z_1)}{P_{chg}\\,\\eta_{chain}}', 'CC region; CV taper adds time near full'], ['\\eta_{chain} = \\eta_{EVSE}\\,\\eta_{OBC}\\,\\eta_{batt}', '']],
    params: [{ id: 'arch', l: 'Architecture', type: 'select', str: true, v: 'l2', opts: Object.entries(ARCH).map(([k, v]) => [k, v[0]]) }, { id: 'P', l: 'Charger power', u: 'kW', min: 2, max: 350, step: 0.1, v: 7.4 }, { id: 'E', l: 'Battery energy', u: 'kWh', min: 10, max: 120, step: 1, v: 50 }, { id: 'z1', l: 'Start SOC', u: '%', min: 0, max: 90, step: 1, v: 20 }, { id: 'z2', l: 'Target SOC', u: '%', min: 10, max: 100, step: 1, v: 80 }, { id: 'v2g', l: 'Power direction (V2G)', type: 'seg', str: true, v: 'g2v', opts: [['g2v', 'Grid → vehicle'], ['v2g', 'Vehicle → grid']] }],
    tools: Object.keys(ARCH).map(k => ({ l: { l1: 'Level 1', l2: 'Level 2', dc: 'DC fast', wpt: 'Wireless', v2g: 'V2G' }[k], f: a => { a.set('arch', k); a.set('P', ARCH[k][1]); } })),
    compute(p) {
      const A = ARCH[p.arch]; const eff = { l1: .9, l2: .92, dc: .94, wpt: .88, v2g: .91 }[p.arch];
      const Ptaper = p.z2 > 80 ? (p.z2 - 80) / 100 * p.E / (p.P * 0.35) : 0;
      const tCC = p.E * (Math.min(p.z2, 80) - p.z1) / 100 / (p.P * eff), t = Math.max(0, tCC) + Ptaper;
      const rows = Object.entries(ARCH).map(([k, a]) => { const e = { l1: .9, l2: .92, dc: .94, wpt: .88, v2g: .91 }[k]; return [a[0], a[3], a[4], a[1], (e * 100).toFixed(0) + ' %', +(p.E * (Math.min(p.z2, 80) - p.z1) / 100 / (a[1] * e)).toFixed(2)]; });
      return { kpis: [kv('Architecture', A[0], '', 'acc'), kv('Conversion location', A[3]), kv('Chain efficiency', eff * 100, '%'), kv('Grid energy drawn', p.E * (p.z2 - p.z1) / 100 / eff, 'kWh'), kv('Charging time', t, 'h', 'good'), kv('Charging time', t * 60, 'min')], obs: { cols: ['Architecture', 'Converter location', 'Type', 'Typical power (kW)', 'Typical efficiency', `Time ${p.z1}→${Math.min(p.z2, 80)} % (h)`], rows }, _e: eff };
    },
    draw(g, W, H, A) {
      const T = A.T, a = ARCH[A.p.arch], rev = A.p.v2g === 'v2g' && A.p.arch === 'v2g' ? -1 : 1; const m = rev * Math.min(1, A.p.P / 100 + .15);
      const N = { grid: [.08, .5, .11, .2, 'Grid', 'AC 230/415 V', T.yellow], evse: [.27, .5, .13, .22, a[3].startsWith('Offboard') && A.p.arch === 'dc' ? 'DC charger' : 'EVSE', A.p.arch === 'dc' ? 'AC→DC, isolated' : 'protection + CP', T.orange], coil: [.46, .5, .12, .2, 'Coils', 'air gap ≈ 150 mm', T.violet], obc: [.64, .5, .13, .22, 'OBC', A.p.arch === 'v2g' ? 'bidirectional' : 'PFC + DC-DC', T.cyan], batt: [.86, .5, .13, .24, 'Battery', `${A.p.E} kWh`, T.green] };
      const nodes = {}; a[2].forEach(k => nodes[k] = N[k]);
      const edges = []; for (let k = 0; k < a[2].length - 1; k++) edges.push([a[2][k], a[2][k + 1], m, rev > 0 ? (k === a[2].length - 2 ? T.cyan : T.yellow) : T.green, k === 0 ? `${A.p.P} kW ${A.p.arch === 'dc' ? 'AC in' : 'AC'}` : '']);
      blocks(g, W, H, A, nodes, edges);
      g.setLineDash([6, 5]); g.strokeStyle = T.muted; g.strokeRect(W * .53, H * .2, W * .45, H * .6); g.setLineDash([]); text(g, 'VEHICLE', W * .75, H * .2 - 10, { color: T.muted, weight: 800 });
      text(g, a[0], 14, 18, { align: 'left', weight: 800 }); if (rev < 0) text(g, 'V2G: battery energy exported to the grid', W / 2, H - 20, { color: T.green, weight: 700 });
    },
    viva: [['Why is DC fast charging done off-board?', 'High-power converters are large, heavy and costly; locating them in the station avoids carrying them in every vehicle.'], ['What does the EVSE do in AC charging?', 'Provides protected AC supply, earth monitoring and signals available current via the control pilot; it does not convert power.'], 'What limits OBC power?', 'What is V2G?'],
    mcq: [{ q: 'In AC charging, AC→DC conversion takes place in the', o: ['EVSE', 'Onboard charger', 'Grid transformer', 'BMS'], a: 1 }, { q: 'Typical DC fast charging power', o: ['3.3 kW', '7.4 kW', '50–350 kW', '1 MW for cars'], a: 2 }],
  };
}
function ccCvExp() {
  return {
    id: '2.16', kind: 'sim', stageH: 260,
    aim: 'To implement constant-current, constant-voltage and CC-CV charging and study charging current and voltage regulation.',
    objectives: ['Simulate CC, CV and CC-CV charging of a cell.', 'Adjust current and voltage limits and the cut-off current.', 'Observe current, voltage, SOC, power and temperature versus time.'],
    theory: `<p><b>Constant current (CC)</b> charging is fast and simple but, if continued, the terminal voltage overshoots the safe limit as the cell fills. <b>Constant voltage (CV)</b> charging holds $v_t = V_{max}$; the current is large at low SOC (limited only by resistance and the charger) and decays as OCV rises. <b>CC-CV</b> combines both: CC until $v_t$ reaches $V_{max}$, then CV with the current tapering until it falls to a cut-off (e.g. C/20). The CV current is regulated by the charger controller: $i_{chg} = (V_{max} - OCV(z) - v_1)/R_0$.</p>`,
    eqs: [['\\text{CC: } i = -I_{cc}\\ \\text{until}\\ v_t = V_{max}', ''], ['\\text{CV: } i = -\\frac{V_{max} - OCV(z) - v_1}{R_0}', ''], ['\\text{Stop when } |i| < I_{cut}', '']],
    params: [{ id: 'mode', l: 'Charging method', type: 'seg', str: true, v: 'cccv', opts: [['cc', 'CC'], ['cv', 'CV'], ['cccv', 'CC-CV']] }, { id: 'C', l: 'Charging current (CC)', u: 'C', min: 0.1, max: 3, step: 0.05, v: 1 }, { id: 'Vmax', l: 'Voltage limit', u: 'V', min: 3.9, max: 4.3, step: 0.01, v: 4.2 }, { id: 'Imax', l: 'Charger current clamp (CV)', u: 'C', min: 0.5, max: 5, step: 0.1, v: 3 }, { id: 'cut', l: 'Cut-off current', u: 'C', min: 0.01, max: 0.2, step: 0.01, v: 0.05 }, { id: 'z0', l: 'Initial SOC', u: '%', min: 0, max: 90, step: 1, v: 10 }, { id: 'Q', l: 'Capacity', u: 'Ah', min: 5, max: 100, step: 1, v: 50 }, { id: 'Ta', l: 'Ambient', u: '°C', min: 0, max: 45, step: 1, v: 25 }, { id: 'hA', l: 'Cooling hA', u: 'W/K', min: 0.1, max: 5, step: 0.1, v: 0.6 }],
    sim: {
      dt: 2, timeScale: 120, sampleEvery: 10,
      init: p => ({ t: 0, c: new ECM({ chem: 'NMC', Q: p.Q, R0: 1.5e-3 * 50 / p.Q, R1: 1e-3 * 50 / p.Q, C1: 25000 * p.Q / 50, order: 1, z: p.z0 / 100, T: p.Ta, Tamb: p.Ta, mcp: 900 * p.Q / 50, hA: p.hA }), i: 0, v: 0, phase: 'CC', done: false }),
      step(s, p, dt) {
        const c = s.c, R0 = c.R0 * c.kR; const icv = -(p.Vmax - c.ocv + c.v1 * 0 - c.v1) / R0; // negative charging current
        let i;
        if (p.mode === 'cc') { i = -p.C * p.Q; s.phase = 'CC'; if (c.z >= .999) s.done = true; }
        else if (p.mode === 'cv') { i = Math.max(-p.Imax * p.Q, icv); s.phase = i === -p.Imax * p.Q ? 'CV (current-limited)' : 'CV'; if (Math.abs(i) < p.cut * p.Q) s.done = true; }
        else { i = Math.max(-p.C * p.Q, icv); s.phase = i === -p.C * p.Q ? 'CC' : 'CV'; if (s.phase === 'CV' && Math.abs(i) < p.cut * p.Q) s.done = true; }
        if (i > 0) i = 0;
        s.v = c.step(i, dt); s.i = i; s.t += dt; if (s.t > 40000) s.done = true;
      },
      done: s => s.done,
      sample: (s, p) => ({ kpis: [kv('Phase', s.phase, '', 'acc'), kv('Voltage', s.v, 'V', s.v > p.Vmax + 0.005 ? 'bad' : '', 3), kv('Current', -s.i, 'A (charging)'), kv('SOC', s.c.z * 100, '%', 'good'), kv('Power', -s.i * s.v, 'W'), kv('Temperature', s.c.T, '°C'), kv('Time', s.t / 60, 'min'), kv('Charge in', -s.c.Ah, 'Ah')], push: { vi: [s.t / 60, s.v], ii: [s.t / 60, -s.i], z: [s.t / 60, s.c.z * 100], P: [s.t / 60, -s.i * s.v], T: [s.t / 60, s.c.T] } }),
      charts: [{ id: 'vi', title: 'Charging voltage', xl: 'Time (min)', yl: 'V', s: ['v_t'] }, { id: 'ii', title: 'Charging current', xl: 'Time (min)', yl: 'A', s: ['i'], colors: ['#f59e0b'] }, { id: 'z', title: 'SOC vs time', xl: 'Time (min)', yl: '%', s: ['SOC'], colors: ['#22c55e'] }, { id: 'P', title: 'Charging power', xl: 'Time (min)', yl: 'W', s: ['P'] }, { id: 'T', title: 'Cell temperature', xl: 'Time (min)', yl: '°C', s: ['T'], colors: ['#ef4444'] }],
    },
    draw(g, W, H, A) {
      const s = A.S; if (!s) return; const T = A.T;
      box(g, 30, H / 2 - 50, 150, 100, 'Charger', { color: T.yellow, active: true, sub: s.phase === 'CC' ? 'current regulation' : 'voltage regulation' });
      text(g, s.phase, 105, H / 2 + 70, { weight: 800, size: 18, color: s.phase === 'CC' ? T.orange : T.cyan });
      flow(g, [[180, H / 2], [W * 0.55, H / 2]], A.t, Math.min(1, -s.i / A.p.Q / 2 + .02), T.green, { w: 4 }); text(g, `${(-s.i).toFixed(1)} A`, W * 0.37, H / 2 - 20, { color: T.green, weight: 800, size: 15 });
      const bx = W * 0.58, bw = W * 0.3; rrect(g, bx, 40, bw, H - 80, 12); g.strokeStyle = T.text; g.lineWidth = 2; g.stroke(); g.fillRect(bx + bw / 2 - 20, 30, 40, 10);
      g.fillStyle = hex(T.green, .5); const z = s.c.z; g.fillRect(bx + 4, 44 + (H - 88) * (1 - z), bw - 8, (H - 88) * z - 4);
      text(g, `${(z * 100).toFixed(1)} %`, bx + bw / 2, H / 2, { size: 26, weight: 800 }); text(g, `${s.v.toFixed(3)} V`, bx + bw / 2, H / 2 + 30, { color: T.cyan, weight: 700 });
    },
    viva: [['Why is pure CC charging unsafe to 100 %?', 'Terminal voltage rises above the maximum allowed cell voltage, causing lithium plating and electrolyte oxidation.'], ['Why does current decay in the CV phase?', 'With v_t fixed, the overpotential (Vmax − OCV) falls as OCV rises with SOC.'], 'What sets the CC-to-CV transition point?', 'How does a higher CC current affect total charging time and heating?'],
    mcq: [{ q: 'In the CV phase of CC-CV charging the', o: ['Current is constant', 'Voltage is constant and current tapers', 'Both constant', 'Voltage rises'], a: 1 }, { q: 'Charging terminates when current falls below about', o: ['1C', 'C/20', '2C', '0 A exactly'], a: 1 }],
  };
}
function standardsExp() {
  const STD = [
    ['Type 1 (SAE J1772)', 'AC', 'Single-phase AC, up to 7.4 kW (32 A, 230/240 V)', 'Control pilot (PWM) + proximity', 'North America, Japan (AC)', 5],
    ['Type 2 (IEC 62196-2, Mennekes)', 'AC', 'Single/three-phase AC, up to 22 kW (43 kW variant)', 'Control pilot (PWM, IEC 61851-1) + proximity', 'Europe, India (AC)', 7],
    ['CCS1 (Combo 1)', 'AC + DC', 'Type 1 AC pins + 2 DC pins; DC up to 350 kW+', 'PLC over CP: DIN 70121 / ISO 15118', 'North America', 7],
    ['CCS2 (Combo 2)', 'AC + DC', 'Type 2 AC pins + 2 DC pins; DC up to 350 kW+', 'PLC over CP: DIN 70121 / ISO 15118', 'Europe, India (DC)', 9],
    ['CHAdeMO', 'DC', 'DC up to 62.5 kW typical (400 kW in v3/ChaoJi)', 'CAN bus', 'Japan (legacy elsewhere)', 10],
    ['GB/T 20234 (AC & DC)', 'AC / DC', 'Separate AC and DC connectors; DC up to 250 kW', 'CAN bus (GB/T 27930)', 'China', 9],
    ['Bharat AC-001 / DC-001', 'AC / DC', 'Low-power AC (3.3 kW ×3) / DC 15 kW for small vehicles', 'DC-001 uses GB/T-based CAN', 'India (legacy, light EVs)', 4],
    ['IS 17017 (India)', 'Standard series', 'Indian adoption of IEC 61851 / 62196: specifies EVSE (AC & DC) and connectors, incl. CCS2 and Type 2', 'Refers to IEC 61851, DIN 70121, ISO 15118', 'India', 0],
  ];
  return {
    id: '2.17', kind: 'static', stageH: 340,
    aim: 'To study EV charging standards: connectors, charging modes and communication protocols, including the Indian ecosystem.',
    objectives: ['Distinguish connector standards from communication protocols.', 'Understand control-pilot signalling (states A–F and duty-cycle current limit).', 'Identify standards used in India.'],
    theory: `<p>Charging standards cover three separate things: the <b>connector/inlet</b> (mechanical and electrical interface, e.g. Type 2, CCS2, CHAdeMO, GB/T), the <b>charging mode/system</b> (IEC 61851 Modes 1–4: Mode 3 = AC from a dedicated EVSE, Mode 4 = DC off-board charger) and the <b>communication protocol</b> between vehicle and charger (basic PWM control pilot; high-level PLC with DIN 70121 / ISO 15118 for CCS; CAN for CHAdeMO and GB/T). India's IS 17017 series adopts IEC 61851/62196 for EVSE; CCS2 is the main DC standard for cars, with Type 2 for AC.</p>
<p><b>Control pilot (IEC 61851-1 / SAE J1772):</b> the EVSE drives a ±12 V, 1 kHz PWM signal through 1 kΩ. The vehicle loads it with resistors, giving state A (12 V, not connected), B (9 V, connected), C (6 V, ready to charge), D (3 V, ventilation). The duty cycle advertises the maximum current: $I = 0.6\\,D$ (A, D in %) for 10–85 %, and $I = 2.5(D-64)$ for 85–96 %; 5 % requests digital (PLC) communication.</p>`,
    eqs: [['I_{max} = 0.6\\times D\\ (10\\%\\le D \\le 85\\%)', ''], ['I_{max} = (D - 64)\\times 2.5\\ (85\\% < D \\le 96\\%)', '']],
    params: [{ id: 'std', l: 'Connector / standard', type: 'select', v: 3, opts: STD.map((s, i) => [i, s[0]]) }, { id: 'D', l: 'Control pilot duty cycle', u: '%', min: 5, max: 96, step: 1, v: 53 }, { id: 'st', l: 'Vehicle state', type: 'seg', str: true, v: 'C', opts: [['A', 'A – unplugged'], ['B', 'B – plugged'], ['C', 'C – charging'], ['D', 'D – vent'], ['E', 'E – fault']] }, { id: 'E', l: 'Battery to charge', u: 'kWh', min: 10, max: 100, step: 1, v: 40 }],
    compute(p) {
      const s = STD[p.std]; const D = p.D; const I = D < 8 ? NaN : D <= 85 ? 0.6 * D : D <= 96 ? (D - 64) * 2.5 : NaN;
      const Vcp = { A: 12, B: 9, C: 6, D: 3, E: 0 }[p.st]; const P1 = 230 * I / 1000, P3 = 3 * 230 * I / 1000;
      return {
        kpis: [kv('Standard', s[0], '', 'acc'), kv('Type', s[1]), kv('CP high level', Vcp, 'V'), kv('Advertised max current', D < 8 ? 'Digital (PLC) – 5 %' : I, D < 8 ? '' : 'A'), kv('AC power (1-phase)', P1, 'kW'), kv('AC power (3-phase)', P3, 'kW'), kv('Time for battery (3-φ)', p.E / (P3 * 0.92), 'h'), kv('Charging allowed', p.st === 'C' || p.st === 'D' ? 'YES' : 'NO', '', p.st === 'C' ? 'good' : 'warn')],
        obs: { cols: ['Standard', 'AC/DC', 'Power / description', 'Communication protocol', 'Region'], rows: STD.map(x => [x[0], x[1], x[2], x[3], x[4]]) },
        steps: [[`Duty cycle D = ${D} % ⇒ ${D < 8 ? 'high-level communication (ISO 15118 / DIN 70121)' : D <= 85 ? `I = 0.6 × ${D} = ${fmt(I)} A` : `I = (${D} − 64) × 2.5 = ${fmt(I)} A`}`]],
        html: `<div class="note"><b>Connector vs protocol:</b> ${s[0]} — power interface: ${s[2]}; communication: ${s[3]}.</div>`,
      };
    },
    draw(g, W, H, A) {
      const T = A.T, s = STD[A.p.std];
      // generic connector face (illustrative, not to scale)
      const cx = W * 0.2, cy = H * 0.5, R = Math.min(W * 0.15, H * 0.36);
      g.fillStyle = '#1f2937'; g.beginPath(); g.arc(cx, cy - (s[1].includes('DC') && s[1] !== 'DC' ? 20 : 0), R, Math.PI, 0); g.lineTo(cx + R, cy + R * .4); g.lineTo(cx - R, cy + R * .4); g.closePath(); g.fill(); g.strokeStyle = T.muted; g.stroke();
      const pins = s[5]; for (let k = 0; k < Math.min(pins, 7); k++) { const a = Math.PI + (k + .5) * Math.PI / Math.min(pins, 7); g.fillStyle = k < 2 ? T.yellow : '#cbd5e1'; g.beginPath(); g.arc(cx + R * .6 * Math.cos(a), cy - 10 + R * .6 * Math.sin(a), 7, 0, 7); g.fill(); }
      if (s[1].includes('DC')) { [-1, 1].forEach(k => { g.fillStyle = '#111827'; g.beginPath(); g.arc(cx + k * R * .38, cy + R * .65, R * .22, 0, 7); g.fill(); g.fillStyle = k < 0 ? T.blue : T.red; g.beginPath(); g.arc(cx + k * R * .38, cy + R * .65, R * .1, 0, 7); g.fill(); }); text(g, 'DC+ / DC−', cx, cy + R * 1.05, { size: 11, color: T.muted }); }
      text(g, s[0], cx, 18, { weight: 800 }); text(g, 'Illustrative pin layout (CP/PP in yellow)', cx, H - 12, { size: 10.5, color: T.muted });
      // CP waveform
      const x0 = W * 0.42, w = W * 0.54, y0 = 50, hh = 120; const Vh = { A: 12, B: 9, C: 6, D: 3, E: 0 }[A.p.st];
      text(g, 'Control pilot signal (1 kHz PWM)', x0, 30, { align: 'left', weight: 700 });
      const per = w / 4; const Y = v => y0 + hh / 2 - v / 12 * hh / 2;
      line(g, [[x0, Y(0)], [x0 + w, Y(0)]], T.line, 1, [3, 3]);
      g.strokeStyle = T.yellow; g.lineWidth = 2.2; g.beginPath(); const sh = (A.t * 30) % per;
      for (let k = -1; k < 5; k++) { const xa = x0 + k * per - sh, xb = xa + per * A.p.D / 100; g.moveTo(Math.max(x0, xa), Y(Vh)); g.lineTo(Math.max(x0, Math.min(x0 + w, xb)), Y(Vh)); if (xb > x0 && xb < x0 + w) { g.lineTo(xb, Y(-12)); g.lineTo(Math.min(x0 + w, xa + per), Y(-12)); } }
      g.stroke(); text(g, `+${Vh} V`, x0 - 6, Y(Vh), { align: 'right', size: 11, color: T.yellow }); text(g, '−12 V', x0 - 6, Y(-12), { align: 'right', size: 11, color: T.yellow });
      const states = [['A', '12 V', 'EV not connected'], ['B', '9 V', 'Connected, not ready'], ['C', '6 V', 'Charging'], ['D', '3 V', 'Charging, ventilation'], ['E', '0 V', 'EVSE error / short']];
      states.forEach(([st, v, d], k) => { const y = y0 + hh + 34 + k * 24; g.fillStyle = A.p.st === st ? hex(T.cyan, .2) : 'transparent'; g.fillRect(x0, y - 11, w, 22); text(g, `State ${st}`, x0 + 8, y, { align: 'left', weight: 800, color: A.p.st === st ? T.cyan : T.muted }); text(g, v, x0 + 90, y, { align: 'left' }); text(g, d, x0 + 150, y, { align: 'left', color: T.muted }); });
    },
    viva: [['Distinguish a connector standard from a communication protocol with an example.', 'CCS2 is a connector (power pins); ISO 15118/DIN 70121 is the PLC protocol carried over its CP line.'], ['How does an EVSE tell the car how much current it may draw?', 'By the duty cycle of the control-pilot PWM signal.'], 'Which DC standard is mainly used for cars in India?', 'What is IS 17017?'],
    mcq: [{ q: 'CP duty cycle 50 % corresponds to a maximum current of', o: ['16 A', '30 A', '32 A', '50 A'], a: 1, e: '0.6 × 50 = 30 A' }, { q: 'CHAdeMO communication uses', o: ['PLC', 'CAN', 'Wi-Fi', 'PWM only'], a: 1 }, { q: 'State C on the control pilot means', o: ['Not connected', 'Connected, ready, charging', 'Fault', 'Ventilation required'], a: 1 }],
  };
}
