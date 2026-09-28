"""
Preemptive Moore-Hodgson Production Scheduler
Implements the algorithm specified in SCHEDULER.md.
"""

from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm

# ── Constants ──────────────────────────────────────────────────────────────────

DEPT_MAP   = {2: "Production Section 2", 1: "Production Section 1"}
EXT_DEPT   = {9: "External (Subcontract)"}
MONTH_ABBR = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
MONTH_NUM  = {m: i + 1 for i, m in enumerate(MONTH_ABBR)}
HORIZON_EXTRA_DAYS = 60

# ── BOM critical-path lead time (pure) ────────────────────────────────────────

def _bom_max_lt(part: str, visiting: frozenset, children: dict) -> float:
    if part not in children or part in visiting:
        return 0
    visiting = visiting | {part}
    return max(max(lt, _bom_max_lt(child, visiting, children)) for child, lt in children[part])

# ── Core simulation (preemptive EDF) ──────────────────────────────────────────

def _simulate(
    ids: list,
    rel_ords: np.ndarray,
    dl_ords: np.ndarray,
    wh: np.ndarray,
    active: np.ndarray,
    capacity: dict,
    days: list,
    store_alloc: bool = False,
):
    """
    Runs one preemptive EDF pass over `days` for the active subset of jobs.

    Jobs must be pre-sorted by (deadline, work_hours) so that index order
    reflects EDF priority — np.where returns indices in ascending order,
    which then matches the sort order.

    Returns (alloc, t_miss, M_ids, rem):
        alloc    – {(job_id, date): hours} if store_alloc, else None
        t_miss   – earliest missed deadline date, or None
        M_ids    – job ids that missed at t_miss
        rem      – remaining work per position after simulation
    """
    rem = wh.copy().astype(float)
    rem[~active] = 0.0

    alloc: dict | None = {} if store_alloc else None
    t_miss: date | None = None
    M_ids: list = []

    for t in days:
        t_ord = t.toordinal()
        cap_t = capacity.get(t, 0.0)

        if cap_t > 1e-9:
            elig = active & (rel_ords <= t_ord) & (rem > 1e-9)
            if elig.any():
                elig_idx = np.where(elig)[0]   # ascending index = EDF order (pre-sorted)
                elig_rem = rem[elig_idx]

                # Greedy EDF allocation: fill jobs in priority order up to cap_t
                cs         = np.cumsum(elig_rem)
                cs_clamped = np.minimum(cs, cap_t)
                allocs     = np.diff(np.concatenate([[0.0], cs_clamped]))

                rem[elig_idx] -= allocs

                if store_alloc:
                    for k, i in enumerate(elig_idx):
                        if allocs[k] > 1e-9:
                            alloc[(ids[i], t)] = allocs[k]   # type: ignore[index]

        # Deadline check after allocation, every day (including non-working days)
        dl_today = active & (dl_ords == t_ord)
        if dl_today.any():
            missed = dl_today & (rem > 1e-9)
            if missed.any():
                m = [ids[i] for i in np.where(missed)[0]]
                if t_miss is None or t < t_miss:
                    t_miss, M_ids = t, m
                elif t == t_miss:
                    M_ids.extend(m)

    return alloc, t_miss, M_ids, rem

# ── Scheduling algorithms ──────────────────────────────────────────────────────

