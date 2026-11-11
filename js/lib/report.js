// Experiment report generator: produces a self-contained printable HTML document (Print → Save as PDF).
import { fmt } from './chart.js';
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function mathml(src) { try { return window.katex.renderToString(src, { displayMode: true, output: 'mathml', throwOnError: false }); } catch (e) { return esc(src); } }
function inlineMath(html) { return String(html || '').replace(/\$\$([\s\S]+?)\$\$/g, (m, a) => mathml(a)).replace(/\$([^$\n]+?)\$/g, (m, a) => { try { return window.katex.renderToString(a, { output: 'mathml', throwOnError: false }); } catch (e) { return a; } }); }

export function buildReport({ exp, p, R, sample, recorded, charts, links, app, result, simT }) {
  const date = new Date().toLocaleString();
  const params = (exp.params || []).filter(c => c.id).map(c => `<tr><td>${esc(c.l)}</td><td class="n">${typeof p[c.id] === 'number' ? fmt(p[c.id]) : esc(c.opts ? (c.opts.find(o => o[0] === p[c.id]) || [0, p[c.id]])[1] : p[c.id])}</td><td>${esc(c.u || '')}</td></tr>`).join('');
  const ks = [...(R.kpis || []), ...((sample && sample.kpis) || [])].map(k => `<tr><td>${esc(k[0])}</td><td class="n">${typeof k[1] === 'number' ? fmt(k[1]) : esc(k[1])}</td><td>${esc(k[2] || '')}</td></tr>`).join('');
  const imgs = Object.values(charts).map(c => `<figure><img src="${c.png()}"><figcaption>${esc(c.spec.title || '')}</figcaption></figure>`).join('');
  let anim = '';
  try { const cv = document.querySelector('canvas.anim'); if (cv && cv.offsetParent) anim = `<figure><img src="${cv.toDataURL('image/png')}" style="background:#0f1729"><figcaption>Circuit / architecture diagram (simulation snapshot at t = ${(simT || 0).toFixed(3)} s)</figcaption></figure>`; } catch (e) { /* ignore */ }
  const obs = R.obs ? `<table><tr>${R.obs.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${R.obs.rows.map(r => `<tr>${r.map(c => `<td class="n">${typeof c === 'number' ? fmt(c) : c}</td>`).join('')}</tr>`).join('')}</table>` : '';
  const rec = recorded.length ? `<h3>Recorded observations</h3><table><tr><th>No.</th><th>t (s)</th>${recorded[0].p.map(x => `<th>${esc(x[0])}</th>`).join('')}${recorded[0].k.map(x => `<th>${esc(x[0])}</th>`).join('')}</tr>${recorded.map((r, i) => `<tr><td>${i + 1}</td><td class="n">${r.t.toFixed(3)}</td>${r.p.map(x => `<td class="n">${typeof x[1] === 'number' ? fmt(x[1]) : esc(x[1])}</td>`).join('')}${r.k.map(x => `<td class="n">${typeof x[1] === 'number' ? fmt(x[1]) : esc(x[1])}</td>`).join('')}</tr>`).join('')}</table>` : '';
  const steps = (R.steps || []).map(s => `<li>${inlineMath(s[0])}${s[1] ? mathml(s[1]) : ''}</li>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Experiment ${esc(exp.id)} report – ${esc(exp.title)}</title>
<style>body{font-family:Inter,Segoe UI,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 24px;color:#0f1b33;line-height:1.5;font-size:13.5px}
h1{font-size:22px;margin:4px 0}h2{font-size:16px;border-bottom:2px solid #0891b2;padding-bottom:3px;margin-top:22px}h3{font-size:14px}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px}td,th{border:1px solid #c7d3e5;padding:4px 7px;text-align:left}th{background:#eef3fa}td.n{text-align:right}
figure{margin:10px 0;page-break-inside:avoid}figure img{width:100%;border:1px solid #c7d3e5;border-radius:6px}figcaption{font-size:12px;color:#4b5d7d;text-align:center}
.hd{display:flex;justify-content:space-between;border-bottom:3px solid #0b1f4d;padding-bottom:8px}.muted{color:#4b5d7d}.foot{margin-top:30px;border-top:1px solid #c7d3e5;padding-top:8px;font-size:12px;color:#4b5d7d}
.pb{position:fixed;right:16px;top:16px;background:#2563eb;color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600}@media print{.pb{display:none}}
math{font-size:1.1em}</style></head><body><button class="pb" onclick="print()">Print / Save as PDF</button>
<div class="hd"><div><b>EV MASTER LAB</b> — Electric Vehicle System Engineering Virtual Laboratory<br><span class="muted">School of Electrical and Electronics Engineering, REVA University, Bengaluru · Course B24EES502</span></div><div class="muted" style="text-align:right">Generated ${esc(date)}</div></div>
<p class="muted">Student name: ____________________ &nbsp; SRN: ______________ &nbsp; Section: ______</p>
<h1>Experiment ${esc(exp.id)}: ${esc(exp.title)}</h1>
<p><b>Unit ${exp.unit}:</b> ${esc(app.units[exp.unit - 1].title)} &nbsp;·&nbsp; <b>${esc(exp.co || '')}</b></p>
<h2>1. Aim</h2><p>${esc(exp.aim || 'To study ' + exp.title.toLowerCase() + ' through simulation.')}</p>
<h2>2. Theory</h2>${inlineMath(exp.theory || '')}
<h2>3. Governing equations</h2>${(exp.eqs || []).map(([e, d]) => mathml(e) + (d ? `<div class="muted" style="font-size:12px">${inlineMath(d)}</div>` : '')).join('')}
${exp.assume ? `<p><b>Assumptions:</b> ${inlineMath(exp.assume)}</p>` : ''}
<h2>4. Circuit / architecture diagram and parameters</h2>${anim}<table><tr><th>Parameter</th><th>Value</th><th>Unit</th></tr>${params}</table>
<h2>5. Calculations</h2>${steps ? `<ol>${steps}</ol>` : '<p class="muted">Time-domain simulation; see readings and graphs.</p>'}
<h2>6. Observations</h2><table><tr><th>Quantity</th><th>Value</th><th>Unit</th></tr>${ks}</table>${obs}${rec}
<h2>7. Graphs</h2>${imgs || '<p class="muted">No graphs for this experiment.</p>'}
<h2>8. Result</h2><p>${inlineMath(result || '')}</p>
<h2>9. Conclusion</h2><p>${inlineMath(exp.conclusion || 'The simulated behaviour agrees with the governing equations; the effect of each parameter on the response was observed and recorded.')}</p>
<h2>10. Viva questions</h2><ol>${(exp.viva || []).map(v => `<li>${inlineMath(typeof v === 'string' ? v : v[0])}</li>`).join('')}</ol>
<h2>References</h2><ul>${links.map(l => `<li>Unit ${l.u} notes, §${esc(l.n)} ${esc(l.t)} (PDF page ${l.p})</li>`).join('')}<li>Course B24EES502 prescribed textbooks (Chan & Chau; Husain; Ehsani et al.)</li></ul>
<div class="foot">EV MASTER LAB · Developed by <b>Dr Bansilal Bairwa</b>, Assistant Professor, School of Electrical and Electronics Engineering, REVA University, Bengaluru · LinkedIn: https://www.linkedin.com/in/dr-bansilal-bairwa-4816b2106/</div>
</body></html>`;
}
