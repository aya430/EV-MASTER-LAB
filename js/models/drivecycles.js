// Standard drive cycles (1 Hz speed traces, km/h) and their statistics.
let CYC = null;
export async function loadCycles() {
  if (CYC) return CYC;
  CYC = await (await fetch('data/drivecycles.json')).json();
  return CYC;
}
export const getCycles = () => CYC;
export const CYCLE_OPTS = [['UDDS', 'UDDS (EPA urban)'], ['FTP75', 'FTP-75'], ['HWFET', 'HWFET (EPA highway)'], ['US06', 'US06 (aggressive)'], ['WLTC3b', 'WLTC Class 3b'], ['NEDC', 'NEDC'], ['MIDC1', 'MIDC Part One (India, urban)']];

export function cycleStats(v) {
  const n = v.length; let d = 0, vmax = 0, amax = -1e9, amin = 1e9, idle = 0, sumMov = 0, nMov = 0, ka = 0, stops = 0, rpa = 0;
  const acc = [];
  for (let i = 0; i < n; i++) {
    const s = v[i] / 3.6; d += s; vmax = Math.max(vmax, v[i]);
    if (v[i] < 0.5) idle++; else { sumMov += v[i]; nMov++; }
    if (i > 0 && v[i] < 0.5 && v[i - 1] >= 0.5) stops++;
    if (i < n - 1) { const a = (v[i + 1] - v[i]) / 3.6; acc.push(a); amax = Math.max(amax, a); amin = Math.min(amin, a); if (a > 0.1) { ka += a * a * s; rpa += s * a; } }
  }
  // acceleration distribution histogram (bins of 0.25 m/s^2)
  const bins = []; for (let b = -3.5; b <= 3.5 + 1e-9; b += 0.25) bins.push(+b.toFixed(2));
  const hist = bins.map(() => 0);
  for (const a of acc) { let k = Math.round((a + 3.5) / 0.25); k = Math.max(0, Math.min(bins.length - 1, k)); hist[k]++; }
  return { T: n - 1, dist: d / 1000, vavg: d / 1000 / ((n - 1) / 3600), vmov: nMov ? sumMov / nMov : 0, vmax, amax, amin, idlePct: 100 * idle / n, stops, RPA: rpa / d, bins, hist };
}
