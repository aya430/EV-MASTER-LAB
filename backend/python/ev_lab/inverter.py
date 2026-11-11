"""Three-phase VSI with sinusoidal PWM and SVPWM dwell times."""
import math
import numpy as np


def _tri(x):
    f = x - np.floor(x)
    return np.where(f < 0.5, 4 * f - 1, 3 - 4 * f)


def vsi_spwm(Vdc=400.0, m=0.8, f1=50.0, fc=2550.0, spc=120, svpwm=False):
    """Return fundamental phase-voltage peak from one cycle of switched waveforms."""
    t = np.arange(0, 1 / f1, 1 / (fc * spc))
    th = 2 * np.pi * f1 * t
    r = np.stack([m * np.sin(th - k * 2 * np.pi / 3) for k in range(3)])
    if svpwm:
        r = r - (r.max(0) + r.min(0)) / 2
    S = (r >= _tri(fc * t)).astype(float)
    vO = (S - 0.5) * Vdc
    vaN = vO[0] - vO.mean(0)
    n = len(t)
    a = 2 / n * np.sum(vaN * np.cos(th)); b = 2 / n * np.sum(vaN * np.sin(th))
    return float(math.hypot(a, b))


def sv_dwell(Vref, theta, Vdc, Ts):
    theta %= 2 * math.pi
    k = int(theta // (math.pi / 3)); al = theta - k * math.pi / 3
    c = math.sqrt(3) * Ts * Vref / Vdc
    T1, T2 = c * math.sin(math.pi / 3 - al), c * math.sin(al)
    return dict(sector=k + 1, T1=T1, T2=T2, T0=Ts - T1 - T2)
