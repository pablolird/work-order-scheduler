import { useRef, useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle } from 'lucide-react'
import type { EmergencyOrder } from '@/api/types'

const DEPARTMENTS = ['Production Section 1', 'Production Section 2'] as const
const DEFAULT_ORDER_DATE = '2024-03-01'

interface Props {
  parts: string[]
  partDepts: Record<string, string>
  onConfirm: (order: EmergencyOrder) => void
  onCancel: () => void
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

function PartPicker({
  parts,
  value,
  onChange,
}: {
  parts: string[]
  value: string
  onChange: (v: string) => void
}) {
  const [filter, setFilter] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(
    () => parts.filter(p => p.toLowerCase().includes(filter.toLowerCase())).slice(0, 50),
    [parts, filter],
  )

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setFilter(value)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, value])

  const select = (p: string) => {
    onChange(p)
    setFilter(p)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={filter}
        placeholder="Type to filter parts…"
        onChange={e => {
          setFilter(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        className="text-sm"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {visible.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No parts match</div>
          ) : (
            visible.map(p => (
              <button
                key={p}
                type="button"
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors ${p === value ? 'font-semibold bg-accent/50' : ''}`}
                onMouseDown={() => select(p)}
              >
                {p}
              </button>
            ))
          )}
          {parts.filter(p => p.toLowerCase().includes(filter.toLowerCase())).length > 50 && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
              Showing 50 of {parts.filter(p => p.toLowerCase().includes(filter.toLowerCase())).length} — type more to narrow
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function deptLabel(dept: string) {
  return dept === 'Production Section 1' ? 'Sec 1' : 'Sec 2'
}

export default function EmergencyOrderDialog({
  parts,
  partDepts,
  onConfirm,
  onCancel,
  enabled,
  onToggle,
}: Props) {
  const defaultShip = (() => {
    const d = new Date(DEFAULT_ORDER_DATE)
    d.setDate(d.getDate() + 21)
    return d.toISOString().slice(0, 10)
  })()

  const [form, setForm] = useState<EmergencyOrder>({
    order_number: 'EMG-SO-0001',
    finished_goods_part: parts[0] ?? '',
    order_quantity: 500,
    order_date: DEFAULT_ORDER_DATE,
    shipping_date: defaultShip,
    department: 'Production Section 2',
    standard_seconds: 120,
    effective_lt: 0,
  })

  // Sync first part when parts list arrives
  useEffect(() => {
    if (parts.length > 0 && !form.finished_goods_part) {
      setForm(f => ({ ...f, finished_goods_part: parts[0] }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts])

  const set = <K extends keyof EmergencyOrder>(k: K, v: EmergencyOrder[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const naturalDept = form.finished_goods_part ? partDepts[form.finished_goods_part] : undefined

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Emergency Order</Label>
        <button
          onClick={() => {
            onToggle(!enabled)
            if (enabled) onCancel()
          }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-red-500' : 'bg-muted'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      {enabled && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm" className="w-full gap-2">
              <AlertTriangle className="h-4 w-4" />
              Configure Emergency Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Emergency Order Details
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="eo-so">SO Number</Label>
                <Input
                  id="eo-so"
                  value={form.order_number}
                  onChange={e => set('order_number', e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label>Part Number</Label>
                <PartPicker
                  parts={parts}
                  value={form.finished_goods_part}
                  onChange={v => {
                    const dept = partDepts[v]
                    setForm(f => ({
                      ...f,
                      finished_goods_part: v,
                      ...(dept ? { department: dept } : {}),
                    }))
                  }}
                />
                {naturalDept && naturalDept !== form.department && (
                  <p className="text-[11px] text-amber-600">
                    This part is normally in {naturalDept}. You've overridden it to {form.department}.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="eo-qty">Quantity</Label>
                  <Input
                    id="eo-qty"
                    type="number"
                    min={1}
                    value={form.order_quantity}
                    onChange={e => set('order_quantity', Number(e.target.value))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="eo-dept">Department</Label>
                  <Select value={form.department} onValueChange={v => set('department', v)}>
                    <SelectTrigger id="eo-dept">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map(d => (
                        <SelectItem key={d} value={d}>{deptLabel(d)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="eo-odate">Order Date</Label>
                  <Input
                    id="eo-odate"
                    type="date"
                    value={form.order_date}
                    onChange={e => set('order_date', e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="eo-ship">Shipping Date</Label>
                  <Input
                    id="eo-ship"
                    type="date"
                    value={form.shipping_date}
                    onChange={e => set('shipping_date', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="eo-secs">Std. Seconds/Unit</Label>
                  <Input
                    id="eo-secs"
                    type="number"
                    min={1}
                    step={10}
                    value={form.standard_seconds}
                    onChange={e => set('standard_seconds', Number(e.target.value))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="eo-lt">Effective LT (days)</Label>
                  <Input
                    id="eo-lt"
                    type="number"
                    min={0}
                    max={60}
                    value={form.effective_lt}
                    onChange={e => set('effective_lt', Number(e.target.value))}
                  />
                </div>
              </div>

              <Button onClick={() => onConfirm(form)} className="w-full">
                Apply Emergency Order
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {enabled && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive space-y-0.5">
          <div className="font-medium">{form.order_number}</div>
          <div>{form.finished_goods_part || <span className="opacity-60">no part selected</span>}</div>
          <div>
            {form.order_quantity.toLocaleString()} units · {deptLabel(form.department)} · ships{' '}
            {form.shipping_date}
          </div>
        </div>
      )}
    </div>
  )
}
