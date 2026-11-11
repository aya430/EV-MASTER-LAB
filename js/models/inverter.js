// Two-level three-phase VSI models: SPWM, SVPWM (min-max injection = symmetric 7-segment), six-step,
// hysteresis current control, single-phase single/multiple pulse PWM, and Fourier/THD analysis.
const TAU = 2 * Math.PI;
const tri = x => { const f = x - Math.floor(x); return f < .5 ? 4 * f - 1 : 3 - 4 * f; }; // triangular carrier, -1..1, period 1

/** Fourier amplitudes (peak) of harmonics 1..nmax over exactly one fundamental period of samples y. */
export function harmonics(y, nmax = 60) {
  const N = y.length, out = new Array(nmax + 1).fill(0);
  for (let n = 1; n <= nmax; n++) {
    let a = 0, b = 0; const w = TAU * n / N;
    for (let k = 0; k < N; k++) { a += y[k] * Math.cos(w * k); b += y[k] * Math.sin(w * k); }
    out[n] = 2 * Math.hypot(a, b) / N;
  }
  return out;
}
export function thd(H) { let s = 0; for (let n = 2; n < H.length; n++) s += H[n] * H[n]; return H[1] > 1e-9 ? Math.sqrt(s) / H[1] : 0; }
/** Exact THD from total rms and fundamental peak (includes all harmonics, not only those computed). */
export function thdRms(y, V1pk) { const r = rms(y), r1 = V1pk / Math.SQRT2; return r1 > 1e-9 ? Math.sqrt(Math.max(0, r * r - r1 * r1)) / r1 : 0; }
export function rms(y) { let s = 0; for (const v of y) s += v * v; return Math.sqrt(s / y.length); }

/** SVPWM sector / dwell times for a reference vector (magnitude Vref, angle th in rad). */
export function svDwell(Vref, th, Vdc, Ts) {
  th = ((th % TAU) + TAU) % TAU;
  const k = Math.floor(th / (Math.PI / 3)); const al = th - k * Math.PI / 3;
  const c = Math.sqrt(3) * Ts * Vref / Vdc;
  let T1 = c * Math.sin(Math.PI / 3 - al), T2 = c * Math.sin(al);
  if (T1 + T2 > Ts) { const s = Ts / (T1 + T2); T1 *= s; T2 *= s; } // overmodulation: rescale
  return { sector: k + 1, alpha: al, T1, T2, T0: Ts - T1 - T2 };
}
/** Active-vector switching states per sector (Va..V6 in the conventional order). */
export const VEC = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]];

/**
 * Simulate a three-phase VSI with star RL(+EMF) load.
 * o: {Vdc, m, f1, fc, method:'spwm'|'svpwm'|'sixstep'|'thipwm', R, L, Em (back-EMF peak, V), phiE (rad), cycles, spc}
 * Returns one steady-state fundamental cycle of all quantities.
 */
export function vsi(o) {
  const { Vdc = 400, m = 0.8, f1 = 50, fc = 2500, method = 'spwm', R = 2, L = 0.01, Em = 0, phiE = 0, cycles = 4 } = o;
  const spc = o.spc || Math.max(40, Math.round(12000 / Math.max(1, fc / f1)));
  const dt = method === 'sixstep' ? 1 / (f1 * 3600) : 1 / (fc * spc);
  const N1 = Math.round(1 / (f1 * dt));
  const total = N1 * cycles;
  const A = Math.exp(-R * dt / L), B = (1 - A) / R;
  let ia = 0, ib = 0, ic = 0;
  const keep = { t: [], Sa: [], Sb: [], Sc: [], ra: [], rb: [], rc: [], car: [], vaO: [], vbO: [], vaN: [], vbN: [], vcN: [], vab: [], vbc: [], ia: [], ib: [], ic: [], idc: [] };
  let nsw = 0, pS = [0, 0, 0];
  for (let k = 0; k < total; k++) {
    const t = k * dt, th = TAU * f1 * t;
    let r = [Math.sin(th), Math.sin(th - TAU / 3), Math.sin(th + TAU / 3)].map(x => m * x);
    let S;
    const c = tri(fc * t);
    if (method === 'sixstep') {
      S = [Math.sin(th) >= 0 ? 1 : 0, Math.sin(th - TAU / 3) >= 0 ? 1 : 0, Math.sin(th + TAU / 3) >= 0 ? 1 : 0];
    } else {
      if (method === 'svpwm') { const v0 = -(Math.max(...r) + Math.min(...r)) / 2; r = r.map(x => x + v0); }
      else if (method === 'thipwm') { const v3 = -m / 6 * Math.sin(3 * th); r = r.map(x => x + v3); }
      S = r.map(x => (x >= c ? 1 : 0));
    }
    const vaO = (S[0] - .5) * Vdc, vbO = (S[1] - .5) * Vdc, vcO = (S[2] - .5) * Vdc;
    const vn = (vaO + vbO + vcO) / 3;
    const vaN = vaO - vn, vbN = vbO - vn, vcN = vcO - vn;
    const ea = Em * Math.sin(th - phiE), eb = Em * Math.sin(th - phiE - TAU / 3), ec = Em * Math.sin(th - phiE + TAU / 3);
    ia = A * ia + B * (vaN - ea); ib = A * ib + B * (vbN - eb); ic = A * ic + B * (vcN - ec);
    if (k >= total - N1) {
      for (let j = 0; j < 3; j++) if (S[j] !== pS[j]) nsw++;
      keep.t.push((k - (total - N1)) * dt * 1000); keep.Sa.push(S[0]); keep.Sb.push(S[1]); keep.Sc.push(S[2]);
      keep.ra.push(r[0]); keep.rb.push(r[1]); keep.rc.push(r[2]); keep.car.push(method === 'sixstep' ? 0 : c);
      keep.vaO.push(vaO); keep.vbO.push(vbO); keep.vaN.push(vaN); keep.vbN.push(vbN); keep.vcN.push(vcN); keep.vab.push(vaO - vbO); keep.vbc.push(vbO - vcO);
      keep.ia.push(ia); keep.ib.push(ib); keep.ic.push(ic); keep.idc.push(S[0] * ia + S[1] * ib + S[2] * ic);
    }
    pS = S;
  }
  const nh = Math.min(300, Math.max(60, Math.ceil(2.3 * fc / f1) + 10));
  const Hv = harmonics(keep.vab, nh), Hi = harmonics(keep.ia, nh), Hp = harmonics(keep.vaN, nh);
  return Object.assign(keep, { dt, N1, Hv, Hi, Hp, thdV: thdRms(keep.vab, Hv[1]), thdI: thdRms(keep.ia, Hi[1]), V1ll: Hv[1], V1ph: Hp[1], I1: Hi[1], Irms: rms(keep.ia), fsw: nsw / 6 * f1, Idc: keep.idc.reduce((a, b) => a + b, 0) / keep.idc.length });
}

