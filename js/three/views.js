// Ready-made 3D views used by experiments, the explorer and the digital twin.
import { Viewer, buildCar, buildPack, buildMotor, THREE } from './ev3d.js';
import { COMPONENTS } from './components.js';
import { h, tex } from '../lib/ui.js';

/** Info card for a picked component. */
export function compInfo(name) {
  const c = COMPONENTS[name]; if (!c) return h('div', { class: 'muted' }, 'Click a component to see its details.');
  return h('div', {}, h('h3', { style: { margin: '0 0 6px' } }, c.name),
    h('p', {}, h('b', {}, 'Function: '), c.fn), c.principle ? h('p', {}, h('b', {}, 'Working principle: '), c.principle) : null,
    h('p', {}, h('b', {}, 'Construction: '), c.construction), c.specs ? h('p', {}, h('b', {}, 'Specifications: '), c.specs) : null,
    c.eq ? h('div', { class: 'eq' }, tex(c.eq, true)) : null,
    h('a', { class: 'btn sm', href: `#/notes/${c.unit}/1` }, `Unit ${c.unit} notes →`));
}
/** Overlay with view buttons and mode switches on top of a 3D host. */
function overlay(host, V, car, onInfo, mode0 = 'normal') {
  const bar = h('div', { style: { position: 'absolute', left: '10px', top: '10px', display: 'flex', gap: '4px', flexWrap: 'wrap', zIndex: 3, maxWidth: '70%' } });
  for (const v of ['iso', 'front', 'rear', 'side', 'top']) bar.append(h('button', { class: 'btn sm', onclick: () => V.view(v) }, v === 'iso' ? '3D' : v[0].toUpperCase() + v.slice(1)));
  if (car) {
    const modes = [['normal', 'Body'], ['transparent', 'Transparent'], ['xray', 'X-ray'], ['exploded', 'Exploded']];
    const mb = modes.map(([m, l]) => h('button', { class: 'btn sm' + (m === mode0 ? ' on' : ''), onclick: e => { car.setMode(m); mb.forEach(b => b.classList.remove('on')); e.target.classList.add('on'); } }, l));
    bar.append(h('span', { style: { width: '8px' } }), ...mb);
  }
  host.style.position = 'relative'; host.append(bar);
  const info = h('div', { class: 'card', style: { position: 'absolute', right: '10px', top: '10px', width: '320px', maxHeight: 'calc(100% - 20px)', overflow: 'auto', zIndex: 3, fontSize: '.84rem', display: 'none' } });
  host.append(info);
  V.onPick = name => {
    if (car) car.highlight(name);
    if (!name) { info.style.display = 'none'; return; }
    info.innerHTML = ''; info.append(h('button', { class: 'btn sm', style: { float: 'right' }, onclick: () => { info.style.display = 'none'; car && car.highlight(null); car && car.isolate(null); } }, '✕'), compInfo(name),
      car ? h('button', { class: 'btn sm', style: { marginTop: '6px' }, onclick: () => car.isolate(name) }, 'Isolate component') : null,
      car ? h('button', { class: 'btn sm', style: { marginTop: '6px', marginLeft: '4px' }, onclick: () => car.isolate(null) }, 'Show all') : null);
    info.style.display = 'block'; onInfo && onInfo(name);
  };
  host.append(h('div', { class: 'hint', style: { position: 'absolute', left: '10px', bottom: '8px', fontSize: '.72rem', color: 'var(--dim)', zIndex: 3 } }, 'Drag to rotate · scroll to zoom · right-drag to pan · click a component for details'));
  return { bar, info };
}
export function carView(host, o = {}) {
  const V = new Viewer(host, { cam: o.cam || [5.2, 2.4, 5.2], target: [0, 0.5, 0] });
  const car = buildCar(o); V.scene.add(car); V.pickables.push(car);
  overlay(host, V, car, o.onInfo, o.mode || 'normal');
  if (o.mode) car.setMode(o.mode);
  let wa = 0, ma = 0, dist = 0;
  return {
    V, car,
    frame(dt, running, p, R, S) {
      const st = o.state ? o.state(p, R, S) : {};
      if (running && st.speed !== undefined) { wa += st.speed / 0.33 * dt; ma += st.speed / 0.33 * 9 * dt; dist += st.speed * dt; if (o.scroll && V.grid) V.grid.position.x = -(dist % 0.5); }
      car.update(Object.assign({ wheelAng: wa, motorAng: ma }, st), dt); V.render();
    },
    update() { }, resetCam: () => V.view('iso'), zoom: f => V.zoom(f), dispose: () => V.dispose(),
  };
}
export function packView(host, o = {}) {
  const V = new Viewer(host, { cam: [2.6, 2.2, 3.0], target: [0, 0.3, 0] });
  let pk = null, key = '';
  const api = {
    V,
    build(s, p, fmt) { const k = `${s}-${p}-${fmt}`; if (k === key) return; key = k; if (pk) V.scene.remove(pk); pk = buildPack({ s: Math.min(s, 24), p: Math.min(p, 6), format: fmt }); const sc = 2.4 / Math.max(1, Math.min(s, 24) * 0.27); pk.scale.setScalar(Math.min(1.4, sc)); V.scene.add(pk); },
    color(fn) { pk && pk.color(fn); },
    frame() { V.render(); }, resetCam: () => V.view('iso'), zoom: f => V.zoom(f), dispose: () => V.dispose(), update() { },
  };
  overlay(host, V, null);
  return api;
}
export function motorView(host, o = {}) {
  const V = new Viewer(host, { cam: [2.6, 1.6, 3.4], target: [0, 0, 0], floor: false });
  const m = buildMotor(o); V.scene.add(m); V.pickables.push(m);
  overlay(host, V, null);
  const cut = h('label', { class: 'btn sm', style: { position: 'absolute', left: '10px', top: '46px', zIndex: 3 } }, h('input', { type: 'checkbox', onchange: e => { api.cut = e.target.checked; } }), ' Cut-away stator');
  const ex = h('label', { class: 'btn sm', style: { position: 'absolute', left: '150px', top: '46px', zIndex: 3 } }, h('input', { type: 'checkbox', onchange: e => { api.explode = e.target.checked ? 1 : 0; } }), ' Pull out rotor');
  host.append(cut, ex);
  const api = {
    V, m, cut: false, explode: 0, th: 0, thm: 0,
    frame(dt, running, p, R, S) {
      const st = o.state ? o.state(p, R, S, dt, running) : {};
      m.update(Object.assign({ cut: api.cut, explode: api.explode }, st)); V.render();
    },
    resetCam: () => V.view('iso'), zoom: f => V.zoom(f), dispose: () => V.dispose(), update() { },
  };
  return api;
}
export { THREE };
