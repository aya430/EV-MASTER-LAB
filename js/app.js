// EV MASTER LAB — application shell: header, sidebar, footer (on every page), router, search.
import { h, $, renderMath, ICON, toast } from './lib/ui.js';
import { store } from './lib/store.js';
import { UNITS, CATALOG, CO, byId } from './catalog.js';
import { loadNotesIndex, loadNotesPages, INDEX, NOTES } from './lib/notes.js';
import { loadCycles } from './models/drivecycles.js';
import { mountExperiment } from './lib/lab.js';

const AUTHOR = { name: 'Dr Bansilal Bairwa', role: 'Assistant Professor', org: 'REVA University, Bengaluru', dept: 'School of Electrical and Electronics Engineering', li: 'https://www.linkedin.com/in/dr-bansilal-bairwa-4816b2106/' };
let leaveFns = [];
export const app = {
  units: UNITS, co: CO, author: AUTHOR,
  onLeave(f) { leaveFns.push(f); },
};
const NAV = [['#/home', 'Home'], ['#/units', 'All Units'], ['#/experiments', 'Experiments'], ['#/explorer', '3D EV Explorer'], ['#/sim', 'Live EV Simulator'], ['#/calc', 'Engineering Calculators'], ['#/perf', 'Performance Analysis'], ['#/notes', 'PDF Notes'], ['#/assess', 'Assessment'], ['#/about', 'About Laboratory']];

