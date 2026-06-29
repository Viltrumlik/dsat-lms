// Domain: Analytics
// Description: Horizontal bar chart of accuracy per category, colored by module.
//   Loaded lazily (next/dynamic, ssr:false) so Recharts stays out of the server
//   bundle and off the initial load.
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
import { num } from '@/lib/utils/num'
import type { CategoryProgress, QuestionModule } from '@/types'

const MODULE_COLOR: Record<QuestionModule, string> = {
  math: '#7C3AED',
  reading_writing: '#059669',
}

export default function AccuracyByCategoryChart({ data }: { data: CategoryProgress[] }) {
  const rows = data.map((d) => ({
    name: d.categoryName,
    accuracy: num(d.accuracyPct) ?? 0,
    module: d.module,
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 52)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis
          type="number"
          domain={[0, 100]}
          unit="%"
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          stroke="var(--border)"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          stroke="var(--border)"
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Accuracy']}
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--foreground)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
        />
        <Bar dataKey="accuracy" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={i} fill={MODULE_COLOR[r.module]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