/** Three-phase hysteresis current control of an RL + back-EMF load. */
export function hysteresis(o) {
  const { Vdc = 400, Ipk = 20, f1 = 50, band = 2, R = 1, L = 0.01, Em = 100, cycles = 3, dt = 2e-6 } = o;
  const N1 = Math.round(1 / (f1 * dt)), total = N1 * cycles;
  const A = Math.exp(-R * dt / L), B = (1 - A) / R;
  const i = [0, 0, 0], S = [0, 0, 0];
  const keep = { t: [], ir: [], ia: [], ib: [], ic: [], up: [], lo: [], Sa: [], vaN: [] };
  let nsw = 0; const every = Math.max(1, Math.floor(N1 / 4000));
  let errSq = 0, cnt = 0;
  for (let k = 0; k < total; k++) {
    const th = TAU * f1 * k * dt;
    const ref = [0, 1, 2].map(j => Ipk * Math.sin(th - j * TAU / 3));
    for (let j = 0; j < 3; j++) {
      const ns = i[j] > ref[j] + band / 2 ? 0 : i[j] < ref[j] - band / 2 ? 1 : S[j];
      if (ns !== S[j] && k >= total - N1) nsw++;
      S[j] = ns;
    }
    const vO = S.map(s => (s - .5) * Vdc), vn = (vO[0] + vO[1] + vO[2]) / 3;
    for (let j = 0; j < 3; j++) { const e = Em * Math.sin(th - j * TAU / 3); i[j] = A * i[j] + B * (vO[j] - vn - e); }
    if (k >= total - N1) {
      errSq += (i[0] - ref[0]) ** 2; cnt++;
      if (k % every === 0) { keep.t.push((k - (total - N1)) * dt * 1000); keep.ir.push(ref[0]); keep.ia.push(i[0]); keep.ib.push(i[1]); keep.ic.push(i[2]); keep.up.push(ref[0] + band / 2); keep.lo.push(ref[0] - band / 2); keep.Sa.push(S[0]); keep.vaN.push(vO[0] - vn); }
    }
  }
  const Hi = harmonics(keep.ia, 120);
  return Object.assign(keep, { fsw: nsw / 6 * f1, ripple: Math.sqrt(errSq / cnt), Hi, thdI: thdRms(keep.ia, Hi[1]) });
}

/** Single-phase full-bridge single-pulse / multiple-pulse (uniform) PWM output. */
export function singlePhasePWM({ Vdc = 200, m = 0.6, N = 1, f1 = 50, samples = 7200 }) {
  const v = [], t = [], ref = [], car = [];
  for (let k = 0; k < samples; k++) {
    const x = k / samples, half = x < .5 ? 1 : -1, xh = (x % .5) * 2; // position in half cycle 0..1
    const c = (1 - tri(xh * N)) / 2; // 0..1 carrier (minimum at each pulse centre), N per half cycle
    const on = m >= c;
    v.push(on ? half * Vdc : 0); t.push(x * 1000 / f1); ref.push(m); car.push(c);
  }
  const H = harmonics(v, 60);
  return { t, v, ref, car, H, thd: thdRms(v, H[1]), Vrms: rms(v) };
}
