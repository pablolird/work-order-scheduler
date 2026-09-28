import { useRef, useState, useMemo, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertTriangle, Pencil, Trash2, Plus, X, Check } from 'lucide-react'
import { useEmergency } from '@/context/EmergencyContext'
import type { EmergencyOrder } from '@/api/types'

const DEFAULT_ORDER_DATE = '2024-03-01'

function deptShort(dept: string) {
  return dept === 'Production Section 1' ? 'Sec 1' : 'Sec 2'
}

function makeDefaultOrder(parts: string[], partDepts: Record<string, string>): EmergencyOrder {
  const d = new Date(DEFAULT_ORDER_DATE)
  d.setDate(d.getDate() + 21)
  const part = parts[0] ?? ''
  return {
    order_number: 'EMG-SO-0001',
    finished_goods_part: part,
    order_quantity: 500,
    order_date: DEFAULT_ORDER_DATE,
    shipping_date: d.toISOString().slice(0, 10),
    department: partDepts[part] ?? 'Production Section 2',
    standard_seconds: 120,
    effective_lt: 0,
  }
}

// ── Searchable part picker ────────────────────────────────────────────────────
function PartPicker({ parts, value, onChange }: { parts: string[]; value: string; onChange: (v: string) => void }) {
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

  useEffect(() => { setFilter(value) }, [value])

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={filter}
        placeholder="Type to filter parts…"
        onChange={e => { setFilter(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="text-xs h-8"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {visible.length === 0
            ? <div className="px-3 py-2 text-xs text-muted-foreground">No parts match</div>
            : visible.map(p => (
              <button
                key={p}
                type="button"
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors ${p === value ? 'font-semibold bg-accent/50' : ''}`}
                onMouseDown={() => { onChange(p); setFilter(p); setOpen(false) }}
              >
                {p}
              </button>
            ))}
          {parts.filter(p => p.toLowerCase().includes(filter.toLowerCase())).length > 50 && (
            <div className="px-3 py-1 text-[10px] text-muted-foreground border-t">
              Showing 50 of {parts.filter(p => p.toLowerCase().includes(filter.toLowerCase())).length} — type more to narrow
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Inline row form ───────────────────────────────────────────────────────────
function OrderForm({
  form,
  parts,
  partDepts,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  form: EmergencyOrder
  parts: string[]
  partDepts: Record<string, string>
  onChange: (updated: EmergencyOrder) => void
  onSave: () => void
  onCancel: () => void
  saveLabel: string
}) {
  const set = <K extends keyof EmergencyOrder>(k: K, v: EmergencyOrder[K]) =>
    onChange({ ...form, [k]: v })

  const naturalDept = form.finished_goods_part ? partDepts[form.finished_goods_part] : undefined

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">SO Number</Label>
          <Input
            value={form.order_number}
            onChange={e => set('order_number', e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Department</Label>
          <Select value={form.department} onValueChange={v => set('department', v)}>
            <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
            <SelectContent className="w-[var(--radix-select-trigger-width)]">
              <SelectItem value="Production Section 1" className="text-xs">Sec 1</SelectItem>
              <SelectItem value="Production Section 2" className="text-xs">Sec 2</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1">
        <Label className="text-xs">Part Number</Label>
        <PartPicker
          parts={parts}
          value={form.finished_goods_part}
          onChange={v => onChange({ ...form, finished_goods_part: v, department: partDepts[v] ?? form.department })}
        />
        {naturalDept && naturalDept !== form.department && (
          <p className="text-[11px] text-amber-600">
            This part is normally in {naturalDept}; you've overridden to {form.department}.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">Quantity</Label>
          <Input type="number" min={1} value={form.order_quantity} onChange={e => set('order_quantity', Number(e.target.value))} className="h-8 text-xs" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Std Sec / Unit</Label>
          <Input type="number" min={1} step={10} value={form.standard_seconds} onChange={e => set('standard_seconds', Number(e.target.value))} className="h-8 text-xs" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Eff LT (days)</Label>
          <Input type="number" min={0} max={60} value={form.effective_lt} onChange={e => set('effective_lt', Number(e.target.value))} className="h-8 text-xs" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">Order Date</Label>
          <Input type="date" value={form.order_date} onChange={e => set('order_date', e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Shipping Date</Label>
          <Input type="date" value={form.shipping_date} onChange={e => set('shipping_date', e.target.value)} className="h-8 text-xs" />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5">
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={onSave} className="gap-1.5">
          <Check className="h-3.5 w-3.5" /> {saveLabel}
        </Button>
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  parts: string[]
  partDepts: Record<string, string>
}

export default function EmergencyOrdersPanel({ open, onOpenChange, parts, partDepts }: Props) {
  const { pendingOrders, setPendingOrders, isDirty } = useEmergency()

  // editingIdx: index in pendingOrders being edited, or -1 when adding new, or null when no form open
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EmergencyOrder>(makeDefaultOrder(parts, partDepts))

  const openAdd = () => {
    setEditForm(makeDefaultOrder(parts, partDepts))
    setEditingIdx(-1)
  }

  const openEdit = (idx: number) => {
    setEditForm({ ...pendingOrders[idx] })
    setEditingIdx(idx)
  }

  const cancelEdit = () => setEditingIdx(null)

  const saveEdit = () => {
    if (editingIdx === -1) {
      setPendingOrders([...pendingOrders, editForm])
    } else {
      const next = [...pendingOrders]
      next[editingIdx!] = editForm
      setPendingOrders(next)
    }
    setEditingIdx(null)
  }

  const deleteRow = (idx: number) => {
    setPendingOrders(pendingOrders.filter((_, i) => i !== idx))
    if (editingIdx === idx) setEditingIdx(null)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Emergency Orders
            {pendingOrders.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingOrders.length}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Dirty warning */}
          {isDirty && pendingOrders.length > 0 && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              Pending changes — close this panel and press <span className="font-semibold mx-0.5">Run with Emergency</span> to update the schedule.
            </div>
          )}

          {/* Empty state */}
          {pendingOrders.length === 0 && editingIdx === null && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No emergency orders yet. Click <span className="font-medium">Add Order</span> to insert one.
            </div>
          )}

          {/* Orders table */}
          {pendingOrders.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs py-2">SO #</TableHead>
                    <TableHead className="text-xs py-2">Part</TableHead>
                    <TableHead className="text-xs py-2">Dept</TableHead>
                    <TableHead className="text-xs py-2 text-right">Qty</TableHead>
                    <TableHead className="text-xs py-2">Order Date</TableHead>
                    <TableHead className="text-xs py-2">Ship Date</TableHead>
                    <TableHead className="text-xs py-2 w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingOrders.map((order, i) => (
                    <TableRow key={i} className={editingIdx === i ? 'bg-primary/5' : undefined}>
                      <TableCell className="font-mono text-xs py-2">{order.order_number}</TableCell>
                      <TableCell className="font-mono text-xs py-2 max-w-[120px] truncate">{order.finished_goods_part}</TableCell>
                      <TableCell className="text-xs py-2">
                        <Badge variant="secondary" className={`text-[10px] px-1.5 ${order.department === 'Production Section 1' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'}`}>
                          {deptShort(order.department)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2 text-right tabular-nums">{order.order_quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-xs py-2 tabular-nums">{order.order_date}</TableCell>
                      <TableCell className="text-xs py-2 tabular-nums">{order.shipping_date}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => editingIdx === i ? cancelEdit() : openEdit(i)}
                            className="p-1 rounded hover:bg-accent transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => deleteRow(i)}
                            className="p-1 rounded hover:bg-destructive/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Inline form */}
          {editingIdx !== null && (
            <OrderForm
              form={editForm}
              parts={parts}
              partDepts={partDepts}
              onChange={setEditForm}
              onSave={saveEdit}
              onCancel={cancelEdit}
              saveLabel={editingIdx === -1 ? 'Add Order' : 'Save Changes'}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 flex items-center justify-between bg-muted/20">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={openAdd}
            disabled={editingIdx !== null}
          >
            <Plus className="h-3.5 w-3.5" /> Add Order
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
