import type { ResultRow, AllocationRow } from '@/api/types'

type ReportScope = 'all' | 'internal' | 'external'

const DEPT_META: Record<string, { section: string; dept_code: string; dept_name: string }> = {
  'Production Section 1': { section: 'section1', dept_code: '1', dept_name: 'Production Section 1' },
  'Production Section 2': { section: 'section2', dept_code: '2', dept_name: 'Production Section 2' },
  'External (Subcontract)':       { section: 'external',  dept_code: '9', dept_name: 'External (Subcontract)' },
}

const INTERNAL_HEADERS = [
  'wo_number', 'so_number', 'finished_goods_part', 'wo_quantity', 'original_so_quantity',
  'unit', 'man_hours', 'section', 'dept_code', 'dept_name',
  'start_date', 'end_date', 'scheduled_year', 'scheduled_month',
  'shipping_date', 'order_date', 'split_seq', 'is_split', 'is_late', 'status',
  'duration_days', 'requested_shipping_date',
]

const EXTERNAL_HEADERS = [
  'wo_number', 'so_number', 'finished_goods_part', 'wo_quantity', 'original_so_quantity',
  'unit', 'man_hours', 'section', 'dept_code', 'dept_name',
  'start_date', 'end_date', 'scheduled_year', 'scheduled_month',
  'shipping_date', 'requested_shipping_date', 'order_date', 'split_seq', 'is_split', 'is_late', 'status',
]

function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay) + 1
}

function buildRow(r: ResultRow, startDate: string, headers: string[]): string {
  const meta  = DEPT_META[r.department] ?? { section: '', dept_code: '', dept_name: '' }
  const end   = (r.actual_shipping_date ?? '').slice(0, 10)
  const start = startDate.slice(0, 10)
  const year  = start ? new Date(start).getFullYear() : ''
  const month = start ? new Date(start).getMonth() + 1 : ''

  let status: string
  if (r.department === 'External (Subcontract)') status = 'external'
  else if (!r.actual_shipping_date)      status = 'unscheduled'
  else                                   status = 'scheduled'

  const duration = start && end ? daysBetween(start, end) : ''

  const values: Record<string, string | number> = {
    wo_number:              r.wo_number,
    so_number:              r.order_number,
    finished_goods_part:    r.finished_goods_part_number,
    wo_quantity:            r.order_quantity,
    original_so_quantity:   r.order_quantity,
    unit:                   'PC',
    man_hours:              r.work_hours,
    section:                meta.section,
    dept_code:              meta.dept_code,
    dept_name:              meta.dept_name,
    start_date:             start,
    end_date:               end,
    scheduled_year:         year,
    scheduled_month:        month,
    shipping_date:          end,
    requested_shipping_date: r.estimated_shipping_date.slice(0, 10),
    order_date:             r.order_date.slice(0, 10),
    split_seq:              1,
    is_split:               'False',
    is_late:                r.on_time ? 'False' : 'True',
    status,
    duration_days:          duration,
  }

  return headers.map(h => String(values[h] ?? '')).join(',')
}

export function downloadWOReport(
  results: ResultRow[],
  allocation: AllocationRow[],
  scope: ReportScope,
): void {
  // Build min alloc date per WO
  const minDate: Record<number, string> = {}
  for (const row of allocation) {
    const d = row.date.slice(0, 10)
    if (!minDate[row.work_order_idx] || d < minDate[row.work_order_idx]) {
      minDate[row.work_order_idx] = d
    }
  }

  const isExternal = (r: ResultRow) => r.department === 'External (Subcontract)'

  const filtered = results.filter(r => {
    if (scope === 'internal') return !isExternal(r)
    if (scope === 'external') return isExternal(r)
    return true
  })

  // For "all" use internal header order (matches wo_all.csv)
  // For "external" use the external-specific header order
  const useExternalHeaders = scope === 'external'
  const headers = useExternalHeaders ? EXTERNAL_HEADERS : INTERNAL_HEADERS

  const lines = [
    headers.join(','),
    ...filtered.map(r => {
      const start = minDate[r.work_order_idx] ?? r.release_date.slice(0, 10)
      const rowHeaders = isExternal(r) && scope !== 'external' ? INTERNAL_HEADERS : headers
      return buildRow(r, start, rowHeaders)
    }),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const filename = scope === 'all' ? 'wo_all.csv' : scope === 'internal' ? 'wo_internal.csv' : 'wo_external.csv'
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
