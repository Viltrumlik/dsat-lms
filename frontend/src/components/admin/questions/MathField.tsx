// Domain: Admin (content studio)
// Description: A question-content field — label, textarea, and an inline live
//   preview of exactly what the student will see. Registers itself with the
//   toolbar so snippets land at its caret.
'use client'

import * as React from 'react'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FieldError } from '@/components/ui/field-error'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'
import type { FieldInsert } from './useFieldInsert'

interface MathFieldProps {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  fieldInsert: FieldInsert
  placeholder?: string
  hint?: string
  error?: string
  rows?: number
  /** Grow the textarea to fit its content (used for the compact choice rows). */
  autoGrow?: boolean
  className?: string
}

export function MathField({
  id,
  label,
  value,
  onChange,
  fieldInsert,
  placeholder,
  hint,
  error,
  rows = 4,
  autoGrow = false,
  className,
}: MathFieldProps) {
  const t = useT()
  const ref = React.useRef<HTMLTextAreaElement | null>(null)

  const fit = React.useCallback(() => {
    const el = ref.current
    if (!el || !autoGrow) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [autoGrow])

  React.useEffect(fit, [value, fit])

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        {...fieldInsert.register(onChange)}
        className={cn(autoGrow && 'resize-none overflow-hidden')}
      />
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError message={error} />
      {value.trim() && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t('admin.questions.preview')}
          </p>
          <MarkdownMath content={value} className="text-sm leading-relaxed" />
        </div>
      )}
    </div>
  )
}
