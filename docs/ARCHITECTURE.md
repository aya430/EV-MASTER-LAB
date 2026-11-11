# Architecture

* **Static single-page application** (hash router in `js/app.js`), ES modules, no build step. Units are loaded on demand (`import('./experiments/unitN.js')`).
* **Experiment template** (`js/lib/lab.js`): every experiment is a declarative object (`params`, `compute`, `sim`, `draw`, `view3d`, `eqs`, `theory`, `mcq`, `viva`…). The template supplies the control bar, controls, animation stage, live KPIs, synchronised charts, mathematical-analysis tab, observation recording, auto-result, notes link and report.
* **Numerics decoupled from rendering:** time-domain experiments advance with a fixed step `dt` inside `requestAnimationFrame`, accumulating real time × sim speed; if the browser cannot keep up the simulation slows down rather than changing `dt`.
* **Central EV engine** (`js/models/ev_engine.js`): one state object; loop = driver/VCU inputs → speeds → BMS limits → torque demand & brake blending → traction control → vehicle dynamics → power chain (motor/inverter loss models evaluated at mid-step speed) → battery current from P = (E − R₀I)I → SOC/RC/thermal update → energy bookkeeping → outputs. Dashboard, graphs, power-flow animation and 3D vehicle all read `ev.o`.
* **Energy balance:** Σ V_oc·I·dt + charger DC energy = battery loss + inverter loss + motor loss + gear loss + aux + aero + rolling + friction brake + ΔKE + ΔPE. The residual is displayed (≈1e-7 % on FTP-75).
* **3D:** procedural Three.js models (`js/three/ev3d.js`), raycast picking, transparent/X-ray/exploded modes, component isolation.
* **Persistence:** `localStorage` (progress, bookmarks, recent, observations, quiz history).
* **Python backend (optional):** `backend/python/ev_lab` mirrors the models for verification; `api/main.py` exposes them via FastAPI.
