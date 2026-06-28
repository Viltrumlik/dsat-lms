// Domain: Test Engine
// Description: Student-produced response (grid-in) numeric entry.
'use client'

import { Input } from '@/components/ui/input'

interface GridInProps {
  value: string | null
  onChange: (value: string) => void
}

export function GridIn({ value, onChange }: GridInProps) {
  return (
    <div className="max-w-xs space-y-2">
      <label htmlFor="grid-in" className="text-sm font-medium">
        Your answer
      </label>
      <Input
        id="grid-in"
        inputMode="text"
        autoComplete="off"
        placeholder="e.g. 3.5 or 7/2"
        maxLength={8}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="text-lg font-mono"
      />
      <p className="text-xs text-muted-foreground">
        Enter a number. Fractions (7/2) and decimals (3.5) are allowed.
      </p>
    </div>
  )
}
