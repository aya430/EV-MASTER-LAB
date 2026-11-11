// Generic experiment runtime: every experiment in every unit is mounted through this template.
// It provides the experiment control bar, parameter controls, animation stage, live KPIs, synchronised
// charts, mathematical analysis, observation recording, auto-result, questions, notes link and report export.
import { h, renderMath, toast, download, table, fmt, ICON, modal, tex } from './ui.js';
import { Chart, Trace, PALETTE } from './chart.js';
import { fitCanvas, themeColors } from './draw.js';
import { store } from './store.js';
import { notesLinks } from './notes.js';
import { buildReport } from './report.js';

export function paramDefaults(exp) {
  const p = {};
  for (const c of exp.params || []) if (c.id) p[c.id] = c.v;
  return p;
}

export function mountExperiment(root, exp, app) {
  const p = paramDefaults(exp);
  const L = { exp, p, R: null, S: null, t: 0, running: false, simT: 0, zoom: 1, speed: 1, dtMul: 1, recorded: store.getObs(exp.id).slice(), view: exp.view3d && exp.default3d ? '3d' : '2d' };
  let raf = 0, last = 0, acc = 0, disposed = false, view3d = null;
  const charts = {}; const traces = {};

  // ---------- header ----------
  const unitName = app.units[exp.unit - 1].title;
  const bm = h('button', { class: 'btn sm' + (store.isBookmarked(exp.id) ? ' on' : ''), title: 'Bookmark', html: ICON.star + ' Bookmark', onclick: () => { const on = store.toggleBookmark(exp.id); bm.classList.toggle('on', on); } });
  const doneBtn = h('button', { class: 'btn sm' + (store.isDone(exp.id) ? ' on' : ''), onclick: () => { const v = !store.isDone(exp.id); store.setDone(exp.id, v); doneBtn.classList.toggle('on', v); doneBtn.textContent = v ? '✓ Completed' : 'Mark completed'; } }, store.isDone(exp.id) ? '✓ Completed' : 'Mark completed');
  const links = notesLinks(exp.notes || []);
  root.append(
    h('div', { class: 'crumbs' }, h('a', { href: '#/units' }, 'All Units'), ' / ', h('a', { href: '#/unit/' + exp.unit }, `Unit ${exp.unit}: ${unitName}`), ' / ', `Experiment ${exp.id}`),
    h('div', { class: 'exphead' },
      h('span', { class: 'eid' }, exp.id),
      h('div', { style: { flex: 1, minWidth: '260px' } }, h('h1', {}, exp.title),
        h('div', { class: 'row', style: { marginTop: '6px' } },
          h('span', { class: 'tag' }, exp.co || ['CO-1', 'CO-2', 'CO-3', 'CO-4'][exp.unit - 1]),
          h('span', { class: 'tag' }, exp.kind === 'sim' ? 'Time-domain simulation' : 'Interactive analysis'),
          exp.view3d ? h('span', { class: 'tag' }, '3D model') : null,
          links.length ? h('span', { class: 'tag src', title: 'Content mapped to your Unit notes' }, 'Mapped to Unit notes') : h('span', { class: 'tag sup' }, 'Supplementary'),
        )),
      h('div', { class: 'row' }, links.length ? h('a', { class: 'btn sm', href: links[0].href, html: ICON.book + ' Reference Notes' }) : null, bm, doneBtn)),
  );

  // ---------- tabs ----------
  const tabNames = [['lab', 'Experiment'], ['theory', 'Theory'], ['math', 'Mathematical Analysis'], ['obs', 'Observations & Result'], ['qa', 'Questions & Viva'], ['ref', 'Reference Notes']];
  const panes = {}; const tabBtns = {};
  const tabs = h('div', { class: 'tabs' }, tabNames.map(([k, l]) => (tabBtns[k] = h('button', { class: k === 'lab' ? 'on' : '', onclick: () => showTab(k) }, l))));
  root.append(tabs);
  for (const [k] of tabNames) { panes[k] = h('div', { style: { display: k === 'lab' ? 'block' : 'none' } }); root.append(panes[k]); }
  function showTab(k) {
    for (const [n] of tabNames) { panes[n].style.display = n === k ? 'block' : 'none'; tabBtns[n].classList.toggle('on', n === k); }
    if (k === 'math') renderMathPane(); if (k === 'obs') renderObsPane();
    if (k === 'lab') Object.values(charts).forEach(c => c.request());
  }

  // ---------- control bar ----------
  const clock = h('span', { class: 'clock' }, 't = 0.000 s');
  const runBtn = h('button', { class: 'btn go sm', html: ICON.play + ' Start', onclick: () => toggleRun() });
  const sel = (label, opts, val, on) => h('label', {}, label, h('select', { onchange: e => on(parseFloat(e.target.value)) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l))));
  const tb = h('div', { class: 'toolbar' },
    runBtn,
    h('button', { class: 'btn sm', html: ICON.stop + ' Stop', title: 'Stop and hold the present state', onclick: () => stop() }),
    h('button', { class: 'btn sm', html: ICON.reset + ' Reset', onclick: () => reset() }),
    h('span', { class: 'sep' }),
    sel('Sim speed', [[0.1, '0.1×'], [0.25, '0.25×'], [0.5, '0.5×'], [1, '1×'], [2, '2×'], [5, '5×'], [10, '10×'], [25, '25×']], 1, v => { L.speed = v; }),
    exp.kind === 'sim' ? sel('Time step', [[0.5, '½ Δt'], [1, `Δt = ${fmtDt(exp.sim.dt)}`], [2, '2 Δt']], 1, v => { L.dtMul = v; reset(); }) : null,
    h('span', { class: 'sep' }),
    h('button', { class: 'btn sm', title: 'Zoom in', html: ICON.zin, onclick: () => zoom(1.15) }),
    h('button', { class: 'btn sm', title: 'Zoom out', html: ICON.zout, onclick: () => zoom(1 / 1.15) }),
    h('button', { class: 'btn sm', title: 'Full screen', html: ICON.full, onclick: () => fullscreen() }),
    exp.view3d ? h('button', { class: 'btn sm', id: 'b3d', onclick: () => setView(L.view === '3d' ? '2d' : '3d') }, '2D / 3D') : null,
    exp.view3d ? h('button', { class: 'btn sm', title: 'Camera reset', html: ICON.cam, onclick: () => view3d && view3d.resetCam && view3d.resetCam() }) : null,
    h('span', { class: 'sep' }),
    ...(exp.tools || []).map(tl => h('button', { class: 'btn sm ' + (tl.cls || ''), onclick: () => { tl.f(api); } }, tl.l)),
    (exp.tools || []).length ? h('span', { class: 'sep' }) : null,
    h('button', { class: 'btn sm', html: ICON.rec + ' Record', title: 'Record present readings into the observation table', onclick: () => record() }),
    h('button', { class: 'btn sm', html: ICON.dl + ' Export CSV', onclick: () => exportCSV() }),
    h('button', { class: 'btn sm pri', html: ICON.pdf + ' Report', onclick: () => report() }),
    h('button', { class: 'btn sm', html: ICON.help, title: 'Help', onclick: () => help() }),
    clock);
  panes.lab.append(tb);

  // ---------- controls ----------
  const ctrls = h('div', { class: 'card ctrls' });
  const inputs = {};
  for (const c of exp.params || []) {
    if (c.h) { ctrls.append(h('h4', {}, c.h)); continue; }
    const lbl = h('b', {});
    const show = () => { lbl.textContent = c.type === 'select' ? '' : c.type === 'check' ? '' : c.type === 'seg' ? '' : (c.fmt ? c.fmt(p[c.id]) : fmt(p[c.id], c.d)) + (c.u ? ' ' + c.u : ''); };
    let input;
    if (c.type === 'select') {
      input = h('select', { onchange: e => setP(c.id, isNaN(+e.target.value) || c.str ? e.target.value : +e.target.value) }, c.opts.map(o => h('option', { value: o[0], selected: o[0] === c.v }, o[1])));
    } else if (c.type === 'check') {
      input = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.v, onchange: e => setP(c.id, e.target.checked) }), c.l);
    } else if (c.type === 'seg') {
      input = h('div', { class: 'seg' }, c.opts.map(o => h('button', { class: o[0] === c.v ? 'on' : '', onclick: e => { [...input.children].forEach(b => b.classList.remove('on')); e.target.classList.add('on'); setP(c.id, o[0]); } }, o[1])));
    } else if (c.type === 'num') {
      input = h('input', { type: 'number', value: c.v, step: c.step || 'any', min: c.min, max: c.max, onchange: e => setP(c.id, +e.target.value) });
    } else {
      input = h('input', { type: 'range', min: c.min, max: c.max, step: c.step || (c.max - c.min) / 100, value: c.v, oninput: e => setP(c.id, +e.target.value) });
    }
    inputs[c.id] = { input, show, c };
    ctrls.append(h('div', { class: 'ctrl', title: c.tip || '' }, c.type === 'check' ? null : h('div', { class: 'lbl' }, h('span', {}, c.l), lbl), input));
    show();
  }
  if (!(exp.params || []).length) ctrls.append(h('p', { class: 'muted' }, 'This experiment is driven from the stage and toolbar.'));
  ctrls.append(h('div', { class: 'hr' }), h('button', { class: 'btn sm', onclick: () => { for (const c of exp.params || []) if (c.id) setP(c.id, c.v, true); recompute(); reset(); } }, 'Restore default parameters'));

  const stage = h('div', { class: 'stage' });
  const canvas = h('canvas', { class: 'anim', style: exp.stageH ? { height: exp.stageH + 'px' } : null });
  const v3host = h('div', { class: 'v3d', style: { display: 'none', height: (exp.stageH || 440) + 'px' } });
  const hint = h('div', { class: 'hint' }, exp.hint || '');
  stage.append(canvas, v3host, hint);
  L.hits = [];
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect(); let x = e.clientX - r.left, y = e.clientY - r.top;
    if (L.zoom !== 1) { x = (x - r.width / 2) / L.zoom + r.width / 2; y = (y - r.height / 2) / L.zoom + r.height / 2; }
    const hit = L.hits.find(b => x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3]);
    if (exp.click) exp.click(hit ? hit[4] : null, api, x, y);
  });
  canvas.style.cursor = exp.click ? 'pointer' : 'default';
  const kpis = h('div', { class: 'kpis' });
  const chartsEl = h('div', { class: 'charts' });
  const extra = h('div', {});
  const right = h('div', {}, stage, kpis, extra, chartsEl);
  panes.lab.append(h('div', { class: 'lab' }, ctrls, right));

  // ---------- theory ----------
  panes.theory.append(h('div', { class: 'grid g2', style: { alignItems: 'start' } },
    h('div', { class: 'card theory' },
      h('h3', {}, 'Aim'), h('p', {}, exp.aim || `To study ${exp.title.toLowerCase()} through interactive simulation.`),
      h('h3', {}, 'Learning objectives'), h('ul', {}, (exp.objectives || []).map(o => h('li', {}, o))),
      exp.background ? [h('h3', {}, 'Required background'), h('p', { class: 'muted' }, exp.background)] : null),
    h('div', { class: 'card theory' }, h('h3', {}, 'Course outcome'), h('p', {}, app.co[exp.co || ['CO-1', 'CO-2', 'CO-3', 'CO-4'][exp.unit - 1]] || ''),
      h('h3', {}, 'Procedure'), h('ol', {}, (exp.procedure || defaultProcedure(exp)).map(s => h('li', {}, s))))),
  h('div', { class: 'card theory', style: { marginTop: '14px' }, html: exp.theory || '' }),
  exp.eqs ? h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Governing equations'), exp.eqs.map(([e, d]) => h('div', { class: 'eq' }, tex(e, true), d ? h('div', { class: 'd', html: d }) : null))) : null,
  exp.assume ? h('div', { class: 'note warn' }, h('b', {}, 'Model assumptions: '), exp.assume) : null);
  renderMath(panes.theory);

  // ---------- questions ----------
  buildQA(panes.qa, exp);
  // ---------- reference notes ----------
  panes.ref.append(h('div', { class: 'card' }, h('h3', {}, 'Reference Notes (Unit-wise PDF)'),
    links.length ? h('div', {}, h('p', { class: 'muted' }, 'Sections of your unit notes that this experiment is built on. Page numbers are the actual PDF pages, read from the notes\' table of contents.'),
      h('ul', {}, links.map(l => h('li', {}, h('a', { href: l.href }, `§${l.n} ${l.t}`), h('span', { class: 'dim' }, ` — Unit ${l.u} PDF, page ${l.p} `), h('a', { href: l.pdf, target: '_blank', class: 'dim' }, '(open PDF ↗)')))))
      : h('p', { class: 'note warn' }, 'This topic is not covered as a separate section in the supplied notes. The material here is supplementary, based on standard engineering references listed in the syllabus.'),
    exp.supp ? h('p', { class: 'note warn' }, h('b', {}, 'Supplementary material: '), exp.supp) : null,
    links.length ? h('iframe', { src: links[0].pdf, style: { width: '100%', height: '70vh', border: '1px solid var(--line)', borderRadius: '10px', marginTop: '10px', background: '#fff' }, loading: 'lazy', title: 'Unit notes' }) : null));

  // ---------- API exposed to experiment hooks ----------
  const api = {
    get p() { return p; }, get R() { return L.R; }, get S() { return L.S; }, L,
    set: (id, v) => setP(id, v), run: () => { if (!L.running) toggleRun(); }, pause: () => { if (L.running) toggleRun(); }, reset: () => reset(), recompute: () => recompute(),
    extra, toast, onLeave: f => app.onLeave(f),
  };

  function setP(id, v, silent) {
    p[id] = v;
    const I = inputs[id];
    if (I) {
      if (I.c.type === 'range' || !I.c.type || I.c.type === 'num') I.input.value = v;
      else if (I.c.type === 'select') I.input.value = v;
      else if (I.c.type === 'check') I.input.querySelector('input').checked = !!v;
      else if (I.c.type === 'seg') [...I.input.children].forEach((b, i) => b.classList.toggle('on', I.c.opts[i][0] === v));
      I.show();
    }
    if (silent) return;
    if (exp.kind === 'sim' && (!exp.sim.live || !exp.sim.live.includes(id))) { reset(); }
    recompute();
  }
  function fmtDt(dt) { return dt >= 1e-3 ? (dt * 1e3).toFixed(dt < 1e-2 ? 1 : 0) + ' ms' : (dt * 1e6).toFixed(0) + ' µs'; }

  // ---------- compute / render ----------
  function recompute() {
    try {
      if (exp.compute) L.R = exp.compute(p, L.S, api) || {};
      else L.R = L.R || {};
    } catch (e) { console.error(e); L.R = { error: e.message }; }
    renderOut();
    if (view3d && view3d.update) view3d.update(p, L.R, L.S, 0);
  }
  function renderKPIs(list) {
    kpis.innerHTML = '';
    for (const k of list || []) kpis.append(h('div', { class: 'kpi ' + (k[3] || '') }, h('span', { title: k[0] }, k[0]), h('b', { class: typeof k[1] === 'string' && k[1].length > 14 ? 'sm' : '' }, typeof k[1] === 'number' ? fmt(k[1], k[4]) : k[1]), h('i', {}, k[2] || '')));
  }
  function ensureChart(spec) {
    let c = charts[spec.id];
    if (!c) {
      const host = h('div', { class: 'chart' + (spec.tall ? ' tall' : '') });
      const title = h('h5', {}, h('span', {}, spec.title || ''), h('span', { class: 'acts' },
        h('button', { title: 'Download PNG', onclick: () => download(`${exp.id}_${spec.id}.png`, dataURLtoBlob(c.png())) }, 'PNG'),
        h('button', { title: 'Download CSV', onclick: () => download(`${exp.id}_${spec.id}.csv`, c.csv(), 'text/csv') }, 'CSV')));
      host.append(title);
      if (spec.wide) host.style.gridColumn = '1/-1';
      chartsEl.append(host);
      c = charts[spec.id] = new Chart(host, spec);
      c.titleEl = title.firstChild;
    }
    return c;
  }
  function renderOut() {
    const R = L.R || {};
    if (R.error) { kpis.innerHTML = ''; kpis.append(h('div', { class: 'note bad' }, 'Calculation error: ' + R.error)); return; }
    const simK = L.lastSample ? L.lastSample.kpis : null;
    renderKPIs([...(R.kpis || []), ...(simK || [])]);
    for (const spec of R.charts || []) { const c = ensureChart(spec); c.set(spec); if (spec.title) c.titleEl.textContent = spec.title; }
    if (R.html !== undefined) { extra.innerHTML = ''; if (R.html) { extra.append(typeof R.html === 'string' ? h('div', { html: R.html }) : R.html); renderMath(extra); } }
  }
  // sim charts (live)
  function initSimCharts() {
    for (const spec of exp.sim.charts || []) {
      const c = ensureChart(spec);
      traces[spec.id] = spec.s.map(() => new Trace(spec.max || 6000));
      c.set({ series: spec.s.map((n, i) => ({ name: n, x: traces[spec.id][i].x, y: traces[spec.id][i].y, color: (spec.colors || [])[i] || PALETTE[i % PALETTE.length], type: (spec.types || [])[i], dash: (spec.dashes || [])[i] })) });
    }
  }
  function simSample() {
    const smp = exp.sim.sample(L.S, p, api);
    L.lastSample = smp;
    if (smp.push) for (const [id, arr] of Object.entries(smp.push)) {
      const tr = traces[id]; if (!tr) continue;
      for (let i = 0; i < tr.length; i++) tr[i].push(arr[0], arr[i + 1]);
    }
    return smp;
  }
  function refreshSimView() {
    if (L.lastSample) renderKPIs([...(L.R?.kpis || []), ...(L.lastSample.kpis || [])]);
    for (const id in traces) charts[id].request();
  }
  function reset() {
    acc = 0; L.t = 0; L.simT = 0;
    if (exp.kind === 'sim') {
      L.S = exp.sim.init(p, api);
      for (const id in traces) traces[id].forEach(t => t.clear());
      if (!Object.keys(traces).length) initSimCharts();
      L.lastSample = null; simSample(); L.nextSample = 0;
    }
    if (exp.onReset) exp.onReset(api);
    recompute(); refreshSimView();
    clock.textContent = 't = 0.000 s';
  }
  function stop() { if (L.running) toggleRun(); runBtn.innerHTML = ICON.play + ' Resume'; }
  function toggleRun() {
    L.running = !L.running;
    runBtn.innerHTML = L.running ? ICON.pause + ' Pause' : ICON.play + (L.t > 0 ? ' Resume' : ' Start');
    runBtn.classList.toggle('go', !L.running); runBtn.classList.toggle('warn', L.running);
    if (L.running) last = performance.now();
  }
  function zoom(f) { L.zoom = Math.max(.5, Math.min(3, L.zoom * f)); if (view3d && view3d.zoom) view3d.zoom(f); }
  function fullscreen() {
    stage.classList.toggle('fs');
    if (stage.classList.contains('fs')) { const x = h('button', { class: 'btn sm', style: { position: 'absolute', right: '12px', top: '12px', zIndex: 5 }, onclick: () => { stage.classList.remove('fs'); x.remove(); } }, 'Exit full screen ✕'); stage.append(x); }
  }
  async function setView(v) {
    L.view = v; canvas.style.display = v === '3d' ? 'none' : 'block'; v3host.style.display = v === '3d' ? 'block' : 'none';
    if (v === '3d' && !view3d) {
      v3host.append(h('div', { class: 'loading' }, 'Loading 3D model…'));
      try { view3d = await exp.view3d(v3host, p, api); v3host.querySelector('.loading')?.remove(); view3d.update && view3d.update(p, L.R, L.S, 0); }
      catch (e) { console.error(e); v3host.innerHTML = '<div class="note bad">3D view unavailable on this device (WebGL not supported). The 2D animation remains fully functional.</div>'; }
    }
  }
  function record() {
    const R = L.R || {}; const ks = [...(R.kpis || []), ...((L.lastSample && L.lastSample.kpis) || [])];
    const keyP = (exp.params || []).filter(c => c.id && c.rec !== false && (c.type === undefined || c.type === 'range' || c.type === 'num')).slice(0, 4);
    const row = { t: L.simT, p: keyP.map(c => [c.l + (c.u ? ` (${c.u})` : ''), p[c.id]]), k: ks.slice(0, 8).map(k => [k[0] + (k[2] ? ` (${k[2]})` : ''), k[1]]) };
    L.recorded.push(row); store.saveObs(exp.id, L.recorded.slice(-50));
    toast(`Observation ${L.recorded.length} recorded`);
  }
  function exportCSV() {
    const lines = [`# EV MASTER LAB - Experiment ${exp.id}: ${exp.title}`, `# Developed by Dr Bansilal Bairwa, Assistant Professor, REVA University, Bengaluru`, '# Parameters'];
    for (const c of exp.params || []) if (c.id) lines.push(`${c.l},${p[c.id]},${c.u || ''}`);
    lines.push('# Readings'); const ks = [...(L.R?.kpis || []), ...((L.lastSample && L.lastSample.kpis) || [])];
    for (const k of ks) lines.push(`${k[0]},${k[1]},${k[2] || ''}`);
    if (L.recorded.length) { lines.push('# Recorded observations'); const r0 = L.recorded[0]; lines.push(['No.', 't (s)', ...r0.p.map(x => x[0]), ...r0.k.map(x => x[0])].join(',')); L.recorded.forEach((r, i) => lines.push([i + 1, r.t.toFixed(3), ...r.p.map(x => x[1]), ...r.k.map(x => x[1])].join(','))); }
    for (const id in charts) { lines.push(`# Chart: ${charts[id].spec.title || id}`); lines.push(charts[id].csv()); }
    download(`EVLab_${exp.id}_data.csv`, lines.join('\n'), 'text/csv');
  }
  function report() {
    const html = buildReport({ exp, p, R: L.R || {}, sample: L.lastSample, recorded: L.recorded, charts, links, app, simT: L.simT, result: exp.result ? safe(() => exp.result(p, L.R || {}, L.S, api)) : autoResult() });
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); } else download(`EVLab_${exp.id}_report.html`, html, 'text/html');
    store.setDone(exp.id, true); doneBtn.classList.add('on'); doneBtn.textContent = '✓ Completed';
  }
  function safe(f) { try { return f(); } catch (e) { return ''; } }
  function autoResult() {
    const ks = [...(L.R?.kpis || []), ...((L.lastSample && L.lastSample.kpis) || [])].slice(0, 6);
    return `The experiment on ${exp.title.toLowerCase()} was performed in the virtual laboratory. Key results: ` + ks.map(k => `${k[0]} = ${typeof k[1] === 'number' ? fmt(k[1]) : k[1]} ${k[2] || ''}`).join('; ') + '.';
  }
  function help() {
    modal('How to perform this experiment', h('div', {},
      h('ol', {}, (exp.procedure || defaultProcedure(exp)).map(s => h('li', {}, s))),
      h('p', { class: 'muted' }, 'Control bar: Start/Pause runs the time-domain simulation or animation; Stop holds the state; Reset re-initialises from the present parameters. Sim speed scales simulated time relative to real time; the numerical time step stays fixed, independent of the display frame rate. Record stores the present readings in the observation table. Report opens a printable experiment report (use Print → Save as PDF).'),
      exp.hint ? h('p', {}, exp.hint) : null));
  }
  function renderMathPane() {
    const m = panes.math; m.innerHTML = '';
    m.append(h('div', { class: 'card' }, h('h3', {}, 'Governing equations'), (exp.eqs || []).map(([e, d]) => h('div', { class: 'eq' }, tex(e, true), d ? h('div', { class: 'd', html: d }) : null))));
    const st = (L.R && L.R.steps) || [];
    m.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Step-by-step calculation with the present parameters'),
      st.length ? h('ol', { class: 'steps' }, st.map(s => h('li', {}, h('span', { html: s[0] }), s[1] ? h('div', { class: 'eq' }, tex(s[1], true)) : null))) : h('p', { class: 'muted' }, 'Intermediate values are shown live in the experiment panel for this time-domain experiment; record observations at instants of interest.')));
    renderMath(m);
  }
  function renderObsPane() {
    const o = panes.obs; o.innerHTML = '';
    const R = L.R || {};
    if (R.obs) o.append(h('div', { class: 'card' }, h('h3', {}, 'Observation table (generated from the simulation)'), table(R.obs.cols, R.obs.rows)));
    const recCard = h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, `Recorded observations (${L.recorded.length})`), h('button', { class: 'btn sm bad', onclick: () => { L.recorded = []; store.saveObs(exp.id, []); renderObsPane(); } }, 'Clear')));
    if (L.recorded.length) { const r0 = L.recorded[0]; recCard.append(table(['No.', 't (s)', ...r0.p.map(x => x[0]), ...r0.k.map(x => x[0])], L.recorded.map((r, i) => [i + 1, +r.t.toFixed(3), ...r.p.map(x => x[1]), ...r.k.map(x => x[1])]))); }
    else recCard.append(h('p', { class: 'muted' }, 'Use the “Record” button in the experiment control bar to log readings for different parameter settings.'));
    o.append(recCard);
    const res = exp.result ? safe(() => exp.result(p, R, L.S, api)) : autoResult();
    o.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Result (auto-generated)'), h('p', { html: res }), exp.conclusion ? [h('h3', {}, 'Conclusion'), h('p', { html: exp.conclusion })] : null));
    renderMath(o);
  }

  // ---------- main loop: fixed-step numerics decoupled from rendering ----------
  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dtR = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (L.running) {
      L.t += dtR * L.speed;
      if (exp.kind === 'sim') {
        const dt = exp.sim.dt * L.dtMul;
        acc += dtR * L.speed * (exp.sim.timeScale || 1);
        let n = 0; const maxN = exp.sim.maxSteps || 40000;
        const every = exp.sim.sampleEvery || dt;
        while (acc >= dt && n < maxN) {
          exp.sim.step(L.S, p, dt, api); acc -= dt; n++; L.simT += dt;
          if (L.simT >= L.nextSample - 1e-12) { simSample(); L.nextSample = L.simT + every; }
          if (exp.sim.done && exp.sim.done(L.S, p)) { stop(); runBtn.innerHTML = ICON.play + ' Finished'; acc = 0; simSample(); break; }
        }
        if (n >= maxN) acc = 0; // cannot keep up: slow down rather than lose numerical consistency
        refreshSimView();
        if (exp.sim.recompute) recompute();
        clock.textContent = `t = ${L.simT.toFixed(L.simT < 1 ? 4 : 2)} s`;
      } else clock.textContent = `t = ${L.t.toFixed(2)} s`;
    }
    if (L.view === '2d' && exp.draw) {
      const { g, W, H } = fitCanvas(canvas);
      g.save(); if (L.zoom !== 1) { g.translate(W / 2, H / 2); g.scale(L.zoom, L.zoom); g.translate(-W / 2, -H / 2); }
      L.hits = [];
      try { exp.draw(g, W, H, { t: L.t, p, R: L.R || {}, S: L.S, T: themeColors(), running: L.running, simT: L.simT, api, hit: (x, y, w, hh, id) => L.hits.push([x, y, w, hh, id]) }); } catch (e) { console.error(e); }
      g.restore();
    } else if (L.view === '3d' && view3d && view3d.frame) view3d.frame(dtR, L.running, p, L.R, L.S);
  }

  if (!exp.draw && !exp.view3d) stage.style.display = 'none';
  if (!exp.draw && exp.view3d) L.view = '3d';
  if (exp.kind === 'sim') initSimCharts();
  if (exp.extraUI) exp.extraUI(api);
  reset();
  if (L.view === '3d') setView('3d');
  if (exp.autorun) toggleRun();
  raf = requestAnimationFrame(frame);
  store.visit(exp.id);
  app.onLeave(() => { disposed = true; cancelAnimationFrame(raf); Object.values(charts).forEach(c => c.destroy()); if (view3d && view3d.dispose) view3d.dispose(); });
  return api;
}