def schedule_mh(
    work_orders: list,
    capacity: dict,
    days: list,
) -> tuple[dict, set, list]:
    """
    Moore-Hodgson: maximise the number of on-time jobs.

    Returns (alloc, on_time_ids, late_list):
        alloc        – {(job_id, date): person-hours}
        on_time_ids  – set of job ids that finish by their deadline
        late_list    – list of work-order dicts moved to L
    """
    # Pre-sort by (deadline, work_hours) — must stay fixed throughout
    work_orders_sorted = sorted(work_orders, key=lambda j: (j["deadline"], j["work_hours"]))

    ids      = [j["id"] for j in work_orders_sorted]
    rel_ords = np.array([j["release_date"].toordinal() for j in work_orders_sorted])
    dl_ords  = np.array([j["deadline"].toordinal()     for j in work_orders_sorted])
    wh       = np.array([j["work_hours"]               for j in work_orders_sorted], dtype=float)

    # Pre-processing: impossible orders — r_i > d_i, or deadline before horizon start
    horizon_start_ord = days[0].toordinal() if days else 0
    active = (rel_ords <= dl_ords) & (dl_ords >= horizon_start_ord)

    # ── Main loop ──────────────────────────────────────────────────────────────
    while True:
        _, t_miss, _, _ = _simulate(ids, rel_ords, dl_ords, wh, active, capacity, days)

        if t_miss is None:
            break   # S is feasible

        t_miss_ord = t_miss.toordinal()
        cand_mask  = active & (dl_ords <= t_miss_ord)

        if not cand_mask.any():
            break   # safety exit — should not occur

        # Remove job with the largest work content (ties: earliest deadline via pre-sort)
        cand_idx = np.where(cand_mask)[0]
        best_pos = cand_idx[np.argmax(wh[cand_idx])]
        active[best_pos] = False

    # ── Final simulation: collect allocations for on-time set ──────────────────
    alloc, _, _, _ = _simulate(
        ids, rel_ords, dl_ords, wh, active, capacity, days, store_alloc=True
    )

    on_time_ids = {ids[i] for i in range(len(ids)) if active[i]}
    late_list   = [work_orders_sorted[i] for i in range(len(ids)) if not active[i]]

    # ── Post-processing: schedule late jobs with residual capacity (EDF) ───────
    residual = dict(capacity)
    for (_, t), hours in alloc.items():   # type: ignore[misc]
        residual[t] = residual.get(t, 0.0) - hours

    if late_list:
        late_sorted = sorted(late_list, key=lambda j: (j["deadline"], j["work_hours"]))
        l_ids    = [j["id"] for j in late_sorted]
        l_rel    = np.array([j["release_date"].toordinal() for j in late_sorted])
        l_rem    = np.array([j["work_hours"]               for j in late_sorted], dtype=float)

        for t in days:
            res = residual.get(t, 0.0)
            if res <= 1e-9:
                continue
            t_ord     = t.toordinal()
            elig_mask = (l_rel <= t_ord) & (l_rem > 1e-9)
            if not elig_mask.any():
                continue
            elig_idx  = np.where(elig_mask)[0]
            cs        = np.cumsum(l_rem[elig_idx])
            cs_cl     = np.minimum(cs, res)
            allocs    = np.diff(np.concatenate([[0.0], cs_cl]))
            l_rem[elig_idx] -= allocs
            for k, i in enumerate(elig_idx):
                if allocs[k] > 1e-9:
                    key = (l_ids[i], t)
                    alloc[key] = alloc.get(key, 0.0) + allocs[k]   # type: ignore[index]

    return alloc, on_time_ids, late_list


def schedule_lawler(
    work_orders: list,
    capacity: dict,
    days: list,
) -> tuple[dict, set, list]:
    """
    EDF on all jobs: minimises maximum lateness (1|pmtn,r_j|Lmax).
    No S/L split — every job is scheduled in a single EDF pass.
    """
    work_orders_sorted = sorted(work_orders, key=lambda j: (j["deadline"], j["work_hours"]))

    ids      = [j["id"] for j in work_orders_sorted]
    rel_ords = np.array([j["release_date"].toordinal() for j in work_orders_sorted])
    dl_ords  = np.array([j["deadline"].toordinal()     for j in work_orders_sorted])
    wh       = np.array([j["work_hours"]               for j in work_orders_sorted], dtype=float)

    horizon_start_ord = days[0].toordinal() if days else 0
    active = (rel_ords <= dl_ords) & (dl_ords >= horizon_start_ord)

    alloc, _, _, _ = _simulate(
        ids, rel_ords, dl_ords, wh, active, capacity, days, store_alloc=True
    )

    last_date: dict = {}
    for (jid, t), hours in alloc.items():
        if hours > 1e-9 and (jid not in last_date or t > last_date[jid]):
            last_date[jid] = t

    on_time_ids: set = set()
    for i in range(len(ids)):
        if not active[i]:
            continue
        last = last_date.get(ids[i])
        if last is not None and last <= work_orders_sorted[i]["deadline"]:
            on_time_ids.add(ids[i])

    late_list = [work_orders_sorted[i] for i in range(len(ids)) if ids[i] not in on_time_ids]

    return alloc, on_time_ids, late_list