function shell() {
  const root = $('#app'); root.innerHTML = '';
  const sres = h('div', { class: 'sres' });
  const sin = h('input', { placeholder: 'Search experiments, concepts, notes…', 'aria-label': 'Search', oninput: e => doSearch(e.target.value, sres), onfocus: e => doSearch(e.target.value, sres), onkeydown: e => { if (e.key === 'Enter') { location.hash = '#/search/' + encodeURIComponent(e.target.value); sres.classList.remove('on'); } if (e.key === 'Escape') sres.classList.remove('on'); } });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) sres.classList.remove('on'); });
  const themeBtn = h('button', { class: 'ibtn', title: 'Toggle light/dark mode', onclick: () => { const l = document.documentElement.classList.toggle('light'); store.setTheme(l ? 'light' : 'dark'); window.dispatchEvent(new Event('themechange')); } }, '◐');
  root.append(
    h('header', { class: 'hdr' },
      h('button', { class: 'ibtn menu-btn', onclick: () => document.body.classList.toggle('navopen'), 'aria-label': 'Menu' }, '☰'),
      h('a', { class: 'brand', href: '#/home' }, h('div', { class: 'logo' }, '⚡'), h('div', {}, h('b', {}, 'EV MASTER LAB'), h('small', {}, 'Electric Vehicle System Engineering – Interactive Virtual Laboratory'))),
      h('nav', { class: 'topnav', id: 'topnav' }, NAV.map(([href, l]) => h('a', { href }, l))),
      h('div', { class: 'hdr-tools' }, h('div', { class: 'search' }, h('span', { html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>' }), sin, sres), themeBtn)),
    h('aside', { class: 'side', id: 'side' }),
    h('div', { class: 'main' }, h('main', { class: 'content', id: 'content' }), footer()));
  buildSidebar();
  store.on(buildSidebar);
}
export function footer() {
  return h('footer', { class: 'foot' },
    h('img', { src: 'data/dr-bansilal-bairwa.jpg', alt: AUTHOR.name }),
    h('div', { class: 'who' }, h('div', {}, h('span', {}, 'Developed by '), h('b', {}, AUTHOR.name)), h('div', {}, h('span', {}, `${AUTHOR.role}, ${AUTHOR.dept}, ${AUTHOR.org}`))),
    h('a', { class: 'li', href: AUTHOR.li, target: '_blank', rel: 'noopener', html: ICON.li + ' LinkedIn profile' }),
    h('div', { class: 'copy' }, 'EV MASTER LAB · Course B24EES502 Electric Vehicle System Engineering', h('br'), `© ${new Date().getFullYear()} ${AUTHOR.name}, REVA University. For academic use.`));
}
function buildSidebar() {
  const side = $('#side'); if (!side) return;
  const open = new Set([...side.querySelectorAll('.unit.open')].map(u => u.dataset.u));
  const cur = location.hash.match(/#\/exp\/([\d.]+)/);
  if (cur) open.add(cur[1].split('.')[0]);
  if (!side.dataset.init) { open.add('1'); side.dataset.init = 1; }
  side.innerHTML = '';
  side.append(h('h5', {}, 'Course units'));
  for (const u of UNITS) {
    const exps = CATALOG.filter(e => e.unit === u.n), done = exps.filter(e => store.isDone(e.id)).length;
    const el = h('div', { class: 'unit' + (open.has(String(u.n)) ? ' open' : ''), 'data-u': u.n },
      h('button', { onclick: () => el.classList.toggle('open') }, h('span', { class: 'uchip', style: { background: u.color } }, u.n), h('span', {}, `Unit ${u.n} – ${u.title}`), h('span', { class: 'prog' }, `${done}/${exps.length}`)),
      h('ul', {}, h('li', {}, h('a', { href: '#/unit/' + u.n }, h('span', { class: 'n' }, '▸'), 'Unit overview')), exps.map(e => h('li', {}, h('a', { href: '#/exp/' + e.id, class: (store.isDone(e.id) ? 'done ' : '') + (cur && cur[1] === e.id ? 'on' : '') }, h('span', { class: 'n' }, e.id), e.t)))));
    side.append(el);
  }
  side.append(h('h5', {}, 'Laboratory'), h('div', { class: 'quick' },
    [['#/sim', '🚗 Live EV Digital Twin'], ['#/explorer', '🧊 3D EV Explorer'], ['#/calc', '🧮 Engineering Calculators'], ['#/perf', '📊 Compare / Design your EV'], ['#/analytics', '🧠 AI Battery Analytics'], ['#/thermal', '🌡 Battery Thermal Lab'], ['#/notes', '📘 Unit-wise PDF Notes'], ['#/assess', '📝 Assessment'], ['#/validation', '✅ Validation Panel'], ['#/about', 'ℹ️ About Laboratory']].map(([a, l]) => h('a', { href: a }, l))));
  const bm = Object.keys(store.get().bookmarks), rec = store.get().recent;
  if (bm.length) side.append(h('h5', {}, 'Bookmarks'), h('div', { class: 'quick' }, bm.map(id => byId(id) ? h('a', { href: '#/exp/' + id }, `★ ${id} ${byId(id).t}`) : null)));
  if (rec.length) side.append(h('h5', {}, 'Recently accessed'), h('div', { class: 'quick' }, rec.slice(0, 5).map(id => byId(id) ? h('a', { href: '#/exp/' + id }, `${id} ${byId(id).t}`) : null)));
}

// ---------------- search (experiments, concepts, notes full text) ----------------
let notesPages = null;
async function doSearch(q, box) {
  q = q.trim().toLowerCase(); box.innerHTML = '';
  if (q.length < 2) { box.classList.remove('on'); return; }
  const words = q.split(/\s+/);
  const hit = s => words.every(w => s.toLowerCase().includes(w));
  const exps = CATALOG.filter(e => hit(`${e.id} ${e.t} ${e.k}`)).slice(0, 8);
  box.append(h('div', { class: 'sh' }, 'Experiments'));
  exps.forEach(e => box.append(h('a', { href: '#/exp/' + e.id, onclick: () => box.classList.remove('on') }, `${e.id} · ${e.t}`, h('small', {}, `Unit ${e.unit} · ${e.k}`))));
  if (!exps.length) box.append(h('a', {}, h('small', {}, 'No experiment matches')));
  const secs = [];
  for (const u of Object.keys(INDEX || {})) for (const s of INDEX[u].sections) if (hit(s.t)) secs.push([u, s]);
  if (secs.length) { box.append(h('div', { class: 'sh' }, 'Notes sections')); secs.slice(0, 6).forEach(([u, s]) => box.append(h('a', { href: `#/notes/${u}/${s.p}`, onclick: () => box.classList.remove('on') }, `§${s.n} ${s.t}`, h('small', {}, `Unit ${u} notes · PDF page ${s.p}`)))); }
  box.append(h('a', { href: '#/search/' + encodeURIComponent(q), onclick: () => box.classList.remove('on') }, h('small', {}, 'Search the full text of all unit notes →')));
  box.classList.add('on');
}
async function searchPage(c, q) {
  q = decodeURIComponent(q || '');
  c.append(h('h1', {}, `Search: “${q}”`));
  notesPages = notesPages || await loadNotesPages();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const exps = CATALOG.filter(e => words.every(w => `${e.id} ${e.t} ${e.k}`.toLowerCase().includes(w)));
  c.append(h('div', { class: 'card' }, h('h3', {}, `Experiments (${exps.length})`), exps.length ? h('div', { class: 'grid g3' }, exps.map(expCard)) : h('p', { class: 'muted' }, 'None.')));
  const res = [];
  for (const u of Object.keys(notesPages)) notesPages[u].forEach((t, i) => { const lt = t.toLowerCase(); if (words.every(w => lt.includes(w))) { const k = lt.indexOf(words[0]); res.push([u, i + 1, t.slice(Math.max(0, k - 90), k + 160)]); } });
  c.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, `Pages in the unit notes (${res.length})`),
    res.slice(0, 80).map(([u, p, s]) => h('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--line)' } }, h('a', { href: `#/notes/${u}/${p}` }, `Unit ${u} notes – page ${p}`), h('div', { class: 'muted', style: { fontSize: '.85rem' } }, '…' + s + '…')))));
}

