import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Search, AlertCircle, Clock, CheckCircle2, ExternalLink, Package, CalendarDays } from 'lucide-react'
import GanttChart, { buildGanttBars } from '@/components/gantt/GanttChart'
import type { ResultRow } from '@/api/types'

function deptBadgeClass(dept: string) {
  if (dept === 'Production Section 1') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
  if (dept === 'Production Section 2') return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
  return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
}

function deptShort(dept: string) {
  if (dept === 'Production Section 1') return 'Sec 1'
  if (dept === 'Production Section 2') return 'Sec 2'
  return 'EXT'
}

function StatusBadge({ row }: { row: ResultRow }) {
  if (row.actual_shipping_date === null)
    return <Badge variant="secondary" className="text-xs text-orange-600">Unscheduled</Badge>
  if (!row.on_time)
    return <Badge variant="destructive" className="text-xs gap-1"><Clock className="h-3 w-3" />Late</Badge>
  return <Badge variant="secondary" className="text-xs gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" />On Time</Badge>
}

export default function WOLookupPage() {
  const [input, setInput] = useState('')
  const [woNumber, setWoNumber] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['wo-lookup', woNumber],
    queryFn: () => api.woLookup(woNumber!),
    enabled: woNumber !== null,
    retry: false,
  })

  const handleSearch = () => {
    const trimmed = input.trim()
    if (trimmed) setWoNumber(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  const wo = data?.work_order

  const ganttBars = useMemo(
    () => wo ? buildGanttBars([wo], data?.allocation ?? []) : [],
    [wo, data?.allocation],
  )

  const siblingBars = useMemo(
    () => buildGanttBars(data?.so_work_orders ?? [], []),
    [data?.so_work_orders],
  )

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Work Order Lookup</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Enter a WO number to view its schedule details and parent Sales Order.
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 font-mono"
            placeholder="e.g. WO-000042 or WO-EXT-000001"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button onClick={handleSearch} disabled={!input.trim() || isLoading}>
          {isLoading ? 'Searching…' : 'Search'}
        </Button>
      </div>

      {/* Error */}
      {isError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Work order not found</p>
            <p className="text-xs mt-0.5 opacity-80">{String(error)}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      )}

      {/* Results */}
      {data && wo && (
        <div className="space-y-5">
          {/* WO header */}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-base font-semibold font-mono">{data.wo_number}</h2>
            <Badge variant="outline" className={deptBadgeClass(wo.department)}>
              {deptShort(wo.department)}
            </Badge>
            <StatusBadge row={wo} />
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Qty */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: '#6366f1' }} />
              <CardHeader className="pb-0 pt-5 px-5">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quantity</span>
                  <Package className="h-4 w-4 opacity-80" style={{ color: '#6366f1' }} />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-2">
                <div className="text-4xl font-extrabold tabular-nums tracking-tight">{wo.order_quantity.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-2">units ordered</p>
              </CardContent>
            </Card>

            {/* Work Hours */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: '#8b5cf6' }} />
              <CardHeader className="pb-0 pt-5 px-5">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Work Hours</span>
                  <Clock className="h-4 w-4 opacity-80" style={{ color: '#8b5cf6' }} />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-2">
                <div className="text-4xl font-extrabold tabular-nums tracking-tight">
                  {wo.department === 'External (Subcontract)' ? '—' : wo.work_hours.toFixed(1)}
                </div>
                <p className="text-xs text-muted-foreground mt-2">person-hours</p>
              </CardContent>
            </Card>

            {/* Status */}
            {(() => {
              const isUnscheduled = wo.actual_shipping_date === null
              const isLate = !wo.on_time && !isUnscheduled
              const color = isUnscheduled ? '#f97316' : isLate ? '#ef4444' : '#22c55e'
              const label = isUnscheduled ? 'Unscheduled' : isLate ? 'Late' : 'On Time'
              const textCls = isUnscheduled
                ? 'text-orange-500 dark:text-orange-400'
                : isLate
                  ? 'text-destructive'
                  : 'text-green-600 dark:text-green-400'
              const Icon = isUnscheduled ? AlertCircle : isLate ? AlertCircle : CheckCircle2
              return (
                <Card className="relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: color }} />
                  <CardHeader className="pb-0 pt-5 px-5">
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</span>
                      <Icon className="h-4 w-4 opacity-80" style={{ color }} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 pt-2">
                    <div className={`text-3xl font-extrabold tracking-tight ${textCls}`}>{label}</div>
                    <p className="text-xs text-muted-foreground mt-2">delivery status</p>
                  </CardContent>
                </Card>
              )
            })()}

            {/* Deadline */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: '#0ea5e9' }} />
              <CardHeader className="pb-0 pt-5 px-5">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Deadline</span>
                  <CalendarDays className="h-4 w-4 opacity-80" style={{ color: '#0ea5e9' }} />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-2">
                <div className="text-2xl font-extrabold tabular-nums tracking-tight">{wo.estimated_shipping_date.slice(0, 10)}</div>
                <p className="text-xs text-muted-foreground mt-2">requested shipping date</p>
              </CardContent>
            </Card>
          </div>

          {/* WO detail card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Work Order Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Sales Order</dt>
                  <dd className="font-mono font-medium flex items-center gap-1.5">
                    {wo.order_number}
                    <Link
                      to={`/so-lookup?so=${encodeURIComponent(wo.order_number)}`}
                      className="text-primary hover:underline"
                      title="View Sales Order"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Part</dt>
                  <dd className="font-mono text-xs">{wo.finished_goods_part_number}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Department</dt>
                  <dd>{wo.department}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Order Date</dt>
                  <dd>{wo.order_date.slice(0, 10)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Release Date</dt>
                  <dd>{wo.release_date.slice(0, 10)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Deadline</dt>
                  <dd>{wo.estimated_shipping_date.slice(0, 10)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Actual End</dt>
                  <dd className={!wo.on_time && wo.actual_shipping_date ? 'text-destructive font-medium' : ''}>
                    {wo.actual_shipping_date ? wo.actual_shipping_date.slice(0, 10) : <span className="text-muted-foreground">Unscheduled</span>}
                  </dd>
                </div>
                {wo.department !== 'External (Subcontract)' && (
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Work Hours</dt>
                    <dd>{wo.work_hours.toFixed(1)} hrs</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Timeline */}
          {ganttBars.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <GanttChart bars={ganttBars} />
              </CardContent>
            </Card>
          )}

          {/* Day-level allocation (internal only) */}
          {data.allocation.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Daily Allocation</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Hours allocated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.allocation
                        .slice()
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{row.date.slice(0, 10)}</TableCell>
                            <TableCell className="text-right text-xs">{row.hours.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Parent SO — sibling WOs */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold">
                Parent Sales Order: <span className="font-mono">{data.so_number}</span>
              </h3>
              <Badge variant="outline">{data.so_work_orders.length} work order{data.so_work_orders.length !== 1 ? 's' : ''}</Badge>
              <Link
                to={`/so-lookup?so=${encodeURIComponent(data.so_number)}`}
                className="ml-auto text-xs text-primary hover:underline flex items-center gap-1"
              >
                View full SO <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {siblingBars.length > 0 && (
              <Card className="mb-4">
                <CardContent className="pt-4">
                  <GanttChart bars={siblingBars} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>WO #</TableHead>
                        <TableHead>Part</TableHead>
                        <TableHead>Dept</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead>Actual End</TableHead>
                        <TableHead className="text-right">Work hrs</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.so_work_orders.map(row => (
                        <TableRow
                          key={row.work_order_idx}
                          className={row.wo_number === data.wo_number ? 'bg-primary/5' : undefined}
                        >
                          <TableCell className="font-mono text-xs font-medium">
                            {row.wo_number === data.wo_number ? (
                              <span className="flex items-center gap-1">
                                {row.wo_number}
                                <Badge variant="secondary" className="text-[10px] px-1 py-0">this</Badge>
                              </span>
                            ) : (
                              <button
                                className="hover:underline text-primary text-left"
                                onClick={() => { setInput(row.wo_number); setWoNumber(row.wo_number) }}
                              >
                                {row.wo_number}
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.finished_goods_part_number}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`text-xs ${deptBadgeClass(row.department)}`}>
                              {deptShort(row.department)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{row.estimated_shipping_date.slice(0, 10)}</TableCell>
                          <TableCell className="text-xs">
                            {row.actual_shipping_date ? row.actual_shipping_date.slice(0, 10) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {row.department === 'External (Subcontract)' ? <span className="text-muted-foreground">—</span> : row.work_hours.toFixed(1)}
                          </TableCell>
                          <TableCell><StatusBadge row={row} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Data from the most recent schedule run. Re-run from the Dashboard to refresh.
          </p>
        </div>
      )}
    </div>
  )
}
