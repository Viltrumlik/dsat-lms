// Domain: Question Bank
// Description: Filter controls for the question browser.
//
//   Difficulty is offered as easy / medium / hard rather than the stored 1–5:
//   nobody browses in fives, and the three bands are the terms the SAT itself
//   uses. The category select is grouped by domain, and picking a DOMAIN means
//   everything under it (the server resolves that — questions are tagged with a
//   skill, so a domain on its own would match nothing).
'use client'

import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n/I18nProvider'
import { MODULE_LABEL_KEY, ANSWER_TYPE_LABEL_KEY } from './labels'
import type { AnswerType, QuestionCategory, QuestionModule } from '@/types'

export type DifficultyBand = 'easy' | 'medium' | 'hard'

export interface QuestionUIFilters {
  search: string
  module?: QuestionModule
  /** easy / medium / hard; repeatable. */
  bands: DifficultyBand[]
  answerType?: AnswerType
  category?: string
  /** Answered by me, or not yet. */
  status?: 'done' | 'todo'
}

interface QuestionFiltersProps {
  value: QuestionUIFilters
  onChange: (patch: Partial<QuestionUIFilters>) => void
  onReset: () => void
  categories: QuestionCategory[]
  hasActiveFilters: boolean
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

const MODULES: QuestionModule[] = ['math', 'reading_writing']
const ANSWER_TYPES: AnswerType[] = ['mcq', 'grid_in']
const BANDS: DifficultyBand[] = ['easy', 'medium', 'hard']
const STATUSES: Array<'todo' | 'done'> = ['todo', 'done']

export function QuestionFilters({
  value,
  onChange,
  onReset,
  categories,
  hasActiveFilters,
}: QuestionFiltersProps) {
  const t = useT()
  // Toggle helper: clicking the active chip clears it back to "All".
  const toggle = <K extends keyof QuestionUIFilters>(key: K, v: QuestionUIFilters[K]) =>
    onChange({ [key]: value[key] === v ? undefined : v } as Partial<QuestionUIFilters>)

  // Only show categories relevant to the selected module (or all when none).
  const visibleCategories = value.module
    ? categories.filter((c) => c.module === value.module)
    : categories
  const domains = visibleCategories.filter((c) => !c.parent)

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t('questionBank.searchPlaceholder')}
          aria-label={t('questionBank.searchAria')}
          value={value.search}
          onChange={(e) => onChange({ search: e.target.value })}
          className="pl-9"
        />
      </div>

      <FilterGroup label={t('questionBank.filters.module')}>
        {MODULES.map((m) => (
          <Chip key={m} active={value.module === m} onClick={() => toggle('module', m)}>
            {t(MODULE_LABEL_KEY[m])}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label={t('questionBank.filters.difficulty')}>
        {BANDS.map((band) => (
          <Chip
            key={band}
            active={value.bands.includes(band)}
            onClick={() =>
              onChange({
                bands: value.bands.includes(band)
                  ? value.bands.filter((b) => b !== band)
                  : [...value.bands, band],
              })
            }
          >
            {t(`bank.band.${band}`)}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label={t('questionBank.filters.progress')}>
        {STATUSES.map((status) => (
          <Chip key={status} active={value.status === status} onClick={() => toggle('status', status)}>
            {t(`questionBank.filters.${status}`)}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label={t('questionBank.filters.type')}>
        {ANSWER_TYPES.map((at) => (
          <Chip key={at} active={value.answerType === at} onClick={() => toggle('answerType', at)}>
            {t(ANSWER_TYPE_LABEL_KEY[at])}
          </Chip>
        ))}
      </FilterGroup>

      {visibleCategories.length > 0 && (
        <FilterGroup label={t('questionBank.filters.topic')}>
          <select
            aria-label={t('questionBank.filters.category')}
            value={value.category ?? ''}
            onChange={(e) => onChange({ category: e.target.value || undefined })}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <option value="">{t('questionBank.filters.allTopics')}</option>
            {domains.map((domain) => (
              <optgroup key={domain.id} label={domain.name}>
                {/* The domain itself is selectable — it means "everything in it". */}
                <option value={domain.id}>
                  {t('questionBank.filters.allIn', { name: domain.name })}
                </option>
                {visibleCategories
                  .filter((c) => c.parent === domain.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </FilterGroup>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> {t('questionBank.filters.clear')}
        </button>
      )}
    </div>
  )
}
