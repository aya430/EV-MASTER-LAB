# EV MASTER LAB
### Electric Vehicle System Engineering – Interactive Virtual Laboratory (Course B24EES502)

[![Deploy to GitHub Pages](https://github.com/aya430/EV-MASTER-LAB/actions/workflows/deploy.yml/badge.svg)](https://github.com/aya430/EV-MASTER-LAB/actions/workflows/deploy.yml)

**Live website:** **https://aya430.github.io/EV-MASTER-LAB/**

**Developed by Dr Bansilal Bairwa**, Assistant Professor, School of Electrical and Electronics Engineering, REVA University, Bengaluru
LinkedIn: https://www.linkedin.com/in/dr-bansilal-bairwa-4816b2106/

---

## 1. Project overview

EV MASTER LAB is a browser-based virtual laboratory for the 5th-semester undergraduate course **B24EES502 – Electric Vehicle System Engineering**. It covers all four syllabus units with **62 interactive experiments**, a **live EV digital twin**, a **3D EV explorer**, **24 engineering calculators**, unit-wise **PDF notes** with page-exact links, assessment and automated validation. Every simulation, calculation, animation and graph runs **online in the visitor's browser** – no installation, login or server-side code is needed.

## 2. Features

| Area | Content |
|---|---|
| Unit 1 – Introduction to EVs | 13 experiments: 3D EV explorer, configurations (BEV/HEV/PHEV/FCEV, series/parallel/power-split), performance, energy flow (6 modes), traction batteries, drive cycles, BEV component selection, three-phase inverter, VSI switching states, PWM lab, SVPWM, hysteresis control, PWM comparison |
| Unit 2 – Energy storage | 17 experiments: Ragone plot, cell formats & pack builder, battery operation, Li-ion chemistries, efficiency, capacity calculation, SOC estimation (CC, OCV, KF, EKF, observer), SOH/ageing, waveforms, parameter comparison, BEV pack sizing, Rint/1-RC/2-RC/3-RC ECM, cell balancing, BMS with fault injection, charger architectures, CC/CV/CC-CV control, charging standards (control-pilot simulator) |
| Unit 3 – Power electronics & drives | 17 experiments: DC-DC/AC-DC converters (switching-level), charger topologies (PFC, DAB, LLC), drivetrain, linear/rotating systems, load types, four-quadrant operation, IM construction (3D), IM steady state (Example 13), direct vector control & DTC, indirect vector control (detuning), IM FOC, leakage model, PMSM (3D), salient vs non-salient, generic dq model, PMSM steady-state envelope, PMSM FOC with SVPWM |
| Unit 4 – Modelling & simulation | 15 experiments: complete BEV model, forward and backward models, driver model, brake control unit, regenerative-braking digital twin, VCU with CAN messages & faults, chassis, steady-state energy balance, battery/cell modelling, peak vs continuous dimensioning, drive-cycle analysis, control strategies, performance, range prediction |
| Live EV digital twin | One central 10 ms simulation: pedals/keyboard, steering, gears, ECO/NORMAL/SPORT, cruise, regeneration, grade, mass, temperature, drive cycles with PI driver, AC/DC charging, 9 injectable faults, 3D vehicle, gauges, power-flow animation, 16 synchronised graphs, live energy-balance check |
| Other | 3D EV explorer, 24 engineering calculators, compare-two-EVs and design-your-own-EV (with report), battery thermal lab, AI battery analytics (trained in-browser on labelled synthetic data), unit-wise PDF notes library with page-exact links and full-text search, assessment (unit/topic quizzes, viva & numerical banks, challenges, progress tracking), validation panel (30 automated tests), printable experiment reports, CSV/PNG export |

Every experiment page has: aim, objectives, theory, governing equations, procedure, experiment-specific control bar (Start/Pause/Stop/Reset, sim speed, time step, zoom, full screen, 2D/3D, record, export, report, help), animation, live readings, graphs, step-by-step mathematical analysis, observation table, auto-generated result, MCQs, viva and a **Reference Notes** link to the exact page of the unit PDF.

Every experiment page has: aim, objectives, theory, governing equations, procedure, experiment-specific control bar (Start/Pause/Stop/Reset, sim speed, time step, zoom, full screen, 2D/3D, record, export, report, help), animation, live readings, graphs, step-by-step mathematical analysis, observation table, auto-generated result, MCQs, viva and a **Reference Notes** link to the exact page of the unit PDF.

## 3. Technology stack

| Layer | Technology |
|---|---|
| Front end | HTML5, CSS3, vanilla JavaScript ES modules (no framework, no bundler) with hash-based SPA routing (`#/exp/1.1`, `#/sim`, `#/notes/2/5` …) |
| 3D graphics | three.js r187 (vendored) + OrbitControls; all 3D models (vehicle, battery packs, IM/PMSM) are generated procedurally in `js/three/` – there are no external GLB/GLTF files to load |
| Mathematics | KaTeX (vendored) |
| Charts / animation | Custom canvas chart and drawing library (`js/lib/chart.js`, `js/lib/draw.js`) |
| Fonts | Inter (vendored, woff2) |
| Data | JSON (drive cycles, notes index, notes full text) and PDF notes |
| Build / CI | Node.js build script (`scripts/build_site.mjs`), GitHub Actions, GitHub Pages |
| Optional backend | Python 3, NumPy, FastAPI, Uvicorn, pytest (`backend/python`) – **not required by the website** |

## 4. Folder structure

```
EV-MASTER-LAB/
  index.html                 entry point (relative asset paths – works under /EV-MASTER-LAB/ on GitHub Pages)
  404.html                   GitHub Pages SPA fallback (deep links → hash routes)
  .nojekyll                  serve files as-is on GitHub Pages
  package.json               npm scripts: build / serve / preview
  css/style.css              design system (dark default, light mode, responsive breakpoints)
  js/app.js                  shell, routing, header/sidebar/footer (credits on every page), search
  js/catalog.js              syllabus → experiment map with notes section references
  js/lib/                    lab template (lab.js), charts, drawing, UI, notes index, report generator, storage, config
  js/models/                 vehicle, drive cycles, battery, inverter, machines, EV digital-twin engine, ML
  js/experiments/unit1-4.js  all 62 experiments; arch.js, twinviz.js, common.js helpers
  js/pages/                  home, simulator, explorer, calculators, performance, notes, assessment, validation, analytics, thermal, about
  js/three/                  procedural 3D models (car, battery packs, IM/PMSM) and component database
  data/                      drive cycles, notes index (section → PDF page), notes full text, photo
  notes/                     unit-wise PDF notes (Units 1–4) and syllabus
  vendor/                    three.js r187, KaTeX, Inter font
  backend/python/            NumPy reference models, FastAPI service, pytest verification, Dockerfile
  scripts/                   build script, local launchers, notes extraction, drive-cycle provenance
  docs/                      architecture, experiment map, validation, assumptions
  render.yaml                optional Render.com blueprint for the Python API
  .github/workflows/deploy.yml  CI/CD: build → test → deploy to GitHub Pages
```

## 5. Installation and local execution

Requirements: a recent Chrome, Edge or Firefox (WebGL for 3D). Python 3 **or** Node.js 18+ for a local web server. Browsers block ES modules on `file://`, so always serve the folder.

```bash
git clone https://github.com/aya430/EV-MASTER-LAB.git
cd EV-MASTER-LAB
python3 -m http.server 8080        # or: npm run serve
# open http://localhost:8080/index.html
```

* **Windows:** double-click `scripts/start_lab_windows.bat` (needs Python 3). It opens http://localhost:8080.
* **Linux/macOS:** `./scripts/start_lab.sh`

Works offline: Three.js, KaTeX and the Inter font are vendored in `vendor/`.

## 6. Production build

```bash
npm run build      # writes dist/ and verifies every module import, fetch() target, CSS url(), JSON file and PDF
npm run preview    # serves dist/ at http://localhost:8080
```

The build copies only the web application (`index.html`, `404.html`, `css/`, `js/`, `data/`, `notes/`, `vendor/`, `docs/`) into `dist/`, adds `.nojekyll`, and writes `dist/config.json` (optional backend URL). It fails if any import or asset reference is broken.

## 7. Deployment (GitHub Pages)

Deployment is automatic. `.github/workflows/deploy.yml` runs on every push to `main` (and on manual *Run workflow*):

1. **build** – checks out the code, sets up Node 20, installs dependencies, runs `npm run build`, uploads `dist/` as the Pages artifact;
2. **backend-tests** – runs the 9 Python verification tests against the worked examples in the notes;
3. **deploy** – publishes the artifact with `actions/deploy-pages` (permissions `pages: write`, `id-token: write`).

One-time repository setting: **Settings → Pages → Build and deployment → Source: GitHub Actions** (already configured for this repository).

All paths in the site are relative (`css/style.css`, `js/app.js`, `data/…`, `notes/…`, `vendor/…`), so the same build works at `https://aya430.github.io/EV-MASTER-LAB/`, at a custom domain root, or on a college intranet server. Routing uses URL hashes, which GitHub Pages serves without server rewrites; `404.html` additionally converts accidental deep links such as `/EV-MASTER-LAB/exp/2.4` into `#/exp/2.4`.

**Live website:** https://aya430.github.io/EV-MASTER-LAB/

Progress, bookmarks and quiz scores are stored per browser (localStorage); no login or database is required.

## 8. Optional Python backend (not needed for the website)

GitHub Pages is static hosting and cannot run Python or Java processes. The laboratory therefore performs **all** experiments, the live simulator, calculators and analytics in JavaScript in the browser; the website makes **no** API calls. No Java module exists in this project.

`backend/python` reproduces the core models in NumPy with a FastAPI service (`/api/health`, `/api/roadload`, `/api/cycle/{name}`, `/api/im/{slip}`, `/api/pmsm`, `/api/spwm`) for scripted studies and verification:

```bash
cd backend/python
pip install -r requirements.txt
pytest -q                                  # 9 verification tests
uvicorn api.main:app --port 8000           # http://localhost:8000/docs
```

To host it separately (e.g. for students' Python/Jupyter work):

* **Render.com:** *New → Blueprint* → select this repository (uses `render.yaml`), or a Web Service with root `backend/python`, build `pip install -r requirements.txt`, start `uvicorn api.main:app --host 0.0.0.0 --port $PORT`.
* **Docker (any cloud / college server):** from the repository root
  `docker build -f backend/python/Dockerfile -t ev-master-lab-api . && docker run -p 8000:8000 -e ALLOWED_ORIGINS=https://aya430.github.io ev-master-lab-api`
* **CORS:** set `ALLOWED_ORIGINS` (comma-separated) to `https://aya430.github.io`; default `*`.
* **Connect the website (optional):** GitHub → *Settings → Secrets and variables → Actions → Variables* → add `EV_API_URL` = your API URL, then re-run the workflow. The value is written to `config.json` and exposed through `js/lib/config.js` (`apiUrl('/api/…')`). See `.env.example`.

## 9. Notes integration

`scripts/extract_notes.py` parsed each unit PDF's table of contents and printed page footers; 657 sections were mapped to physical PDF pages (offset verified on every page). Experiments link to these pages; nothing is fabricated. The original PDFs in the parent folder are not modified — the site uses copies in `notes/`. If you revise the notes, copy the new PDFs into `notes/` and re-run the script.

## 10. Data sources and assumptions

See `docs/ASSUMPTIONS.md`. Drive cycles are official traces (EPA, UN GTR 15, UNECE). Reference vehicles are Table 1.5 (Unit 1) and Table 4.3 (Unit 4) of the notes. Battery OCV curves, ageing model, Ragone/chemistry ranges and loss models are illustrative/indicative and labelled as such in the interface.

---
© Dr Bansilal Bairwa, School of Electrical and Electronics Engineering, REVA University, Bengaluru. The original project README is kept at `docs/README_ORIGINAL.md`.
