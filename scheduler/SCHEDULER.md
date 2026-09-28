# Preemptive Moore-Hodgson Production Scheduler
## Problem Statement and Algorithm Specification

---

## 1. Background and Context

### 1.1 The Manufacturing Environment

This scheduler operates in a **make-to-order** manufacturing environment: nothing is
produced speculatively. Every production run is tied to a specific customer order.

Customers place **sales orders (SOs)**. Each SO contains one or more **line items**,
where each line item specifies a finished product, a quantity, and a required shipping
date. Each SO line item generates exactly one **work order (WO)** — the internal
instruction to produce that quantity of that product by that date.

Work orders are assigned to **departments**. A department is a group of workers who
share the same skills and can perform the same type of production work. Departments are
fully independent: a work order cannot be moved from one department to another for
load-balancing purposes.

### 1.2 Bill of Materials and Material Lead Times

Every finished product has a **Bill of Materials (BOM)**: a tree describing the
components and sub-components required to assemble it. Before assembly can begin, all
components must be physically present. Procuring a component takes time, measured in
calendar days, called its **material lead time**.

The **critical path lead time** of a work order is the maximum total lead time across
all branches of its BOM tree — the time it takes for the slowest component chain to
arrive, assuming all purchase orders are placed simultaneously on the day the SO is
received.

**No-partial-start assumption:** Work on a work order cannot begin until every single
component in the BOM has arrived. Because all components must be present before any
work starts, the critical path lead time (maximum branch, not average) governs the
earliest possible start.

**Zero-inventory assumption:** No components are held in stock. Components are ordered
on the SO date. Therefore, the earliest day labor can begin is:

$$r_i = s_i + \text{LT}_i$$

where $s_i$ is the SO date and $\text{LT}_i$ is the critical path lead time. This date
is called the **effective release date** of the work order.

**Labor aggregation assumption:** All person-hours required across every level of the
BOM tree are aggregated into a single figure for the top-level work order. Child nodes
in the BOM contribute zero direct labor — their only role is determining material lead
times. Consequently, each SO line item maps to exactly one work order with a single
work content figure.

### 1.3 Departmental Capacity

Each department has a headcount (number of workers) that may vary month to month.
Workers work **12-hour shifts, 6 days per week (Monday through Saturday)**. Sundays and
public holidays are non-working days with zero available capacity.

The available capacity of department $k$ on working day $t$ is:

$$C_{k,t} = \text{headcount}_{k,t} \times 12 \text{ person-hours}$$

On non-working days, $C_{k,t} = 0$.

