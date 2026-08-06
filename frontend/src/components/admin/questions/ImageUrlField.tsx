// Domain: Admin (content studio)
// Description: A question figure — URL in, live thumbnail out, so an author can
//   confirm the image resolves before the question ever reaches a student.
// Note: images are referenced by URL (the model stores a URL). Direct file
//   upload would need a public media route — see the panel's docs.
'use client'

import * as React from 'react'
import { ImageOff, ImagePlus, X } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ImageUrlFieldProps {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  /** Compact variant used inside a choice row. */
  compact?: boolean
}

export function ImageUrlField({ id, label, value, onChange, compact }: ImageUrlFieldProps) {
  const t = useT()
  const [open, setOpen] = React.useState(Boolean(value))
  const [broken, setBroken] = React.useState(false)
  const url = value.trim()

  React.useEffect(() => {
    setBroken(false)
  }, [url])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground',
          compact ? 'text-xs' : 'text-sm'
        )}
      >
        <ImagePlus className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className={compact ? 'text-xs' : undefined}>
          {label}
        </Label>
        <button
          type="button"
          onClick={() => {
            onChange('')
            setOpen(false)
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-error"
        >
          <X className="h-3.5 w-3.5" /> {t('admin.questions.image.remove')}
        </button>
      </div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('admin.questions.image.placeholder')}
        inputMode="url"
      />
      {url &&
        (broken ? (
          <p className="flex items-center gap-1.5 text-xs text-error">
            <ImageOff className="h-3.5 w-3.5" /> {t('admin.questions.image.broken')}
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            onError={() => setBroken(true)}
            className={cn(
              'rounded-md border border-border bg-white object-contain',
              compact ? 'max-h-24' : 'max-h-48'
            )}
          />
        ))}
    </div>
  )
}
