import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Search, AlertCircle, Clock, CheckCircle2, Package } from 'lucide-react'
import GanttChart, { buildGanttBars } from '@/components/gantt/GanttChart'

function deptShort(dept: string) {
  if (dept === 'Production Section 1') return 'Sec 1'
  if (dept === 'Production Section 2') return 'Sec 2'
  if (dept === 'External (Subcontract)')       return 'EXT'
  return dept
}

function deptBadgeClass(dept: string) {
  if (dept === 'Production Section 1') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
  if (dept === 'Production Section 2') return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
  return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
}

export default function SOLookupPage() {
  const [searchParams] = useSearchParams()
  const [input, setInput] = useState('')
  const [soNumber, setSoNumber] = useState<string | null>(null)

  useEffect(() => {
    const so = searchParams.get('so')
    if (so) { setInput(so); setSoNumber(so) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['so-lookup', soNumber],
    queryFn: () => api.soLookup(soNumber!),
    enabled: soNumber !== null,
    retry: false,
  })

  const handleSearch = () => {
    const trimmed = input.trim()
    if (trimmed) setSoNumber(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  const lateCount = data?.work_orders.filter(r => !r.on_time && r.actual_shipping_date !== null).length ?? 0
  const unscheduledCount = data?.work_orders.filter(r => r.actual_shipping_date === null).length ?? 0
  const onTimeCount = data?.work_orders.filter(r => r.on_time).length ?? 0
  const totalHours = data?.work_orders.reduce((s, r) => s + r.work_hours, 0) ?? 0
  const totalRows = data?.work_orders.length ?? 0
  const onTimePct = totalRows > 0 ? (onTimeCount / totalRows) * 100 : 0
  const latePct   = totalRows > 0 ? (lateCount   / totalRows) * 100 : 0

  const ganttBars = useMemo(
    () => buildGanttBars(data?.work_orders ?? [], data?.allocation ?? []),
    [data],
  )

  // Min alloc date per work_order_idx for start dates in the table
  const startDates = useMemo(() => {
    const map: Record<number, string> = {}
    for (const row of data?.allocation ?? []) {
      const k = row.work_order_idx
      if (!map[k] || row.date < map[k]) map[k] = row.date
    }
    return map
  }, [data])

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Sales Order Lookup</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Enter a Sales Order number to view all linked schedule rows from the current run.
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="e.g. SO-2024-00042"
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
            <p className="font-medium">No results found</p>
            <p className="text-xs mt-0.5 opacity-80">{String(error)}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-base font-semibold font-mono">{data.so_number}</h2>
            <Badge variant="outline">{data.work_orders.length} rows</Badge>
            {lateCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <Clock className="h-3 w-3" />
                {lateCount} late
              </Badge>
            )}
            {unscheduledCount > 0 && (
              <Badge variant="secondary" className="gap-1 text-orange-600">
                {unscheduledCount} unscheduled
              </Badge>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Rows */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: '#6366f1' }} />
              <CardHeader className="pb-0 pt-5 px-5">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rows</span>
                  <Package className="h-4 w-4 opacity-80" style={{ color: '#6366f1' }} />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-2">
                <div className="text-4xl font-extrabold tabular-nums tracking-tight">{data.work_orders.length}</div>
                <p className="text-xs text-muted-foreground mt-2">work orders linked</p>
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
                <div className="text-4xl font-extrabold tabular-nums tracking-tight">{totalHours.toFixed(1)}</div>
                <p className="text-xs text-muted-foreground mt-2">person-hours total</p>
              </CardContent>
            </Card>

            {/* On Time */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: '#22c55e' }} />
              <CardHeader className="pb-0 pt-5 px-5">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">On Time</span>
                  <CheckCircle2 className="h-4 w-4 opacity-80" style={{ color: '#22c55e' }} />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-2">
                <div className="text-4xl font-extrabold tabular-nums tracking-tight text-green-600 dark:text-green-400">{onTimeCount}</div>
                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${onTimePct}%`, background: '#22c55e' }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{onTimePct.toFixed(1)}% on-time rate</p>
              </CardContent>
            </Card>

            {/* Late */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: '#ef4444' }} />
              <CardHeader className="pb-0 pt-5 px-5">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Late</span>
                  <AlertCircle className="h-4 w-4 opacity-80" style={{ color: '#ef4444' }} />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-2">
                <div className={`text-4xl font-extrabold tabular-nums tracking-tight ${lateCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {lateCount}
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${latePct}%`, background: '#ef4444' }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{latePct.toFixed(1)}% late rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Gantt */}
          {ganttBars.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <GanttChart bars={ganttBars} />
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Schedule Rows</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO #</TableHead>
                      <TableHead>Part</TableHead>
                      <TableHead>Dept</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Actual End</TableHead>
                      <TableHead className="text-right">Work hrs</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.work_orders.map(row => {
                      const start = startDates[row.work_order_idx]
                      const isLate = !row.on_time && row.actual_shipping_date !== null
                      const isExternal = row.department === 'External (Subcontract)'
                      return (
                        <TableRow
                          key={row.work_order_idx}
                          className={isLate ? 'bg-destructive/5' : undefined}
                        >
                          <TableCell className="font-mono text-xs font-medium">
                            {row.wo_number}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.finished_goods_part_number}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`text-xs ${deptBadgeClass(row.department)}`}
                            >
                              {deptShort(row.department)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {start ? start.slice(0, 10) : '—'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.estimated_shipping_date.slice(0, 10)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.actual_shipping_date
                              ? row.actual_shipping_date.slice(0, 10)
                              : <span className="text-muted-foreground">unscheduled</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {isExternal ? <span className="text-muted-foreground">—</span> : row.work_hours.toFixed(1)}
                          </TableCell>
                          <TableCell>
                            {row.actual_shipping_date === null ? (
                              <Badge variant="secondary" className="text-xs text-orange-600">
                                Unscheduled
                              </Badge>
                            ) : isLate ? (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <Clock className="h-3 w-3" />
                                Late
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                                On Time
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Separator />
          <p className="text-xs text-muted-foreground">
            Data from the most recent schedule run. Re-run from the Dashboard to refresh.
          </p>
        </div>
      )}
    </div>
  )
}
