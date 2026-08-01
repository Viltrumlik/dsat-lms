// Domain: Test Engine
// Description: Student-produced response (grid-in) — Bluebook's boxed entry
//   field with a live "Answer preview" underneath.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'

interface GridInProps {
  value: string | null
  onChange: (value: string) => void
}

export function GridIn({ value, onChange }: GridInProps) {
  const t = useT()
  const entered = (value ?? '').trim()

  return (
    <div className="max-w-md space-y-3">
      <input
        id="grid-in"
        inputMode="text"
        autoComplete="off"
        aria-label={t('testEngine.yourAnswer')}
        maxLength={12}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-56 rounded-[10px] border border-bb-choice bg-white px-4 font-exam text-[19px] text-bb-ink focus:border-bb-blue focus:outline-none focus:ring-2 focus:ring-bb-blue/40"
      />
      <p className="font-exam text-[17px] text-bb-ink">
        {t('testEngine.answerPreview')}{' '}
        <span className="font-semibold">{entered || '—'}</span>
      </p>
      <p className="text-sm text-neutral-600">{t('testEngine.gridInHelp')}</p>
    </div>
  )
}
