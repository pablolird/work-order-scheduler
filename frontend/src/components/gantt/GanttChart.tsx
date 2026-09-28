import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ResultRow, AllocationRow, FrozenZone } from '@/api/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

// ── Public types ──────────────────────────────────────────────────────────────

export interface GanttBar {
  id: string
  wo_number: string
  so_number: string
  section: 'section1' | 'section2' | 'external'
  start_date: string
  end_date: string
  deadline: string
  part: string
  work_hours: number
  on_time: boolean
  is_unscheduled: boolean
}

const DEPT_TO_SECTION: Record<string, GanttBar['section']> = {
  'Production Section 1': 'section1',
  'Production Section 2': 'section2',
  'External (Subcontract)':       'external',
}

export function buildGanttBars(results: ResultRow[], alloc: AllocationRow[]): GanttBar[] {
  const minDate: Record<number, string> = {}
  for (const row of alloc) {
    const k = row.work_order_idx
    const d = row.date.slice(0, 10)
    if (!minDate[k] || d < minDate[k]) minDate[k] = d
  }

  return results
    .filter(r => r.department in DEPT_TO_SECTION)
    .map(r => ({
      id:             String(r.work_order_idx),
      wo_number:      r.wo_number,
      so_number:      r.order_number,
      section:        DEPT_TO_SECTION[r.department],
      start_date:     minDate[r.work_order_idx] ?? r.release_date.slice(0, 10),
      end_date:       (r.actual_shipping_date ?? r.estimated_shipping_date).slice(0, 10),
      deadline:       r.estimated_shipping_date.slice(0, 10),
      part:           r.finished_goods_part_number,
      work_hours:     r.work_hours,
      on_time:        r.on_time,
      is_unscheduled: r.actual_shipping_date === null,
    }))
}

// ── Internal chart constants ──────────────────────────────────────────────────

type ViewMode = 'year' | 'month' | 'week'
type Section  = 'section1' | 'section2' | 'external'

const SECTION_COLORS: Record<string, string> = {
  section1: '#3b82f6',
  section2: '#f97316',
  external: '#8b5cf6',
}
const EMERGENCY_COLOR = '#ef4444'
const LATE_STRIPE     = 'url(#lateStripe)'

const ROW_H               = 18
const ROW_GAP             = 2
const SECTION_HEADER_H    = 28
const LABEL_W             = 124
const AXIS_H              = 36
const MAX_ROWS_PER_SECTION = 40
const MIN_BAR_W           = 3
const MAX_HEIGHT          = 600

function parseDate(d: string): Date {
  // Parse "YYYY-MM-DD…" as local midnight so positions match buildDateRange's local-time dates
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}

function packRows(bars: GanttBar[]): Map<string, number> {
  const sorted = [...bars].sort(
    (a, b) => parseDate(a.start_date).getTime() - parseDate(b.start_date).getTime(),
  )
  const rowEnds: number[] = []
  const map = new Map<string, number>()
  for (const bar of sorted) {
    const s = parseDate(bar.start_date).getTime()
    const e = parseDate(bar.end_date).getTime()
    let row = rowEnds.findIndex(t => t <= s)
    if (row === -1) {
      row = rowEnds.length
      if (row >= MAX_ROWS_PER_SECTION) row = MAX_ROWS_PER_SECTION - 1
      else rowEnds.push(e)
    } else {
      rowEnds[row] = e
    }
    map.set(bar.id, row)
  }
  return map
}

function buildDateRange(mode: ViewMode, year: number, month: number, week: number) {
  if (mode === 'year')  return { start: new Date(year, 0, 1),        end: new Date(year + 1, 0, 1) }
  if (mode === 'month') return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) }
  const jan1 = new Date(year, 0, 1)
  const ws   = startOfWeek(new Date(jan1.getTime() + (week - 1) * 7 * 86400000))
  return { start: ws, end: new Date(ws.getTime() + 7 * 86400000) }
}