# ── Algorithm selector ─────────────────────────────────────────────────────────

# schedule = schedule_lawler   # swap to change algorithm
schedule = schedule_mh


# ── Main entry point ───────────────────────────────────────────────────────────

def run_rolling_schedule(
    extra_orders: "pd.DataFrame | None" = None,
    data_root: Path = Path("."),
) -> tuple["pd.DataFrame", "pd.DataFrame"]:
    """
    Loads data from data_root/csvs/, runs the rolling Moore-Hodgson schedule.

    extra_orders: optional DataFrame of pre-processed rows to append (must already
                  have order_date, estimated_shipping_date, department, work_hours,
                  release_date columns set as Python date objects).

    Returns (results_df, alloc_df).
    """
    # ── Load ──────────────────────────────────────────────────────────────────
    bom_df = pd.read_csv(data_root / "csvs/bom.csv")
    so_df  = pd.read_csv(data_root / "csvs/sales_orders.csv")
    mp_df  = pd.read_csv(data_root / "csvs/manpower.csv")

    so_df["order_date"]              = pd.to_datetime(so_df["order_date"]).dt.date
    so_df["estimated_shipping_date"] = pd.to_datetime(so_df["estimated_shipping_date"]).dt.date

    # ── BOM critical-path lead time ───────────────────────────────────────────
    children: dict = {}
    for _, row in bom_df.iterrows():
        children.setdefault(row["finished_goods_part_number"], []).append(
            (row["component_part_number"], row["material_lead_time"])
        )

    lt_cache: dict = {}
    def release_lead_time(part: str) -> int:
        if part not in lt_cache:
            lt = _bom_max_lt(part, frozenset(), children)
            lt_cache[part] = 0 if lt > 30 else int(lt)
        return lt_cache[part]

    # ── Work orders ───────────────────────────────────────────────────────────
    so_filtered = so_df[so_df["department_code"].isin(DEPT_MAP)].copy()
    so_filtered["department"]   = so_filtered["department_code"].map(DEPT_MAP)
    so_filtered["work_hours"]   = so_filtered["order_quantity"] * so_filtered["standard_seconds"] / 3600.0
    so_filtered["lead_time"]    = so_filtered["finished_goods_part_number"].map(release_lead_time)
    so_filtered["release_date"] = so_filtered.apply(
        lambda r: r["order_date"] + timedelta(days=int(r["lead_time"])), axis=1
    )
    so_filtered = so_filtered[so_filtered["work_hours"] > 0].reset_index(drop=True)

    if extra_orders is not None and len(extra_orders) > 0:
        so_filtered = pd.concat([so_filtered, extra_orders], ignore_index=True)

    # ── Headcount / capacity calendar ─────────────────────────────────────────
    headcount_lookup: dict = {}
    for _, row in mp_df.iterrows():
        month_num = MONTH_NUM[row["month"]]
        headcount_lookup[(row["department"], int(row["year"]), month_num)] = int(row["headcount"])

    _last_headcount: dict = {}
    for (dept, year, month), hc in sorted(
        headcount_lookup.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])
    ):
        _last_headcount[dept] = hc

    def _headcount(dept: str, year: int, month: int) -> int:
        hc = headcount_lookup.get((dept, year, month))
        return hc if hc is not None else _last_headcount.get(dept, 0)

    def build_capacity(dept: str, t_start: date, t_end: date) -> dict:
        cap = {}
        cur = t_start
        while cur <= t_end:
            if cur.weekday() < 6:   # Mon=0 … Sat=5, Sun=6
                cap[cur] = float(_headcount(dept, cur.year, cur.month) * 12)
            else:
                cap[cur] = 0.0
            cur += timedelta(days=1)
        return cap

    # ── Rolling reschedule ─────────────────────────────────────────────────────
    trigger_dates = sorted(so_filtered["order_date"].unique())
    running_alloc: dict = {}

    for trigger in tqdm(trigger_dates, desc="Rolling reschedule"):
        max_frozen = trigger + timedelta(days=2)
        allocated_in_window = {
            d for (_, d) in running_alloc
            if trigger < d <= max_frozen
        }
        frozen_end   = max(allocated_in_window) if allocated_in_window else trigger
        t_start_free = frozen_end + timedelta(days=1)

        arrived = so_filtered[so_filtered["order_date"] <= trigger]

        committed: dict = defaultdict(float)
        for (wid, d), h in running_alloc.items():
            if d <= frozen_end:
                committed[wid] += h

        running_alloc = {(wid, d): h for (wid, d), h in running_alloc.items()
                         if d <= frozen_end}

        active_deadlines = [
            row["estimated_shipping_date"]
            for _, row in arrived.iterrows()
            if row["estimated_shipping_date"] > frozen_end
            and row["work_hours"] - committed[row.name] > 1e-9
        ]
        if not active_deadlines:
            continue

        t_end    = max(active_deadlines) + timedelta(days=HORIZON_EXTRA_DAYS)
        all_days = [t_start_free + timedelta(days=i)
                    for i in range((t_end - t_start_free).days + 1)]

        new_alloc: dict = {}
        for dept_code, dept_name in DEPT_MAP.items():
            dept_df = arrived[arrived["department"] == dept_name]
            work_orders_list = []
            for _, row in dept_df.iterrows():
                remaining = row["work_hours"] - committed[row.name]
                if remaining <= 1e-9:
                    continue
                work_orders_list.append({
                    "id":           row.name,
                    "release_date": row["release_date"],
                    "deadline":     row["estimated_shipping_date"],
                    "work_hours":   remaining,
                })
            if not work_orders_list:
                continue
            capacity = build_capacity(dept_name, all_days[0], all_days[-1])
            alloc, _, _ = schedule(work_orders_list, capacity, all_days)
            new_alloc.update(alloc)

        running_alloc.update(new_alloc)

    all_alloc = running_alloc

    # ── Results DataFrame ─────────────────────────────────────────────────────
    last_alloc_date: dict = {}
    for (wid, t), hours in all_alloc.items():
        if hours >= 1e-9 and (wid not in last_alloc_date or t > last_alloc_date[wid]):
            last_alloc_date[wid] = t

    results_rows = []
    for idx, row in so_filtered.iterrows():
        actual = last_alloc_date.get(idx)
        results_rows.append({
            "work_order_idx":             idx,
            "order_number":               row["order_number"],
            "finished_goods_part_number": row["finished_goods_part_number"],
            "department":                 row["department"],
            "order_date":                 row["order_date"],
            "release_date":               row["release_date"],
            "estimated_shipping_date":    row["estimated_shipping_date"],
            "actual_shipping_date":       actual,
            "work_hours":                 round(row["work_hours"], 4),
            "order_quantity":             int(row["order_quantity"]),
            "on_time":                    actual is not None and actual <= row["estimated_shipping_date"],
        })

    results_df = pd.DataFrame(results_rows)

    # ── Allocation DataFrame ──────────────────────────────────────────────────
    alloc_rows = []
    for (wid, t), hours in all_alloc.items():
        if hours < 1e-9:
            continue
        row = so_filtered.loc[wid]
        alloc_rows.append({
            "work_order_idx":             wid,
            "order_number":               row["order_number"],
            "finished_goods_part_number": row["finished_goods_part_number"],
            "department":                 row["department"],
            "deadline":                   row["estimated_shipping_date"],
            "date":                       t,
            "hours":                      round(hours, 6),
            "on_time":                    last_alloc_date.get(wid) <= row["estimated_shipping_date"],
        })

    alloc_df = (
        pd.DataFrame(alloc_rows).sort_values(["department", "date", "order_number"])
        if alloc_rows else pd.DataFrame(columns=["work_order_idx", "order_number",
                                                  "finished_goods_part_number", "department",
                                                  "deadline", "date", "hours", "on_time"])
    )

    # ── External (Subcontract) orders ─────────────────────────────────────────────────
    # External orders use no manpower. on_time is determined purely by comparing
    # order_date + bom_lead_time against estimated_shipping_date (uncapped LT).
    ext_df = so_df[so_df["department_code"].isin(EXT_DEPT)].copy()
    ext_df["department"] = ext_df["department_code"].map(EXT_DEPT)
    ext_df = ext_df[ext_df["order_quantity"] > 0].reset_index(drop=True)

    n_internal = len(so_filtered)
    ext_lt_cache: dict = {}

    def _ext_lead_time(part: str) -> int:
        if part not in ext_lt_cache:
            lt = _bom_max_lt(part, frozenset(), children)
            ext_lt_cache[part] = 0 if lt > 30 else int(lt)
        return ext_lt_cache[part]

    ext_results_rows = []
    for i, (_, row) in enumerate(ext_df.iterrows()):
        lt     = _ext_lead_time(row["finished_goods_part_number"])
        actual = row["order_date"] + timedelta(days=lt)
        ext_results_rows.append({
            "work_order_idx":             n_internal + i,
            "order_number":               row["order_number"],
            "finished_goods_part_number": row["finished_goods_part_number"],
            "department":                 row["department"],
            "order_date":                 row["order_date"],
            "release_date":               row["order_date"],
            "estimated_shipping_date":    row["estimated_shipping_date"],
            "actual_shipping_date":       actual,
            "work_hours":                 0.0,
            "order_quantity":             int(row["order_quantity"]),
            "on_time":                    actual <= row["estimated_shipping_date"],
        })

    if ext_results_rows:
        results_df = pd.concat(
            [results_df, pd.DataFrame(ext_results_rows)],
            ignore_index=True,
        )

    # ── WO number assignment ──────────────────────────────────────────────────
    # Sorted deterministically within each class so numbers are stable for a
    # given dataset (they may shift if new SOs arrive at earlier dates).
    is_ext = results_df["department"] == "External (Subcontract)"

    int_idx = results_df[~is_ext].sort_values(
        ["order_date", "order_number", "finished_goods_part_number"]
    ).index
    ext_idx = results_df[is_ext].sort_values(
        ["order_date", "order_number", "finished_goods_part_number"]
    ).index

    wo_nums = pd.Series("", index=results_df.index, dtype=str)
    for n, idx in enumerate(int_idx, 1):
        wo_nums.at[idx] = f"WO-{n:06d}"
    for n, idx in enumerate(ext_idx, 1):
        wo_nums.at[idx] = f"WO-EXT-{n:06d}"

    results_df["wo_number"] = wo_nums.values

    return results_df, alloc_df