// ---------------- pages ----------------
export function expCard(e) {
  return h('a', { class: 'expcard' + (store.isDone(e.id) ? ' done' : ''), href: '#/exp/' + e.id }, h('span', { class: 'id' }, `EXP ${e.id}${store.isDone(e.id) ? '  ✓' : ''}`), h('b', {}, e.t), h('small', { class: 'muted' }, e.k));
}
function unitsPage(c) {
  c.append(h('h1', {}, 'All Units'), h('p', { class: 'muted' }, 'Course B24EES502 – Electric Vehicle System Engineering (PE-2, V semester, 3 credits). Every syllabus topic is an interactive experiment.'));
  for (const u of UNITS) unitBlock(c, u);
}
function unitBlock(c, u) {
  const exps = CATALOG.filter(e => e.unit === u.n), done = exps.filter(e => store.isDone(e.id)).length;
  c.append(h('div', { class: 'card', style: { marginBottom: '16px' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h2', {}, h('span', { class: 'tag', style: { background: u.color, color: '#06122a', marginRight: '8px' } }, `Unit ${u.n}`), u.title),
      h('div', { class: 'row' }, h('span', { class: 'pill info' }, `${done}/${exps.length} completed`), h('a', { class: 'btn sm', href: `#/notes/${u.n}/1`, html: ICON.book + ' Unit notes (PDF)' }))),
    h('p', { class: 'muted' }, u.short + ' · ' + CO[u.co]),
    h('div', { class: 'grid g4' }, exps.map(expCard))));
}
function unitPage(c, n) {
  const u = UNITS[n - 1]; if (!u) return notFound(c);
  const exps = CATALOG.filter(e => e.unit === u.n);
  const done = exps.filter(e => store.isDone(e.id)).length;
  const qz = store.get().quiz['unit' + n] || [];
  c.append(h('div', { class: 'crumbs' }, h('a', { href: '#/units' }, 'All Units'), ` / Unit ${n}`), h('h1', {}, `Unit ${n}: ${u.title}`),
    h('div', { class: 'grid g4', style: { margin: '10px 0 16px' } },
      h('div', { class: 'stat' }, h('b', {}, exps.length), h('span', {}, 'Total experiments')),
      h('div', { class: 'stat' }, h('b', { style: { color: 'var(--green)' } }, done), h('span', {}, 'Completed')),
      h('div', { class: 'stat' }, h('b', { style: { color: 'var(--orange)' } }, exps.length - done), h('span', {}, 'Pending')),
      h('div', { class: 'stat' }, h('b', {}, qz.length ? `${Math.round(100 * qz[qz.length - 1].s / qz[qz.length - 1].n)}%` : '–'), h('span', {}, 'Latest unit quiz score'))),
    h('div', { class: 'card' }, h('p', {}, CO[u.co]), h('div', { class: 'row' }, h('a', { class: 'btn pri', href: `#/notes/${n}/1`, html: ICON.book + ` Open Unit ${n} notes` }), h('a', { class: 'btn', href: `#/assess/unit${n}` }, `Take Unit ${n} quiz`))),
    h('h2', { style: { marginTop: '18px' } }, 'Experiments'), h('div', { class: 'grid g3' }, exps.map(expCard)));
  const secs = (INDEX[n] || { sections: [] }).sections.filter(s => s.n.split('.').length === 2);
  c.append(h('h2', { style: { marginTop: '18px' } }, 'Notes – chapter map'), h('div', { class: 'card' }, h('div', { class: 'pdfnav', style: { border: 0 } }, secs.map(s => h('a', { href: `#/notes/${n}/${s.p}` }, h('span', { class: 'n' }, s.n), s.t, h('span', { class: 'pg' }, `p. ${s.p}`))))));
}
function experimentsPage(c) {
  c.append(h('h1', {}, 'Experiments'), h('p', { class: 'muted' }, `${CATALOG.length} experiments covering every topic of the B24EES502 syllabus, plus the integrated digital twin, calculators and special laboratories.`));
  const filt = h('input', { placeholder: 'Filter…', style: { background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: '8px', padding: '8px', width: '280px', marginBottom: '12px' }, oninput: e => { const q = e.target.value.toLowerCase(); grid.querySelectorAll('.expcard').forEach(a => { a.style.display = a.textContent.toLowerCase().includes(q) ? '' : 'none'; }); } });
  const grid = h('div', {}, UNITS.map(u => h('div', {}, h('h3', { style: { marginTop: '16px' } }, `Unit ${u.n} – ${u.title}`), h('div', { class: 'grid g4' }, CATALOG.filter(e => e.unit === u.n).map(expCard)))));
  c.append(filt, grid);
}
async function experimentPage(c, id) {
  const meta = byId(id); if (!meta) return notFound(c);
  c.append(h('div', { class: 'loading' }, 'Loading experiment…'));
  try {
    const mod = await import(`./experiments/unit${meta.unit}.js`);
    const def = mod.EXPERIMENTS.find(e => e.id === id);
    c.innerHTML = '';
    if (!def) { c.append(h('div', { class: 'note bad' }, 'Experiment definition missing.')); return; }
    mountExperiment(c, Object.assign({ unit: meta.unit, notes: meta.notes, title: meta.t, co: UNITS[meta.unit - 1].co }, def), app);
    const prev = CATALOG[CATALOG.indexOf(meta) - 1], next = CATALOG[CATALOG.indexOf(meta) + 1];
    c.append(h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '20px' } }, prev ? h('a', { class: 'btn', href: '#/exp/' + prev.id }, `← ${prev.id} ${prev.t}`) : h('span'), next ? h('a', { class: 'btn', href: '#/exp/' + next.id }, `${next.id} ${next.t} →`) : h('span')));
  } catch (e) {
    console.error(e); c.innerHTML = ''; c.append(h('div', { class: 'note bad' }, `Could not load experiment ${id}: ${e.message}`));
  }
}
function notFound(c) { c.append(h('h1', {}, 'Page not found'), h('a', { href: '#/home' }, 'Go home')); }

