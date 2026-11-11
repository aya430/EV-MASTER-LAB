// Battery models: OCV curves, Rint / 1-RC / 2-RC equivalent circuits, thermal, ageing, SOC estimators, charging.
// Sign convention (as in the Unit 2 notes): battery current i > 0 on DISCHARGE, i < 0 on charge.
import { clamp } from '../lib/ui.js';

const Z = [0, .05, .1, .2, .3, .4, .5, .6, .7, .8, .9, .95, 1];
/** Representative cell data. Ranges are indicative, commercial cell level (see Unit 2 notes Table 2.2). */
export const CHEM = {
  NMC: { name: 'NMC (LiNiMnCoO₂ / graphite)', Vnom: 3.65, Vmax: 4.2, Vmin: 3.0, ocv: [3.0, 3.3, 3.45, 3.55, 3.62, 3.68, 3.74, 3.82, 3.91, 3.99, 4.08, 4.13, 4.2], Ewh: [150, 260], Pw: [300, 1500], cyc: [1000, 2500], thermal: 'Moderate (runaway ≈ 210 °C)', cost: 'Medium', charge: '0.5–2C, CC-CV to 4.2 V', kg: 0.070, color: '#22d3ee' },
  NCA: { name: 'NCA (LiNiCoAlO₂ / graphite)', Vnom: 3.6, Vmax: 4.2, Vmin: 2.7, ocv: [2.7, 3.2, 3.38, 3.5, 3.58, 3.65, 3.72, 3.8, 3.9, 3.98, 4.07, 4.13, 4.2], Ewh: [200, 280], Pw: [300, 1500], cyc: [500, 1500], thermal: 'Lower (runaway ≈ 150 °C)', cost: 'Medium–high', charge: '0.5–1C, CC-CV to 4.2 V', kg: 0.068, color: '#a78bfa' },
  LFP: { name: 'LFP (LiFePO₄ / graphite)', Vnom: 3.2, Vmax: 3.65, Vmin: 2.5, ocv: [2.5, 3.0, 3.18, 3.22, 3.25, 3.27, 3.28, 3.29, 3.3, 3.31, 3.33, 3.36, 3.6], Ewh: [90, 180], Pw: [200, 2000], cyc: [2000, 6000], thermal: 'Excellent (runaway ≈ 270 °C)', cost: 'Low', charge: '1–3C, CC-CV to 3.65 V', kg: 0.090, color: '#22c55e' },
  LCO: { name: 'LCO (LiCoO₂ / graphite)', Vnom: 3.7, Vmax: 4.2, Vmin: 3.0, ocv: [3.0, 3.45, 3.6, 3.68, 3.73, 3.77, 3.81, 3.86, 3.92, 3.99, 4.08, 4.13, 4.2], Ewh: [150, 240], Pw: [200, 600], cyc: [500, 1000], thermal: 'Low (runaway ≈ 150 °C)', cost: 'High (cobalt)', charge: '0.7–1C, CC-CV to 4.2 V', kg: 0.045, color: '#f472b6' },
  LTO: { name: 'LTO (NMC or LMO / Li₄Ti₅O₁₂)', Vnom: 2.4, Vmax: 2.8, Vmin: 1.8, ocv: [1.8, 2.1, 2.2, 2.25, 2.28, 2.3, 2.32, 2.35, 2.38, 2.42, 2.48, 2.55, 2.8], Ewh: [50, 90], Pw: [1500, 4000], cyc: [7000, 20000], thermal: 'Excellent', cost: 'High', charge: 'up to 10C, CC-CV to 2.8 V', kg: 0.060, color: '#f59e0b' },
};
export function ocv(z, chem = 'NMC') {
  const t = CHEM[chem].ocv; z = clamp(z, 0, 1);
  for (let i = 1; i < Z.length; i++) if (z <= Z[i]) { const f = (z - Z[i - 1]) / (Z[i] - Z[i - 1]); return t[i - 1] + f * (t[i] - t[i - 1]); }
  return t[t.length - 1];
}
export function docv(z, chem = 'NMC') { const e = 0.01; return (ocv(Math.min(1, z + e), chem) - ocv(Math.max(0, z - e), chem)) / (Math.min(1, z + e) - Math.max(0, z - e)); }
export function socFromOcv(v, chem = 'NMC') { let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ocv(m, chem) < v) lo = m; else hi = m; } return (lo + hi) / 2; }
/** Illustrative Arrhenius-type temperature factor for resistance (=1 at 25 °C). */
export const rTemp = T => Math.exp(3000 * (1 / (273.15 + T) - 1 / 298.15));
/** Illustrative available-capacity factor versus temperature. */
export const qTemp = T => clamp(T >= 25 ? 1 + 0.001 * (T - 25) : 1 - 0.008 * (25 - T), 0.5, 1.05);

