// Domain: Support (admin)
// Description: Daily activity trend for the admin ops dashboard — bookings created,
//   tickets created, and office-hours attendance over the selected window. Lazy
//   (dynamic, ssr:false); colors via CSS variables + fixed series palette.
'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { useT } from '@/lib/i18n/I18nProvider'
import type { SupportOpsDailyPoint } from '@/types'

const SERIES = [
  { key: 'bookingsCreated', color: '#7C3AED', labelKey: 'admin.supportOps.trend.bookings' },
  { key: 'ticketsCreated', color: '#2563EB', labelKey: 'admin.supportOps.trend.tickets' },
  { key: 'officeHoursAttended', color: '#059669', labelKey: 'admin.supportOps.trend.attendance' },
] as const

export default function SupportOpsTrendChart({ daily }: { daily: SupportOpsDailyPoint[] }) {
  const t = useT()
  const rows = daily.map((d) => ({
    ...d,
    label: (() => {
      try {
        return format(new Date(d.date), 'MMM d')
      } catch {
        return d.date
      }
    })(),
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          stroke="var(--border)"
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          stroke="var(--border)"
        />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--foreground)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={t(s.labelKey)}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