const ROUTES = [
  [/^#\/?$|^#\/home$/, c => import('./pages/home.js').then(m => m.render(c, app))],
  [/^#\/units$/, unitsPage],
  [/^#\/unit\/(\d)$/, (c, n) => unitPage(c, +n)],
  [/^#\/experiments$/, experimentsPage],
  [/^#\/exp\/([\d.]+)$/, experimentPage],
  [/^#\/sim$/, c => import('./pages/simulator.js').then(m => m.render(c, app))],
  [/^#\/explorer$/, c => import('./pages/explorer.js').then(m => m.render(c, app))],
  [/^#\/calc(?:\/([\w-]+))?$/, (c, id) => import('./pages/calculators.js').then(m => m.render(c, app, id))],
  [/^#\/perf(?:\/(\w+))?$/, (c, t) => import('./pages/perf.js').then(m => m.render(c, app, t))],
  [/^#\/notes(?:\/(\d)(?:\/(\d+))?)?$/, (c, u, p) => import('./pages/notes.js').then(m => m.render(c, app, u, p))],
  [/^#\/assess(?:\/(\w+))?$/, (c, k) => import('./pages/assessment.js').then(m => m.render(c, app, k))],
  [/^#\/about$/, c => import('./pages/about.js').then(m => m.render(c, app))],
  [/^#\/validation$/, c => import('./pages/validation.js').then(m => m.render(c, app))],
  [/^#\/analytics$/, c => import('./pages/analytics.js').then(m => m.render(c, app))],
  [/^#\/thermal$/, c => import('./pages/thermal.js').then(m => m.render(c, app))],
  [/^#\/search\/(.*)$/, searchPage],
];
async function route() {
  leaveFns.forEach(f => { try { f(); } catch (e) { console.error(e); } }); leaveFns = [];
  document.body.classList.remove('navopen');
  const c = $('#content'); c.innerHTML = '';
  const hs = location.hash || '#/home';
  document.querySelectorAll('#topnav a').forEach(a => a.classList.toggle('on', hs === a.getAttribute('href') || (hs.startsWith(a.getAttribute('href') + '/') && a.getAttribute('href') !== '#/home')));
  buildSidebar();
  window.scrollTo(0, 0);
  for (const [re, f] of ROUTES) {
    const m = hs.match(re);
    if (m) { try { await f(c, ...m.slice(1)); } catch (e) { console.error(e); c.append(h('div', { class: 'note bad' }, 'Error: ' + e.message)); } renderMath(c); return; }
  }
  notFound(c);
}

async function boot() {
  shell();
  await Promise.all([loadNotesIndex(), loadCycles().catch(e => console.error(e)), new Promise(r => { if (window.katex) r(); else { const t = setInterval(() => { if (window.katex) { clearInterval(t); r(); } }, 30); setTimeout(() => { clearInterval(t); r(); }, 4000); } })]);
  window.addEventListener('hashchange', route);
  route();
}
boot();
