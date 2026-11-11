"""How data/drivecycles.json was built (provenance record).

UDDS, HWFET, US06: US EPA dynamometer schedules (1 Hz, m/s) as distributed with NREL FASTSim, converted to km/h.
FTP-75: UDDS (1370 s) + first 505 s of UDDS (hot start), 10-minute soak omitted.
WLTC Class 3b: UN GTR No. 15 trace as distributed in the EC JRC 'wltp' Python package (class3.class_data_b).
NEDC: UNECE R83/R101 trace from the same package (nedc.cycle_data).
MIDC Part One: first 780 s of NEDC (4 x ECE-15 urban cycle).
Checks: UDDS 11.99 km, HWFET 16.51 km, US06 12.89 km, WLTC 23.27 km, NEDC 11.01 km.
"""
