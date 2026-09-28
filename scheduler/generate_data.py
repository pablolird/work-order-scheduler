"""
Generate a synthetic dataset for the scheduler.

Every part number, order, lead time and headcount written here is random.
The files have the same columns the scheduler expects, so the whole pipeline
(scheduler -> API -> dashboard) can run without any real company data.

Usage:
    python generate_data.py            # writes csvs/ next to this file
    python generate_data.py --seed 7   # different random dataset
"""

import argparse
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

DEPARTMENTS = {
    1: "Production Section 1",
    2: "Production Section 2",
    9: "External (Subcontract)",
}

YEAR            = 2024
N_PARTS         = 120
N_COMPONENTS    = 600
ORDERS_PER_DAY  = (2, 7)          # inclusive range, Mon–Sat
# Demand multiplier per month — a spring and an autumn peak create overload.
SEASONALITY     = [1.0, 1.3, 1.1, 0.9, 0.9, 1.0, 1.1, 0.9, 1.2, 1.4, 1.0, 0.8]


def generate(seed: int = 42) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)

    # ── Parts ─────────────────────────────────────────────────────────────────
    parts = [f"FG-{1000 + i}" for i in range(N_PARTS)]
    components = [f"CMP-{i:05d}" for i in range(N_COMPONENTS)]
    part_dept = {p: int(rng.choice([1, 2, 9], p=[0.45, 0.45, 0.10])) for p in parts}
    part_std_seconds = {p: float(rng.integers(30, 600)) for p in parts}

    # ── BOM ───────────────────────────────────────────────────────────────────
    # Lead times mix stock parts (0), short buy-to-order (1–30) and long-lead
    # strategic parts (>30, treated as pre-stocked by the scheduler).
    bom_rows = []
    for p in parts:
        for c in rng.choice(components, size=rng.integers(3, 12), replace=False):
            bucket = rng.choice(["stock", "short", "long"], p=[0.5, 0.35, 0.15])
            lt = 0 if bucket == "stock" else int(rng.integers(1, 21)) if bucket == "short" else int(rng.integers(31, 180))
            bom_rows.append({
                "finished_goods_part_number":      p,
                "component_part_number":           c,
                "unit":                            "PC",
                "material_lead_time":              lt,
                "material_minimum_order_quantity": int(rng.choice([100, 500, 1000, 5000])),
                "quantity_per_unit":               round(float(rng.uniform(0.1, 4)), 3),
                "scrap_allowance":                 0.03,
            })
    bom = pd.DataFrame(bom_rows)

    # ── Sales orders ──────────────────────────────────────────────────────────
    so_rows = []
    seq = 0
    d = date(YEAR, 1, 2)
    while d <= date(YEAR, 12, 20):
        if d.weekday() < 6:
            n = int(rng.integers(*ORDERS_PER_DAY, endpoint=True) * SEASONALITY[d.month - 1])
            for _ in range(n):
                seq += 1
                p = str(rng.choice(parts))
                dept = part_dept[p]
                so_rows.append({
                    "order_date":                 d.isoformat(),
                    "order_number":               f"SO-{YEAR}-{seq:05d}",
                    "finished_goods_part_number": p,
                    "order_quantity":             int(rng.choice([50, 100, 200, 300, 500, 800, 1000, 1500])),
                    "unit":                       "PC",
                    "estimated_shipping_date":    (d + timedelta(days=int(rng.integers(14, 75)))).isoformat(),
                    "standard_seconds":           part_std_seconds[p],
                    "department_code":            dept,
                    "department_name":            DEPARTMENTS[dept],
                    "remarks":                    "",
                })
        d += timedelta(days=1)
    sales_orders = pd.DataFrame(so_rows)

    # ── Manpower (headcount per section per month) ────────────────────────────
    mp_rows = []
    for year in (YEAR, YEAR + 1):
        for m in MONTH_ABBR:
            for dept in (1, 2):
                mp_rows.append({
                    "year":       year,
                    "department": DEPARTMENTS[dept],
                    "month":      m,
                    "headcount":  int(rng.integers(5, 9)),
                })
    manpower = pd.DataFrame(mp_rows)

    return bom, sales_orders, manpower


def write(out_dir: Path, seed: int = 42) -> None:
    bom, sales_orders, manpower = generate(seed)
    out_dir.mkdir(parents=True, exist_ok=True)
    bom.to_csv(out_dir / "bom.csv", index=False)
    sales_orders.to_csv(out_dir / "sales_orders.csv", index=False)
    manpower.to_csv(out_dir / "manpower.csv", index=False)
    print(f"Wrote {len(sales_orders)} sales orders, {len(bom)} BOM rows, "
          f"{len(manpower)} manpower rows to {out_dir}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "csvs")
    args = ap.parse_args()
    write(args.out, args.seed)
