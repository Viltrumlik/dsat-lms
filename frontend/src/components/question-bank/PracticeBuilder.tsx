// Domain: Question Bank
// Description: The drill builder — tick the skills you want, the difficulty you
//   want, press start, and sit exactly that set in the exam runner.
//
// Every category row carries what is in it and how much of it you have done,
// because that is the number that decides what to practise next. A domain's
// counts include its skills (the server rolls them up), so ticking a domain and
// ticking all of its skills mean the same thing.
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Play, Sparkles } from 'lucide-react'
import {
  questionAPI,
  type DifficultyBand,
  type PracticeCategory,
} from '@/lib/api/questions'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { useDebounced } from '@/lib/hooks/useDebounced'
import { cn } from '@/lib/utils/cn'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const BANDS: DifficultyBand[] = ['easy', 'medium', 'hard']

/** A skill row and its tick box. */
function SkillRow({
  category,
  checked,
  onToggle,
}: {
  category: PracticeCategory
  checked: boolean
  onToggle: () => void
}) {
  const t = useI18n().t
  const done = category.total > 0 ? Math.round((category.done / category.total) * 100) : 0
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      disabled={category.total === 0}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
        checked ? 'bg-primary-50 dark:bg-primary-800/40' : 'hover:bg-muted',
        category.total === 0 && 'cursor-not-allowed opacity-40'
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          checked ? 'border-primary bg-primary text-white' : 'border-border'
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{category.name}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {t('bank.builder.doneOf', { done: category.done, total: category.total })}
      </span>
      <span className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
        <span className="block h-full rounded-full bg-success" style={{ width: `${done}%` }} />
      </span>
    </button>
  )
}

function DomainGroup({
  domain,
  skills,
  selected,
  onToggleMany,
}: {
  domain: PracticeCategory
  skills: PracticeCategory[]
  selected: Set<string>
  onToggleMany: (ids: string[], next: boolean) => void
}) {
  const t = useI18n().t
  const [open, setOpen] = React.useState(false)
  const skillIds = skills.map((s) => s.id)
  const chosen = skillIds.filter((id) => selected.has(id)).length
  const allChosen = skillIds.length > 0 && chosen === skillIds.length

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={allChosen}
          aria-label={domain.name}
          onClick={() => onToggleMany(skillIds, !allChosen)}
          disabled={domain.total === 0}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
            allChosen ? 'border-primary bg-primary text-white' : 'border-border',
            chosen > 0 && !allChosen && 'border-primary bg-primary/30',
            domain.total === 0 && 'cursor-not-allowed opacity-40'
          )}
        >
          {allChosen && <Check className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <span className="min-w-0 flex-1 truncate font-medium">{domain.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t('bank.builder.doneOf', { done: domain.done, total: domain.total })}
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>
      {open && (
        <div className="space-y-0.5 border-t border-border p-1.5">
          {skills.map((skill) => (
            <SkillRow
              key={skill.id}
              category={skill}
              checked={selected.has(skill.id)}
              onToggle={() => onToggleMany([skill.id], !selected.has(skill.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function PracticeBuilder() {
  const { t } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const resetSession = useSessionStore((s) => s.resetSession)

  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [bands, setBands] = React.useState<Set<DifficultyBand>>(new Set())
  const [excludeDone, setExcludeDone] = React.useState(true)
  const [instant, setInstant] = React.useState(true)

  const options = useQuery({
    queryKey: ['practice-options'],
    queryFn: questionAPI.practiceOptions,
  })

  const selection = React.useMemo(
    () => ({
      categories: [...selected],
      difficulties: [...bands],
      excludeDone,
    }),
    [selected, bands, excludeDone]
  )
  // Debounced so ticking through a domain doesn't fire a request per box.
  const debouncedSelection = useDebounced(selection, 250)

  const preview = useQuery({
    queryKey: ['practice-preview', debouncedSelection],
    queryFn: () => questionAPI.practicePreview(debouncedSelection),
  })

  const start = useMutation({
    mutationFn: () =>
      questionAPI.practiceStart({ ...selection, mode: instant ? 'instant' : 'exam' }),
    onSuccess: (session) => {
      resetSession()
      router.push(`/session/${session.id}`)
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('bank.builder.startFailed'),
        description: parseApiError(err).message,
      }),
  })

  const toggleMany = React.useCallback((ids: string[], next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev)
      ids.forEach((id) => (next ? copy.add(id) : copy.delete(id)))
      return copy
    })
  }, [])

  const domains = (options.data?.categories ?? []).filter((c) => !c.parent)
  const skillsOf = (domainId: string) =>
    (options.data?.categories ?? []).filter((c) => c.parent === domainId)

  const matching = preview.data?.matching ?? 0
  const willUse = preview.data?.willUse ?? 0

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">{t('bank.builder.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('bank.builder.subtitle')}</p>
          </div>
        </div>

        {options.data && (
          <p className="text-sm text-muted-foreground">
            {t('bank.builder.bankSummary', {
              done: options.data.doneQuestions,
              total: options.data.totalQuestions,
            })}
          </p>
        )}

        <div className="space-y-2">
          {domains.map((domain) => (
            <DomainGroup
              key={domain.id}
              domain={domain}
              skills={skillsOf(domain.id)}
              selected={selected}
              onToggleMany={toggleMany}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t('bank.builder.difficulty')}</span>
          {BANDS.map((band) => {
            const on = bands.has(band)
            return (
              <button
                key={band}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setBands((prev) => {
                    const copy = new Set(prev)
                    on ? copy.delete(band) : copy.add(band)
                    return copy
                  })
                }
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted'
                )}
              >
                {t(`bank.band.${band}`)}
              </button>
            )
          })}
          {bands.size === 0 && (
            <span className="text-xs text-muted-foreground">{t('bank.builder.allLevels')}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={excludeDone}
              onChange={(e) => setExcludeDone(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t('bank.builder.skipDone')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={instant}
              onChange={(e) => setInstant(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t('bank.builder.instant')}
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {matching === 0
              ? t('bank.builder.nothingMatches')
              : t('bank.builder.willUse', { willUse, matching })}
          </p>
          <Button disabled={matching === 0} loading={start.isPending} onClick={() => start.mutate()}>
            <Play className="h-4 w-4" /> {t('bank.builder.start')}
          </Button>
        </div>

        {matching > 0 && willUse < matching && (
          <Badge variant="secondary">
            {t('bank.builder.cappedAt', { cap: options.data?.maxQuestions ?? willUse })}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
