// Domain: Test Engine
// Description: Student-produced response (grid-in) numeric entry.
'use client'

import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n/I18nProvider'

interface GridInProps {
  value: string | null
  onChange: (value: string) => void
}

export function GridIn({ value, onChange }: GridInProps) {
  const t = useT()
  return (
    <div className="max-w-xs space-y-2">
      <label htmlFor="grid-in" className="text-sm font-medium">
        {t('testEngine.yourAnswer')}
      </label>
      <Input
        id="grid-in"
        inputMode="text"
        autoComplete="off"
        placeholder={t('testEngine.gridInPlaceholder')}
        maxLength={8}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="text-lg font-mono"
      />
      <p className="text-xs text-muted-foreground">{t('testEngine.gridInHelp')}</p>
    </div>
  )
}
