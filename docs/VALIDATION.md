# Validation record

Automated tests (also runnable in the browser: *Validation Panel*). Result of the run at release:

| # | Group | Test | Result | Expected | Status |
|---|---|---|---|---|---|
| 1 | Engineering | Road-load force, Unit 1 Example 1 (3 %, 60 km/h, 1 m/s²) | 2425.0 | 2425 N (notes) | PASS |
| 2 | Engineering | Battery energy of 96s3p 48 Ah 3.65 V pack | 50.458 | 50.46 kWh (Table 4.3) | PASS |
| 3 | Engineering | SOC by Coulomb counting: 144 Ah pack, 144 A for 30 min from 100 % | 50.000 | 50 % | PASS |
| 4 | Engineering | Motor torque–power relation at base speed (P = Tω) | 110.00 | 110 kW | PASS |
| 5 | Engineering | Gearbox: wheel torque = Tm·G·ηg (200 N·m, G = 9, η = 0.97) | 1746.0 | 1746 N·m | PASS |
| 6 | Engineering | Acceleration of reference BEV 0–100 km/h (numerical integration) | 7.4800 | physically plausible 5–12 s, speed monotonic up to 100 km/h | PASS |
| 7 | Engineering | Regenerative energy ≤ available kinetic energy (stop from 72 km/h) | 63.405 | < 100 % of KE | PASS |
| 8 | Engineering | Charging time: AC 7.4 kW, 20→80 % of 50.46 kWh | 4.9892 | ≈ 4.82 h = E·ΔSOC/(P·η − P_aux), ±10 % | PASS |
| 9 | Engineering | SPWM fundamental = ma·Vdc/2 (ma = 0.8, Vdc = 400 V) | 160.18 | 160 V ± 1 % | PASS |
| 10 | Engineering | SVPWM linear range: V1 = 1.15·Vdc/2 at ma = 1.15 | 229.90 | 230 V ± 1 % | PASS |
| 11 | Engineering | Induction motor Example 13: Is, PF, Pag at s = 3 % | 38.8 A, 0.889, 23.0 kW | 38.8 A, 0.889, 23.01 kW | PASS |
| 12 | Engineering | PMSM torque, Unit 3 Example 20 (id = −100 A, iq = 250 A) | 180.00 | 180 N·m | PASS |
| 13 | Engineering | Clarke → Park → inverse Park → inverse Clarke round trip | 2.2204e-16 | < 1e-9 | PASS |
| 14 | Engineering | Indirect vector control slip, Unit 3 Example 17 | 15.000 | 15.0 rad/s | PASS |
| 15 | Engineering | Drive-cycle data: UDDS distance | 11.990 | 11.99 km (EPA) | PASS |
| 16 | Simulation | 1. EV acceleration from rest | 102 km/h, SOC 89.59 % | speed ↑, SOC ↓, I_b > 0 | PASS |
| 17 | Simulation | 2. Constant-speed driving (cruise 60 km/h) | 60.000 | 60 ± 1 km/h | PASS |
| 18 | Simulation | 3. Deceleration (coasting with one-pedal regen) | 54.042 | < 90 km/h start | PASS |
| 19 | Simulation | 4. Regenerative braking: battery current negative | I_min -143 A, E_reg 81.5 Wh | I_b < 0, E_reg > 0 | PASS |
| 20 | Simulation | 5. Hill climbing 10 % at 50 km/h needs more power than level | 26.8 vs 5.05 kW | P_hill > P_level | PASS |
| 21 | Simulation | 6. Downhill −6 % at constant 50 km/h regenerates | P_b -6.93 kW, v 50.0 | P_b < 0, speed held | PASS |
| 22 | Simulation | 7. Battery low SOC → limp-home power limit | P_b 24.4 kW | ≤ 25 kW | PASS |
| 23 | Simulation | 8. Battery overheating → derate then contactor opens | flags: OPEN, P_b 0 kW | contactor OPEN, P_b ≈ aux only | PASS |
| 24 | Simulation | 9. AC charging 7.4 kW | P_chg 6.90 kW, SOC 32.08 % | ≈ 6.9 kW into pack, SOC ↑ | PASS |
| 25 | Simulation | 10. DC fast charging current limited to 150 A | I_min -148 A | |I| ≤ 150 A | PASS |
| 26 | Simulation | 11. FTP-75 drive cycle with PI driver | RMS 1.00 km/h, 126 Wh/km, balance 1.0e-7 % | RMS < 3 km/h, 90–200 Wh/km, balance < 1e-3 % | PASS |
| 27 | Simulation | 12. Motor overload (2500 kg towing up 30 % at 20 km/h) → thermal derating | T_motor max 141 °C | > 140 °C triggers derating | PASS |
| 28 | Simulation | 13. Battery charging limit at 98 % SOC during braking | P_b min -0.982 kW | charge power ≥ −2 kW (acceptance limit) | PASS |
| 29 | Simulation | 14. Inverter fault → zero motor torque | |T| max 0 N·m | 0 N·m | PASS |
| 30 | Simulation | SOC stays within 0–100 % and speed ≥ 0 when braking in D | v_min 0.081 km/h, SOC 0.998 % | v ≥ 0, 0 ≤ SOC ≤ 100 | PASS |

**30/30 passed.** Python verification: `pytest -q` in backend/python (9 tests) – all passed.

Functional checks performed with a headless Chrome on every route: all 62 experiment pages, simulator, explorer, calculators, performance, notes, assessment, validation, analytics, thermal, search – no console errors; sim start/pause/reset, keyboard driving, report generation, CSV export, quiz grading exercised.
