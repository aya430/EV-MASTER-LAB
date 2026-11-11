// Assessment: unit-wise and topic-wise quizzes (auto-graded, timed, repeatable), viva and numerical banks,
// simulation challenges and experiment-completion tracking (browser-local persistence).
import { h, renderMath, fmt } from '../lib/ui.js';
import { store } from '../lib/store.js';
import { UNITS, CATALOG } from '../catalog.js';

async function bank() {
  const mods = await Promise.all([1, 2, 3, 4].map(u => import(`../experiments/unit${u}.js`)));
  const Q = [], V = [], N = [];
  mods.forEach((m, i) => m.EXPERIMENTS.forEach(e => {
    (e.mcq || []).forEach(q => Q.push(Object.assign({ unit: i + 1, exp: e.id }, q)));
    (e.viva || []).forEach(v => V.push({ unit: i + 1, exp: e.id, q: typeof v === 'string' ? v : v[0], a: typeof v === 'string' ? null : v[1] }));
    (e.numericals || []).forEach(v => N.push({ unit: i + 1, exp: e.id, q: v[0], a: v[1] }));
  }));
  return { Q, V, N };
}
const CHALLENGES = [
  ['1.3', 'Reach 0–100 km/h in under 7.0 s with a 1800 kg vehicle by choosing torque, power and gear ratio, while keeping top speed ≥ 150 km/h.'],
  ['1.7', 'Size a BEV for 400 km WLTC range and 0–100 km/h in 8 s; record peak power, gear ratio and battery energy.'],
  ['1.11', 'Find the largest V_ref for which T0 stays positive at every angle (linear SVPWM limit) for Vdc = 400 V.'],
  ['1.12', 'Choose the hysteresis band that gives an average switching frequency close to 5 kHz.'],
  ['2.7', 'Start the estimator with a 30 % SOC error. Which method converges first? Record the RMS errors.'],
  ['2.13', 'Compare energy wasted by passive and active balancing for the same 12 % spread.'],
  ['2.16', 'Charge a 50 Ah cell from 10 % to full with CC-CV in under 70 minutes without exceeding 40 °C.'],
  ['3.17', 'Tune the PMSM speed loop for < 5 % overshoot on a 0 → 3000 r/min step with 60 N·m load.'],
  ['3.10', 'Detune the rotor resistance by +40 %. Measure the torque and flux error at 2500 r/min, 100 N·m.'],
  ['4.6', 'Find the regeneration level and braking intensity that recover the most energy in a stop from 90 km/h.'],
  ['4.13', 'Rank the control strategies by consumption on UDDS and explain the difference between PI and rule-based.'],
  ['sim', 'In the digital twin, complete the FTP-75 cycle and report Wh/km, recovered energy and the energy-balance error.'],
];

