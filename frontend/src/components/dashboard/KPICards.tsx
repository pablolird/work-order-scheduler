import { CheckCircle2, AlertCircle, AlertTriangle, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { KPIs } from '@/api/types'

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  )
}

function KPICard({
  title,
  value,
  sub,
  icon,
  accentColor,
  valueColor,
  progress,
  progressColor,
}: {
  title: string
  value: string
  sub?: string
  icon: React.ReactNode
  accentColor: string
  valueColor?: string
  progress?: number
  progressColor?: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: accentColor }} />
      <CardHeader className="pb-0 pt-5 px-5">
        <CardTitle className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
          <span style={{ color: accentColor }} className="opacity-80">{icon}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-2">
        <div className={`text-5xl font-extrabold tabular-nums tracking-tight ${valueColor ?? 'text-foreground'}`}>
          {value}
        </div>
        {progress !== undefined && progressColor && (
          <ProgressBar value={progress} color={progressColor} />
        )}
        {sub && (
          <p className="text-xs text-muted-foreground mt-2 leading-snug">{sub}</p>
        )}
      </CardContent>
    </Card>
  )
}

interface Props {
  kpis: KPIs
}

export default function KPICards({ kpis }: Props) {
  const onTimePct  = kpis.total > 0 ? (kpis.on_time / kpis.total) * 100 : 0
  const latePct    = kpis.total > 0 ? (kpis.late    / kpis.total) * 100 : 0
  const scheduled  = kpis.total - kpis.unscheduled

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Total Orders"
        value={kpis.total.toLocaleString()}
        icon={<Package className="h-4 w-4" />}
        accentColor="#6366f1"
        sub={`${scheduled.toLocaleString()} scheduled · ${kpis.unscheduled} unscheduled`}
      />
      <KPICard
        title="On Time"
        value={kpis.on_time.toLocaleString()}
        icon={<CheckCircle2 className="h-4 w-4" />}
        accentColor="#22c55e"
        valueColor="text-green-600 dark:text-green-400"
        progress={onTimePct}
        progressColor="#22c55e"
        sub={`${onTimePct.toFixed(1)}% of all orders`}
      />
      <KPICard
        title="Late"
        value={kpis.late.toLocaleString()}
        icon={<AlertCircle className="h-4 w-4" />}
        accentColor="#ef4444"
        valueColor={kpis.late > 0 ? 'text-destructive' : 'text-muted-foreground'}
        progress={latePct}
        progressColor="#ef4444"
        sub={`${latePct.toFixed(1)}% late rate`}
      />
      <KPICard
        title="Unscheduled"
        value={kpis.unscheduled.toLocaleString()}
        icon={<AlertTriangle className="h-4 w-4" />}
        accentColor={kpis.unscheduled > 0 ? '#f97316' : '#94a3b8'}
        valueColor={kpis.unscheduled > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-muted-foreground'}
        sub="orders not placed into production"
      />
    </div>
  )
}
