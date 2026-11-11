// Electric machine models: induction machine (steady-state equivalent circuit + dynamic model with
// IFOC / DFOC / DTC), PMSM (dq model with FOC, MTPA, field weakening) and transformations.
import { clamp } from '../lib/ui.js';
const TAU = 2 * Math.PI, S3 = Math.sqrt(3);

// ---------- complex helpers ----------
const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const mag = a => Math.hypot(a.re, a.im);

// ---------- transformations (amplitude-invariant) ----------
export function clarke(a, b, c) { return { al: (2 * a - b - c) / 3, be: (b - c) / S3 }; }
export function park(al, be, th) { return { d: al * Math.cos(th) + be * Math.sin(th), q: -al * Math.sin(th) + be * Math.cos(th) }; }
export function ipark(d, q, th) { return { al: d * Math.cos(th) - q * Math.sin(th), be: d * Math.sin(th) + q * Math.cos(th) }; }
export function iclarke(al, be) { return { a: al, b: -al / 2 + S3 / 2 * be, c: -al / 2 - S3 / 2 * be }; }

// ---------- induction machine: steady state (Example 13 of Unit 3 notes as default) ----------
export const IM_EX13 = { V: 400, f: 50, poles: 4, Rs: 0.2, Rr: 0.18, Xls: 0.5, Xlr: 0.6, Xm: 18, Prot: 800 };
export function imSteady(P, s, Vll = P.V, f = P.f) {
  const k = f / P.f; // reactances scale with frequency
  const Vs = Vll / S3;
  const Zr = cx(P.Rr / (Math.abs(s) < 1e-6 ? 1e-6 : s), P.Xlr * k), Zm = cx(0, P.Xm * k);
  const Zp = div(mul(Zm, Zr), add(Zm, Zr)), Z = add(cx(P.Rs, P.Xls * k), Zp);
  const Is = div(cx(Vs), Z), E = mul(Is, Zp), Ir = div(E, Zr);
  const ws = TAU * f / (P.poles / 2), ns = 120 * f / P.poles;
  const Iab = mag(Ir), Pag = 3 * Iab * Iab * P.Rr / (Math.abs(s) < 1e-6 ? 1e-6 : s);
  const Te = Pag / ws, Prc = s * Pag, Pmech = (1 - s) * Pag;
  const Pin = 3 * Vs * Is.re, Pscl = 3 * mag(Is) ** 2 * P.Rs;
  const Pout = Pmech - (P.Prot || 0) * (1 - s) ** 2;
  const PF = Math.cos(Math.atan2(Is.im, Is.re));
  return { Is: mag(Is), Ir: Iab, E: mag(E), PF, phi: Math.atan2(-Is.im, Is.re) * 180 / Math.PI, Pin, Pag, Prc, Pscl, Pmech, Pout, Te, eta: Pin > 0 && Pout > 0 ? Pout / Pin : NaN, ns, nr: ns * (1 - s), ws, Zin: Z };
}
export function imThevenin(P, f = P.f) {
  const k = f / P.f, Vs = P.V / S3 * f / P.f;
  const Zm = cx(0, P.Xm * k), Z1 = cx(P.Rs, P.Xls * k);
  const Vth = mag(div(mul(cx(Vs), Zm), add(Z1, Zm))), Zth = div(mul(Z1, Zm), add(Z1, Zm));
  const smax = P.Rr / Math.hypot(Zth.re, Zth.im + P.Xlr * k);
  const ws = TAU * f / (P.poles / 2);
  const Tmax = 3 * Vth * Vth / (2 * ws * (Zth.re + Math.hypot(Zth.re, Zth.im + P.Xlr * k)));
  return { Vth, Rth: Zth.re, Xth: Zth.im, smax, Tmax };
}

