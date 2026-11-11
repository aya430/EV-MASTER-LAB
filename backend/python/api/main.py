"""Optional FastAPI service exposing the reference models.

Run:  uvicorn api.main:app --reload --port 8000   (from backend/python)
The browser laboratory does not need this service; it is provided for scripted studies and verification.
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ev_lab import REF4, road_load, backward, load_cycles, cycle_stats, im_steady, IM_EX13, pmsm_torque, PMSM_EX20, vsi_spwm

app = FastAPI(title="EV MASTER LAB API", description="Developed by Dr Bansilal Bairwa, REVA University", version="1.0")
# ALLOWED_ORIGINS: comma-separated list, e.g. "https://<user>.github.io" (default "*" keeps the original behaviour)
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])
CYCLES = load_cycles()


class RoadLoadIn(BaseModel):
    v_kmh: float = 60
    a: float = 0
    grade_pct: float = 0
    m: float = 1500


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/roadload")
def api_roadload(q: RoadLoadIn):
    P = dict(REF4, m=q.m)
    return road_load(q.v_kmh / 3.6, q.a, q.grade_pct, P)


@app.get("/api/cycle/{name}")
def api_cycle(name: str, m: float = 1500, kr: float = 1.0):
    c = CYCLES[name]
    r = backward(c, dict(REF4, m=m), kr=kr)
    return {**cycle_stats(c), "Wh_per_km": r["Wh_per_km"], "E_kWh": r["E_kWh"]}


@app.get("/api/im/{slip}")
def api_im(slip: float):
    return im_steady(IM_EX13, slip)


@app.get("/api/pmsm")
def api_pmsm(id: float = -100, iq: float = 250):
    return {"Te": pmsm_torque(PMSM_EX20, id, iq)}


@app.get("/api/spwm")
def api_spwm(Vdc: float = 400, m: float = 0.8):
    return {"V1_phase_peak": vsi_spwm(Vdc, m)}
