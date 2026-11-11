// EV / HEV / PHEV / FCEV architecture definitions with mode-dependent power flows (Experiments 1.1, 1.2, 4.1).
import { themeColors } from '../lib/draw.js';

export const ARCH_TYPES = [['BEV', 'BEV'], ['SHEV', 'Series HEV'], ['PHEV_P', 'Parallel HEV / PHEV'], ['PSHEV', 'Series-parallel (power-split) HEV'], ['FCEV', 'FCEV']];
export const ARCH_MODES = {
  BEV: [['drive', 'Cruise'], ['accel', 'Acceleration'], ['regen', 'Regen braking'], ['charge', 'Plug-in charging']],
  SHEV: [['ev', 'EV launch'], ['drive', 'Engine cruise'], ['accel', 'Acceleration (both)'], ['regen', 'Regen braking'], ['charge', 'Engine charging at rest']],
  PHEV_P: [['ev', 'EV mode'], ['drive', 'Engine cruise'], ['accel', 'Acceleration (both)'], ['regen', 'Regen braking'], ['charge', 'Plug-in charging']],
  PSHEV: [['ev', 'EV launch'], ['drive', 'Power-split cruise'], ['accel', 'Acceleration (both)'], ['regen', 'Regen braking']],
  FCEV: [['drive', 'Fuel-cell cruise'], ['accel', 'Acceleration (FC + battery)'], ['regen', 'Regen braking'], ['fcchg', 'FC charging battery']],
};
export const ARCH_INFO = {
  BEV: { name: 'Battery Electric Vehicle', src: 'Battery only (grid-charged)', ice: 'No', plug: 'Yes', zev: 'Yes (zero tailpipe)', ttw: 0.85, range: '250–600 km', ex: 'Tata Nexon EV, MG ZS EV, Tesla Model 3', note: 'Simplest powertrain: battery → inverter → motor → single-speed gear → wheels. Highest tank-to-wheel efficiency, regeneration on every stop.' },
  SHEV: { name: 'Series Hybrid', src: 'Fuel (engine-generator) + battery', ice: 'Yes (no mechanical link to wheels)', plug: 'Optional', zev: 'Partly (EV mode)', ttw: 0.30, range: '600+ km', ex: 'Nissan e-Power, BMW i3 REx', note: 'The engine drives only a generator; the wheels are driven only by the electric motor. Engine runs at its best-efficiency point but every kWh is converted twice.' },
  PHEV_P: { name: 'Parallel Hybrid / Plug-in Hybrid', src: 'Fuel + battery (grid-chargeable when plug-in)', ice: 'Yes (mechanically coupled)', plug: 'Yes (PHEV)', zev: 'In EV mode', ttw: 0.35, range: '40–80 km electric + engine', ex: 'Honda IMA, VW Golf GTE, Volvo XC90 T8', note: 'Engine and motor torques are summed in a torque coupler; either or both can propel the vehicle. A larger, grid-charged battery makes it a PHEV.' },
  PSHEV: { name: 'Series-Parallel (Power-Split) Hybrid', src: 'Fuel + battery', ice: 'Yes (via planetary gear)', plug: 'Optional', zev: 'At low speed', ttw: 0.38, range: '800+ km', ex: 'Toyota Prius / Hybrid Synergy Drive', note: 'A planetary gear set splits engine power into a mechanical path (ring → wheels) and an electrical path (generator → motor). Acts as an e-CVT.' },
  FCEV: { name: 'Fuel-Cell Electric Vehicle', src: 'Hydrogen (fuel cell) + buffer battery', ice: 'No', plug: 'Usually no', zev: 'Yes (water vapour only)', ttw: 0.50, range: '500–650 km', ex: 'Toyota Mirai, Hyundai Nexo', note: 'A PEM fuel-cell stack converts H₂ to electricity through a boost DC-DC converter; a small battery buffers transients and stores regenerated energy.' },
};

