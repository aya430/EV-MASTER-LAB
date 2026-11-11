// Production build for GitHub Pages / any static host. Developed by Dr Bansilal Bairwa, REVA University.
// The laboratory is plain HTML + ES modules (no bundler needed). This script:
//  1. copies the web application into dist/ (backend, scripts and repo tooling are excluded),
//  2. verifies that every static/dynamic ES-module import, fetch() data file and asset reference resolves,
//  3. validates every JSON data file,
//  4. writes dist/config.json (optional backend URL from the EV_API_URL environment variable),
//  5. adds .nojekyll and a 404.html SPA fallback for GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const INCLUDE = ['index.html', '404.html', 'css', 'js', 'data', 'notes', 'vendor', 'docs', 'README.md'];
const errors = [];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const p of INCLUDE) {
  const src = path.join(ROOT, p);
  if (!fs.existsSync(src)) { errors.push(`missing required path: ${p}`); continue; }
  fs.cpSync(src, path.join(DIST, p), { recursive: true });
}
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
const apiBaseUrl = (process.env.EV_API_URL || '').trim().replace(/\/+$/, '');
fs.writeFileSync(path.join(DIST, 'config.json'), JSON.stringify({ apiBaseUrl, builtAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local' }, null, 2));

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(DIST);
const exists = p => fs.existsSync(p);

// ES module imports (static and dynamic). Template imports like unit${n}.js are expanded for units 1-4.
for (const f of files.filter(f => f.endsWith('.js') && f.includes(`${path.sep}js${path.sep}`))) {
  const src = fs.readFileSync(f, 'utf8');
  const specs = [...src.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g), ...src.matchAll(/import\(\s*['"`]([^'"`]+)['"`]\s*\)/g)].map(m => m[1]);
  for (let s of specs) {
    if (s === 'three' || s.startsWith('three/addons/')) continue; // resolved by the import map in index.html
    if (!s.startsWith('.')) { errors.push(`${path.relative(DIST, f)}: bare import "${s}"`); continue; }
    const variants = s.includes('${') ? [1, 2, 3, 4].map(n => s.replace(/\$\{[^}]+\}/, n)) : [s];
    for (const v of variants) if (!exists(path.resolve(path.dirname(f), v))) errors.push(`${path.relative(DIST, f)}: unresolved import "${v}"`);
  }
  for (const m of src.matchAll(/fetch\(\s*['"]([^'"]+)['"]/g)) if (!/^https?:/.test(m[1]) && !exists(path.join(DIST, m[1]))) errors.push(`${path.relative(DIST, f)}: fetch target missing "${m[1]}"`);
  for (const m of src.matchAll(/['"`]((?:notes|data|vendor)\/[\w./-]+\.(?:pdf|json|jpg|png|svg|woff2|glb|gltf))['"`]/g)) if (!exists(path.join(DIST, m[1]))) errors.push(`${path.relative(DIST, f)}: asset missing "${m[1]}"`);
  if (/(?:src|href)=["']\/(?!\/)/.test(src)) errors.push(`${path.relative(DIST, f)}: root-absolute URL (breaks under /<repo>/ on GitHub Pages)`);
}
// HTML/CSS references
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) if (!exists(path.join(DIST, m[1]))) errors.push(`index.html: missing "${m[1]}"`);
for (const m of html.matchAll(/"\.\/(vendor\/[^"]+\.js)"/g)) if (!exists(path.join(DIST, m[1]))) errors.push(`index.html importmap: missing "${m[1]}"`);
for (const f of files.filter(f => f.endsWith('.css'))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    if (/^(data:|https?:|#)/.test(m[1])) continue;
    if (m[1].startsWith('/')) errors.push(`${path.relative(DIST, f)}: root-absolute url(${m[1]})`);
    else if (/\.(woff|ttf)$/.test(m[1]) && exists(path.resolve(path.dirname(f), m[1].replace(/\.(woff|ttf)$/, '.woff2')))) continue; // legacy fallback format; woff2 is used by all supported browsers
    else if (!exists(path.resolve(path.dirname(f), m[1]))) errors.push(`${path.relative(DIST, f)}: missing url(${m[1]})`);
  }
}
for (const f of files.filter(f => f.endsWith('.json'))) { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { errors.push(`${path.relative(DIST, f)}: invalid JSON (${e.message})`); } }
for (const u of [1, 2, 3, 4]) if (!exists(path.join(DIST, `notes/Unit_${u}___EVSE_UG.pdf`))) errors.push(`notes PDF for unit ${u} missing`);

const size = files.reduce((s, f) => s + fs.statSync(f).size, 0);
if (errors.length) { console.error('BUILD FAILED\n - ' + errors.join('\n - ')); process.exit(1); }
console.log(`EV MASTER LAB build OK: ${files.length + 2} files, ${(size / 1048576).toFixed(1)} MB -> dist/  (apiBaseUrl: ${apiBaseUrl || 'none – fully client-side'})`);
