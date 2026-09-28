export interface ResultRow {
  work_order_idx: number
  wo_number: string
  order_number: string
  finished_goods_part_number: string
  department: string
  order_date: string
  release_date: string
  estimated_shipping_date: string
  actual_shipping_date: string | null
  work_hours: number
  order_quantity: number
  on_time: boolean
}

export interface AllocationRow {
  work_order_idx: number
  order_number: string
  finished_goods_part_number: string
  department: string
  deadline: string
  date: string
  hours: number
  on_time: boolean
}

export interface KPIs {
  total: number
  on_time: number
  late: number
  late_rate: number
  unscheduled: number
}

export interface EmergencyOrder {
  order_number: string
  finished_goods_part: string
  order_quantity: number
  order_date: string
  shipping_date: string
  department: string
  standard_seconds: number
  effective_lt: number
}

export interface FrozenZone {
  start: string
  end: string
  department: string
}

export interface WorkOrdersResponse {
  kpis: KPIs
  results: ResultRow[]
  allocation: AllocationRow[]
  frozen_zones: FrozenZone[]
  active_emergencies: EmergencyOrder[]
}

export interface EmergencyResponse {
  kpis: KPIs
  emergency_results: ResultRow[]
  emergency_allocation: AllocationRow[]
}

export interface SOLookupResponse {
  so_number: string
  work_orders: ResultRow[]
  allocation: AllocationRow[]
}

export interface WOLookupResponse {
  wo_number: string
  work_order: ResultRow
  allocation: AllocationRow[]
  so_number: string
  so_work_orders: ResultRow[]
}
