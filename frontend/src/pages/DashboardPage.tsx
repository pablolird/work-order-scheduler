import { useMemo, useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useEmergency } from '@/context/EmergencyContext'
import KPICards from '@/components/dashboard/KPICards'
import GanttChart, { buildGanttBars } from '@/components/gantt/GanttChart'
import CapacityChart from '@/components/dashboard/CapacityChart'
import EmergencyOrdersPanel from '@/components/dashboard/EmergencyOrdersPanel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Download, Play, RefreshCw, Trash2, Zap } from 'lucide-react'
import { downloadWOReport } from '@/lib/exportCsv'

export default function DashboardPage() {
  const [reportScope, setReportScope] = useState<'all' | 'internal' | 'external'>('all')
  const [panelOpen, setPanelOpen] = useState(false)

  const {
    emergencyEnabled, setEmergencyEnabled,
    pendingOrders, setPendingOrders,
    isDirty, setIsDirty,
    emergencyResult, setEmergencyResult,
    latestKPIs,
    runSchedule, runWithEmergency, clearEmergency,
    isPending, isClearPending, error,
  } = useEmergency()

  const { data: woData, isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: api.workOrders,
  })

  const parts = useMemo(() => {
    const set = new Set(woData?.results.map(r => r.finished_goods_part_number) ?? [])
    return [...set].sort()
  }, [woData])

  const partDepts = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of woData?.results ?? []) {
      map[r.finished_goods_part_number] = r.department
    }
    return map
  }, [woData])

  const handleRun = useCallback(() => {
    if (emergencyEnabled && pendingOrders.length > 0) {
      runWithEmergency()
    } else {
      runSchedule()
    }
  }, [emergencyEnabled, pendingOrders.length, runWithEmergency, runSchedule])

  const handleToggleEmergency = (enabled: boolean) => {
    setEmergencyEnabled(enabled)
    if (!enabled) setEmergencyResult(null)
  }

  const results = woData?.results ?? []
  const alloc = woData?.allocation ?? []
  const frozenZones = woData?.frozen_zones ?? []
  const currentKPIs = latestKPIs ?? woData?.kpis ?? null

  // Restore full emergency state after a page reload if the backend still has active emergency orders
  useEffect(() => {
    const active = woData?.active_emergencies
    if (!active || active.length === 0 || emergencyEnabled) return
    const emgNumbers = active.map(e => e.order_number)
    const emergencyRows  = woData!.results.filter(r => emgNumbers.includes(r.order_number))
    const emergencyAlloc = woData!.allocation.filter(r => emgNumbers.includes(r.order_number))
    setEmergencyEnabled(true)
    setPendingOrders(active)    // marks dirty=true first…
    setIsDirty(false)           // …then clear it — these match what was run
    setEmergencyResult({
      kpis:                 woData!.kpis,
      emergency_results:    emergencyRows,
      emergency_allocation: emergencyAlloc,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woData, emergencyEnabled])

  const ganttBars = useMemo(() => buildGanttBars(results, alloc), [results, alloc])

  const emergencySONumbers = useMemo(
    () => emergencyEnabled && emergencyResult
      ? [...new Set(emergencyResult.emergency_results.map(r => r.order_number))]
      : [],
    [emergencyEnabled, emergencyResult],
  )

  const emergencyBars = useMemo(() => {
    if (!emergencyResult) return []
    return buildGanttBars(emergencyResult.emergency_results, emergencyResult.emergency_allocation)
  }, [emergencyResult])

  const isEmergencyActive = emergencyResult !== null && emergencyBars.length > 0

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 border-r bg-muted/30 flex flex-col overflow-y-auto">
        <div className="p-4 space-y-5">
          <div>
            <h2 className="text-sm font-semibold mb-1">Schedule Controls</h2>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Moore-Hodgson preemptive EDF scheduler
            </p>
          </div>

          <Separator />

          {/* Emergency toggle + panel */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Emergency Orders</Label>
              <button
                onClick={() => handleToggleEmergency(!emergencyEnabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${emergencyEnabled ? 'bg-red-500' : 'bg-muted'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${emergencyEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {emergencyEnabled && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setPanelOpen(true)}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                Configure Emergency Orders
                {pendingOrders.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">{pendingOrders.length}</Badge>
                )}
              </Button>
            )}

            {emergencyEnabled && isDirty && pendingOrders.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                Changes pending — re-run to apply
              </div>
            )}
          </div>

          <EmergencyOrdersPanel
            open={panelOpen}
            onOpenChange={setPanelOpen}
            parts={parts}
            partDepts={partDepts}
          />

          <Separator />

          <div className="space-y-2">
            <Button
              onClick={handleRun}
              disabled={isPending || (emergencyEnabled && pendingOrders.length === 0)}
              className="w-full gap-2 relative"
              variant={emergencyEnabled ? 'destructive' : 'default'}
            >
              {isPending && !isClearPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Running…
                </>
              ) : emergencyEnabled ? (
                <>
                  <Zap className="h-4 w-4" />
                  Run with Emergency
                  {isDirty && (
                    <span className="ml-1 flex h-2 w-2 rounded-full bg-amber-300 animate-pulse" title="Pending changes" />
                  )}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Re-run Schedule
                </>
              )}
            </Button>

            {isEmergencyActive && (
              <Button
                onClick={() => clearEmergency()}
                disabled={isPending || isClearPending}
                variant="outline"
                size="sm"
                className="w-full gap-2 text-muted-foreground"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isClearPending ? 'Clearing…' : 'Clear Emergency Orders'}
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
              {String(error)}
            </div>
          )}

          {isEmergencyActive && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive space-y-1">
              <div className="font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Emergency orders active
              </div>
              <div>{emergencyBars.length} WO{emergencyBars.length !== 1 ? 's' : ''} inserted ({emergencySONumbers.length} SO{emergencySONumbers.length !== 1 ? 's' : ''})</div>
              {emergencyBars[0] && (
                <div>Earliest start {emergencyBars[0].start_date.slice(0, 10)}</div>
              )}
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Download Report</h2>
            <Select value={reportScope} onValueChange={v => setReportScope(v as typeof reportScope)}>
              <SelectTrigger className="w-full h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All work orders</SelectItem>
                <SelectItem value="internal">Internal only</SelectItem>
                <SelectItem value="external">External (Subcontract) only</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              disabled={!woData || isLoading}
              onClick={() => downloadWOReport(results, woData!.allocation, reportScope)}
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">
                {isEmergencyActive ? 'Emergency Recalculation' : 'Current Schedule'}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isEmergencyActive
                  ? `Schedule with ${emergencySONumbers.length} emergency SO${emergencySONumbers.length !== 1 ? 's' : ''}.`
                  : 'Rolling Moore-Hodgson schedule. Press Re-run to refresh.'}
              </p>
            </div>
            {isEmergencyActive && (
              <Badge variant="destructive" className="gap-1">
                <Zap className="h-3 w-3" /> Emergency
              </Badge>
            )}
          </div>

          {/* KPIs */}
          {isLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : currentKPIs ? (
            <KPICards kpis={currentKPIs} />
          ) : null}

          {/* Tabs */}
          <Tabs defaultValue="gantt">
            <TabsList>
              <TabsTrigger value="gantt">Gantt Chart</TabsTrigger>
              {isEmergencyActive && (
                <TabsTrigger value="emergency">Emergency Impact</TabsTrigger>
              )}
              <TabsTrigger value="capacity">Capacity</TabsTrigger>
            </TabsList>

            <TabsContent value="gantt" className="mt-4">
              {isLoading ? (
                <Skeleton className="h-96" />
              ) : (
                <GanttChart bars={ganttBars} emergencySONumbers={emergencySONumbers} frozenZones={frozenZones} />
              )}
            </TabsContent>

            {isEmergencyActive && (
              <TabsContent value="emergency" className="mt-4">
                <div className="space-y-4">
                  {(() => {
                    const isLate   = emergencyBars.some(b => !b.on_time)
                    const totalHrs = emergencyBars.reduce((s, b) => s + b.work_hours, 0)
                    const latestEnd = emergencyBars
                      .reduce((m, b) => (b.end_date > m ? b.end_date : m), '')
                      .slice(0, 10)
                    return (
                      <div className="grid grid-cols-4 gap-4">
                        {/* Inserted */}
                        <Card className="relative overflow-hidden">
                          <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: '#0d9488' }} />
                          <CardHeader className="pb-0 pt-5 px-5">
                            <CardTitle className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inserted</span>
                              <Zap className="h-4 w-4 opacity-80" style={{ color: '#0d9488' }} />
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-5 pb-5 pt-2">
                            <div className="text-5xl font-extrabold tabular-nums tracking-tight" style={{ color: '#0d9488' }}>{emergencyBars.length}</div>
                            <p className="text-xs text-muted-foreground mt-2">emergency work order{emergencyBars.length !== 1 ? 's' : ''}</p>
                          </CardContent>
                        </Card>

                        {/* Work Hours */}
                        <Card className="relative overflow-hidden">
                          <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: '#d97706' }} />
                          <CardHeader className="pb-0 pt-5 px-5">
                            <CardTitle className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Work Hours</span>
                              <Clock className="h-4 w-4 opacity-80" style={{ color: '#d97706' }} />
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-5 pb-5 pt-2">
                            <div className="text-5xl font-extrabold tabular-nums tracking-tight" style={{ color: '#d97706' }}>{totalHrs.toFixed(1)}</div>
                            <p className="text-xs text-muted-foreground mt-2">person-hours consumed</p>
                          </CardContent>
                        </Card>

                        {/* On Time */}
                        <Card className="relative overflow-hidden">
                          <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: isLate ? '#f43f5e' : '#10b981' }} />
                          <CardHeader className="pb-0 pt-5 px-5">
                            <CardTitle className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">On Time?</span>
                              {isLate
                                ? <AlertTriangle className="h-4 w-4 opacity-80" style={{ color: '#f43f5e' }} />
                                : <CheckCircle2 className="h-4 w-4 opacity-80" style={{ color: '#10b981' }} />}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-5 pb-5 pt-2">
                            <div className="text-5xl font-extrabold tracking-tight" style={{ color: isLate ? '#f43f5e' : '#10b981' }}>
                              {isLate ? 'No' : 'Yes'}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">{isLate ? 'will miss deadline' : 'meets deadline'}</p>
                          </CardContent>
                        </Card>

                        {/* Latest End */}
                        <Card className="relative overflow-hidden">
                          <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: '#0ea5e9' }} />
                          <CardHeader className="pb-0 pt-5 px-5">
                            <CardTitle className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Latest End</span>
                              <CalendarDays className="h-4 w-4 opacity-80" style={{ color: '#0ea5e9' }} />
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-5 pb-5 pt-2">
                            <div className="text-3xl font-extrabold tabular-nums tracking-tight" style={{ color: '#0ea5e9' }}>{latestEnd || '—'}</div>
                            <p className="text-xs text-muted-foreground mt-2">last completion date</p>
                          </CardContent>
                        </Card>
                      </div>
                    )
                  })()}
                  <GanttChart
                    bars={emergencyBars}
                    emergencySONumbers={emergencySONumbers}
                    title="Emergency Order Timeline"
                  />

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Emergency Order Details</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
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
                          {emergencyResult!.emergency_results.map(row => {
                            const bar = emergencyBars.find(b => b.id === String(row.work_order_idx))
                            const isLate = !row.on_time && row.actual_shipping_date !== null
                            return (
                              <TableRow key={row.work_order_idx} className={isLate ? 'bg-destructive/5' : undefined}>
                                <TableCell className="font-mono text-xs font-medium">{row.wo_number}</TableCell>
                                <TableCell className="font-mono text-xs">{row.finished_goods_part_number}</TableCell>
                                <TableCell className="text-xs">{row.department}</TableCell>
                                <TableCell className="text-xs">{bar?.start_date.slice(0, 10) ?? '—'}</TableCell>
                                <TableCell className="text-xs">{row.estimated_shipping_date.slice(0, 10)}</TableCell>
                                <TableCell className="text-xs">
                                  {row.actual_shipping_date
                                    ? row.actual_shipping_date.slice(0, 10)
                                    : <span className="text-muted-foreground">unscheduled</span>}
                                </TableCell>
                                <TableCell className="text-right text-xs">{row.work_hours.toFixed(1)}</TableCell>
                                <TableCell>
                                  {row.actual_shipping_date === null ? (
                                    <Badge variant="secondary" className="text-xs text-orange-600">Unscheduled</Badge>
                                  ) : isLate ? (
                                    <Badge variant="destructive" className="text-xs gap-1"><Clock className="h-3 w-3" />Late</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs text-green-700">On Time</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}

            <TabsContent value="capacity" className="mt-4">
              {isLoading ? (
                <Skeleton className="h-96" />
              ) : (
                <CapacityChart data={alloc} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
