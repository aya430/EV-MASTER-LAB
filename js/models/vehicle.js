// Vehicle longitudinal dynamics, performance and drive-cycle (backward-looking) models.
export const g0 = 9.81;
/** Unit 1 reference BEV (Table 1.5 of Unit 1 notes) */
export const REF1 = { m: 1600, Crr: 0.010, Cd: 0.30, A: 2.3, rho: 1.225, r: 0.32, delta: 1.05, G: 9.5, eta_tr: 0.95 };
/** Unit 4 hypothetical reference BEV (Table 4.3 of Unit 4 notes) */
export const REF4 = {
  m: 1500, delta: 1.05, Crr: 0.012, Cd: 0.30, A: 2.2, rho: 1.2, r: 0.31, G: 9, eta_g: 0.97, eta_m: 0.93, eta_inv: 0.97, Paux: 600,
  Tpk: 280, Ppk: 110e3, Tc: 150, Pc: 60e3, ns: 96, np: 3, Ccell: 48, Vcell: 3.65, Rcell: 1.5e-3, Q: 144, Enom: 50.46, R0: 0.048, Pchg: 50e3, nmax: 12000,
};
export const kmh = v => v * 3.6, ms = v => v / 3.6;

/** Road-load forces (N). v [m/s], a [m/s^2], grade [%]. */
export function roadLoad(v, a, grade, P) {
  const th = Math.atan((grade || 0) / 100);
  const s = Math.sign(v) || 1;
  const Fr = P.Crr * P.m * g0 * Math.cos(th) * (Math.abs(v) > 1e-3 ? s : 1);
  const Fa = 0.5 * (P.rho ?? 1.225) * P.Cd * P.A * v * Math.abs(v);
  const Fg = P.m * g0 * Math.sin(th);
  const Fi = (P.delta ?? 1) * P.m * a;
  return { Fr, Fa, Fg, Fi, Ft: Fr + Fa + Fg + Fi, th };
}
/** Motor torque envelope: constant torque to base speed, constant power above, zero above n_max. */
export function motorTmax(w, M) {
  if (w > (M.nmax || 1e9) * Math.PI / 30) return 0;
  return Math.min(M.Tpk, M.Ppk / Math.max(w, 1e-6));
}
/** Maximum tractive force available at vehicle speed v. */
export function tractiveMax(v, P) {
  const w = Math.abs(v) / P.r * P.G;
  return motorTmax(w, P) * P.G * (P.eta_tr ?? P.eta_g ?? 0.95) / P.r;
}
/** Full-throttle acceleration run (fixed-step Euler, dt=0.01 s). */
export function accelRun(P, grade = 0, tEnd = 40) {
  const dt = 0.01; let v = 0, x = 0, t = 0; const T = [], V = [], A = [], Pw = [];
  let t60 = NaN, t100 = NaN;
  for (let i = 0; t <= tEnd; i++) {
    const Ft = tractiveMax(v, P);
    const rl = roadLoad(v, 0, grade, P);
    let a = (Ft - rl.Fr - rl.Fa - rl.Fg) / ((P.delta ?? 1) * P.m);
    if (P.amax) a = Math.min(a, P.amax);
    if (i % 10 === 0) { T.push(+t.toFixed(2)); V.push(v * 3.6); A.push(a); Pw.push(Ft * v / 1000); }
    v = Math.max(0, v + a * dt); x += v * dt; t += dt;
    if (isNaN(t60) && v * 3.6 >= 60) t60 = t;
    if (isNaN(t100) && v * 3.6 >= 100) t100 = t;
  }
  return { T, V, A, Pw, t60, t100 };
}
/** Maximum speed: highest v where available traction >= road load on the given grade. */
export function maxSpeed(P, grade = 0) {
  let vmax = 0;
  for (let v = 0.5; v < 120; v += 0.05) {
    const rl = roadLoad(v, 0, grade, P);
    if (tractiveMax(v, P) >= rl.Fr + rl.Fa + rl.Fg) vmax = v; else if (v > 5) break;
  }
  return vmax;
}
/** Gradeability (%) at speed v: largest grade the drive can sustain. */
export function gradeability(v, P) {
  const Ft = tractiveMax(v, P), Fd = 0.5 * (P.rho ?? 1.225) * P.Cd * P.A * v * v;
  let lo = 0, hi = Math.PI / 4;
  for (let k = 0; k < 50; k++) { const th = (lo + hi) / 2; if (Ft - Fd >= P.m * g0 * (P.Crr * Math.cos(th) + Math.sin(th))) lo = th; else hi = th; }
  return Math.tan(lo) * 100;
}
/** Steady-speed consumption (Wh/km at battery) on a grade. */
export function steadyConsumption(vkmh, P, grade = 0) {
  const v = vkmh / 3.6, rl = roadLoad(v, 0, grade, P);
  const Pw = rl.Ft * v, eta = (P.eta_tr ?? P.eta_g ?? .95) * (P.eta_m ?? .92) * (P.eta_inv ?? .97);
  const Pb = (Pw >= 0 ? Pw / eta : Pw * eta * (P.kr ?? 0.6)) + (P.Paux ?? 0);
  return { Pw, Pb, Whkm: Pb / v / 3.6, rl };
}

