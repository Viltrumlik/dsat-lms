// Domain: Support
// Description: Bar chart of bookings by status. Loaded lazily (next/dynamic,
//   ssr:false) so Recharts stays out of the server bundle.
'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useT } from '@/lib/i18n/I18nProvider'
import type { SupportBookingKpis } from '@/types'

const STATUS = [
  { key: 'pending', color: '#F59E0B' },
  { key: 'confirmed', color: '#7C3AED' },
  { key: 'completed', color: '#059669' },
  { key: 'cancelled', color: '#9CA3AF' },
  { key: 'no_show', color: '#DC2626' },
] as const

export default function SupportBookingsChart({
  byStatus,
}: {
  byStatus: SupportBookingKpis['byStatus']
}) {
  const t = useT()
  const counts: Record<string, number> = {
    pending: byStatus.pending,
    confirmed: byStatus.confirmed,
    completed: byStatus.completed,
    cancelled: byStatus.cancelled,
    no_show: byStatus.noShow,
  }
  const rows = STATUS.map((s) => ({
    name: t(`support.status.${s.key}`),
    count: counts[s.key],
    color: s.color,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          stroke="var(--border)"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          stroke="var(--border)"
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--foreground)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={40} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
