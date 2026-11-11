// ===================================================================================================
// EV DIGITAL TWIN — centralised simulation engine.
// One state object feeds the dashboard, graphs, power-flow animation and 3D vehicle.
// Fixed integration step (default 10 ms), decoupled from the rendering frame rate.
// Vehicle defaults: hypothetical reference BEV of Unit 4 notes, Table 4.3.
// Sign conventions: battery current I > 0 discharging; motor torque > 0 motoring in the forward direction.
// ===================================================================================================
import { REF4, g0 } from './vehicle.js';
import { rTemp } from './battery.js';
import { clamp } from '../lib/ui.js';

export const TWIN_DEFAULT = Object.assign({}, REF4, {
  // battery pack 96s3p, linear OCV of the notes: Voc = 96 (3.30 + 0.70 z)
  ocv0: 3.30, ocv1: 0.70, R1: 0.020, tau1: 30, Imax: 450, Ichg: 150, VcellMin: 3.0, VcellMax: 4.05, zMin: 0.0,
  mcpB: 3.0e5, hAB: 60, mcpM: 1.5e4, hAM: 45, Tamb: 25,
  // motor loss model: Pcu = kcu T^2, Pfe = kfe w^1.5, Pw = kw w^2, P0
  kcu: 0.12, kfe: 0.038, kw: 3e-4, P0: 100,
  // inverter loss model
  inv0: 150, inv1: 0.015, inv2: 1e-7,
  muTyre: 0.9, wDrive: 0.55, L: 2.7, vRevMax: 25 / 3.6, decelMax: 0.95,
  regenFadeHi: 15, regenFadeLo: 5,
});
export const MODES = {
  ECO: { pScale: 0.6, tScale: 0.75, pedal: 1.6, regenBias: 1.0, label: 'ECO' },
  NORMAL: { pScale: 1.0, tScale: 1.0, pedal: 1.0, regenBias: 0.8, label: 'NORMAL' },
  SPORT: { pScale: 1.0, tScale: 1.0, pedal: 0.65, regenBias: 0.6, label: 'SPORT' },
};