function defaultProcedure(exp) {
  return [
    'Read the theory and governing equations (Theory tab) and open the reference notes section.',
    'Set the parameters in the left panel (defaults reproduce the worked examples in the notes where applicable).',
    exp.kind === 'sim' ? 'Press Start to run the time-domain simulation; use Pause, Stop and Reset as needed.' : 'Press Start to animate; results update immediately when any parameter is changed.',
    'Observe the animation, live readings and graphs. Hover on graphs to read values.',
    'Press Record for each parameter setting you wish to tabulate; vary one parameter at a time.',
    'Inspect the Mathematical Analysis tab for the step-by-step calculation.',
    'Answer the viva and MCQ questions, then generate the experiment report.',
  ];
}
function dataURLtoBlob(d) { const [a, b] = d.split(','); const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: a.split(':')[1].split(';')[0] }); }

export function buildQA(host, exp) {
  const mcq = exp.mcq || [];
  const card = h('div', { class: 'card' }, h('h3', {}, `Multiple-choice questions (${mcq.length})`));
  let score = 0, answered = 0;
  const sc = h('span', { class: 'pill info' }, `Score 0 / ${mcq.length}`);
  card.firstChild.append(' ', sc);
  mcq.forEach((m, qi) => {
    const box = h('div', { class: 'mcq' }, h('div', { class: 'q' }, `Q${qi + 1}. `, h('span', { html: m.q })));
    m.o.forEach((o, i) => {
      const lab = h('label', {}, h('input', { type: 'radio', name: `${exp.id}_q${qi}`, onchange: () => {
        if (box.classList.contains('answered')) return;
        box.classList.add('answered'); answered++;
        if (i === m.a) { lab.classList.add('right'); score++; } else { lab.classList.add('wrong'); box.querySelectorAll('label')[m.a].classList.add('right'); }
        sc.textContent = `Score ${score} / ${mcq.length}`;
        if (answered === mcq.length) store.quizScore('exp:' + exp.id, { s: score, n: mcq.length, t: Date.now() });
      } }), h('span', { html: o }));
      box.append(lab);
    });
    box.append(h('div', { class: 'ex', html: m.e || '' }));
    card.append(box);
  });
  host.append(card);
  if (exp.viva?.length) host.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Viva-voce questions'), h('ol', {}, exp.viva.map(v => h('li', { html: typeof v === 'string' ? v : v[0] }, typeof v === 'string' ? null : h('details', {}, h('summary', { class: 'muted' }, 'Model answer'), h('p', { html: v[1] })))))));
  if (exp.numericals?.length) host.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Numerical / application problems'), h('ol', {}, exp.numericals.map(v => h('li', {}, h('span', { html: v[0] }), h('details', {}, h('summary', { class: 'muted' }, 'Answer'), h('p', { html: v[1] })))))));
  renderMath(host);
}
