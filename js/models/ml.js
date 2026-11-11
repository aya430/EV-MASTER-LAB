// Minimal in-browser machine-learning toolkit for the battery analytics module.
// Models are genuinely trained on the data passed in: linear regression, MLP (ANN), random forest,
// gradient-boosted trees (XGBoost-style squared-loss boosting) and RBF kernel ridge (SVR-like).
import { rng } from '../lib/ui.js';

export function standardize(X) {
  const d = X[0].length, mu = Array(d).fill(0), sd = Array(d).fill(0);
  X.forEach(r => r.forEach((v, j) => mu[j] += v / X.length));
  X.forEach(r => r.forEach((v, j) => sd[j] += (v - mu[j]) ** 2 / X.length));
  sd.forEach((v, j) => sd[j] = Math.sqrt(v) || 1);
  return { mu, sd, f: r => r.map((v, j) => (v - mu[j]) / sd[j]) };
}
function solve(A, b) { // Gaussian elimination with partial pivoting
  const n = b.length; A = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
  const x = Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x;
}
export function linear(X, y, lam = 1e-6) {
  const Z = X.map(r => [1, ...r]), d = Z[0].length;
  const A = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? lam : 0)));
  const b = Array.from({ length: d }, (_, i) => Z.reduce((s, r, k) => s + r[i] * y[k], 0));
  const w = solve(A, b); return { predict: r => w[0] + r.reduce((s, v, j) => s + v * w[j + 1], 0), name: 'Linear regression' };
}
export function mlp(X, y, { hidden = [16, 16], epochs = 250, lr = 0.01, seed = 3 } = {}) {
  const R = rng(seed), sizes = [X[0].length, ...hidden, 1];
  const W = [], B = [], mW = [], vW = [], mB = [], vB = [];
  for (let l = 0; l < sizes.length - 1; l++) { const s = Math.sqrt(2 / (sizes[l] + sizes[l + 1])); W.push(Array.from({ length: sizes[l + 1] }, () => Array.from({ length: sizes[l] }, () => R.gauss() * s))); B.push(Array(sizes[l + 1]).fill(0)); mW.push(W[l].map(r => r.map(() => 0))); vW.push(W[l].map(r => r.map(() => 0))); mB.push(B[l].map(() => 0)); vB.push(B[l].map(() => 0)); }
  const ym = y.reduce((a, b) => a + b, 0) / y.length, ys = Math.sqrt(y.reduce((a, b) => a + (b - ym) ** 2, 0) / y.length) || 1;
  const fwd = x => { const A = [x]; for (let l = 0; l < W.length; l++) { const z = W[l].map((w, i) => w.reduce((s, v, j) => s + v * A[l][j], B[l][i])); A.push(l < W.length - 1 ? z.map(Math.tanh) : z); } return A; };
  let t = 0; const idx = X.map((_, i) => i), bs = 32, b1 = .9, b2 = .999;
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let s0 = 0; s0 < idx.length; s0 += bs) {
      const gW = W.map(w => w.map(r => r.map(() => 0))), gB = B.map(b => b.map(() => 0)); const batch = idx.slice(s0, s0 + bs);
      for (const k of batch) { const A = fwd(X[k]); let d = [(A[A.length - 1][0] - (y[k] - ym) / ys)]; for (let l = W.length - 1; l >= 0; l--) { for (let i = 0; i < W[l].length; i++) { gB[l][i] += d[i]; for (let j = 0; j < W[l][i].length; j++) gW[l][i][j] += d[i] * A[l][j]; } if (l > 0) d = A[l].map((a, j) => (1 - a * a) * W[l].reduce((s, w, i) => s + w[j] * d[i], 0)); } }
      t++; const n = batch.length;
      for (let l = 0; l < W.length; l++) { for (let i = 0; i < W[l].length; i++) { for (let j = 0; j < W[l][i].length; j++) { const g = gW[l][i][j] / n; mW[l][i][j] = b1 * mW[l][i][j] + (1 - b1) * g; vW[l][i][j] = b2 * vW[l][i][j] + (1 - b2) * g * g; W[l][i][j] -= lr * (mW[l][i][j] / (1 - b1 ** t)) / (Math.sqrt(vW[l][i][j] / (1 - b2 ** t)) + 1e-8); } const g = gB[l][i] / n; mB[l][i] = b1 * mB[l][i] + (1 - b1) * g; vB[l][i] = b2 * vB[l][i] + (1 - b2) * g * g; B[l][i] -= lr * (mB[l][i] / (1 - b1 ** t)) / (Math.sqrt(vB[l][i] / (1 - b2 ** t)) + 1e-8); } }
    }
  }
  return { predict: x => { const A = fwd(x); return A[A.length - 1][0] * ys + ym; }, name: `ANN (MLP ${hidden.join('-')}, tanh, Adam)` };
}
function tree(X, y, idx, depth, maxD, minLeaf, R, mtry) {
  const mean = idx.reduce((s, i) => s + y[i], 0) / idx.length;
  if (depth >= maxD || idx.length <= 2 * minLeaf) return { v: mean };
  const d = X[0].length; let best = null;
  const feats = Array.from({ length: d }, (_, j) => j).sort(() => R() - .5).slice(0, mtry || d);
  for (const j of feats) {
    const s = idx.slice().sort((a, b) => X[a][j] - X[b][j]); let sl = 0, sl2 = 0, st = 0, st2 = 0;
    s.forEach(i => { st += y[i]; st2 += y[i] * y[i]; });
    for (let k = 0; k < s.length - 1; k++) { const v = y[s[k]]; sl += v; sl2 += v * v; const nl = k + 1, nr = s.length - nl; if (nl < minLeaf || nr < minLeaf || X[s[k]][j] === X[s[k + 1]][j]) continue; const sse = (sl2 - sl * sl / nl) + ((st2 - sl2) - (st - sl) ** 2 / nr); if (!best || sse < best.sse) best = { sse, j, th: (X[s[k]][j] + X[s[k + 1]][j]) / 2 }; }
  }
  if (!best) return { v: mean };
  const L = idx.filter(i => X[i][best.j] <= best.th), Rr = idx.filter(i => X[i][best.j] > best.th);
  return { j: best.j, th: best.th, l: tree(X, y, L, depth + 1, maxD, minLeaf, R, mtry), r: tree(X, y, Rr, depth + 1, maxD, minLeaf, R, mtry) };
}
const tpred = (t, x) => t.v !== undefined ? t.v : tpred(x[t.j] <= t.th ? t.l : t.r, x);
export function forest(X, y, { n = 30, maxD = 7, seed = 5 } = {}) {
  const R = rng(seed), trees = [];
  for (let k = 0; k < n; k++) { const idx = X.map(() => Math.floor(R() * X.length)); trees.push(tree(X, y, idx, 0, maxD, 3, R, Math.max(1, Math.ceil(X[0].length * 0.6)))); }
  return { predict: x => trees.reduce((s, t) => s + tpred(t, x), 0) / trees.length, name: `Random forest (${n} trees, depth ${maxD})` };
}
export function boost(X, y, { n = 120, maxD = 3, eta = 0.1, seed = 7 } = {}) {
  const R = rng(seed), f0 = y.reduce((a, b) => a + b, 0) / y.length, trees = []; const F = y.map(() => f0); const idx = X.map((_, i) => i);
  for (let k = 0; k < n; k++) { const res = y.map((v, i) => v - F[i]); const t = tree(X, res, idx, 0, maxD, 5, R); trees.push(t); X.forEach((x, i) => F[i] += eta * tpred(t, x)); }
  return { predict: x => trees.reduce((s, t) => s + eta * tpred(t, x), f0), name: `Gradient-boosted trees (XGBoost-style, ${n} × depth ${maxD})` };
}
export function kernelRidge(X, y, { gamma = 0.5, lam = 1e-3 } = {}) {
  const n = X.length, k = (a, b) => Math.exp(-gamma * a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0));
  const ym = y.reduce((a, b) => a + b, 0) / n;
  const K = X.map((a, i) => X.map((b, j) => k(a, b) + (i === j ? lam : 0)));
  const al = solve(K, y.map(v => v - ym));
  return { predict: x => ym + X.reduce((s, xi, i) => s + al[i] * k(x, xi), 0), name: 'SVR-style RBF kernel ridge regression' };
}
export function metrics(model, X, y) { const p = X.map(x => model.predict(x)); const m = y.reduce((a, b) => a + b, 0) / y.length; const sse = p.reduce((s, v, i) => s + (v - y[i]) ** 2, 0), sst = y.reduce((s, v) => s + (v - m) ** 2, 0); return { rmse: Math.sqrt(sse / y.length), mae: p.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / y.length, r2: 1 - sse / sst, p }; }
