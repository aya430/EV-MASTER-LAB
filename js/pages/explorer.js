// 3D EV Explorer: car, battery pack and motors with component isolation and information.
import { h } from '../lib/ui.js';
import { carView, motorView, packView, compInfo } from '../three/views.js';
import { COMPONENTS } from '../three/components.js';

export function render(c, app) {
  c.append(h('div', { class: 'crumbs' }, 'Laboratory / 3D EV Explorer'), h('h1', {}, '3D EV Explorer'), h('p', { class: 'muted' }, 'Procedurally generated 3D models (no external assets required). Rotate 360°, zoom, choose front/rear/side/top views, switch to transparent, X-ray or exploded view, and click or select any component to isolate it and read its function, working principle, construction, specifications and governing equation.'));
  const tabs = [['car', 'Battery electric vehicle'], ['pmsm', 'PMSM (interior magnet)'], ['spm', 'PMSM (surface magnet)'], ['im', 'Induction motor'], ['pack', 'Battery pack']];
  let cur = null, raf = 0, last = 0;
  const host = h('div', { class: 'v3d', style: { height: '560px' } });
  const stage = h('div', { class: 'stage' }, host);
  const side = h('div', { class: 'card', style: { maxHeight: '560px', overflow: 'auto' } });
  const bar = h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { 'data-k': k, onclick: () => show(k) }, l)));
  c.append(bar, h('div', { class: 'lab', style: { gridTemplateColumns: 'minmax(0,1fr) 340px' } }, stage, side));
  function show(k) {
    bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    if (cur) { cur.dispose(); host.innerHTML = ''; }
    side.innerHTML = '';
    try {
      if (k === 'car') {
        cur = carView(host, { state: () => ({ speed: 3, flow: .5 }) });
        side.append(h('h3', {}, 'Components'), h('p', { class: 'muted', style: { fontSize: '.84rem' } }, 'Select to highlight and isolate.'), ...['battery', 'bms', 'inverter', 'motor', 'gearbox', 'differential', 'shafts', 'wheel', 'obc', 'dcdc', 'aux12', 'vcu', 'radiator', 'chargeport', 'body'].map(n => h('button', { class: 'btn sm', style: { margin: '3px', }, onclick: () => { cur.car.highlight(n); cur.car.isolate(n === 'body' ? null : n); info.innerHTML = ''; info.append(compInfo(n)); } }, COMPONENTS[n].name.split('(')[0])), h('button', { class: 'btn sm on', style: { margin: '3px' }, onclick: () => { cur.car.isolate(null); cur.car.highlight(null); } }, 'Show all'));
      } else if (k === 'pack') {
        cur = packView(host); cur.build(12, 4, 'cylindrical');
        side.append(h('h3', {}, 'Battery pack'), ...[['cylindrical', '21700 cylindrical 12s4p'], ['prismatic', 'Prismatic 12s2p'], ['pouch', 'Pouch 16s2p']].map(([f, l]) => h('button', { class: 'btn sm', style: { margin: '3px' }, onclick: () => cur.build(f === 'pouch' ? 16 : 12, f === 'cylindrical' ? 4 : 2, f) }, l)), h('p', { class: 'muted' }, 'Orange busbars connect cells in series (voltage adds); silver busbars connect cells in parallel (capacity adds).'));
      } else {
        const type = k === 'im' ? 'IM' : 'PMSM';
        let th = 0;
        cur = motorView(host, { type, salient: k === 'pmsm', poles: type === 'IM' ? 4 : 8, state: (p, R, S, dt) => { th += 0.02; return { thetaE: th * 4, thetaM: type === 'IM' ? th * 0.96 : th, ia: Math.cos(th * 4), ib: Math.cos(th * 4 - 2.094), ic: Math.cos(th * 4 + 2.094) }; } });
        const list = type === 'IM' ? ['stator', 'windings', 'rotorbars', 'endrings', 'airgap', 'shaft', 'bearings'] : ['stator', 'windings', 'rotor', 'magnets', 'airgap', 'shaft', 'bearings'];
        side.append(h('h3', {}, type === 'IM' ? 'Induction motor' : k === 'pmsm' ? 'Interior PMSM' : 'Surface PMSM'), ...list.map(n => h('button', { class: 'btn sm', style: { margin: '3px' }, onclick: () => { info.innerHTML = ''; info.append(compInfo(n)); } }, COMPONENTS[n].name)), h('p', { class: 'muted' }, 'The cyan arrow is the resultant stator field; coils glow in proportion to their phase current.'));
      }
    } catch (e) { host.innerHTML = '<div class="note bad">WebGL is not available in this browser, so 3D models cannot be displayed. All 2D experiments remain available.</div>'; cur = null; }
    const info = h('div', { style: { marginTop: '12px', fontSize: '.86rem' } }); side.append(info);
  }
  const loop = now => { raf = requestAnimationFrame(loop); const dt = Math.min(.05, (now - (last || now)) / 1000); last = now; if (cur && cur.frame) cur.frame(dt, true, {}, {}, null); };
  show('car'); raf = requestAnimationFrame(loop);
  app.onLeave(() => { cancelAnimationFrame(raf); cur && cur.dispose(); });
}