function buildTicks(
  start: Date, end: Date, mode: ViewMode, totalW: number,
): { label: string; x: number }[] {
  const totalMs = end.getTime() - start.getTime()
  const toX = (d: Date) => ((d.getTime() - start.getTime()) / totalMs) * totalW
  const ticks: { label: string; x: number }[] = []

  if (mode === 'week') {
    const cur = new Date(start); cur.setHours(0, 0, 0, 0)
    while (cur < end) {
      ticks.push({ label: cur.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }), x: toX(cur) })
      cur.setDate(cur.getDate() + 1)
    }
  } else if (mode === 'month') {
    const cur = new Date(start); cur.setHours(0, 0, 0, 0)
    let i = 0
    while (cur < end) {
      if (i % 2 === 0) ticks.push({ label: `${cur.getMonth() + 1}/${cur.getDate()}`, x: toX(cur) })
      cur.setDate(cur.getDate() + 1); i++
    }
  } else {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur < end) {
      ticks.push({ label: cur.toLocaleDateString('en-US', { month: 'short' }), x: toX(cur) })
      cur.setMonth(cur.getMonth() + 1)
    }
  }
  return ticks
}

// ── Section metadata ──────────────────────────────────────────────────────────

const SECTION_META: Record<Section, { label: string; sub: string; fill: string; textColor: string; bgFill: string }> = {
  section1: { label: 'Section 1', sub: '', fill: 'rgba(59,130,246,0.10)',  textColor: '#3b82f6', bgFill: 'rgba(59,130,246,0.04)'  },
  section2: { label: 'Section 2', sub: '', fill: 'rgba(249,115,22,0.10)', textColor: '#f97316', bgFill: 'rgba(249,115,22,0.04)'  },
  external: { label: 'External',  sub: '(Subcontract)', fill: 'rgba(139,92,246,0.10)', textColor: '#8b5cf6', bgFill: 'rgba(139,92,246,0.04)'  },
}

const SECTION_ORDER: Section[] = ['section1', 'section2', 'external']

const FROZEN_TINT: Record<Section, string> = {
  section1: 'rgba(59,130,246,0.18)',
  section2: 'rgba(249,115,22,0.18)',
  external: 'rgba(139,92,246,0.18)',
}
const FROZEN_EMERGENCY_TINT = 'rgba(100,116,139,0.28)'

// ── Component ─────────────────────────────────────────────────────────────────

interface GanttChartProps {
  bars: GanttBar[]
  emergencySONumbers?: string[]
  frozenZones?: FrozenZone[]
  title?: string
  sections?: Section[]
}