export async function render(c, app, key) {
  c.append(h('div', { class: 'crumbs' }, 'Assessment'), h('h1', {}, 'Student Assessment'), h('div', { class: 'loading' }, 'Loading question bank…'));
  const B = await bank(); c.querySelector('.loading').remove();
  // progress
  const prog = h('div', { class: 'card' }, h('h3', {}, 'Experiment completion tracking'), h('table', { class: 't' }, h('tr', {}, ['Unit', 'Total experiments', 'Completed', 'Pending', 'Latest quiz score', 'Overall progress'].map(x => h('th', {}, x))), UNITS.map(u => { const ex = CATALOG.filter(e => e.unit === u.n), d = ex.filter(e => store.isDone(e.id)).length; const q = store.get().quiz['unit' + u.n] || []; const last = q[q.length - 1]; return h('tr', {}, h('td', {}, `Unit ${u.n} – ${u.title}`), h('td', { class: 'num' }, ex.length), h('td', { class: 'num' }, d), h('td', { class: 'num' }, ex.length - d), h('td', { class: 'num' }, last ? `${Math.round(100 * last.s / last.n)} %` : '–'), h('td', {}, h('div', { class: 'ucard', style: { padding: 0, border: 0 } }, h('div', { class: 'bar' }, h('i', { style: { width: `${100 * d / ex.length}%` } }))))); })), h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn sm bad', onclick: () => { if (confirm('Reset all progress, bookmarks and scores stored in this browser?')) { store.reset(); location.reload(); } } }, 'Reset my progress')));
  const area = h('div', { style: { marginTop: '14px' } });
  const tabs = [['unit1', 'Unit 1 quiz'], ['unit2', 'Unit 2 quiz'], ['unit3', 'Unit 3 quiz'], ['unit4', 'Unit 4 quiz'], ['course', 'Full course test'], ['topic', 'Topic-wise quiz'], ['viva', 'Viva bank'], ['num', 'Numerical problems'], ['chal', 'Simulation challenges']];
  const tb = h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: k === (key || 'unit1') ? 'on' : '', onclick: () => location.hash = '#/assess/' + k }, l)));
  c.append(prog, tb, area);
  key = key || 'unit1';
  if (key.startsWith('unit') || key === 'course') { const u = key === 'course' ? 0 : +key.slice(4); quiz(area, B.Q.filter(q => !u || q.unit === u), key, u ? 15 : 30); }
  else if (key === 'topic') { const s = h('select', { onchange: e => { qa.innerHTML = ''; quiz(qa, B.Q.filter(q => q.exp === e.target.value), 'exp:' + e.target.value, 20); } }, h('option', { value: '' }, 'Select an experiment / topic…'), CATALOG.map(e => h('option', { value: e.id }, `${e.id} ${e.t}`))); const qa = h('div', {}); area.append(h('div', { class: 'card' }, s), qa); }
  else if (key === 'viva') area.append(h('div', { class: 'card' }, h('h3', {}, `Viva-voce question bank (${B.V.length})`), h('ol', {}, B.V.map(v => h('li', {}, h('a', { href: '#/exp/' + v.exp, class: 'tag' }, v.exp), ' ', h('span', { html: v.q }), v.a ? h('details', {}, h('summary', { class: 'muted' }, 'Model answer'), h('p', { html: v.a })) : null)))));
  else if (key === 'num') area.append(h('div', { class: 'card' }, h('h3', {}, 'Numerical problems'), h('ol', {}, B.N.map(v => h('li', {}, h('a', { href: '#/exp/' + v.exp, class: 'tag' }, v.exp), ' ', h('span', { html: v.q }), h('details', {}, h('summary', { class: 'muted' }, 'Answer'), h('p', { html: v.a }))))), h('p', { class: 'muted' }, 'Every calculator in the Engineering Calculators section also shows step-by-step solutions you can use for practice.')));
  else if (key === 'chal') area.append(h('div', { class: 'card' }, h('h3', {}, 'Simulation challenges'), h('ol', {}, CHALLENGES.map(([e, t]) => h('li', { style: { marginBottom: '8px' } }, t, ' ', h('a', { class: 'btn sm', href: e === 'sim' ? '#/sim' : '#/exp/' + e }, e === 'sim' ? 'Open simulator' : `Open experiment ${e}`))))));
  renderMath(area);
}
function quiz(host, pool, key, n) {
  if (!pool.length) { host.append(h('p', { class: 'muted' }, 'No questions available.')); return; }
  const qs = pool.slice().sort(() => Math.random() - .5).slice(0, n); const t0 = Date.now(); const ans = {};
  const timer = h('span', { class: 'pill info' }, '00:00'); const iv = setInterval(() => { if (!timer.isConnected) return clearInterval(iv); const s = Math.round((Date.now() - t0) / 1000); timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
  const box = h('div', { class: 'card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, `${qs.length} questions`), timer));
  qs.forEach((q, i) => box.append(h('div', { class: 'mcq', 'data-i': i }, h('div', { class: 'q' }, `Q${i + 1}. `, h('span', { html: q.q }), ' ', h('a', { class: 'tag', href: '#/exp/' + q.exp }, q.exp)), q.o.map((o, j) => h('label', {}, h('input', { type: 'radio', name: `q${i}`, onchange: () => ans[i] = j }), h('span', { html: o }))), h('div', { class: 'ex', html: q.e || '' }))));
  const res = h('div', {});
  box.append(h('button', { class: 'btn pri', onclick: () => grade() }, 'Submit and grade'), h('button', { class: 'btn', style: { marginLeft: '8px' }, onclick: () => { host.innerHTML = ''; quiz(host, pool, key, n); renderMath(host); } }, 'Retake (new random set)'), res);
  host.append(box);
  function grade() {
    clearInterval(iv); let s = 0; const topic = {};
    qs.forEach((q, i) => { const el = box.querySelector(`.mcq[data-i="${i}"]`); el.classList.add('answered'); const labs = el.querySelectorAll('label'); labs[q.a].classList.add('right'); const ok = ans[i] === q.a; if (ok) s++; else if (ans[i] !== undefined) labs[ans[i]].classList.add('wrong'); const t = topic[q.exp] = topic[q.exp] || [0, 0]; t[1]++; if (ok) t[0]++; });
    const time = Math.round((Date.now() - t0) / 1000); store.quizScore(key, { s, n: qs.length, t: Date.now(), time });
    res.innerHTML = ''; res.append(h('div', { class: 'kpis' }, [['Total questions', qs.length], ['Correct', s], ['Incorrect', qs.length - s], ['Percentage', `${Math.round(100 * s / qs.length)} %`], ['Time taken', `${Math.floor(time / 60)} min ${time % 60} s`]].map(([l, v]) => h('div', { class: 'kpi acc' }, h('span', {}, l), h('b', {}, v)))),
      h('h3', {}, 'Topic-wise performance'), h('table', { class: 't' }, h('tr', {}, h('th', {}, 'Experiment / topic'), h('th', { class: 'num' }, 'Correct'), h('th', { class: 'num' }, 'Asked'), h('th', {}, '')), Object.entries(topic).map(([e, [a, b]]) => h('tr', {}, h('td', {}, h('a', { href: '#/exp/' + e }, `${e} ${(CATALOG.find(x => x.id === e) || {}).t || ''}`)), h('td', { class: 'num' }, a), h('td', { class: 'num' }, b), h('td', {}, a === b ? '✓' : 'revise')))));
    const hist = store.get().quiz[key] || []; if (hist.length > 1) res.append(h('p', { class: 'muted' }, 'Previous attempts: ' + hist.slice(-6).map(r => `${Math.round(100 * r.s / r.n)} %`).join(', ')));
  }
}
