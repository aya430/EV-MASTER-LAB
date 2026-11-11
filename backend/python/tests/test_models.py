"""Verification against worked examples in the B24EES502 unit notes (run: pytest -q from backend/python)."""
import math
import numpy as np
from ev_lab import REF1, REF4, road_load, backward, accel_run, ECM, im_steady, IM_EX13, pmsm_torque, PMSM_EX20, vsi_spwm, sv_dwell, load_cycles, cycle_stats


def test_unit1_example1_tractive_force():
    assert abs(road_load(60 / 3.6, 1.0, 3, REF1)["Ft"] - 2425) < 3


def test_pack_energy_table_4_3():
    assert abs(96 * 3 * 3.65 * 48 / 1000 - 50.46) < 0.01


def test_im_example13():
    r = im_steady(IM_EX13, 0.03)
    assert abs(r["Is"] - 38.8) < 0.1 and abs(r["PF"] - 0.889) < 0.002 and abs(r["Pag"] - 23010) < 30


def test_pmsm_example20():
    assert abs(pmsm_torque(PMSM_EX20, -100, 250) - 180) < 1e-9


def test_spwm_fundamental():
    assert abs(vsi_spwm(400, 0.8) - 160) < 1.6


def test_svpwm_linear_range():
    assert abs(vsi_spwm(400, 1.15, svpwm=True) - 230) < 2.3
    d = sv_dwell(400 / math.sqrt(3), math.pi / 6, 400, 1e-4)
    assert abs(d["T0"]) < 1e-9


def test_ecm_coulomb_counting():
    c = ECM(Q=48, order=2, z=1.0)
    for _ in range(1800):
        c.step(48, 1.0)
    assert abs(c.z - 0.5) < 1e-9


def test_udds_distance_and_consumption():
    cyc = load_cycles()
    st = cycle_stats(cyc["UDDS"])
    assert abs(st["distance_km"] - 11.99) < 0.02
    r = backward(cyc["UDDS"], REF4, kr=1.0)
    assert 80 < r["Wh_per_km"] < 160


def test_acceleration_plausible():
    r = accel_run(dict(REF4, eta_tr=0.97))
    assert 5 < r["t100"] < 12
