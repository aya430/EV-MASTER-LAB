import { h, ICON } from '../lib/ui.js';
import { CATALOG } from '../catalog.js';

export function render(c, app) {
  const A = app.author;
  c.append(h('div', { class: 'crumbs' }, 'About Laboratory'), h('h1', {}, 'About EV MASTER LAB'),
    h('div', { class: 'card', style: { display: 'flex', gap: '22px', alignItems: 'center', flexWrap: 'wrap' } },
      h('img', { src: 'data/dr-bansilal-bairwa.jpg', alt: A.name, style: { width: '150px', height: '150px', borderRadius: '50%', objectFit: 'cover', objectPosition: '50% 18%', border: '3px solid var(--cyan)' } }),
      h('div', { style: { flex: 1, minWidth: '280px' } }, h('div', { class: 'muted', style: { fontWeight: 700, letterSpacing: '.08em', fontSize: '.78rem' } }, 'CONCEIVED AND DEVELOPED BY'), h('h2', { style: { margin: '4px 0' } }, A.name), h('p', { style: { margin: '2px 0' } }, `${A.role}, ${A.dept}`), h('p', { class: 'muted', style: { margin: '2px 0' } }, A.org), h('p', { class: 'muted' }, 'Research interests: EV battery modelling and BMS, AI/ML battery health estimation, robotics, MATLAB/Simulink.'),
        h('a', { class: 'btn', href: A.li, target: '_blank', rel: 'noopener', html: ICON.li + ' Connect on LinkedIn', style: { background: '#0a66c2', borderColor: '#0a66c2', color: '#fff' } }))),
    h('div', { class: 'grid g2', style: { marginTop: '14px' } },
      h('div', { class: 'card' }, h('h3', {}, 'Course'), h('p', {}, 'B24EES502 – Electric Vehicle System Engineering (Professional Elective, V semester, 3 credits), School of Electrical and Electronics Engineering, REVA University, Bengaluru. The laboratory covers all four units of the syllabus with ', h('b', {}, `${CATALOG.length} interactive experiments`), ', a digital-twin EV simulator, 24 engineering calculators, a 3D explorer, a battery thermal laboratory, AI battery analytics, an assessment module and a validation panel.'),
        h('h3', {}, 'Course outcomes'), h('ul', {}, Object.values(app.co).map(x => h('li', {}, x)))),
      h('div', { class: 'card' }, h('h3', {}, 'How the laboratory works'), h('ul', {},
        h('li', {}, 'Runs entirely in the browser – no installation or internet connection needed once served locally. All simulations are computed live from documented mathematical models; no values are faked or randomly generated (where noise is part of an experiment it comes from a seeded generator and is reproducible).'),
        h('li', {}, 'One central EV simulation engine (fixed 10 ms step, decoupled from the display frame rate) feeds the dashboard, graphs, 3D vehicle and energy-flow animations.'),
        h('li', {}, 'Every experiment links to the exact page of the unit-wise notes (pages parsed from each PDF’s table of contents). Topics not covered as separate sections are marked “Supplementary”.'),
        h('li', {}, 'Progress, bookmarks, recorded observations and quiz scores are stored in this browser only (localStorage).')),
        h('h3', {}, 'Technology'), h('p', { class: 'muted' }, 'HTML5, CSS3, modular JavaScript (ES modules), Three.js/WebGL for procedural 3D models, KaTeX for equations, a custom canvas charting engine. An optional Python (NumPy/FastAPI) package in the project folder reproduces the core models for verification and batch studies.'))),
    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Data sources and modelling assumptions'), h('ul', {},
      h('li', {}, 'Drive cycles: UDDS, HWFET and US06 – US EPA schedules (via NREL FASTSim data); FTP-75 built from UDDS (soak omitted); WLTC Class 3b and NEDC – UN GTR 15 / UNECE R83 (via the EC JRC “wltp” package); MIDC Part One = 4 × ECE-15 urban cycle.'),
      h('li', {}, 'Reference vehicles: Unit 1 Table 1.5 (Unit 1 experiments) and Unit 4 Table 4.3 (digital twin and Unit 4).'),
      h('li', {}, 'Battery: 1-RC/2-RC equivalent circuits with tabulated OCV curves (illustrative, chemistry-typical); linear OCV for the twin pack as in the Unit 4 notes; Arrhenius-type resistance-temperature factor; semi-empirical ageing model (illustrative).'),
      h('li', {}, 'Motor and inverter loss models are parametric (copper ∝ T², iron ∝ ω^1.5, windage ∝ ω²; inverter fixed + linear + quadratic) and calibrated to typical traction efficiencies (motor ≈ 91–96 %, inverter ≈ 97 %).'),
      h('li', {}, 'Inverter switching waveforms are simulated at sample level; drive control experiments use average-value inverter models with SVPWM voltage limits.'),
      h('li', {}, 'Ragone, chemistry and standards tables give indicative ranges consistent with the notes, not product data.')),
      h('p', { class: 'muted', style: { fontSize: '.84rem' } }, 'Limitations: longitudinal dynamics only (steering is kinematic, for visualisation); tyre slip is represented by a traction-control force limit; thermal models are lumped; AI analytics are trained in the browser on synthetic data generated from the ageing model and are clearly labelled as such.')));
}
