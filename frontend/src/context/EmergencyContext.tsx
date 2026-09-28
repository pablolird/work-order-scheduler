import { createContext, useContext, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { EmergencyOrder, EmergencyResponse, KPIs } from '@/api/types'

interface EmergencyState {
  emergencyEnabled: boolean
  setEmergencyEnabled: (v: boolean) => void

  pendingOrders: EmergencyOrder[]
  setPendingOrders: (v: EmergencyOrder[]) => void  // marks dirty

  isDirty: boolean
  setIsDirty: (v: boolean) => void

  emergencyResult: EmergencyResponse | null
  setEmergencyResult: (v: EmergencyResponse | null) => void

  latestKPIs: KPIs | null

  runSchedule: () => void
  runWithEmergency: () => void
  clearEmergency: () => void

  isPending: boolean
  isClearPending: boolean
  error: Error | null
}

const EmergencyContext = createContext<EmergencyState | undefined>(undefined)

export function EmergencyProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  const [emergencyEnabled, setEmergencyEnabled] = useState(false)
  const [pendingOrders, _setPendingOrders] = useState<EmergencyOrder[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [emergencyResult, setEmergencyResult] = useState<EmergencyResponse | null>(null)
  const [latestKPIs, setLatestKPIs] = useState<KPIs | null>(null)

  const setPendingOrders = (v: EmergencyOrder[]) => {
    _setPendingOrders(v)
    setIsDirty(true)
  }

  const invalidateWOs = () => queryClient.invalidateQueries({ queryKey: ['work-orders'] })

  const runMutation = useMutation({
    mutationFn: api.runSchedule,
    onSuccess: data => {
      setLatestKPIs(data.kpis)
      setEmergencyResult(null)
      invalidateWOs()
    },
  })

  const batchMutation = useMutation({
    mutationFn: (orders: EmergencyOrder[]) => api.runEmergencyBatch(orders),
    onSuccess: data => {
      setEmergencyResult(data)
      setLatestKPIs(data.kpis)
      setIsDirty(false)
      invalidateWOs()
    },
  })

  const clearMutation = useMutation({
    mutationFn: api.clearEmergency,
    onSuccess: data => {
      setEmergencyResult(null)
      _setPendingOrders([])
      setIsDirty(false)
      setEmergencyEnabled(false)
      setLatestKPIs(data.kpis)
      invalidateWOs()
    },
  })

  const isPending = runMutation.isPending || batchMutation.isPending
  const error = (runMutation.error || batchMutation.error || clearMutation.error) as Error | null

  return (
    <EmergencyContext.Provider
      value={{
        emergencyEnabled,
        setEmergencyEnabled,
        pendingOrders,
        setPendingOrders,
        isDirty,
        setIsDirty,
        emergencyResult,
        setEmergencyResult,
        latestKPIs,
        runSchedule: () => runMutation.mutate(),
        runWithEmergency: () => batchMutation.mutate(pendingOrders),
        clearEmergency: () => clearMutation.mutate(),
        isPending,
        isClearPending: clearMutation.isPending,
        error,
      }}
    >
      {children}
    </EmergencyContext.Provider>
  )
}

export function useEmergency() {
  const ctx = useContext(EmergencyContext)
  if (!ctx) throw new Error('useEmergency must be used within EmergencyProvider')
  return ctx
}
