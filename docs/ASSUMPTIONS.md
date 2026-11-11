# Models, assumptions and limitations

| Model | Assumptions |
|---|---|
| Vehicle | Longitudinal dynamics; rotating-mass factor δ = 1.05; rolling resistance constant; still air unless stated; steering kinematic (visual only) |
| Motor envelope | Constant torque to base speed, constant power above, zero above n_max; thermal derating above 140 °C |
| Motor losses | P = k_cu T² + k_fe ω^1.5 + k_w ω² + P₀ (k_cu = 0.12, k_fe = 0.038, k_w = 3e-4, P₀ = 100 W) – calibrated, illustrative |
| Inverter losses | P = 150 W + 0.015|P| + 1e-7 P² (Si); SiC option 0.007|P| |
| Battery (twin) | 96s3p, OCV = 96(3.30 + 0.70 z) as in Unit 4 notes, R₀ = 48 mΩ × Arrhenius factor, 1-RC (20 mΩ, 30 s), η_C = 0.99 on charge, I_max 450 A, charge acceptance 150 A / 50 kW tapering above 90 % SOC |
| Battery (cell labs) | Tabulated OCV per chemistry (illustrative shapes), 1-RC/2-RC parameters typical of a 48–50 Ah NMC cell |
| Ageing | Semi-empirical √N cycle + √t calendar law with temperature, DoD and C-rate factors – illustrative |
| Regeneration | Series blending; generator torque ≤ motor envelope × regen level; fade 15 → 5 km/h; charge-power limit; parallel blending option in Exp 4.5 |
| Driver | PI with anti-windup, 0.6 s preview and acceleration feed-forward (K_p = 0.2, K_i = 0.05) |
| Inverter waveforms | Ideal switches, no dead time; star RL(+EMF) load integrated exactly per sample |
| Drives | IM: stationary-frame Γ model with exact flux rotation; PMSM: dq model; average inverter with SVPWM voltage limit V_dc/√3 |
| Thermal lab | Lumped nodes, conduction to neighbours, serpentine coolant channel, radiator approach ΔT = 3 K |
| AI analytics | Synthetic data from the ageing / ECM models with seeded noise; trained in browser; LSTM described only |

Indicative data (Ragone ranges, chemistry tables, connector ratings) are consistent with the Unit 2 notes and labelled as indicative in the interface.
