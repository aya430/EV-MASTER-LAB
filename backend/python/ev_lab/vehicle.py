"""Vehicle longitudinal dynamics and backward-looking drive-cycle model."""
from __future__ import annotations
import math
import numpy as np

G0 = 9.81
# Unit 1 notes, Table 1.5
REF1 = dict(m=1600, Crr=0.010, Cd=0.30, A=2.3, rho=1.225, r=0.32, delta=1.05, G=9.5, eta_tr=0.95)
# Unit 4 notes, Table 4.3
REF4 = dict(m=1500, delta=1.05, Crr=0.012, Cd=0.30, A=2.2, rho=1.2, r=0.31, G=9, eta_g=0.97, eta_m=0.93,
            eta_inv=0.97, Paux=600, Tpk=280, Ppk=110e3, nmax=12000)


def road_load(v: float, a: float, grade_pct: float, P: dict) -> dict:
    """Road-load forces in N for speed v [m/s], acceleration a [m/s^2], grade in %."""
    th = math.atan(grade_pct / 100)
    Fr = P["Crr"] * P["m"] * G0 * math.cos(th)
    Fa = 0.5 * P.get("rho", 1.225) * P["Cd"] * P["A"] * v * abs(v)
    Fg = P["m"] * G0 * math.sin(th)
    Fi = P.get("delta", 1.0) * P["m"] * a
    return dict(Fr=Fr, Fa=Fa, Fg=Fg, Fi=Fi, Ft=Fr + Fa + Fg + Fi)


def motor_tmax(w: float, P: dict) -> float:
    if w > P["nmax"] * math.pi / 30:
        return 0.0
    return min(P["Tpk"], P["Ppk"] / max(w, 1e-6))


def accel_run(P: dict, t_end: float = 40.0, dt: float = 0.01) -> dict:
    eta = P.get("eta_tr", P.get("eta_g", 0.95))
    v = t = 0.0
    t100 = math.nan
    while t <= t_end:
        Ft = motor_tmax(v / P["r"] * P["G"], P) * P["G"] * eta / P["r"]
        rl = road_load(v, 0, 0, P)
        a = (Ft - rl["Fr"] - rl["Fa"]) / (P.get("delta", 1) * P["m"])
        v = max(0.0, v + a * dt)
        t += dt
        if math.isnan(t100) and v * 3.6 >= 100:
            t100 = t
    return dict(t100=t100, vmax=v * 3.6)


def backward(cycle_kmh: np.ndarray, P: dict, kr: float = 1.0, Pregen: float = 50e3, Paux: float | None = None) -> dict:
    """Backward-looking model: cycle -> wheel -> motor -> battery (1 Hz trace)."""
    v = np.asarray(cycle_kmh, float) / 3.6
    a = np.append(np.diff(v), 0.0)
    eta_tr, eta_m, eta_inv = P.get("eta_tr", P.get("eta_g", 0.95)), P.get("eta_m", 0.92), P.get("eta_inv", 0.97)
    Paux = P.get("Paux", 0) if Paux is None else Paux
    Ft = P["Crr"] * P["m"] * G0 * (v > 1e-3) + 0.5 * P.get("rho", 1.225) * P["Cd"] * P["A"] * v * v + P.get("delta", 1) * P["m"] * a
    Ft = np.where(v > 1e-3, Ft, P.get("delta", 1) * P["m"] * a + P["Crr"] * P["m"] * G0)
    Pw = Ft * v
    vk = v * 3.6
    fade = np.clip((vk - 5) / 10, 0, 1)
    rec = np.minimum(-Pw * eta_tr * eta_m * eta_inv * kr * fade, Pregen)
    Pb = np.where(Pw >= 0, Pw / (eta_tr * eta_m * eta_inv), -rec) + Paux
    dist = v.sum() / 1000
    E = Pb.sum() / 3.6e6
    return dict(dist_km=dist, E_kWh=E, Wh_per_km=E * 1000 / dist, Pb_kW=Pb / 1000)
