import { h, ICON } from '../lib/ui.js';
import { store } from '../lib/store.js';
import { UNITS, CATALOG, byId } from '../catalog.js';
import { fitCanvas, car2d, flow, text, themeColors, hex } from '../lib/draw.js';

export function render(c, app) {
  const cv = h('canvas');
  const total = CATALOG.length, done = CATALOG.filter(e => store.isDone(e.id)).length;
  c.append(
    h('div', { class: 'hero' }, cv,
      h('div', { style: { position: 'relative', maxWidth: '620px' } },
        h('span', { class: 'tag src' }, 'Course B24EES502 · REVA University'),
        h('h1', {}, 'EV MASTER LAB'),
        h('div', { class: 'sub' }, 'Electric Vehicle System Engineering – Interactive Virtual Laboratory. Operate a digital-twin electric car, run battery, power-electronics and motor-drive experiments, and study every syllabus topic through live simulation, animation and the unit-wise notes.'),
        h('div', { class: 'row', style: { marginTop: '16px' } }, h('a', { class: 'btn pri', href: '#/sim' }, '🚗 Drive the EV digital twin'), h('a', { class: 'btn', href: '#/units' }, 'Browse all units'), h('a', { class: 'btn', href: '#/explorer' }, '🧊 3D EV Explorer')))),
    h('div', { class: 'grid g4', style: { margin: '16px 0' } },
      h('div', { class: 'stat' }, h('b', {}, total), h('span', {}, 'Interactive experiments (one per syllabus topic)')),
      h('div', { class: 'stat' }, h('b', {}, '24'), h('span', {}, 'Engineering calculators')),
      h('div', { class: 'stat' }, h('b', {}, '4'), h('span', {}, 'Unit-wise PDF notes, linked page-by-page')),
      h('div', { class: 'stat' }, h('b', { style: { color: 'var(--green)' } }, `${done}/${total}`), h('span', {}, 'Your completed experiments'))),
    h('h2', {}, 'Course units'),
    h('div', { class: 'grid g4' }, UNITS.map(u => { const ex = CATALOG.filter(e => e.unit === u.n), d = ex.filter(e => store.isDone(e.id)).length; return h('a', { class: 'ucard', href: '#/unit/' + u.n, style: { borderTop: `3px solid ${u.color}` } }, h('div', { class: 'muted', style: { fontSize: '.75rem', fontWeight: 700 } }, `UNIT ${u.n} · ${u.co}`), h('h3', { style: { margin: '6px 0' } }, u.title), h('p', { class: 'muted', style: { fontSize: '.84rem' } }, u.short), h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '.78rem' } }, h('span', {}, `${ex.length} experiments`), h('span', {}, `${d} done`)), h('div', { class: 'bar' }, h('i', { style: { width: `${100 * d / ex.length}%` } }))); })),
    h('h2', { style: { marginTop: '22px' } }, 'Featured laboratories'),
    h('div', { class: 'grid g3' }, [['#/sim', 'Live EV digital twin', 'Accelerator, brake, steering, gears, drive modes, cruise, regeneration, drive cycles, charging, faults — with 16 synchronised graphs and an energy-balance check.'], ['#/exp/1.4', 'Energy flow analysis', 'Battery → DC link → inverter → motor → gearbox → differential → wheels with live losses in six operating modes.'], ['#/exp/4.6', 'Regenerative braking digital twin', 'Watch power flow reverse, battery current turn negative and recovered energy accumulate, limited by charge acceptance and fade.'], ['#/exp/2.12', 'Battery equivalent-circuit lab', 'Rint, 1-RC, 2-RC and 3-RC models with animated circuit and polarisation voltages.'], ['#/exp/1.11', 'Space-vector PWM', 'Rotating reference vector, sectors, dwell times and the seven-segment switching sequence.'], ['#/exp/3.17', 'PMSM field-oriented control', 'Cascaded speed/current loops, MTPA, field weakening and SVPWM gate signals.']].map(([href, t, d]) => h('a', { class: 'expcard', href }, h('b', {}, t), h('span', { class: 'muted', style: { fontSize: '.84rem' } }, d)))),
    store.get().recent.length ? h('div', {}, h('h2', { style: { marginTop: '22px' } }, 'Continue where you left off'), h('div', { class: 'row' }, store.get().recent.slice(0, 6).map(id => byId(id) ? h('a', { class: 'btn', href: '#/exp/' + id }, `${id} ${byId(id).t}`) : null))) : null,
    h('div', { class: 'card', style: { marginTop: '22px', display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' } },
      h('img', { src: 'data/dr-bansilal-bairwa.jpg', alt: app.author.name, style: { width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', objectPosition: '50% 18%', border: '3px solid var(--cyan)' } }),
      h('div', { style: { flex: 1, minWidth: '260px' } }, h('div', { class: 'muted', style: { fontSize: '.78rem', fontWeight: 700, letterSpacing: '.08em' } }, 'DEVELOPED BY'), h('h2', { style: { margin: '4px 0' } }, app.author.name), h('div', {}, `${app.author.role}, ${app.author.dept}`), h('div', { class: 'muted' }, app.author.org)),
      h('a', { class: 'btn', href: app.author.li, target: '_blank', rel: 'noopener', html: ICON.li + ' LinkedIn profile', style: { background: '#0a66c2', borderColor: '#0a66c2', color: '#fff' } })));
  // hero animation: car with energy flowing battery -> wheels, reversing periodically
  let raf; const t0 = performance.now();
  const loop = now => { raf = requestAnimationFrame(loop); if (!cv.isConnected) return cancelAnimationFrame(raf); const { g, W, H } = fitCanvas(cv); const T = themeColors(); const t = (now - t0) / 1000; const ph = Math.sin(t * 0.5); const gy = H * 0.78; g.strokeStyle = hex(T.cyan, .3); g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke(); const off = (t * 120) % 60; for (let x = -off; x < W; x += 60) { g.fillStyle = hex(T.cyan, .3); g.fillRect(x, gy + 10, 30, 3); } const cx = W * .55; car2d(g, cx, gy, Math.min(340, W * .7), t * 6, '#2563eb'); const bx = cx - 90, by = gy - 34; g.fillStyle = hex(T.green, .5); g.fillRect(bx, by, 150, 12); flow(g, [[bx + 150, by + 6], [cx + 70, by + 6], [cx + 105, gy - 34]], t, ph, ph >= 0 ? T.cyan : T.green, { w: 2 }); text(g, ph >= 0 ? 'motoring' : 'regenerating', cx, gy - 140, { color: ph >= 0 ? T.cyan : T.green, weight: 800 }); };
  raf = requestAnimationFrame(loop); app.onLeave(() => cancelAnimationFrame(raf));
}
