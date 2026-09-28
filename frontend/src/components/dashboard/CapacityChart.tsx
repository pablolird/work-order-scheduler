import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { AllocationRow } from '@/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  data: AllocationRow[]
}

export default function CapacityChart({ data }: Props) {
  const chartData = Object.values(
    data.reduce<Record<string, { month: string; section1: number; section2: number }>>(
      (acc, row) => {
        const d = new Date(row.date)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!acc[key]) acc[key] = { month: key, section1: 0, section2: 0 }
        if (row.department === 'Production Section 1') acc[key].section1 += row.hours
        else if (row.department === 'Production Section 2') acc[key].section2 += row.hours
        return acc
      },
      {},
    ),
  )
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(d => ({ ...d, section1: Math.round(d.section1), section2: Math.round(d.section2) }))

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Allocated Person-Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No allocation data available.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Monthly Allocated Person-Hours</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis
              tickFormatter={v => v.toLocaleString()}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: unknown) => [`${Number(value).toLocaleString()} hrs`]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="section1"
              name="Section 1"
              fill="#3b82f6"
              opacity={0.85}
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="section2"
              name="Section 2"
              fill="#f97316"
              opacity={0.85}
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