// ---------- induction machine: dynamic model with vector control ----------
function rotStep(pa, pb, ia, ib, Lm, tr, wr, dt) {
  const a = Math.exp(-dt / tr);
  const xa = a * pa + (1 - a) * Lm * ia, xb = a * pb + (1 - a) * Lm * ib;
  const c = Math.cos(wr * dt), s = Math.sin(wr * dt);
  return [xa * c - xb * s, xa * s + xb * c];
}
// Traction machine of Examples 17-19 (Unit 3): p = 2, Lm = 4 mH, Lr = Ls = 4.2 mH, Rs = 0.015, Rr = 0.012.
export const IM_TRACTION = { p: 2, Rs: 0.015, Rr: 0.012, Ls: 4.2e-3, Lr: 4.2e-3, Lm: 4.0e-3, J: 0.08, B: 0.002, Vdc: 350, Imax: 400 };
export class IMDrive {
  constructor(P = IM_TRACTION, c = {}) {
    this.P = Object.assign({}, P);
    this.c = Object.assign({ mode: 'IFOC', psiRef: 0.2, wRef: 0, TL: 0, kpw: 6, kiw: 120, bwI: 1500, rrErr: 0, decouple: true, Tmax: 260, dtcBandT: 4, dtcBandF: 0.004, Ts: 50e-6 }, c);
    this.reset();
  }
  reset() {
    Object.assign(this, { isa: 0, isb: 0, pra: 0, prb: 0, wm: 0, thm: 0, t: 0, the: 0, psiHat: 0, iw: 0, iid: 0, iiq: 0, Te: 0, Teref: 0, idRef: 0, iqRef: 0, vd: 0, vq: 0, va: 0, vb: 0, id: 0, iq: 0, psaH: 0, psbH: 0, S: [0, 0, 0], nsw: 0, praH: 0, prbH: 0, TeHat: 0, psiS: 0, sector: 1 });
  }
  /** Start from the magnetised steady state (rotor flux = reference, aligned with alpha axis). */
  premagnetize() {
    const P = this.P, c = this.c, id = c.psiRef / P.Lm;
    Object.assign(this, { pra: c.psiRef, prb: 0, isa: id, isb: 0, psiHat: c.psiRef, praH: c.psiRef, prbH: 0, psaH: P.Ls * id, psbH: 0, the: 0, iid: P.Rs * id, va: P.Rs * id, vb: 0, id, iq: 0 });
  }
  get sigma() { const P = this.P; return 1 - P.Lm * P.Lm / (P.Ls * P.Lr); }
  step(dt) {
    const P = this.P, c = this.c, wr = P.p * this.wm;
    const tr = P.Lr / P.Rr;
    const trC = P.Lr / (P.Rr * (1 + c.rrErr)); // controller's (possibly detuned) rotor time constant
    // ---- speed loop -> torque reference ----
    const ew = c.wRef - this.wm;
    // DTC: limit the torque command below the stator-flux pull-out torque, otherwise the flux vector loses synchronism
    const sg = this.sigma, psS = c.psiRef * P.Ls / P.Lm;
    this.pullout = 1.5 * P.p * psS * psS * (1 - sg) / (2 * sg * P.Ls);
    const Tlim = c.mode === 'DTC' ? Math.min(c.Tmax, 0.8 * this.pullout) : c.Tmax;
    let Teref = c.kpw * ew + this.iw;
    if (Math.abs(Teref) < Tlim || Math.sign(ew) !== Math.sign(Teref)) this.iw += c.kiw * ew * dt;
    Teref = clamp(Teref, -Tlim, Tlim); this.Teref = Teref;
    let va, vb;
    if (c.mode === 'DTC') {
      // stator flux & torque estimation (voltage model), hysteresis comparators, switching table
      this.psaH += (this.va - P.Rs * this.isa) * dt; this.psbH += (this.vb - P.Rs * this.isb) * dt;
      const psi = Math.hypot(this.psaH, this.psbH); this.psiS = psi;
      const TeH = 1.5 * P.p * (this.psaH * this.isb - this.psbH * this.isa); this.TeHat = TeH;
      const psiSref = c.psiRef * P.Ls / P.Lm;
      const fF = psi < psiSref - c.dtcBandF / 2 ? 1 : psi > psiSref + c.dtcBandF / 2 ? 0 : (this.fF ?? 1); this.fF = fF;
      const dT = Teref - TeH; const fT = dT > c.dtcBandT / 2 ? 1 : dT < -c.dtcBandT / 2 ? -1 : 0;
      const ang = Math.atan2(this.psbH, this.psaH);
      const sec = ((Math.floor((ang + Math.PI / 6 + TAU) / (Math.PI / 3)) % 6) + 6) % 6; // 0..5 (sector 1 centred on 0°)
      this.sector = sec + 1;
      let k; // voltage vector index 1..6 or 0 (zero)
      if (fT === 0) k = 0; else { const adv = fT > 0 ? (fF ? 1 : 2) : (fF ? -1 : -2); k = ((sec + adv + 6) % 6) + 1; }
      this.dtcVec = k;
      const S = k === 0 ? (this.S.reduce((a, b) => a + b) >= 2 ? [1, 1, 1] : [0, 0, 0]) : [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]][k - 1];
      for (let j = 0; j < 3; j++) if (S[j] !== this.S[j]) this.nsw++;
      this.S = S;
      const vO = S.map(s => (s - .5) * P.Vdc), vn = (vO[0] + vO[1] + vO[2]) / 3;
      const cl = clarke(vO[0] - vn, vO[1] - vn, vO[2] - vn); va = cl.al; vb = cl.be;
      this.the = ang;
    } else {
      // ---- flux angle: IFOC integrates slip + rotor speed; DFOC uses a flux estimator (current model) ----
      const idq = park(this.isa, this.isb, this.the); this.id = idq.d; this.iq = idq.q;
      this.psiHat += (P.Lm * idq.d - this.psiHat) / trC * dt;
      const psiR = Math.max(this.psiHat, 0.02);
      this.idRef = c.psiRef / P.Lm;
      const kt = 1.5 * P.p * P.Lm / P.Lr;
      const iqLim = Math.sqrt(Math.max(P.Imax ** 2 - this.idRef ** 2, 0));
      this.iqRef = clamp(Teref / (kt * psiR), -iqLim, iqLim);
      if (c.mode === 'IFOC') {
        const wsl = P.Lm * this.iqRef / (trC * Math.max(c.psiRef, 1e-3));
        this.wsl = wsl; this.the += (wr + wsl) * dt;
      } else { // DFOC: current-model rotor-flux estimator in the stationary frame
        [this.praH, this.prbH] = rotStep(this.praH, this.prbH, this.isa, this.isb, P.Lm, trC, wr, dt);
        this.the = Math.atan2(this.prbH, this.praH);
        this.psiHat = Math.hypot(this.praH, this.prbH);
        this.wsl = P.Lm * this.iqRef / (trC * psiR);
      }
      // ---- current PI controllers with feed-forward decoupling ----
      const sL = this.sigma * P.Ls, kp = c.bwI * sL, ki = c.bwI * P.Rs * 3;
      const we = wr + (this.wsl || 0);
      const ed = this.idRef - idq.d, eq = this.iqRef - idq.q;
      let vd = kp * ed + this.iid, vq = kp * eq + this.iiq;
      if (c.decouple) { vd += -we * sL * idq.q; vq += we * sL * idq.d + we * P.Lm / P.Lr * psiR; }
      const Vmax = P.Vdc / S3, vm = Math.hypot(vd, vq);
      if (vm > Vmax) { vd *= Vmax / vm; vq *= Vmax / vm; } else { this.iid += ki * ed * dt; this.iiq += ki * eq * dt; }
      this.vd = vd; this.vq = vq;
      const ab = ipark(vd, vq, this.the); va = ab.al; vb = ab.be;
    }
    this.va = va; this.vb = vb;
    // ---- machine (stationary frame, states is_ab, psi_r_ab, wm) ----
    const sLs = this.sigma * P.Ls, kr = P.Lm / P.Lr;
    // rotor flux: exact first-order decay + exact rotation (explicit Euler on the rotation term is unstable)
    const nf = rotStep(this.pra, this.prb, this.isa, this.isb, P.Lm, tr, wr, dt);
    const dpra = (nf[0] - this.pra) / dt, dprb = (nf[1] - this.prb) / dt;
    const disa = (va - P.Rs * this.isa - kr * dpra) / sLs;
    const disb = (vb - P.Rs * this.isb - kr * dprb) / sLs;
    this.pra = nf[0]; this.prb = nf[1]; this.isa += disa * dt; this.isb += disb * dt;
    this.Te = 1.5 * P.p * kr * (this.pra * this.isb - this.prb * this.isa);
    this.wm += (this.Te - c.TL - P.B * this.wm) / P.J * dt;
    this.thm += this.wm * dt; this.t += dt;
    if (c.mode === 'DTC') { const idq = park(this.isa, this.isb, Math.atan2(this.prb, this.pra)); this.id = idq.d; this.iq = idq.q; }
  }
  get psiR() { return Math.hypot(this.pra, this.prb); }
  get iabc() { return iclarke(this.isa, this.isb); }
}