export default function GanttChart({ bars, emergencySONumbers = [], frozenZones = [], title, sections = SECTION_ORDER }: GanttChartProps) {
  const [tooltip, setTooltip] = useState<{ bar: GanttBar; clientX: number; clientY: number } | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('year')
  const [selYear, setSelYear]   = useState(2024)
  const [selMonth, setSelMonth] = useState(3)
  const [selWeek, setSelWeek]   = useState(10)
  const [timelineW, setTimelineW] = useState(0)
  const timelineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => setTimelineW(entries[0].contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const emergencySet = useMemo(() => new Set(emergencySONumbers), [emergencySONumbers])

  const { rangeStart, rangeEnd, totalW, toX } = useMemo(() => {
    const range      = buildDateRange(viewMode, selYear, selMonth, selWeek)
    const totalMs    = range.end.getTime() - range.start.getTime()
    const totalDays  = totalMs / 86400000
    // minimum px/day to keep bars readable when container is too narrow
    const minPxPerDay = viewMode === 'week' ? 60 : viewMode === 'month' ? 20 : 3
    const minW = totalDays * minPxPerDay
    const tw   = Math.max(timelineW, minW)
    const toX  = (d: Date) => ((d.getTime() - range.start.getTime()) / totalMs) * tw
    return { rangeStart: range.start, rangeEnd: range.end, totalW: tw, toX }
  }, [viewMode, selYear, selMonth, selWeek, timelineW])

  const ticks = useMemo(
    () => buildTicks(rangeStart, rangeEnd, viewMode, totalW),
    [rangeStart, rangeEnd, viewMode, totalW],
  )

  const activeSections = useMemo(
    () => SECTION_ORDER.filter(s => sections.includes(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections.join(',')],
  )

  const bySection = useMemo(() => {
    const inWindow = (b: GanttBar) =>
      parseDate(b.end_date) >= rangeStart && parseDate(b.start_date) <= rangeEnd
    const empty: GanttBar[] = []
    return {
      section1: activeSections.includes('section1') ? bars.filter(b => b.section === 'section1' && inWindow(b)) : empty,
      section2: activeSections.includes('section2') ? bars.filter(b => b.section === 'section2' && inWindow(b)) : empty,
      external: activeSections.includes('external') ? bars.filter(b => b.section === 'external' && inWindow(b)) : empty,
    }
  }, [bars, rangeStart, rangeEnd, activeSections])

  const rowMaps = useMemo(() => ({
    section1: packRows(bySection.section1),
    section2: packRows(bySection.section2),
    external: packRows(bySection.external),
  }), [bySection])

  const sectionRowCount = useCallback((sec: Section) => {
    const bs = bySection[sec]
    const rm = rowMaps[sec]
    return Math.min(MAX_ROWS_PER_SECTION, Math.max(1, bs.length > 0 ? Math.max(...[...rm.values()]) + 1 : 1))
  }, [bySection, rowMaps])

  const sectionH = useCallback(
    (sec: Section) => SECTION_HEADER_H + sectionRowCount(sec) * (ROW_H + ROW_GAP) + 8,
    [sectionRowCount],
  )

  const sectionTops = useMemo(() => {
    const tops: Partial<Record<Section, number>> = {}
    let y = AXIS_H
    for (const sec of activeSections) { tops[sec] = y; y += sectionH(sec) }
    return tops
  }, [activeSections, sectionH])

  const svgH = useMemo(
    () => AXIS_H + activeSections.reduce((sum, sec) => sum + sectionH(sec), 0) + 16,
    [activeSections, sectionH],
  )

  const barColor = useCallback(
    (bar: GanttBar) => emergencySet.has(bar.so_number) ? EMERGENCY_COLOR : (SECTION_COLORS[bar.section] ?? '#94a3b8'),
    [emergencySet],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>, bar: GanttBar) => setTooltip({ bar, clientX: e.clientX, clientY: e.clientY }),
    [],
  )

  const years = useMemo(() => {
    const ys = new Set(bars.map(b => parseDate(b.start_date).getFullYear()))
    return [...ys].sort()
  }, [bars])

  useEffect(() => {
    if (years.length > 0 && !years.includes(selYear)) setSelYear(years[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years])

  useEffect(() => {
    if (emergencySONumbers.length > 0) {
      const emgBar = bars.find(b => emergencySONumbers.includes(b.so_number))
      if (emgBar) {
        const d = parseDate(emgBar.start_date)
        setSelYear(d.getFullYear())
        setViewMode('month')
        setSelMonth(d.getMonth() + 1)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emergencySONumbers.length, bars])

  const renderBars = (bs: GanttBar[], rowMap: Map<string, number>, yOffset: number) =>
    bs.map(bar => {
      const row    = rowMap.get(bar.id) ?? 0
      const x      = toX(parseDate(bar.start_date))
      const x2     = toX(parseDate(bar.end_date))
      const w      = Math.max(MIN_BAR_W, x2 - x)
      const y      = yOffset + SECTION_HEADER_H + row * (ROW_H + ROW_GAP)
      const isLate = !bar.on_time && !bar.is_unscheduled
      const color  = barColor(bar)
      return (
        <g key={bar.id}>
          <rect
            x={x} y={y} width={w} height={ROW_H}
            fill={isLate ? LATE_STRIPE : color}
            fillOpacity={isLate ? 0.72 : bar.is_unscheduled ? 0.3 : 0.92}
            stroke={color} strokeWidth={isLate ? 1 : 0.5}
            strokeDasharray={bar.is_unscheduled ? '4 2' : undefined}
            rx={2} style={{ cursor: 'pointer' }}
            onMouseMove={e => handleMouseMove(e, bar)}
            onMouseLeave={() => setTooltip(null)}
          />
          {isLate && (
            <rect x={x} y={y} width={w} height={ROW_H}
              fill={color} fillOpacity={0.35} rx={2}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </g>
      )
    })

  const renderSectionLabel = (sec: Section, yTop: number, count: number) => {
    const m = SECTION_META[sec]
    return (
      <>
        <rect x={0} y={yTop} width={LABEL_W} height={sectionH(sec)} fill={m.fill} />
        <text x={8} y={yTop + 17} fontSize={11} fontWeight={700} fill={m.textColor} style={{ userSelect: 'none' }}>{m.label}</text>
        <text x={8} y={yTop + 27} fontSize={10} fill={m.textColor} style={{ userSelect: 'none' }}>{m.sub}</text>
        <text x={8} y={yTop + 38} fontSize={9}  fill="var(--muted-foreground)" style={{ userSelect: 'none' }}>{count} orders</text>
        <line x1={0} y1={yTop} x2={LABEL_W} y2={yTop} stroke="var(--border)" strokeWidth={1} />
      </>
    )
  }

  const renderSectionBg = (sec: Section, yTop: number) => {
    const m = SECTION_META[sec]
    return (
      <>
        <line x1={0} y1={yTop} x2={totalW} y2={yTop} stroke="var(--border)" strokeWidth={1} />
        <rect x={0} y={yTop} width={totalW} height={sectionH(sec)} fill={m.bgFill} />
      </>
    )
  }

  const tooltipEl = tooltip && (() => {
    const TW = 260, MARGIN = 14
    const left = tooltip.clientX + MARGIN + TW > window.innerWidth
      ? tooltip.clientX - TW - MARGIN
      : tooltip.clientX + MARGIN
    const bar = tooltip.bar
    return createPortal(
      <div
        className="pointer-events-none fixed z-[9999] rounded-lg border bg-popover text-popover-foreground shadow-lg p-3 text-xs"
        style={{ left, top: tooltip.clientY - 8, transform: 'translateY(-100%)', width: TW }}
      >
        <div className="font-semibold text-sm mb-0.5 truncate">{bar.wo_number}</div>
        <div className="text-muted-foreground text-[11px] mb-1.5 truncate">SO: {bar.so_number}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <span className="text-muted-foreground">Part</span>     <span className="truncate">{bar.part}</span>
          <span className="text-muted-foreground">Start</span>    <span>{bar.start_date.slice(0, 10)}</span>
          <span className="text-muted-foreground">End</span>      <span>{bar.end_date.slice(0, 10)}</span>
          <span className="text-muted-foreground">Deadline</span> <span>{bar.deadline.slice(0, 10)}</span>
          {bar.section !== 'external' && (
            <><span className="text-muted-foreground">Work hrs</span><span>{bar.work_hours.toFixed(1)}</span></>
          )}
          <span className="text-muted-foreground">Status</span>
          <span>
            {bar.is_unscheduled
              ? <Badge variant="secondary" className="text-[10px] px-1 py-0">Unscheduled</Badge>
              : !bar.on_time
                ? <Badge variant="destructive" className="text-[10px] px-1 py-0">Late</Badge>
                : <Badge variant="secondary" className="text-[10px] px-1 py-0 text-green-700">On Time</Badge>}
          </span>
        </div>
      </div>,
      document.body,
    )
  })()

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {title && <span className="font-medium text-sm text-muted-foreground">{title}</span>}

        <Select value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
          <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="year">By Year</SelectItem>
            <SelectItem value="month">By Month</SelectItem>
            <SelectItem value="week">By Week</SelectItem>
          </SelectContent>
        </Select>

        <Select value={String(selYear)} onValueChange={v => setSelYear(Number(v))}>
          <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(years.length > 0 ? years : [2024, 2025]).map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {viewMode === 'month' && (
          <Select value={String(selMonth)} onValueChange={v => setSelMonth(Number(v))}>
            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <SelectItem key={m} value={String(m)}>
                  {new Date(selYear, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {viewMode === 'week' && (
          <Select value={String(selWeek)} onValueChange={v => setSelWeek(Number(v))}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-48 overflow-y-auto">
              {Array.from({ length: 52 }, (_, i) => i + 1).map(w => (
                <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> Section 1</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-orange-500" /> Section 2</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-violet-500" /> External (Subcontract)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Emergency</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm opacity-60 border border-red-400 bg-orange-400" /> Late</span>
          {frozenZones.length > 0 && (
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-slate-400 opacity-60" /> Frozen zone</span>
          )}
        </div>
      </div>

      <div
        className="flex border rounded-lg bg-card"
        style={{ maxHeight: MAX_HEIGHT, overflowY: 'auto', overflowX: 'hidden' }}
      >
        {/* Label panel */}
        <div className="flex-shrink-0 z-10" style={{ width: LABEL_W, boxShadow: '2px 0 6px -2px rgba(0,0,0,0.12)' }}>
          <svg width={LABEL_W} height={svgH} style={{ display: 'block' }}>
            <rect x={0} y={0} width={LABEL_W} height={AXIS_H} fill="var(--muted)" />
            {activeSections.map(sec => renderSectionLabel(sec, sectionTops[sec]!, bySection[sec].length))}
          </svg>
        </div>

        {/* Timeline */}
        <div ref={timelineRef} className="flex-1 overflow-x-auto min-w-0">
          <svg width={totalW} height={svgH} style={{ display: 'block' }}>
            <defs>
              <pattern id="lateStripe" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={6} stroke="rgba(255,255,255,0.5)" strokeWidth={3} />
              </pattern>
            </defs>

            <rect x={0} y={0} width={totalW} height={AXIS_H} fill="var(--muted)" />
            {ticks.map((tick, i) => (
              <g key={i}>
                <line x1={tick.x} y1={AXIS_H - 6} x2={tick.x} y2={svgH} stroke="var(--border)" strokeWidth={0.5} />
                <text x={tick.x + 3} y={AXIS_H - 10} fontSize={10} fill="var(--muted-foreground)" style={{ userSelect: 'none' }}>
                  {tick.label}
                </text>
              </g>
            ))}

            {activeSections.map((sec, i) => {
              const yTop = sectionTops[sec]!
              return (
                <g key={sec}>
                  {i === 0
                    ? <rect x={0} y={yTop} width={totalW} height={sectionH(sec)} fill={SECTION_META[sec].bgFill} />
                    : renderSectionBg(sec, yTop)}
                  {/* one overlay rect per frozen zone */}
                  {frozenZones.map((zone, zi) => {
                    const x1 = toX(parseDate(zone.start))
                    const x2 = toX(addDays(parseDate(zone.end), 1))
                    const fill = DEPT_TO_SECTION[zone.department] === sec
                      ? FROZEN_EMERGENCY_TINT
                      : FROZEN_TINT[sec]
                    return (
                      <rect
                        key={zi}
                        x={x1} y={yTop} width={Math.max(0, x2 - x1)} height={sectionH(sec)}
                        fill={fill}
                        style={{ pointerEvents: 'none' }}
                      />
                    )
                  })}
                  {renderBars(bySection[sec], rowMaps[sec], yTop)}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {tooltipEl}

      <p className="text-xs text-muted-foreground">
        Showing {activeSections.reduce((s, sec) => s + bySection[sec].length, 0)} orders in window
        {bars.length > 0 && ` · ${rangeStart.toLocaleDateString()} – ${rangeEnd.toLocaleDateString()}`}
      </p>
    </div>
  )
}
