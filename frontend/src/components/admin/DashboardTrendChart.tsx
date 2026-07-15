// Domain: Analytics (admin)
// Description: Daily platform-flow trend for the executive dashboard — new
//   registrations, exams taken, and homework submitted over the window. Lazy
//   (dynamic, ssr:false); colors via CSS variables + a fixed series palette.
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
import type { DashboardTrendPoint } from '@/types'

const SERIES = [
  { key: 'newRegistrations', color: '#7C3AED', labelKey: 'admin.dashboard.trend.registrations' },
  { key: 'examsTaken', color: '#2563EB', labelKey: 'admin.dashboard.trend.exams' },
  { key: 'homeworkSubmitted', color: '#059669', labelKey: 'admin.dashboard.trend.homework' },
] as const

export default function DashboardTrendChart({ trends }: { trends: DashboardTrendPoint[] }) {
  const t = useT()
  const rows = trends.map((d) => ({
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