export class EVTwin {
  constructor(cfg = {}) { this.P = Object.assign({}, TWIN_DEFAULT, cfg); this.reset(); }
  reset(z0 = 0.9) {
    const P = this.P;
    this.in = { acc: 0, brk: 0, steer: 0, gear: 'D', mode: 'NORMAL', regen: 0.7, grade: 0, cruise: false, cruiseSet: 60, cycle: null, cycleT0: 0, emergency: false, charging: null, cooling: true, blend: 'series', kpar: 0.5, Kp: 0.2, Ki: 0.05 };
    this.faults = { inverter: false, motorHot: false, battHot: false, sensor: false, comm: false, cooling: false, cellOV: false, cellUV: false, overcurrent: false };
    this.s = { t: 0, v: 0, a: 0, x: 0, h: 0, z: z0, v1: 0, Tb: P.Tamb, Tm: P.Tamb + 15, heading: 0, px: 0, py: 0, wheelAng: 0, motorAng: 0, ie: 0, zDisp: z0 };
    this.E = { chem: 0, out: 0, in: 0, regen: 0, aux: 0, battLoss: 0, invLoss: 0, motLoss: 0, gearLoss: 0, aero: 0, roll: 0, fric: 0, pe0: 0, mechWheel: 0, wheelPos: 0, recovBrakeAvail: 0, chargerIn: 0, ke0: 0 };
    this.o = {}; this.flags = {}; this.warn = []; this.recent = [];
    this.step(0); // populate outputs
  }
  get Q() { return this.P.np * this.P.Ccell; }
  Voc(z) { return this.P.ns * (this.P.ocv0 + this.P.ocv1 * z); }
  get R0() { return this.P.ns * this.P.Rcell / this.P.np * rTemp(this.s.Tb); }
  motorLoss(T, w) { const P = this.P; w = Math.abs(w); return P.kcu * T * T + P.kfe * Math.pow(w, 1.5) + P.kw * w * w + (Math.abs(T) > 0.5 || w > 1 ? P.P0 : 0); }
  invLoss(Pe) { const P = this.P, a = Math.abs(Pe); return a < 1 ? 0 : P.inv0 + P.inv1 * a + P.inv2 * a * a; }
  hvac(Ta) { return clamp(150 * Math.max(0, Math.abs(Ta - 22) - 2), 0, 3500); }
  /** Motor-side torque envelope (both motoring and generating), with mode and thermal derating. */
  tEnvelope(w) {
    const P = this.P, M = MODES[this.in.mode];
    const aw = Math.abs(w);
    if (aw > P.nmax * Math.PI / 30) return 0;
    const derate = this.s.Tm > 140 ? clamp(1 - (this.s.Tm - 140) / 60, 0.3, 1) : 1;
    return Math.min(P.Tpk * M.tScale, P.Ppk * M.pScale / Math.max(aw, 1)) * derate;
  }
  /** One fixed integration step. */
  step(dt) {
    const P = this.P, s = this.s, I = this.in, F = this.faults, M = MODES[I.mode];
    const flags = this.flags = {}; const warn = [];
    const grade = I.grade, th = Math.atan(grade / 100), sgnV = Math.abs(s.v) > 0.05 ? Math.sign(s.v) : 0;
    const dirG = I.gear === 'R' ? -1 : I.gear === 'N' ? 0 : 1;
    // ---------------- 1. driver / VCU inputs ----------------
    let acc = I.acc, brk = I.emergency ? 1 : I.brk, vref = null;
    if (I.cycle) {
      const tc = s.t - I.cycleT0, c = I.cycle, n = c.length;
      const pv = k => c[clamp(Math.floor(k), 0, n - 1)] + (c[clamp(Math.floor(k) + 1, 0, n - 1)] - c[clamp(Math.floor(k), 0, n - 1)]) * (k - Math.floor(k));
      vref = pv(clamp(tc, 0, n - 1)); const vprev = pv(clamp(tc + 0.6, 0, n - 1)); // 0.6 s preview
      const e = (0.5 * vref + 0.5 * vprev) - s.v * 3.6;
      const ff = (pv(clamp(tc + 1, 0, n - 1)) - vref) / 3.6 * 0.35; // feed-forward on reference acceleration
      let u = I.Kp * e + s.ie + ff;
      if (Math.abs(u) < 1 || Math.sign(e) !== Math.sign(u)) s.ie = clamp(s.ie + I.Ki * e * dt, -0.6, 0.6);
      if (vref < 0.3 && s.v < 0.3) u = -0.3; // hold at rest
      u = clamp(u, -1, 1); acc = Math.max(u, 0); brk = Math.max(-u, 0);
      flags.cycleDone = tc > n;
    } else if (I.cruise && I.acc < 0.05 && I.brk < 0.02) {
      vref = I.cruiseSet; const e = vref - s.v * 3.6; let u = I.Kp * e + s.ie;
      if (Math.abs(u) < 1 || Math.sign(e) !== Math.sign(u)) s.ie = clamp(s.ie + I.Ki * e * dt, -0.6, 0.6);
      u = clamp(u, -1, 1); acc = Math.max(u, 0); brk = Math.max(-u, 0);
    }
    if (F.comm) { acc = 0; flags.limp = true; warn.push(['CAN communication lost: VCU safe state, torque request = 0', 'bad']); }
    // ---------------- 2. speeds ----------------
    const wm = s.v / P.r * P.G; // motor speed (rad/s), signed with vehicle velocity
    // ---------------- 3. battery limits ----------------
    const Voc = this.Voc(s.z), R0 = this.R0, E = Voc - s.v1;
    let PbMax = Math.min(E * E / (4 * R0) * 0.95, (P.ns * P.VcellMin) * Math.min(P.Imax, (E - P.ns * P.VcellMin) / R0));
    let Iacc = P.Ichg * (s.z > 0.9 ? clamp((1 - s.z) / 0.1, 0, 1) : 1) * (s.Tb < 5 ? 0.3 : 1);
    let PchgMax = Math.min(P.Pchg, Iacc * (E + Iacc * R0));
    const battCut = s.Tb > 60 || F.cellOV || F.cellUV || s.z <= 0.005 || F.overcurrent;
    if (s.Tb > 50 && s.Tb <= 60) { PbMax *= 0.5; PchgMax *= 0.5; warn.push(['Battery temperature high: power derated 50 %', 'warn']); }
    if (s.z < 0.08) { PbMax = Math.min(PbMax, 25e3); warn.push(['Low SOC: limp-home power limit', 'warn']); }
    if (s.z > 0.97) PchgMax = Math.min(PchgMax, 2e3);
    if (battCut) { PbMax = 0; PchgMax = 0; flags.contactor = 'OPEN'; warn.push(['BMS opened main contactors (' + (F.cellOV ? 'cell over-voltage' : F.cellUV ? 'cell under-voltage' : F.overcurrent ? 'over-current' : s.Tb > 60 ? 'over-temperature' : 'empty') + ')', 'bad']); }
    // ---------------- 4. torque demand & brake blending ----------------
    const Tenv = this.tEnvelope(wm);
    let Tdrive = 0;
    if (dirG !== 0 && !F.inverter && !battCut && !I.charging) {
      const pedal = Math.pow(acc, M.pedal);
      Tdrive = pedal * Tenv * dirG;
      // battery power limit on motoring torque
      const Pavail = Math.max(0, PbMax - P.Paux - this.hvac(P.Tamb)) * 0.9;
      if (Math.abs(wm) > 1 && Tdrive * wm > Pavail) { Tdrive = Pavail / wm; flags.battLimit = true; }
      if (dirG < 0 && s.v < -P.vRevMax) Tdrive = 0;
    }
    if (F.inverter) warn.push(['Inverter fault: gate drives disabled, motor torque = 0', 'bad']);
    // brake demand at the wheels (N·m, magnitude)
    const TbDem = brk * P.decelMax * P.m * g0 * P.r;
    // regenerative capability at the wheels
    const vk = Math.abs(s.v) * 3.6;
    const fade = vk >= P.regenFadeHi ? 1 : vk <= P.regenFadeLo ? 0 : (vk - P.regenFadeLo) / (P.regenFadeHi - P.regenFadeLo);
    let regenOK = !F.inverter && !battCut && dirG !== 0 && !I.charging && Math.abs(wm) > 1;
    const TgenMot = regenOK ? Math.min(P.Tpk, P.Ppk / Math.max(Math.abs(wm), 1)) * I.regen * fade : 0;
    const TgenAcc = regenOK ? PchgMax / 0.88 / Math.max(Math.abs(wm), 1) : 0; // charge acceptance referred to the shaft
    const TgenMax = Math.min(TgenMot, TgenAcc);
    const TwRegMax = TgenMax * P.G / P.eta_g;
    // one-pedal (lift-off) regeneration
    let Tcoast = 0;
    if (acc < 0.02 && brk < 0.01 && regenOK && !I.cycle && !I.cruise) Tcoast = Math.min(TgenMax, 0.12 * I.regen * P.m * g0 * P.r * P.eta_g / P.G);
    // brake blending: series = regenerative first, friction supplies the rest; parallel = fixed share kpar
    let TwReg = I.emergency ? 0 : I.blend === 'parallel' ? Math.min(TbDem * I.kpar, TwRegMax) : Math.min(TbDem, TwRegMax);
    let TwFric = TbDem - TwReg;
    // net motor torque (generating torque opposes motion)
    let Tm = Tdrive;
    const sgnMot = sgnV || dirG || 1;
    if (TwReg > 0 && Math.abs(s.v) > 0.05) Tm = -sgnMot * TwReg * P.eta_g / P.G;
    else if (Tcoast > 0 && Math.abs(s.v) > 0.05 && Tdrive === 0) Tm = -sgnMot * Tcoast;
    // traction control: limit tractive force to tyre adhesion on the driven axle
    const Fadh = P.muTyre * P.wDrive * P.m * g0 * Math.cos(th);
    let Fw = (Tm * wm >= 0 ? Tm * P.G * P.eta_g : Tm * P.G / P.eta_g) / P.r;
    if (Math.abs(Fw) > Fadh) { const k = Fadh / Math.abs(Fw); Tm *= k; Fw *= k; flags.tcs = true; }
    // ---------------- 5. vehicle dynamics ----------------
    const Fr = P.Crr * P.m * g0 * Math.cos(th), Fa = 0.5 * P.rho * P.Cd * P.A * s.v * Math.abs(s.v), Fg = P.m * g0 * Math.sin(th);
    const Ffric = TwFric / P.r;
    const meff = P.delta * P.m;
    let a;
    let hold = false;
    if (sgnV !== 0) a = (Fw - sgnV * (Fr + Ffric) - Fa - Fg) / meff;
    else { // at rest: static friction & brake hold
      const Fnet = Fw - Fg;
      if (Math.abs(Fnet) <= Fr + Ffric + (brk > 0.02 || dirG === 0 ? 1e9 * (brk > 0.02 ? 1 : 0) : 0)) { a = 0; hold = true; }
      else a = (Fnet - Math.sign(Fnet) * (Fr + Ffric)) / meff;
      if (dirG === 1 && a < 0 && brk > 0.02) { a = 0; hold = true; }
    }
    let vNew = s.v + a * dt, clampStep = false;
    if (dt > 0 && ((sgnV > 0 && vNew < 0) || (sgnV < 0 && vNew > 0))) { if (Math.abs(Fw) < Fr + Ffric + Math.abs(Fg) || brk > 0.02) { vNew = 0; a = -s.v / dt; clampStep = true; } }
    if (dirG === 1 && vNew < 0 && brk > 0.02 && dt > 0) { vNew = 0; a = -s.v / dt; clampStep = true; }
    if (dirG === -1 && vNew < -P.vRevMax && dt > 0) { vNew = -P.vRevMax; a = (vNew - s.v) / dt; clampStep = true; }
    const vm = (s.v + vNew) / 2;
    // ---------------- 6. power chain (evaluated at mid-step speed for exact energy bookkeeping) ----------------
    const wmm = vm / P.r * P.G;
    let Pmm = Tm * wmm;
    const Pml = this.motorLoss(Tm, wmm);
    let Pe = Pmm + Pml;
    let Pdc = Pe + this.invLoss(Pe);
    const Paux = P.Paux + this.hvac(P.Tamb) + (I.charging ? 0 : 0);
    let Pchg = 0;
    if (I.charging) { // charging: charger supplies DC power to the pack (CC-CV with acceptance limit)
      const ch = I.charging; const Vmax = P.ns * P.VcellMax;
      const Icv = (E - Vmax) / R0; // current that holds the terminal at Vmax (negative)
      let Ich = -Math.min(ch.Pmax * ch.eta / Math.max(E, 1), P.Ichg * (ch.type === 'DC' ? 1 : 1), ch.Imax || 1e9);
      Ich = Math.max(Ich, Icv); // CV phase
      if (s.z >= 0.999 || battCut) Ich = 0;
      Pchg = -(E * Ich - R0 * Ich * Ich) ; // DC power delivered to the battery terminals (W, >0)
      flags.cv = Ich === Icv;
      Pdc = 0;
    }
    let Pb = Pdc + Paux - Pchg;
    // ---------------- 7. battery electrical ----------------
    let Ib;
    const disc = E * E - 4 * R0 * Pb;
    if (disc < 0) { Ib = E / (2 * R0); flags.battLimit = true; }
    else Ib = (E - Math.sqrt(disc)) / (2 * R0);
    if (battCut && !I.charging) Ib = 0;
    const Vt = E - R0 * Ib;
    const PbAct = Vt * Ib;
    // ---------------- 8. integrate states ----------------
    if (dt > 0) {
      const etaC = Ib < 0 ? 0.99 : 1;
      const tau = P.tau1, a1 = Math.exp(-dt / tau);
      const v1n = a1 * s.v1 + P.R1 * (1 - a1) * Ib;
      // energy bookkeeping (J)
      const Ech = Voc * Ib * dt; // chemical energy released (coulombic losses booked as battery loss)
      this.E.chem += Ech; this.E.battLoss += (Voc - Vt) * Ib * dt; // coulombic inefficiency acts on SOC only
      s.z = clamp(s.z - etaC * Ib * dt / (3600 * this.Q), 0, 1);
      s.v1 = v1n;
      if (PbAct >= 0) this.E.out += PbAct * dt; else this.E.in += -PbAct * dt;
      this.E.aux += Paux * dt; this.E.chargerIn += I.charging ? Pchg / I.charging.eta * dt : 0;
      this.E.invLoss += (Pdc - Pe) * dt * (I.charging ? 0 : 1); this.E.motLoss += Pml * dt;
      const Pwm = Fw * vm; this.E.gearLoss += (Pmm - Pwm) * dt; this.E.mechWheel += Pwm * dt; if (Pwm > 0) this.E.wheelPos += Pwm * dt;
      if (Pmm < 0 && !I.charging) this.E.regen += Math.max(0, -(Pdc)) * dt;
      this.E.aero += Fa * vm * dt; this.E.roll += Fr * Math.abs(vm) * dt * (hold ? 0 : 1);
      // friction-brake energy from the brake model; on steps where the speed is clamped at zero the brake
      // absorbs the remainder (stopping work), which is booked to friction.
      const Pfric = clampStep ? Pwm - meff * a * vm - Fr * Math.abs(vm) - Fa * vm - Fg * vm : (hold ? 0 : Ffric * Math.abs(vm));
      this.E.fric += Pfric * dt;
      if (TbDem > 0 && Math.abs(vm) > 0.05) this.E.recovBrakeAvail += Math.abs(TbDem / P.r * vm) * dt;
      // thermal
      const qB = R0 * Ib * Ib + s.v1 * Ib;
      const hB = (F.cooling ? 0.1 : 1) * P.hAB * (I.cooling ? 1 : 0.3);
      s.Tb += (qB - hB * (s.Tb - P.Tamb)) / P.mcpB * dt;
      const hM = (F.cooling ? 0.1 : 1) * P.hAM;
      s.Tm += (Pml - hM * (s.Tm - P.Tamb)) / P.mcpM * dt;
      // kinematics
      s.v = vNew; s.a = a; s.x += Math.abs(vm) * dt; s.h += vm * Math.sin(th) * dt; s.t += dt;
      s.heading += vm / P.L * Math.tan(I.steer * 0.55) * dt;
      s.px += vm * Math.cos(s.heading) * dt; s.py += vm * Math.sin(s.heading) * dt;
      s.wheelAng += vm / P.r * dt; s.motorAng += wmm * dt;
      if (!F.sensor) s.zDisp = s.z; // SOC sensor/estimator failure freezes the displayed SOC
    }
    if (s.Tb > 50) warn.push([`Battery temperature ${s.Tb.toFixed(1)} °C`, s.Tb > 60 ? 'bad' : 'warn']);
    if (s.Tm > 140) warn.push([`Motor over-temperature (${s.Tm.toFixed(0)} °C): torque derated`, 'warn']);
    if (F.sensor) warn.push(['SOC sensor/estimator failure: displayed SOC frozen, BMS uses fallback', 'warn']);
    if (F.cooling) warn.push(['Cooling system failure: heat rejection reduced to 10 %', 'warn']);
    if (flags.tcs) warn.push(['Traction control active', 'info']);
    this.warn = warn;
    // ---------------- 9. publish outputs ----------------
    const KE = 0.5 * meff * s.v * s.v, PE = P.m * g0 * s.h;
    const Eb = this.E;
    const sumOut = KE + PE + Eb.aero + Eb.roll + Eb.fric + Eb.gearLoss + Eb.motLoss + Eb.invLoss + Eb.battLoss + Eb.aux;
    const chemNet = Eb.chem + Eb.chargerIn * 0; // charging energy enters through the terminals
    const lhs = Eb.chem + (Eb.chargerIn ? 0 : 0);
    const chgDC = this._chgDC = (this._chgDC || 0) + (I.charging ? Pchg * dt : 0);
    const balErr = (lhs + chgDC) - sumOut;
    const ref = Math.max(1, Math.abs(Eb.chem) + chgDC + Math.abs(KE) + Math.abs(PE) + Eb.aux);
    const km = s.x / 1000;
    const netWh = (Eb.out - Eb.in) / 3600;
    // recent consumption for range estimate (rolling window)
    if (dt > 0) { this.recent.push([s.x, netWh]); if (this.recent.length > 4000) this.recent.shift(); }
    let whkm = km > 0.2 ? netWh / km : 150;
    const old = this.recent.find(r => s.x - r[0] < 2000);
    if (old && s.x - old[0] > 300) whkm = (netWh - old[1]) / ((s.x - old[0]) / 1000);
    whkm = clamp(whkm, 60, 600);
    const Eleft = Math.max(0, s.z - 0.05) * this.Q * (P.ns * (P.ocv0 + P.ocv1 * (s.z + 0.05) / 2));
    this.o = {
      t: s.t, v: s.v * 3.6, a: s.a, x: km, vref, acc, brk, Tm, wm: wmm, rpm: wmm * 30 / Math.PI, Pmm: Pmm / 1e3, Pe: Pe / 1e3, Pdc: Pdc / 1e3, Pml: Pml / 1e3,
      etaM: Pmm > 0 ? Pmm / Pe : Pmm < 0 ? Pe / Pmm : 0, etaInv: Pe > 0 ? Pe / Pdc : Pe < 0 ? Pdc / Pe : 0,
      Pwheel: Fw * vm / 1e3, Fw, Tw: Fw * P.r, Ffric, Fr, Fa, Fg, Fi: meff * a, wheelRpm: vm / P.r * 30 / Math.PI,
      Voc, Vt, Ib, Pb: PbAct / 1e3, soc: s.z * 100, socDisp: s.zDisp * 100, Tb: s.Tb, Tmot: s.Tm, R0, v1: s.v1, PbMax: PbMax / 1e3, PchgMax: PchgMax / 1e3,
      Preg: Pmm < 0 ? Math.max(0, -Pdc) / 1e3 : 0, Ereg: Eb.regen / 3.6e6, Paux: Paux / 1e3, Pchg: Pchg / 1e3,
      TwReg: TwReg, TwFric: TwFric, TbDem, TwRegMax, fade,
      whkm, range: Eleft / 3600 / whkm, kwh100: whkm / 10, netkWh: netWh / 1e3,
      KE: KE / 3.6e6, PE: PE / 3.6e6, balErr, balErrPct: 100 * Math.abs(balErr) / ref, sumOut, gear: I.gear, mode: I.mode, soh: 100,
    };
    return this.o;
  }
  /** Energy balance summary (kWh). */
  balance() {
    const E = this.E, k = 3.6e6, o = this.o;
    return {
      drawn: E.out / k, delivered: E.mechWheel / k, deliveredPos: E.wheelPos / k, recovered: E.regen / k, aux: E.aux / k,
      losses: { battery: E.battLoss / k, inverter: E.invLoss / k, motor: E.motLoss / k, gear: E.gearLoss / k },
      road: { aero: E.aero / k, rolling: E.roll / k, friction: E.fric / k }, kinetic: o.KE, potential: o.PE, chem: E.chem / k, net: (E.out - E.in) / k, errPct: o.balErrPct, err: o.balErr / 3600,
    };
  }
}
