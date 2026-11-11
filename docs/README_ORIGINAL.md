# EV MASTER LAB
### Electric Vehicle System Engineering – Interactive Virtual Laboratory (Course B24EES502)

**Developed by Dr Bansilal Bairwa**, Assistant Professor, School of Electrical and Electronics Engineering, REVA University, Bengaluru
LinkedIn: https://www.linkedin.com/in/dr-bansilal-bairwa-4816b2106/

---

## 1. What is included

| Area | Content |
|---|---|
| Unit 1 – Introduction to EVs | 13 experiments: 3D EV explorer, configurations (BEV/HEV/PHEV/FCEV, series/parallel/power-split), performance, energy flow (6 modes), traction batteries, drive cycles, BEV component selection, three-phase inverter, VSI switching states, PWM lab, SVPWM, hysteresis control, PWM comparison |
| Unit 2 – Energy storage | 17 experiments: Ragone plot, cell formats & pack builder, battery operation, Li-ion chemistries, efficiency, capacity calculation, SOC estimation (CC, OCV, KF, EKF, observer), SOH/ageing, waveforms, parameter comparison, BEV pack sizing, Rint/1-RC/2-RC/3-RC ECM, cell balancing, BMS with fault injection, charger architectures, CC/CV/CC-CV control, charging standards (control-pilot simulator) |
| Unit 3 – Power electronics & drives | 17 experiments: DC-DC/AC-DC converters (switching-level), charger topologies (PFC, DAB, LLC), drivetrain, linear/rotating systems, load types, four-quadrant operation, IM construction (3D), IM steady state (Example 13), direct vector control & DTC, indirect vector control (detuning), IM FOC, leakage model, PMSM (3D), salient vs non-salient, generic dq model, PMSM steady-state envelope, PMSM FOC with SVPWM |
| Unit 4 – Modelling & simulation | 15 experiments: complete BEV model, forward and backward models, driver model, brake control unit, regenerative-braking digital twin, VCU with CAN messages & faults, chassis, steady-state energy balance, battery/cell modelling, peak vs continuous dimensioning, drive-cycle analysis, control strategies, performance, range prediction |
| Live EV digital twin | One central 10 ms simulation: pedals/keyboard, steering, gears, ECO/NORMAL/SPORT, cruise, regeneration, grade, mass, temperature, drive cycles with PI driver, AC/DC charging, 9 injectable faults, 3D vehicle, gauges, power-flow animation, 16 synchronised graphs, live energy-balance check |
| Other | 3D EV explorer, 24 engineering calculators, compare-two-EVs and design-your-own-EV (with report), battery thermal lab, AI battery analytics (trained in-browser on labelled synthetic data), unit-wise PDF notes library with page-exact links and full-text search, assessment (unit/topic quizzes, viva & numerical banks, challenges, progress tracking), validation panel (30 automated tests), printable experiment reports, CSV/PNG export |

Every experiment page has: aim, objectives, theory, governing equations, procedure, experiment-specific control bar (Start/Pause/Stop/Reset, sim speed, time step, zoom, full screen, 2D/3D, record, export, report, help), animation, live readings, graphs, step-by-step mathematical analysis, observation table, auto-generated result, MCQs, viva and a **Reference Notes** link to the exact page of the unit PDF.

## 2. How to run (no installation needed)

The laboratory is a static web application (HTML/CSS/JavaScript ES modules). Browsers block ES modules on `file://`, so serve the folder locally:

* **Windows:** double-click `scripts/start_lab_windows.bat` (needs Python 3 from python.org). It opens http://localhost:8080.
* **Linux/macOS:** `./scripts/start_lab.sh`
* **Any OS:** in this folder run `python -m http.server 8080` and open http://localhost:8080/index.html
* Any static web server (IIS, Apache, Nginx, GitHub Pages, college intranet) can host the folder as-is — copy the whole `EV-MASTER-LAB` folder.

Works offline: Three.js, KaTeX and the Inter font are vendored in `vendor/`. Use a recent Chrome, Edge or Firefox (WebGL needed for 3D; everything else works without it).

## 3. Optional Python reference backend

`backend/python` reproduces the core models in NumPy, with a FastAPI service and tests that check results against worked examples in the notes:

```
cd backend/python
pip install -r requirements.txt
pytest -q                                  # 9 verification tests
uvicorn api.main:app --port 8000           # optional REST API (/api/cycle/WLTC3b, /api/im/0.03, ...)
```
The web laboratory does not depend on it. A Java module was not added: it would not provide an architectural benefit for a browser-based laboratory (as allowed by the brief).

## 4. Folder structure

```
EV-MASTER-LAB/
  index.html                 entry point
  css/style.css              design system (dark default, light mode)
  js/app.js                  shell, routing, header/sidebar/footer (credits on every page), search
  js/catalog.js              syllabus → experiment map with notes section references
  js/lib/                    lab template (lab.js), charts, drawing, UI, notes index, report generator, storage
  js/models/                 vehicle, drive cycles, battery, inverter, machines, EV digital-twin engine, ML
  js/experiments/unit1-4.js  all 62 experiments; arch.js, twinviz.js, common.js helpers
  js/pages/                  home, simulator, explorer, calculators, performance, notes, assessment, validation, analytics, thermal, about
  js/three/                  procedural 3D models (car, battery packs, IM/PMSM) and component database
  data/                      drive cycles, notes index (section → PDF page), notes full text, photo
  notes/                     copies of the unit-wise PDFs and syllabus used by the viewer (originals untouched)
  vendor/                    three.js r187, KaTeX, Inter font
  backend/python/            NumPy reference models, FastAPI service, pytest verification
  scripts/                   launchers, notes extraction, drive-cycle provenance
  docs/                      architecture, experiment map, validation, assumptions
```

## 5. Notes integration

`scripts/extract_notes.py` parsed each unit PDF's table of contents and printed page footers; 657 sections were mapped to physical PDF pages (offset verified on every page). Experiments link to these pages; nothing is fabricated. The original PDFs in the parent folder are not modified — the site uses copies in `notes/`. If you revise the notes, copy the new PDFs into `notes/` and re-run the script.

## 6. Data sources and assumptions

See `docs/ASSUMPTIONS.md`. Drive cycles are official traces (EPA, UN GTR 15, UNECE). Reference vehicles are Table 1.5 (Unit 1) and Table 4.3 (Unit 4) of the notes. Battery OCV curves, ageing model, Ragone/chemistry ranges and loss models are illustrative/indicative and labelled as such in the interface.

## 7. Deployment

Copy the folder to any static host. For a college server: place it under the web root and open `/EV-MASTER-LAB/index.html`. Progress, bookmarks and quiz scores are stored per browser (localStorage); no login or database is required.