/**
 * Backward-looking drive-cycle model (cycle -> wheel -> motor -> battery).
 * cyc: speeds in km/h at 1 Hz. Options: kr regen fraction, Pregen limit (W), fade speeds, Paux.
 */
export function backward(cyc, P, o = {}) {
  const n = cyc.length, dt = 1;
  const eta_tr = P.eta_tr ?? P.eta_g ?? 0.95, eta_m = P.eta_m ?? 0.92, eta_inv = P.eta_inv ?? 0.97;
  const kr = o.kr ?? 1, Plim = o.Pregen ?? Infinity, vfHi = o.fadeHi ?? 15, vfLo = o.fadeLo ?? 5, Paux = o.Paux ?? P.Paux ?? 0, grade = o.grade ?? 0;
  const out = { t: [], v: [], a: [], Ft: [], Pw: [], Tm: [], wm: [], Pm: [], Pb: [], Ib: [], E: [], Fr: [], Fa: [], Fg: [], Fi: [], soc: [] };
  let Epos = 0, Eneg = 0, Ew_pos = 0, Ew_neg = 0, E = 0, dist = 0, Ebrake = 0, Tpk = 0, Ppk = 0, Pmc = 0, Trms = 0;
  const Vb = o.Vbat || 350, Eu = o.Eu || 45.4e3;
  for (let i = 0; i < n; i++) {
    const v = cyc[i] / 3.6;
    const a = i < n - 1 ? (cyc[i + 1] - cyc[i]) / 3.6 / dt : 0; // forward difference, as in the notes
    const rl = roadLoad(v, a, grade, P);
    const Pw = rl.Ft * v;
    const wm = v / P.r * P.G;
    let Tm = 0, Pm = 0, Pb;
    if (Pw >= 0) {
      Pm = Pw / eta_tr; Tm = wm > 0 ? Pm / wm : 0;
      Pb = Pm / (eta_m * eta_inv) + Paux;
      Ew_pos += Pw * dt;
    } else {
      const fade = cyc[i] >= vfHi ? 1 : cyc[i] <= vfLo ? 0 : (cyc[i] - vfLo) / (vfHi - vfLo);
      const avail = -Pw * eta_tr * eta_m * eta_inv * kr * fade; // DC-side recoverable power
      const rec = Math.min(avail, Plim);
      Pm = -rec / (eta_m * eta_inv); Tm = wm > 0 ? Pm / wm : 0;
      Ebrake += (-Pw - rec / (eta_tr * eta_m * eta_inv)) * dt;
      Pb = -rec + Paux;
      Ew_neg += -Pw * dt;
    }
    if (Pb >= 0) Epos += Pb * dt; else Eneg += -Pb * dt;
    E += Pb * dt; dist += v * dt;
    Tpk = Math.max(Tpk, Math.abs(Tm)); Ppk = Math.max(Ppk, Pm); Trms += Tm * Tm;
    out.t.push(i); out.v.push(cyc[i]); out.a.push(a); out.Ft.push(rl.Ft); out.Pw.push(Pw / 1000); out.Tm.push(Tm); out.wm.push(wm * 30 / Math.PI);
    out.Pm.push(Pm / 1000); out.Pb.push(Pb / 1000); out.Ib.push(Pb / Vb); out.E.push(E / 3.6e6);
    out.Fr.push(rl.Fr); out.Fa.push(rl.Fa); out.Fg.push(rl.Fg); out.Fi.push(rl.Fi); out.soc.push(100 * (1 - E / 3600 / Eu));
  }
  const km = dist / 1000;
  return Object.assign(out, {
    dist: km, Enet: E / 3.6e6, Epos: Epos / 3.6e6, Eneg: Eneg / 3.6e6, Ew_pos: Ew_pos / 3.6e6, Ew_neg: Ew_neg / 3.6e6, Ebrake: Ebrake / 3.6e6,
    Whkm: km > 0 ? E / 3600 / km : 0, Tpk, Ppk: Ppk / 1000, Trms: Math.sqrt(Trms / n), range: km > 0 ? Eu / (E / 3600 / km) : 0,
  });
}
