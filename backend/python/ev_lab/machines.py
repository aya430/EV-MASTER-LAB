"""Induction-machine equivalent circuit and PMSM torque (Unit 3 examples as defaults)."""
import math
import cmath

IM_EX13 = dict(V=400, f=50, poles=4, Rs=0.2, Rr=0.18, Xls=0.5, Xlr=0.6, Xm=18, Prot=800)
PMSM_EX20 = dict(p=4, Rs=0.02, Ld=0.2e-3, Lq=0.5e-3, lam=0.09)


def im_steady(P: dict, s: float) -> dict:
    Vs = P["V"] / math.sqrt(3)
    Zr = complex(P["Rr"] / s, P["Xlr"]); Zm = complex(0, P["Xm"])
    Zp = Zm * Zr / (Zm + Zr); Z = complex(P["Rs"], P["Xls"]) + Zp
    Is = Vs / Z; Ir = Is * Zp / Zr
    ws = 2 * math.pi * P["f"] / (P["poles"] / 2)
    Pag = 3 * abs(Ir) ** 2 * P["Rr"] / s
    return dict(Is=abs(Is), PF=math.cos(cmath.phase(Is)), Ir=abs(Ir), Pag=Pag, Te=Pag / ws)


def pmsm_torque(P: dict, id_: float, iq: float) -> float:
    return 1.5 * P["p"] * (P["lam"] * iq + (P["Ld"] - P["Lq"]) * id_ * iq)