/** Returns {nodes, edges, flows:{name:kW}} for a type/mode at wheel power Pw (kW). */
export function archFlows(type, mode, Pw, e = {}) {
  const T = themeColors();
  const eg = e.eg ?? 0.97, em = e.em ?? 0.93, ei = e.ei ?? 0.97, ee = e.ee ?? 0.35, efc = e.efc ?? 0.55, ebat = e.ebat ?? 0.97, eobc = 0.93, eDC = 0.97, aux = e.aux ?? 0.6;
  const C = { fuel: T.orange, el: T.cyan, mech: T.violet, regen: T.green, h2: T.pink, grid: T.yellow };
  const max = Math.max(5, Pw / (eg * em * ei) * 1.6);
  const n = v => Math.max(-1, Math.min(1, v / max));
  const L = v => `${v.toFixed(1)} kW`;
  let nodes = {}, edges = [], fl = {};
  const regen = mode === 'regen';
  // electrical drive chain values
  const Pm = Pw / eg, Pe = Pm / em, Pdc = Pe / ei;               // motoring
  const Rm = Pw * eg, Re = Rm * em, Rdc = Re * ei;               // regeneration (Pw = braking power at wheels)
  if (type === 'BEV') {
    nodes = { grid: [.08, .18, .11, .14, 'Grid', 'AC supply', T.yellow], obc: [.25, .18, .11, .14, 'OBC', 'AC→DC', T.violet], batt: [.25, .55, .12, .2, 'Battery', 'HV DC', T.green], inv: [.43, .55, .11, .17, 'Inverter', 'DC↔AC', T.orange], mot: [.59, .55, .11, .17, 'Motor', 'PMSM', T.cyan], gear: [.75, .55, .11, .17, 'Gear+Diff', 'G = 9', T.violet], whl: [.91, .55, .1, .17, 'Wheels', '', T.blue], aux: [.43, .86, .13, .12, 'DC-DC / Aux', '12 V loads', T.pink] };
    if (mode === 'charge') { const Pg = 7.4; edges = [['grid', 'obc', n(Pg), C.grid, L(Pg)], ['obc', 'batt', n(Pg * eobc), C.el, L(Pg * eobc)]]; fl = { 'Grid AC': Pg, 'Into battery': Pg * eobc - aux * 0, 'OBC loss': Pg * (1 - eobc) }; }
    else if (regen) { edges = [['batt', 'inv', -n(Rdc), C.regen, L(Rdc)], ['inv', 'mot', -n(Re), C.regen, L(Re)], ['mot', 'gear', -n(Rm), C.regen, L(Rm)], ['gear', 'whl', -n(Pw), C.regen, L(Pw)], ['batt', 'aux', n(aux), C.el, L(aux)]]; fl = { 'Braking power at wheels': Pw, 'Recovered at battery (net of aux)': Rdc - aux }; }
    else { const k = mode === 'accel' ? 1 : 0.35; const pw = Pw * k; edges = [['batt', 'inv', n(Pdc * k), C.el, L(Pdc * k)], ['inv', 'mot', n(Pe * k), C.el, L(Pe * k)], ['mot', 'gear', n(Pm * k), C.mech, L(Pm * k)], ['gear', 'whl', n(pw), C.mech, L(pw)], ['batt', 'aux', n(aux), C.el, L(aux)]]; fl = { 'Battery output': Pdc * k + aux, 'Wheel power': pw, 'Tank(battery)-to-wheel efficiency': 100 * pw / (Pdc * k + aux) }; }
  } else if (type === 'SHEV') {
    nodes = { tank: [.08, .2, .1, .14, 'Fuel tank', '', T.orange], eng: [.23, .2, .11, .15, 'Engine', 'ICE', T.red], gen: [.38, .2, .11, .15, 'Generator', '', T.cyan], rec: [.53, .2, .11, .15, 'Rectifier', 'AC→DC', T.orange], batt: [.38, .62, .12, .18, 'Battery', '', T.green], bus: [.53, .62, .1, .16, 'DC bus', '', T.yellow], inv: [.67, .62, .1, .16, 'Inverter', '', T.orange], mot: [.8, .62, .09, .16, 'Motor', '', T.cyan], whl: [.93, .62, .09, .16, 'Wheels', 'via gear', T.blue] };
    const Pdrv = mode === 'accel' ? Pdc : mode === 'drive' ? Pdc * .4 : mode === 'ev' ? Pdc * .3 : 0;
    const engP = mode === 'accel' ? Pdc * .55 : mode === 'drive' ? Pdc * .4 + 5 : mode === 'charge' ? 15 : 0;
    const genDC = engP * 0.93 * 0.97, battP = regen ? -Rdc : Pdrv - genDC;
    if (engP) edges.push(['tank', 'eng', n(engP / ee), C.fuel, L(engP / ee)], ['eng', 'gen', n(engP), C.mech, L(engP)], ['gen', 'rec', n(engP * .93), C.el], ['rec', 'bus', n(genDC), C.el, L(genDC)]);
    edges.push(['batt', 'bus', n(battP), battP >= 0 ? C.el : C.regen, L(Math.abs(battP))]);
    if (regen) edges.push(['bus', 'inv', -n(Rdc), C.regen], ['inv', 'mot', -n(Re), C.regen], ['mot', 'whl', -n(Rm), C.regen, L(Pw)]);
    else if (Pdrv) edges.push(['bus', 'inv', n(Pdrv), C.el], ['inv', 'mot', n(Pdrv * ei), C.el], ['mot', 'whl', n(Pdrv * ei * em * eg), C.mech, L(Pdrv * ei * em * eg)]);
    fl = { 'Fuel power': engP / ee || 0, 'Engine shaft': engP, 'Battery (+out/−in)': battP, 'Wheel power': regen ? -Pw : Pdrv * ei * em * eg };
  } else if (type === 'PHEV_P') {
    nodes = { grid: [.08, .85, .1, .12, 'Grid', 'plug-in', T.yellow], tank: [.08, .22, .1, .14, 'Fuel tank', '', T.orange], eng: [.25, .22, .11, .15, 'Engine', 'ICE', T.red], clu: [.42, .22, .1, .14, 'Clutch', '', T.grey], cpl: [.6, .4, .12, .18, 'Torque coupler', 'T = Tₑ + Tₘ', T.violet], batt: [.25, .62, .12, .17, 'Battery', '', T.green], inv: [.42, .62, .1, .15, 'Inverter', '', T.orange], mot: [.6, .75, .1, .14, 'Motor', '', T.cyan], gear: [.77, .4, .1, .15, 'Gearbox', '', T.violet], whl: [.92, .4, .09, .15, 'Wheels', '', T.blue] };
    if (mode === 'charge') { edges.push(['grid', 'batt', n(7.4 * eobc), C.grid, L(7.4)]); fl = { 'Grid → battery': 7.4 * eobc }; }
    else {
      const sE = mode === 'drive' ? 1 : mode === 'accel' ? .6 : 0, pw = mode === 'accel' ? Pw : Pw * .4;
      const engMech = regen ? 0 : pw * sE / eg, motMech = regen ? -Rm : pw * (1 - sE) / eg;
      if (engMech > 0) edges.push(['tank', 'eng', n(engMech / ee), C.fuel, L(engMech / ee)], ['eng', 'clu', n(engMech), C.mech], ['clu', 'cpl', n(engMech), C.mech, L(engMech)]);
      if (motMech > 0) edges.push(['batt', 'inv', n(motMech / em / ei), C.el, L(motMech / em / ei)], ['inv', 'mot', n(motMech / em), C.el], ['mot', 'cpl', n(motMech), C.mech]);
      if (regen) edges.push(['batt', 'inv', -n(Rdc), C.regen, L(Rdc)], ['inv', 'mot', -n(Re), C.regen], ['mot', 'cpl', -n(Rm), C.regen]);
      edges.push(['cpl', 'gear', regen ? -n(Rm) : n(engMech + motMech), regen ? C.regen : C.mech], ['gear', 'whl', regen ? -n(Pw) : n(pw), regen ? C.regen : C.mech, L(regen ? Pw : pw)]);
      fl = { 'Engine shaft': engMech, 'Motor shaft (+/−)': motMech, 'Wheel power': regen ? -Pw : pw };
    }
  } else if (type === 'PSHEV') {
    nodes = { tank: [.08, .2, .1, .14, 'Fuel tank', '', T.orange], eng: [.23, .2, .1, .15, 'Engine', 'carrier', T.red], psd: [.42, .2, .14, .17, 'Planetary gear', 'power-split', T.violet], gen: [.42, .55, .11, .14, 'MG1 (gen)', 'sun', T.cyan], inv: [.6, .55, .12, .14, 'Inverters', '', T.orange], batt: [.6, .85, .12, .13, 'Battery', '', T.green], mot: [.78, .55, .1, .14, 'MG2 (motor)', '', T.cyan], ring: [.78, .2, .1, .15, 'Ring / final drive', '', T.violet], whl: [.93, .2, .08, .15, 'Wheels', '', T.blue] };
    if (mode === 'ev') { const p = Pw * .3; edges = [['batt', 'inv', n(p / eg / em / ei), C.el, L(p / eg / em / ei)], ['inv', 'mot', n(p / eg / em), C.el], ['mot', 'ring', n(p / eg), C.mech], ['ring', 'whl', n(p), C.mech, L(p)]]; fl = { 'Battery': p / eg / em / ei, 'Wheel': p }; }
    else if (regen) { edges = [['batt', 'inv', -n(Rdc), C.regen, L(Rdc)], ['inv', 'mot', -n(Re), C.regen], ['mot', 'ring', -n(Rm), C.regen], ['ring', 'whl', -n(Pw), C.regen, L(Pw)]]; fl = { 'Recovered': Rdc }; }
    else {
      const pw = mode === 'accel' ? Pw : Pw * .45, eng = pw * (mode === 'accel' ? .65 : 1.05) / eg;
      const mechPath = eng * .72, elPath = eng * .28, batt = pw / eg - mechPath - elPath * .9 * .9;
      edges = [['tank', 'eng', n(eng / ee), C.fuel, L(eng / ee)], ['eng', 'psd', n(eng), C.mech, L(eng)], ['psd', 'ring', n(mechPath), C.mech, L(mechPath) + ' mech'], ['psd', 'gen', n(elPath), C.mech], ['gen', 'inv', n(elPath * .93), C.el, L(elPath * .93) + ' elec'], ['batt', 'inv', n(batt / .9), batt >= 0 ? C.el : C.regen], ['inv', 'mot', n(elPath * .9 + Math.max(0, batt)), C.el], ['mot', 'ring', n((elPath * .9 + Math.max(0, batt)) * .93), C.mech], ['ring', 'whl', n(pw), C.mech, L(pw)]];
      fl = { 'Engine': eng, 'Mechanical path': mechPath, 'Electrical path': elPath, 'Battery (+out/−in)': batt, 'Wheel': pw };
    }
  } else if (type === 'FCEV') {
    nodes = { h2: [.08, .25, .11, .15, 'H₂ tank', '700 bar', T.pink], fc: [.25, .25, .12, .16, 'Fuel cell', 'PEM stack', T.pink], bst: [.42, .25, .11, .15, 'Boost DC-DC', '', T.orange], bus: [.55, .5, .1, .16, 'DC bus', '', T.yellow], batt: [.25, .75, .12, .16, 'Battery', 'buffer', T.green], bdc: [.42, .75, .12, .15, 'Bi-dir DC-DC', '', T.orange], inv: [.69, .5, .1, .15, 'Inverter', '', T.orange], mot: [.81, .5, .08, .15, 'Motor', '', T.cyan], whl: [.93, .5, .08, .15, 'Wheels', '', T.blue] };
    const pw = mode === 'accel' ? Pw : mode === 'drive' ? Pw * .4 : 0;
    const Pbus = regen ? -Rdc : pw / eg / em / ei;
    const fcP = mode === 'accel' ? Pbus * .6 : mode === 'drive' ? Pbus : mode === 'fcchg' ? 12 : 0;
    const bat = Pbus - fcP * eDC;
    if (fcP) edges.push(['h2', 'fc', n(fcP / efc), C.h2, L(fcP / efc) + ' H₂'], ['fc', 'bst', n(fcP), C.el, L(fcP)], ['bst', 'bus', n(fcP * eDC), C.el]);
    edges.push(['batt', 'bdc', n(bat), bat >= 0 ? C.el : C.regen, L(Math.abs(bat))], ['bdc', 'bus', n(bat), bat >= 0 ? C.el : C.regen]);
    if (regen) edges.push(['bus', 'inv', -n(Rdc), C.regen], ['inv', 'mot', -n(Re), C.regen], ['mot', 'whl', -n(Rm), C.regen, L(Pw)]);
    else if (pw) edges.push(['bus', 'inv', n(Pbus), C.el], ['inv', 'mot', n(Pbus * ei), C.el], ['mot', 'whl', n(pw), C.mech, L(pw)]);
    fl = { 'Hydrogen chemical power': fcP / efc || 0, 'Fuel-cell electrical': fcP, 'Battery (+out/−in)': bat, 'Wheel power': regen ? -Pw : pw };
  }
  return { nodes, edges, flows: fl };
}
