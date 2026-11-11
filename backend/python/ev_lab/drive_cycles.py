"""Drive-cycle loader (same JSON as the web laboratory)."""
import json
from pathlib import Path
import numpy as np

DATA = Path(__file__).resolve().parents[3] / "data" / "drivecycles.json"


def load_cycles(path: Path = DATA) -> dict:
    with open(path, encoding="utf-8") as f:
        return {k: np.array(v["v"], float) for k, v in json.load(f).items()}


def cycle_stats(v_kmh: np.ndarray) -> dict:
    v = np.asarray(v_kmh, float)
    d = v.sum() / 3.6 / 1000
    return dict(duration_s=len(v) - 1, distance_km=d, v_avg=d / ((len(v) - 1) / 3600), v_max=float(v.max()))
