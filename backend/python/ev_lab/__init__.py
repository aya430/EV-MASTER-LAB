"""EV MASTER LAB – Python reference models (verification and batch studies).

Developed by Dr Bansilal Bairwa, Assistant Professor, REVA University, Bengaluru.
The browser laboratory runs stand-alone; this package reproduces its core models
in NumPy so results can be cross-checked, scripted and reported.
"""
from .vehicle import REF1, REF4, road_load, backward, accel_run
from .battery import ECM, ocv
from .inverter import vsi_spwm, sv_dwell
from .machines import im_steady, IM_EX13, pmsm_torque, PMSM_EX20
from .drive_cycles import load_cycles, cycle_stats
