import type {
  WorkOrdersResponse,
  EmergencyOrder,
  EmergencyResponse,
  KPIs,
  SOLookupResponse,
  WOLookupResponse,
} from './types'

const BASE = 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GET ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DELETE ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

export const api = {
  health: () =>
    get<{ status: string; scheduled_work_orders: number; emergency_orders_active: number }>('/health'),
  workOrders: () => get<WorkOrdersResponse>('/work-orders'),
  runSchedule: () => post<{ kpis: KPIs }>('/schedule/run'),
  addEmergency: (emg: EmergencyOrder) => post<EmergencyResponse>('/schedule/emergency', emg),
  runEmergencyBatch: (orders: EmergencyOrder[]) =>
    post<EmergencyResponse>('/schedule/emergency/batch', { orders }),
  clearEmergency: () => del<{ kpis: KPIs }>('/schedule/emergency'),
  soLookup: (soNumber: string) =>
    get<SOLookupResponse>(`/orders/${encodeURIComponent(soNumber)}`),
  woLookup: (woNumber: string) =>
    get<WOLookupResponse>(`/work-orders/${encodeURIComponent(woNumber)}`),
}