if __name__ == "__main__":
    results_df, alloc_df = run_rolling_schedule()
    results_df.to_csv("csvs/schedule_results.csv", index=False)
    alloc_df.to_csv("csvs/schedule_allocation.csv", index=False)

    total         = len(results_df)
    n_on_time     = results_df["on_time"].sum()
    n_late        = total - n_on_time
    n_unscheduled = (~results_df["on_time"] & results_df["actual_shipping_date"].isna()).sum()

    late_df = results_df[~results_df["on_time"] & results_df["actual_shipping_date"].notna()].copy()
    late_df["delay_days"] = (
        pd.to_datetime(late_df["actual_shipping_date"]) -
        pd.to_datetime(late_df["estimated_shipping_date"])
    ).dt.days
    n_late_scheduled = len(late_df)
    avg_delay = late_df["delay_days"].mean() if n_late_scheduled > 0 else 0.0
    max_delay = late_df["delay_days"].max()  if n_late_scheduled > 0 else 0

    print(f"{'='*60}")
    print(f"  SCHEDULE SUMMARY")
    print(f"{'='*60}")
    print(f"  Total work orders : {total}")
    print(f"  On time           : {n_on_time}  ({100 * n_on_time / total:.1f}%)")
    print(f"  Late              : {n_late}  ({100 * n_late / total:.1f}%)")
    if n_unscheduled > 0:
        print(f"  └ never scheduled : {n_unscheduled}  (deadline within frozen region on arrival)")
    if n_late_scheduled > 0:
        print(f"  Avg delay (late)  : {avg_delay:.1f} days")
        print(f"  Max delay         : {max_delay} days")
    print(f"{'='*60}")
    print(f"  Results    → csvs/schedule_results.csv")
    print(f"  Allocation → csvs/schedule_allocation.csv")