/** Equivalent-circuit cell model (order 0 = Rint, 1 = 1-RC, 2 = 2-RC) with lumped thermal model. */
export class ECM {
  constructor(o = {}) {
    Object.assign(this, { chem: 'NMC', Q: 50, R0: 0.0015, R1: 0.001, C1: 20000, R2: 0.0008, C2: 200000, order: 2, eta: 0.995, z: 1, v1: 0, v2: 0, T: 25, Tamb: 25, mcp: 1000, hA: 0.5, tempEffects: true, n: 1 }, o);
    this.Ah = 0; this.Ein = 0; this.Eout = 0; this.Qgen = 0;
  }
  get kR() { return this.tempEffects ? rTemp(this.T) : 1; }
  /** OCV of the cell (V) */
  get ocv() { return ocv(this.z, this.chem); }
  vt(i) { return this.ocv - i * this.R0 * this.kR - (this.order >= 1 ? this.v1 : 0) - (this.order >= 2 ? this.v2 : 0); }
  step(i, dt) {
    const kR = this.kR, Qeff = this.Q * (this.tempEffects ? qTemp(this.T) : 1);
    const v = this.vt(i);
    const eta = i < 0 ? this.eta : 1;
    this.z = clamp(this.z - eta * i * dt / (3600 * Qeff), 0, 1);
    if (this.order >= 1) { const a = Math.exp(-dt / (this.R1 * kR * this.C1)); this.v1 = a * this.v1 + this.R1 * kR * (1 - a) * i; }
    if (this.order >= 2) { const b = Math.exp(-dt / (this.R2 * kR * this.C2)); this.v2 = b * this.v2 + this.R2 * kR * (1 - b) * i; }
    const q = i * i * this.R0 * kR + i * ((this.order >= 1 ? this.v1 : 0) + (this.order >= 2 ? this.v2 : 0)); // irreversible heat (W)
    this.Qgen += q * dt;
    this.T += (q - this.hA * (this.T - this.Tamb)) * dt / this.mcp;
    this.Ah += i * dt / 3600;
    if (i > 0) this.Eout += v * i * dt; else this.Ein += -v * i * dt;
    return v;
  }
}

/** Semi-empirical ageing model (illustrative, clearly labelled in the experiment). */
export function ageing({ cycles = 0, years = 0, dod = 0.8, T = 25, crate = 1 }) {
  const kT = Math.exp(0.05 * (T - 25));                 // ~2x per 14 K
  const kD = Math.pow(dod / 0.8, 1.3), kC = 1 + 0.15 * Math.max(0, crate - 1);
  const capCyc = 0.0045 * kT * kD * kC * Math.sqrt(cycles);        // fraction lost by cycling
  const capCal = 0.025 * kT * Math.sqrt(Math.max(years, 0));       // calendar fade
  const capLoss = capCyc + capCal;
  const resInc = 1.6 * capCyc + 1.2 * capCal;                      // relative resistance growth
  return { SOHc: Math.max(0, 1 - capLoss), SOHr: 1 + resInc, capLoss, resInc };
}

/** Extended Kalman filter SOC estimator on a 1-RC model. State x=[z, v1]. */
export class EKF {
  constructor(o) {
    Object.assign(this, { chem: 'NMC', Q: 50, R0: .0015, R1: .001, C1: 20000, z: .5, v1: 0, P: [[.1, 0], [0, 1e-4]], Qn: [[1e-7, 0], [0, 1e-6]], Rn: 1e-4 }, o);
  }
  step(i, vmeas, dt) {
    const a = Math.exp(-dt / (this.R1 * this.C1));
    // predict
    this.z = clamp(this.z - i * dt / (3600 * this.Q), 0, 1); this.v1 = a * this.v1 + this.R1 * (1 - a) * i;
    const P = this.P;
    let P00 = P[0][0] + this.Qn[0][0], P01 = P[0][1] * a, P10 = P[1][0] * a, P11 = a * a * P[1][1] + this.Qn[1][1];
    // update
    const H0 = docv(this.z, this.chem), H1 = -1;
    const yhat = ocv(this.z, this.chem) - this.R0 * i - this.v1;
    const S = H0 * (H0 * P00 + H1 * P10) + H1 * (H0 * P01 + H1 * P11) + this.Rn;
    const K0 = (P00 * H0 + P01 * H1) / S, K1 = (P10 * H0 + P11 * H1) / S;
    const e = vmeas - yhat;
    this.z = clamp(this.z + K0 * e, 0, 1); this.v1 += K1 * e;
    const n00 = (1 - K0 * H0) * P00 - K0 * H1 * P10, n01 = (1 - K0 * H0) * P01 - K0 * H1 * P11;
    const n10 = -K1 * H0 * P00 + (1 - K1 * H1) * P10, n11 = -K1 * H0 * P01 + (1 - K1 * H1) * P11;
    this.P = [[n00, n01], [n10, n11]];
    return this.z;
  }
}
/** Linear Kalman filter on a linearised OCV (constant slope, Rint model) — the "basic KF" variant. */
export class LKF {
  constructor(o) { Object.assign(this, { chem: 'NMC', Q: 50, R0: .0015, z: .5, P: .1, Qn: 1e-7, Rn: 1e-3 }, o); this.k = (ocv(.9, this.chem) - ocv(.1, this.chem)) / .8; this.b = ocv(.5, this.chem) - this.k * .5; }
  step(i, vmeas, dt) {
    this.z = this.z - i * dt / (3600 * this.Q); this.P += this.Qn;
    const yhat = this.k * this.z + this.b - this.R0 * i, S = this.k * this.k * this.P + this.Rn, K = this.P * this.k / S;
    this.z = clamp(this.z + K * (vmeas - yhat), 0, 1); this.P = (1 - K * this.k) * this.P; return this.z;
  }
}
/** Pack builder from cells. */
export function pack({ s, p, Vcell, Ah, R, kg, Imax }) {
  return { V: s * Vcell, Ah: p * Ah, kWh: s * p * Vcell * Ah / 1000, R: s * R / p, n: s * p, kg: s * p * kg, I: p * Imax };
}
