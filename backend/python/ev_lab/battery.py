"""Equivalent-circuit battery model (Rint / 1-RC / 2-RC). Current positive on discharge."""
import math
import numpy as np

_Z = np.array([0, .05, .1, .2, .3, .4, .5, .6, .7, .8, .9, .95, 1])
_NMC = np.array([3.0, 3.3, 3.45, 3.55, 3.62, 3.68, 3.74, 3.82, 3.91, 3.99, 4.08, 4.13, 4.2])


def ocv(z: float) -> float:
    return float(np.interp(min(max(z, 0), 1), _Z, _NMC))


class ECM:
    def __init__(self, Q=50.0, R0=1.5e-3, R1=1e-3, C1=2e4, R2=0.8e-3, C2=3e5, order=2, z=1.0, eta=0.995):
        self.Q, self.R0, self.R1, self.C1, self.R2, self.C2, self.order, self.z, self.eta = Q, R0, R1, C1, R2, C2, order, z, eta
        self.v1 = self.v2 = 0.0

    def step(self, i: float, dt: float) -> float:
        v = ocv(self.z) - i * self.R0 - (self.v1 if self.order >= 1 else 0) - (self.v2 if self.order >= 2 else 0)
        self.z = min(1.0, max(0.0, self.z - (self.eta if i < 0 else 1) * i * dt / (3600 * self.Q)))
        if self.order >= 1:
            a = math.exp(-dt / (self.R1 * self.C1)); self.v1 = a * self.v1 + self.R1 * (1 - a) * i
        if self.order >= 2:
            b = math.exp(-dt / (self.R2 * self.C2)); self.v2 = b * self.v2 + self.R2 * (1 - b) * i
        return v
