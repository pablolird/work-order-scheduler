"""FastAPI backend — wraps the Moore-Hodgson scheduler in scheduler/schedule.py."""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

HERE      = Path(__file__).resolve().parent
SCHEDULER = HERE.parent / "scheduler"
DATA_ROOT = SCHEDULER

sys.path.insert(0, str(SCHEDULER))
import generate_data  # noqa: E402
from schedule import DEPT_MAP, run_rolling_schedule  # noqa: E402

from models import EmergencyOrder, EmergencyOrderBatch  # noqa: E402


app = FastAPI(
    title="Work Order Scheduler API",
    description="REST API wrapping the Moore-Hodgson scheduler in scheduler/schedule.py.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

_results:          pd.DataFrame  = pd.DataFrame()
_alloc:            pd.DataFrame  = pd.DataFrame()
_emergency_orders: list[dict]    = []   # accumulated extra-order rows


def _build_emergency_df() -> "pd.DataFrame | None":
    return pd.DataFrame(_emergency_orders) if _emergency_orders else None


def _run_and_cache() -> None:
    global _results, _alloc
    _results, _alloc = run_rolling_schedule(
        extra_orders=_build_emergency_df(),
        data_root=DATA_ROOT,
    )


def _to_json(df: pd.DataFrame) -> list[dict]:
    if df is None or len(df) == 0:
        return []
    return json.loads(df.to_json(orient="records", date_format="iso", default_handler=str))


def _active_emergencies() -> list[dict]:
    out = []
    for emg in _emergency_orders:
        od = emg["order_date"]
        if not hasattr(od, "isoformat"):
            od = date.fromisoformat(str(od))
        sd = emg["estimated_shipping_date"]
        if not hasattr(sd, "isoformat"):
            sd = date.fromisoformat(str(sd))
        out.append({
            "order_number":       emg["order_number"],
            "finished_goods_part": emg["finished_goods_part_number"],
            "order_quantity":     emg["order_quantity"],
            "order_date":         od.isoformat(),
            "shipping_date":      sd.isoformat(),
            "department":         emg["department"],
            "standard_seconds":   emg["standard_seconds"],
            "effective_lt":       emg["lead_time"],
        })
    return out


def _frozen_zones() -> list[dict]:
    zones = []
    for emg in _emergency_orders:
        od = emg["order_date"]
        if not hasattr(od, "isoformat"):
            od = date.fromisoformat(str(od))
        zones.append({
            "start":      od.isoformat(),
            "end":        (od + timedelta(days=2)).isoformat(),
            "department": emg["department"],
        })
    return zones


def _kpis(results: pd.DataFrame) -> dict:
    if results is None or len(results) == 0:
        return {"total": 0, "on_time": 0, "late": 0, "late_rate": 0.0, "unscheduled": 0}
    total   = len(results)
    on_time = int(results["on_time"].sum())
    late    = total - on_time
    return {
        "total":      total,
        "on_time":    on_time,
        "late":       late,
        "late_rate":  round(late / total, 4),
        "unscheduled": int((~results["on_time"] & results["actual_shipping_date"].isna()).sum()),
    }


# ---------------------------------------------------------------------------
# Startup — run the schedule once so the cache is warm on first request
# ---------------------------------------------------------------------------

@app.on_event("startup")
def _startup() -> None:
    if not (DATA_ROOT / "csvs/sales_orders.csv").exists():
        generate_data.write(DATA_ROOT / "csvs")
    _run_and_cache()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Meta"])
def health():
    """Liveness check. Reports cached schedule size and active emergency orders."""
    return {
        "status": "ok",
        "scheduled_work_orders":  len(_results),
        "emergency_orders_active": len(_emergency_orders),
    }


@app.post("/schedule/run", tags=["Schedule"])
def run_schedule():
    """
    Re-run the rolling Moore-Hodgson schedule (including any active emergency orders)
    and refresh the cache. Returns top-level KPIs.
    """
    _run_and_cache()
    return {"kpis": _kpis(_results)}


@app.get("/work-orders", tags=["Schedule"])
def get_work_orders():
    """
    Return the current cached schedule.

    `results`    — one row per work order: on_time flag, actual/estimated shipping dates, etc.
    `allocation` — day-level person-hour allocations, suitable for Gantt charts.
    """
    return {
        "kpis":               _kpis(_results),
        "results":            _to_json(_results),
        "allocation":         _to_json(_alloc),
        "frozen_zones":       _frozen_zones(),
        "active_emergencies": _active_emergencies(),
    }


@app.post("/schedule/emergency", tags=["Emergency"])
def add_emergency_order(emg: EmergencyOrder):
    """
    Add an emergency order, re-run the schedule, and return updated results.

    The release date is set to `order_date + max(effective_lt, 3)` — no work
    can be placed sooner than 3 days after the order arrives.

    Successive calls accumulate emergency orders; use DELETE /schedule/emergency
    to clear them all.
    """
    if emg.department not in DEPT_MAP.values():
        raise HTTPException(
            status_code=422,
            detail=f"department must be one of {list(DEPT_MAP.values())}",
        )

    order_date    = date.fromisoformat(emg.order_date)
    shipping_date = date.fromisoformat(emg.shipping_date)
    lt            = max(emg.effective_lt, 3)
    release_date  = order_date + timedelta(days=lt)
    work_hours    = emg.order_quantity * emg.standard_seconds / 3600.0

    dept_code = next(k for k, v in DEPT_MAP.items() if v == emg.department)

    _emergency_orders.append({
        "order_number":               emg.order_number,
        "finished_goods_part_number": emg.finished_goods_part,
        "department_code":            dept_code,
        "department":                 emg.department,
        "order_date":                 order_date,
        "estimated_shipping_date":    shipping_date,
        "order_quantity":             emg.order_quantity,
        "standard_seconds":           emg.standard_seconds,
        "work_hours":                 work_hours,
        "lead_time":                  lt,
        "release_date":               release_date,
    })

    _run_and_cache()

    emg_results = _results[_results["order_number"] == emg.order_number]
    emg_alloc   = _alloc[_alloc["order_number"] == emg.order_number] if len(_alloc) else pd.DataFrame()

    return {
        "kpis":              _kpis(_results),
        "emergency_results": _to_json(emg_results),
        "emergency_allocation": _to_json(emg_alloc),
    }


@app.post("/schedule/emergency/batch", tags=["Emergency"])
def run_emergency_batch(batch: EmergencyOrderBatch):
    """
    Replace the entire emergency order list with the supplied orders, re-run
    the schedule, and return combined results for all emergency SOs.
    """
    global _emergency_orders
    _emergency_orders = []

    for emg in batch.orders:
        if emg.department not in DEPT_MAP.values():
            raise HTTPException(
                status_code=422,
                detail=f"department must be one of {list(DEPT_MAP.values())}",
            )
        order_date    = date.fromisoformat(emg.order_date)
        shipping_date = date.fromisoformat(emg.shipping_date)
        lt            = max(emg.effective_lt, 3)
        release_date  = order_date + timedelta(days=lt)
        work_hours    = emg.order_quantity * emg.standard_seconds / 3600.0
        dept_code     = next(k for k, v in DEPT_MAP.items() if v == emg.department)

        _emergency_orders.append({
            "order_number":               emg.order_number,
            "finished_goods_part_number": emg.finished_goods_part,
            "department_code":            dept_code,
            "department":                 emg.department,
            "order_date":                 order_date,
            "estimated_shipping_date":    shipping_date,
            "order_quantity":             emg.order_quantity,
            "standard_seconds":           emg.standard_seconds,
            "work_hours":                 work_hours,
            "lead_time":                  lt,
            "release_date":               release_date,
        })

    _run_and_cache()

    emg_numbers  = {emg.order_number for emg in batch.orders}
    emg_results  = _results[_results["order_number"].isin(emg_numbers)] if len(_results) else pd.DataFrame()
    emg_alloc    = _alloc[_alloc["order_number"].isin(emg_numbers)]     if len(_alloc)   else pd.DataFrame()

    return {
        "kpis":                  _kpis(_results),
        "emergency_results":     _to_json(emg_results),
        "emergency_allocation":  _to_json(emg_alloc),
    }


@app.delete("/schedule/emergency", tags=["Emergency"])
def clear_emergency_orders():
    """Remove all active emergency orders and re-run the schedule."""
    global _emergency_orders
    _emergency_orders = []
    _run_and_cache()
    return {"kpis": _kpis(_results)}


@app.get("/work-orders/{wo_number}", tags=["Orders"])
def get_work_order(wo_number: str):
    """
    Return a single work order by WO number, its day-level allocation,
    and all sibling work orders that share the same sales order.
    """
    if len(_results) == 0:
        raise HTTPException(status_code=503, detail="Schedule not yet computed")

    mask = _results["wo_number"] == wo_number
    if not mask.any():
        raise HTTPException(status_code=404, detail=f"Work order '{wo_number}' not found")

    wo_row  = _results[mask].iloc[0]
    so_num  = wo_row["order_number"]
    wo_idx  = int(wo_row["work_order_idx"])

    alloc_for_wo = (
        _alloc[_alloc["work_order_idx"] == wo_idx] if len(_alloc) else pd.DataFrame()
    )
    so_wos = _results[_results["order_number"] == so_num]

    return {
        "wo_number":    wo_number,
        "work_order":   _to_json(_results[mask])[0],
        "allocation":   _to_json(alloc_for_wo),
        "so_number":    so_num,
        "so_work_orders": _to_json(so_wos),
    }


@app.get("/orders/{so_number}", tags=["Orders"])
def get_work_orders_for_so(so_number: str):
    """
    Return all scheduled work orders and their day-level allocation for a given
    sales order number.
    """
    if len(_results) == 0:
        raise HTTPException(status_code=503, detail="Schedule not yet computed")

    wos = _results[_results["order_number"] == so_number]
    if len(wos) == 0:
        raise HTTPException(status_code=404, detail=f"No work orders found for SO '{so_number}'")

    alloc_for_so = (
        _alloc[_alloc["order_number"] == so_number] if len(_alloc) else pd.DataFrame()
    )

    return {
        "so_number":   so_number,
        "work_orders": _to_json(wos),
        "allocation":  _to_json(alloc_for_so),
    }