// ---------- PMSM ----------
export const PMSM_EX20 = { p: 4, Rs: 0.02, Ld: 0.2e-3, Lq: 0.5e-3, lam: 0.09, J: 0.06, B: 0.002, Vdc: 400, Imax: 300 };
export function pmsmTorque(P, id, iq) { return 1.5 * P.p * (P.lam * iq + (P.Ld - P.Lq) * id * iq); }
export function mtpaId(P, iq) {
  const dL = P.Lq - P.Ld; if (Math.abs(dL) < 1e-9) return 0;
  return P.lam / (2 * dL) - Math.sqrt(P.lam * P.lam / (4 * dL * dL) + iq * iq);
}
export function pmsmVoltage(P, id, iq, we) {
  const vd = P.Rs * id - we * P.Lq * iq, vq = P.Rs * iq + we * (P.Ld * id + P.lam);
  return { vd, vq, V: Math.hypot(vd, vq) };
}
/** Steady-state capability envelope with MTPA below base speed and flux weakening above. */
export function pmsmEnvelope(P, nList, o = {}) {
  const Vmax = (o.Vmax ?? P.Vdc / S3) * (o.vMargin ?? 0.95), Imax = o.Imax ?? P.Imax;
  const kfe = o.kfe ?? 2.5e-3, kmech = o.kmech ?? 1e-7;
  return nList.map(n => {
    const wm = n * Math.PI / 30, we = P.p * wm;
    let best = { T: 0, id: 0, iq: 0, V: 0 };
    for (let b = 0; b <= 90; b += 0.5) {
      const br = b * Math.PI / 180;
      let lo = 0, hi = Imax;
      if (pmsmVoltage(P, -hi * Math.sin(br), hi * Math.cos(br), we).V <= Vmax) lo = hi;
      else for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (pmsmVoltage(P, -m * Math.sin(br), m * Math.cos(br), we).V <= Vmax) lo = m; else hi = m; }
      const id = -lo * Math.sin(br), iq = lo * Math.cos(br);
      if (pmsmVoltage(P, id, iq, we).V > Vmax * 1.0001) continue;
      const T = pmsmTorque(P, id, iq);
      if (T > best.T + 1e-9) best = { T, id, iq, V: pmsmVoltage(P, id, iq, we).V };
    }
    const Pm = best.T * wm, Is = Math.hypot(best.id, best.iq);
    const Pcu = 1.5 * P.Rs * Is * Is, Pfe = kfe * Math.pow(we, 1.5) + kmech * wm ** 3;
    return { n, T: best.T, P: Pm, id: best.id, iq: best.iq, Is, V: best.V, eta: Pm > 0 ? Pm / (Pm + Pcu + Pfe) : 0, Pcu, Pfe };
  });
}
export class PMSMDrive {
  constructor(P = PMSM_EX20, c = {}) {
    this.P = Object.assign({}, P);
    this.c = Object.assign({ wRef: 0, TL: 0, kpw: 4, kiw: 80, kpi: null, kii: null, bwI: 2000, strategy: 'id0', fw: true, decouple: true, Tmax: 220 }, c);
    this.reset();
  }
  reset() { Object.assign(this, { id: 0, iq: 0, wm: 0, th: 0, t: 0, iw: 0, iid: 0, iiq: 0, vd: 0, vq: 0, Te: 0, Teref: 0, idRef: 0, iqRef: 0, ifw: 0, vsat: false }); }
  step(dt) {
    const P = this.P, c = this.c, we = P.p * this.wm;
    // speed PI -> torque reference
    const ew = c.wRef - this.wm;
    let Teref = c.kpw * ew + this.iw;
    if (Math.abs(Teref) < c.Tmax || Math.sign(ew) !== Math.sign(Teref)) this.iw += c.kiw * ew * dt;
    Teref = clamp(Teref, -c.Tmax, c.Tmax); this.Teref = Teref;
    // current references: id = 0 or MTPA, plus voltage-feedback flux weakening
    let iq = Teref / (1.5 * P.p * P.lam), id = 0;
    if (c.strategy === 'mtpa') { for (let k = 0; k < 4; k++) { id = mtpaId(P, iq); iq = Teref / (1.5 * P.p * (P.lam + (P.Ld - P.Lq) * id)); } id = mtpaId(P, iq); }
    if (c.fw) id = Math.min(id, id + this.ifw);
    id = Math.max(id, -P.Imax * 0.95);
    const iqMax = Math.sqrt(Math.max(P.Imax ** 2 - id * id, 0)); iq = clamp(iq, -iqMax, iqMax);
    this.idRef = id; this.iqRef = iq;
    // current PI with decoupling
    const kpd = (c.kpi ?? c.bwI * P.Ld), kpq = (c.kpi ?? c.bwI * P.Lq), ki = (c.kii ?? c.bwI * P.Rs);
    const ed = id - this.id, eq = iq - this.iq;
    let vd = kpd * ed + this.iid, vq = kpq * eq + this.iiq;
    if (c.decouple) { vd += -we * P.Lq * this.iq; vq += we * (P.Ld * this.id + P.lam); }
    const Vmax = P.Vdc / S3, vm = Math.hypot(vd, vq);
    this.vsat = vm > Vmax * 0.97;
    if (vm > Vmax) { vd *= Vmax / vm; vq *= Vmax / vm; } else { this.iid += ki * ed * dt; this.iiq += ki * eq * dt; }
    if (c.fw) this.ifw = clamp(this.ifw + (this.vsat ? -1 : 1) * 4000 * dt * Math.max(.2, Math.abs(we) / 1000), -P.Imax, 0);
    this.vd = vd; this.vq = vq;
    // machine (rotor dq frame)
    const did = (vd - P.Rs * this.id + we * P.Lq * this.iq) / P.Ld;
    const diq = (vq - P.Rs * this.iq - we * (P.Ld * this.id + P.lam)) / P.Lq;
    this.id += did * dt; this.iq += diq * dt;
    this.Te = pmsmTorque(P, this.id, this.iq);
    this.wm += (this.Te - c.TL - P.B * this.wm) / P.J * dt;
    this.th += P.p * this.wm * dt; this.t += dt;
  }
  get iabc() { const ab = ipark(this.id, this.iq, this.th); return iclarke(ab.al, ab.be); }
  get vab() { return ipark(this.vd, this.vq, this.th); }
}