**Capacity pool abstraction (McNaughton's theorem):** Because all workers in a
department are identical and interchangeable, $N$ parallel workers running simultaneously
are mathematically equivalent to a single resource processing at $N \times 12$
person-hours per day. This allows the scheduling problem to be stated in terms of a
single pooled capacity per department rather than tracking individual workers. The
assignment of specific workers to specific tasks is a separable, post-hoc step that
does not affect the optimality of the schedule.

### 1.4 Preemptive Scheduling

This scheduler assumes **preemptive scheduling**: work on any order may be freely split
across non-contiguous days, interrupted, and resumed. On any given day, a department's
capacity may be shared among multiple work orders simultaneously.

This assumption is valid at day-level granularity because any valid day-level
allocation can always be decomposed into a concrete per-worker assignment (McNaughton's
wrapping algorithm). The intra-day sequencing of individual workers is always feasible
given a valid day-level allocation.

The preemptive assumption is what makes the problem tractable in polynomial time.
Without preemption, minimising the number of late jobs with release dates
($1|r_j|\sum U_j$) is NP-hard. With preemption ($1|\text{pmtn},r_j|\sum U_j$), it
becomes solvable in polynomial time by the algorithm described in this document.

### 1.5 Rolling Reschedule and the Frozen Region

This scheduler is designed to operate in **rolling reschedule** mode. Every time a new
sales order arrives, the full schedule is recomputed from scratch for all open work
orders. This ensures the schedule always reflects the latest demand.

However, work that has already been committed to the shop floor for the near future
cannot be disrupted: workers have been assigned, materials have been staged, and
production has begun or is about to begin. The period during which the schedule is
locked is called the **frozen region**.

**Definition:** The frozen region spans the next 2 calendar days after today — tomorrow
and the day after. Today itself is not frozen (work in progress on the current day is
already being executed and is not subject to rescheduling). The schedule within the
frozen region is fixed and must not be modified.

**Tail-trimming:** The frozen region is trimmed from the end. If the last day with
actually scheduled work is earlier than the nominal frozen-region end, the frozen
region contracts to that last scheduled day. Idle tail days are not locked — the
scheduler may use them, avoiding unnecessary dead time at the start of a new schedule.
Formally: $\text{frozen\_end} = \max\{t : t \in (\text{today}, \text{today}+2] \text{ and } \exists i : x_{i,t} > 0\}$,
or $\text{frozen\_end} = \text{today}$ if no such day exists.

The scheduler itself has no concept of the frozen region. It is a stateless function
that receives a set of work orders and a start date, and returns an optimal schedule
from that start date forward. The frozen region is handled entirely by the **caller**
before invoking the scheduler, as follows:

**Caller responsibilities before each scheduler invocation:**

1. **Compute remaining work content** for each open work order. The remaining work
   content $w_i$ is the original work content (order quantity × standard hours per
   unit) minus all person-hours already completed in past days, minus all person-hours
   committed to the frozen region (i.e., already assigned and locked for the next 2
   days, subject to tail-trimming). The scheduler receives only the remaining work yet
   to be scheduled.

2. **Remove completed orders.** Work orders whose remaining work content is zero are
   done. Their on-time/late status is already known and they must not be passed to the
   scheduler.

3. **Remove expired orders.** Work orders whose shipping deadline falls on or before
   the last day of the frozen region are already decided — either they were completed
   in time (on time) or they were not (late). These must not be passed to the
   scheduler.

4. **Set the scheduling horizon start.** The scheduler's horizon begins on the first
   day after the frozen region: $T_\text{start} = \text{frozen\_end} + 1$. This is the
   first day the scheduler is allowed to place work.

From the scheduler's point of view, it receives a clean set of work orders with their
remaining work contents, and a start date. There is no frozen region inside the
scheduler.

**Expired-on-arrival orders:** A work order may arrive with a shipping deadline that
already falls within the frozen region. Because the scheduler cannot place work before
$T_\text{start}$, and the deadline precedes $T_\text{start}$, on-time delivery is
impossible regardless of capacity. Such orders are structurally late — analogous to
the unconditionally impossible orders ($r_i > d_i$, Section 3.3), but caused by the
frozen region rather than material lead time. They are placed directly into $L$ during
pre-processing and scheduled with residual capacity like any other late order (Section
3.7); they are not discarded.

---

## 2. Problem Statement

Given:

- A set of work orders, each characterised by a remaining work content, an effective
  release date, a shipping deadline, and a department
- A daily capacity calendar per department
- A scheduling horizon $[T_\text{start}, T_\text{end}]$

Produce a day-by-day allocation of person-hours to work orders that:

- Does not allocate work to any order before its effective release date
- Does not exceed the available daily capacity of any department on any day
- Completes every work order exactly once (total allocation equals remaining work
  content)
- **Minimises the number of work orders that fail to complete by their shipping deadline**

Departments are independent and the problem is solved separately for each.

---

## 3. Formal Specification

### 3.1 Sets

| Symbol | Definition |
|---|---|
| $K$ | Set of all departments |
| $I_k$ | Set of work orders assigned to department $k$, with remaining work content $w_i > 0$ |
| $I_k^* \subseteq I_k$ | Unconditionally impossible orders: $\{i \in I_k : r_i > d_i \text{ or } d_i < T_\text{start}\}$ — those whose materials cannot arrive before their deadline, or whose deadline precedes the scheduling horizon |
| $T = [T_\text{start}, T_\text{end}]$ | The scheduling horizon: the ordered set of calendar days from the first day after the frozen region to the end of the planning window. See Section 3.5 for guidance on setting $T_\text{end}$ |

### 3.2 Parameters

| Symbol | Definition |
|---|---|
| $s_i$ | SO date: the calendar date on which the sales order was placed; the earliest date on which materials can be ordered |
| $\text{LT}_i$ | Critical path lead time in days: the maximum total lead time across all branches of the work order's BOM tree |
| $r_i = s_i + \text{LT}_i$ | Effective release date: the earliest calendar day on which labor may begin, derived from the zero-inventory and no-partial-start assumptions |
| $d_i$ | Deadline: the required shipping date |
| $w_i$ | Remaining work content in person-hours: the original work content minus all person-hours already completed or committed in the frozen region (computed by the caller before invocation) |
| $C_{k,t}$ | Available capacity of department $k$ on day $t$ in person-hours: equal to headcount$_{k,t} \times 12$ on working days (Monday–Saturday); equal to $0$ on Sundays and public holidays |

### 3.3 Pre-processing (per department $k$)

Performed once before the main loop:

1. Identify unconditionally impossible orders:
$$I_k^* = \{i \in I_k : r_i > d_i \;\text{ or }\; d_i < T_\text{start}\}$$
The first condition ($r_i > d_i$) covers orders whose materials cannot arrive before
their deadline. The second ($d_i < T_\text{start}$) covers expired-on-arrival orders
whose deadline precedes the scheduling horizon — the deadline check in Simulate never
fires for them, so they must be excluded from $S$ here. Both are late regardless of
capacity.

2. Initialise the candidate sets:
$$S \leftarrow I_k \setminus I_k^*, \qquad L \leftarrow I_k^*$$

### 3.4 Subroutine: Simulate($S$)

Runs a preemptive Earliest Deadline First (EDF) simulation over the horizon $T$ for
the current on-time candidate set $S$. Returns the daily allocation $x_{i,t}$ and the
first deadline violation found, if any.

**EDF rule:** On each working day, eligible jobs are served in ascending order of
deadline $d_i$. As much capacity as possible is given to the earliest-deadline job
first; once that job's remaining work is exhausted or capacity runs out, the next job
is served, and so on.

**Tie-breaking (EDF):** When two or more jobs share the same deadline, the order among
them is a free parameter of the implementation. The choice does not affect the number
of late jobs produced by the algorithm, but does affect the resulting schedule.
Available options include:

- Smallest $w_i$ first (complete easier jobs early, freeing capacity sooner)
- Largest $w_i$ first (commit capacity to harder jobs early)
- Smallest $r_i$ first (oldest-released job first)
- Arbitrary (e.g., index order)

A single consistent rule must be chosen and applied uniformly throughout.

**Zero-capacity days:** On any day $t$ where $C_{k,t} = 0$ (Sunday or public
holiday), no allocation is made. The simulation advances to the next day without
modifying any remaining work values.

```
initialise rem_i ← w_i for all i ∈ S

for each day t ∈ T (in chronological order):

    if C_{k,t} = 0:
        continue                          // non-working day; skip

    eligible ← { i ∈ S : r_i ≤ t  and  rem_i > 0 }
    sort eligible in ascending order of d_i, breaking ties by chosen rule
    available ← C_{k,t}

    for each i in eligible (in EDF order):
        alloc    ← min(rem_i, available)
        x_{i,t}  ← alloc
        rem_i    ← rem_i − alloc
        available ← available − alloc
        if available = 0: break

    for each i ∈ S with d_i = t:
        if rem_i > 0:
            record: job i missed its deadline at day t_miss = t

return x_{i,t},  and the miss set M = { i ∈ S : rem_i > 0 at their own deadline }
       restricted to the earliest missed deadline: t_miss = min{ d_i : i ∈ M }
       M ← { i ∈ M : d_i = t_miss }
```

**Simultaneous misses:** When multiple jobs share the same earliest missed deadline
$t_\text{miss}$, all are collected into $M$. The removal candidate pool is formed from
the union across all jobs in $M$ (see Section 3.5). Tie-breaking when two removal
candidates share the same $w_i$ is also a free parameter; a consistent rule must be
chosen (e.g., smallest $r_i$ first, or smallest $d_i$ first).

### 3.5 Main Loop (per department $k$)

```
repeat:

    x_{i,t}, t_miss, M ← Simulate(S)

    if M is empty:
        STOP                              // no violations; S is optimal

    // All jobs in S whose deadline is at or before the first missed deadline
    // are candidates for removal, including jobs that were already completed
    // in this simulation — removing them frees their full w_i in the
    // re-simulation.
    candidates ← { i ∈ S : d_i ≤ t_miss }

    j ← argmax{ w_i : i ∈ candidates }   // largest work content
    S ← S \ {j}
    L ← L ∪ {j}
```

**Why the deadline bound, not the release-date bound:** Under preemptive EDF, a job
with $d_i > t_\text{miss}$ is never served ahead of eligible jobs with tighter
deadlines. It can only consume capacity on days when all eligible jobs with
$d_j \leq t_\text{miss}$ are either not yet released or already finished. In neither
case does removing it free capacity that those tight-deadline jobs could have used:
jobs that are not yet released cannot use earlier-day capacity regardless, and jobs
that are already done do not need it. The infeasibility at $t_\text{miss}$ is
therefore caused entirely by jobs with $d_i \leq t_\text{miss}$, and only those jobs
are meaningful candidates for removal.

Using the release-date bound $r_i \leq t_\text{miss}$ (the classical Moore-Hodgson
criterion, established for the no-release-date case) can cause a job with a far
deadline to be evicted from $S$ unnecessarily. That job may then finish before its
deadline anyway in post-processing, indicating that the eviction was suboptimal and
the true on-time count was undercounted.

**Why the largest job is removed:** Among the candidate set $\{i \in S : d_i \leq
t_\text{miss}\}$, removing the job with the greatest $w_i$ maximises the
person-hours freed for redistribution in the re-simulation, giving the remaining jobs
the best chance of meeting their deadlines.

### 3.6 Scheduling Horizon Length

$T_\text{end}$ must extend far enough past the last deadline to allow all orders in
$L$ to be completed. If the horizon is too short, the exact-completion requirement
(every order must be fully scheduled) becomes infeasible.

A conservative safe bound is:

$$T_\text{end} \;\geq\; \max_{i \in I_k} d_i \;+\;
\left\lceil \frac{\displaystyle\max_{i \in I_k} w_i}
                 {\displaystyle\min_{t \in T,\; C_{k,t} > 0} C_{k,t}} \right\rceil$$

In practice, extending the horizon by 60 calendar days past the latest deadline is
sufficient for typical headcount and order sizes.

### 3.7 Post-processing: Scheduling Late Jobs

After the main loop terminates, every order in $L$ must still be fully completed —
all orders are eventually fulfilled, even if late. Remaining daily capacity after
placing on-time orders is used to schedule late orders:

```
for each day t ∈ T (in chronological order):

    if C_{k,t} = 0: continue

    residual_t ← C_{k,t} − Σ_{i ∈ S} x_{i,t}

    if residual_t > 0:
        allocate residual_t to incomplete jobs in L
        by any chosen policy (e.g., EDF among late jobs)
```

The choice of policy for late jobs affects their individual completion dates (and
therefore how late each one is) but does not affect which jobs are in $S$ or $L$.

---

## 4. Termination, Correctness, and Complexity

**Termination:** The main loop removes exactly one job from $S$ per iteration. Since
$|S|$ is finite and decreases strictly at each step, the loop terminates in at most
$|I_k|$ iterations.

**Correctness:** Preemptive EDF is optimal for feasibility on a capacity-pool machine.
If no schedule exists that delivers all jobs in $S$ on time, the EDF simulation will
detect a violation. The Moore-Hodgson removal step ensures the fewest possible jobs
are moved to $L$.

**Global optimality:** Since departments share no workers and no work orders can
transfer between them, each department's problem is fully independent. Solving each
department to optimality independently yields a globally optimal solution.

**Complexity:**

| Scope | Complexity |
|---|---|
| Per simulation pass | $O(\|I_k\| \log \|I_k\| + \|T\|)$ |
| Per department (all iterations) | $O(\|I_k\|^2 \log \|I_k\|)$ |
| All departments combined | $O(D \cdot \|I_k\|^2 \log \|I_k\|)$, fully parallelisable across departments |

For a department with 4,000 orders and a 730-day horizon, each simulation pass
completes in milliseconds, and the full algorithm runs in well under one second.

---

## 5. Assumptions Summary

| Assumption | Consequence |
|---|---|
| **Preemptive scheduling** | Work on any order may be freely split across days; the problem is polynomial rather than NP-hard |
| **No partial start** | All BOM components must arrive before any labor begins; $\text{LT}_i$ is the maximum (critical path) branch lead time, not an average |
| **Zero inventory** | Components are ordered on $s_i$; no pre-stocking; effective release date is $r_i = s_i + \text{LT}_i$ |
| **Labor aggregated at top level** | Each SO line item produces exactly one work order; child BOM nodes contribute zero direct labor |
| **Identical workers (capacity pool)** | $N$ workers collapse to $N \times 12$ person-hours/day by McNaughton's theorem; individual worker assignment is a post-processing step |
| **Independent departments** | Work orders cannot transfer between departments; each is solved in isolation; the department optima combine to give a global optimum |
| **Make-to-order** | No finished-goods inventory; every work order corresponds to a specific customer commitment |
| **12-hour shifts, Mon–Sat** | $C_{k,t} = \text{headcount}_{k,t} \times 12$ on working days; $C_{k,t} = 0$ on Sundays and public holidays |
