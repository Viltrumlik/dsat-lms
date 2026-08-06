// Domain: Admin (content studio)
// Description: The authoring pane — classification, content fields with the
//   formula toolbar, choices, the answer key, a readiness checklist, and a live
//   student-view preview. Lifecycle actions live in LifecycleActions.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Save } from 'lucide-react'
import { adminQuestionsAPI } from '@/lib/api/admin/questions'
import { adminCategoriesAPI, adminTagsAPI } from '@/lib/api/admin/taxonomy'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils/cn'
import { FormulaToolbar } from './FormulaToolbar'
import { MathField } from './MathField'
import { ImageUrlField } from './ImageUrlField'
import { ChoicesEditor, CHOICE_LABELS } from './ChoicesEditor'
import { CorrectAnswerField } from './CorrectAnswerField'
import { QuestionReadiness, readinessItems, isPublishable } from './QuestionReadiness'
import { QuestionPreviewCard } from './QuestionPreviewCard'
import { LifecycleActions } from './LifecycleActions'
import { useFieldInsert } from './useFieldInsert'
import {
  EMPTY_DRAFT,
  draftFromQuestion,
  payloadFromDraft,
  useQuestionDraft,
} from './useQuestionDraft'
import type { AdminQuestion, AnswerType, QuestionModule, QuestionSource } from '@/types'

interface QuestionEditorPaneProps {
  /** null = authoring a brand-new question. */
  questionId: string | null
  onCreated: (question: AdminQuestion) => void
  onDeleted: () => void
}

export function QuestionEditorPane({ questionId, onCreated, onDeleted }: QuestionEditorPaneProps) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fieldInsert = useFieldInsert()

  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const { draft, patch, patchChoice, reset, isDirty } = useQuestionDraft()

  const detail = useQuery({
    queryKey: ['admin', 'question', questionId],
    queryFn: () => adminQuestionsAPI.get(questionId!),
    enabled: Boolean(questionId),
  })
  const categories = useQuery({
    queryKey: ['admin', 'categories', draft.module],
    queryFn: () => adminCategoriesAPI.list(draft.module),
  })
  const allTags = useQuery({ queryKey: ['admin', 'tags-all'], queryFn: () => adminTagsAPI.list() })

  const status = detail.data?.status

  // Seed from the server ONCE per question. A later refetch (invalidation, window
  // focus) hands back a new object identity, and re-seeding on that would silently
  // wipe whatever the author had typed since — so key the seed on the id, not the
  // data. A save re-seeds explicitly from its own response.
  const seededFor = React.useRef<string | null | undefined>(undefined)
  React.useEffect(() => {
    if (seededFor.current === questionId) return
    if (!questionId) {
      seededFor.current = null
      reset(EMPTY_DRAFT)
      setErrors({})
      return
    }
    if (detail.data) {
      seededFor.current = questionId
      reset(draftFromQuestion(detail.data))
      setErrors({})
    }
  }, [questionId, detail.data, reset])

  const save = useMutation({
    mutationFn: () =>
      questionId
        ? adminQuestionsAPI.update(questionId, payloadFromDraft(draft))
        : adminQuestionsAPI.create(payloadFromDraft(draft)),
    onSuccess: (q) => {
      setErrors({})
      reset(draftFromQuestion(q))
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'question', q.id] })
      toast({ variant: 'success', title: t('admin.questions.saved') })
      if (!questionId) onCreated(q)
    },
    onError: (err) => {
      const parsed = parseApiError(err)
      setErrors(parsed.fields)
      if (Object.keys(parsed.fields).length === 0) {
        toast({
          variant: 'error',
          title: t('admin.questions.saveFailed'),
          description: parsed.message,
        })
      }
    },
  })

  const checklist = readinessItems({
    answerType: draft.answerType,
    stem: draft.stem,
    categoryId: draft.categoryId,
    correctAnswer: draft.correctAnswer,
    choices: draft.choices,
    explanation: draft.explanation,
  })
  const canSave = isPublishable(checklist) && !save.isPending

  // ⌘S / Ctrl+S saves without leaving the keyboard.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (canSave) save.mutate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canSave, save])

  if (questionId && detail.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sticky action bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {questionId ? t('admin.questions.editingQuestion') : t('admin.questions.newQuestion')}
          </p>
          <p className="text-xs text-muted-foreground">
            {isDirty ? t('admin.questions.unsaved') : t('admin.questions.allSaved')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status && <LifecycleActions questionId={questionId!} status={status} />}
          <Button size="sm" onClick={() => save.mutate()} disabled={!canSave} loading={save.isPending}>
            <Save className="h-4 w-4" /> {t('admin.questions.save')}
          </Button>
        </div>
      </div>

      {/* Formula toolbar — pinned so it never scrolls away mid-edit */}
      <div className="shrink-0 border-b border-border px-4 py-2">
        <FormulaToolbar onInsert={fieldInsert.insert} hasTarget={fieldInsert.hasTarget} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 p-4 xl:grid-cols-2">
          {/* ── Authoring form ── */}
          <div className="space-y-5">
            {status === 'published' && (
              <Card className="border-warning/40 bg-warning-light/40">
                <CardContent className="flex items-start gap-2 p-3 text-sm text-warning-dark">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t('admin.questions.liveEditHint')}</span>
                </CardContent>
              </Card>
            )}

            {/* Classification */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="q-module">{t('admin.questions.module')}</Label>
                <Select
                  value={draft.module}
                  onValueChange={(v) => patch({ module: v as QuestionModule, categoryId: '' })}
                >
                  <SelectTrigger id="q-module">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="math">{t('admin.questions.moduleMath')}</SelectItem>
                    <SelectItem value="reading_writing">
                      {t('admin.questions.moduleRw')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-difficulty">{t('admin.questions.difficulty')}</Label>
                <Select
                  value={String(draft.difficulty)}
                  onValueChange={(v) => patch({ difficulty: Number(v) })}
                >
                  <SelectTrigger id="q-difficulty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="q-category">{t('admin.questions.category')}</Label>
              <Select value={draft.categoryId} onValueChange={(v) => patch({ categoryId: v })}>
                <SelectTrigger id="q-category">
                  <SelectValue placeholder={t('admin.questions.categoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(categories.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.category} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="q-answer-type">{t('admin.questions.answerType')}</Label>
              <Select
                value={draft.answerType}
                onValueChange={(v) => patch({ answerType: v as AnswerType, correctAnswer: '' })}
              >
                <SelectTrigger id="q-answer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">{t('admin.questions.answerMcq')}</SelectItem>
                  <SelectItem value="grid_in">{t('admin.questions.answerGridIn')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            <MathField
              id="q-stem"
              label={t('admin.questions.stem')}
              value={draft.stem}
              onChange={(v) => patch({ stem: v })}
              fieldInsert={fieldInsert}
              placeholder={t('admin.questions.stemPlaceholder')}
              hint={t('admin.questions.mathHint')}
              error={errors.stem}
              rows={5}
            />
            <ImageUrlField
              id="q-stem-image"
              label={t('admin.questions.image.stem')}
              value={draft.stemImageUrl}
              onChange={(v) => patch({ stemImageUrl: v })}
            />

            <MathField
              id="q-passage"
              label={t('admin.questions.passage')}
              value={draft.passage}
              onChange={(v) => patch({ passage: v })}
              fieldInsert={fieldInsert}
              placeholder={t('admin.questions.passagePlaceholder')}
              hint={t('admin.questions.passageHint')}
              rows={4}
            />
            <ImageUrlField
              id="q-passage-image"
              label={t('admin.questions.image.passage')}
              value={draft.passageImageUrl}
              onChange={(v) => patch({ passageImageUrl: v })}
            />

            {draft.answerType === 'mcq' && (
              <ChoicesEditor
                choices={draft.choices}
                correctAnswer={draft.correctAnswer}
                onChangeChoice={patchChoice}
                onPickCorrect={(label) => patch({ correctAnswer: label })}
                fieldInsert={fieldInsert}
                error={errors.choices}
              />
            )}

            <CorrectAnswerField
              answerType={draft.answerType}
              value={draft.correctAnswer}
              onChange={(v) => patch({ correctAnswer: v })}
              availableLabels={CHOICE_LABELS.filter((l) => draft.choices[l].text.trim() !== '')}
              error={errors.correctAnswer}
            />

            <MathField
              id="q-explanation"
              label={t('admin.questions.explanation')}
              value={draft.explanation}
              onChange={(v) => patch({ explanation: v })}
              fieldInsert={fieldInsert}
              placeholder={t('admin.questions.explanationPlaceholder')}
              hint={t('admin.questions.explanationHint')}
              rows={4}
            />
            <ImageUrlField
              id="q-explanation-image"
              label={t('admin.questions.image.explanation')}
              value={draft.explanationImageUrl}
              onChange={(v) => patch({ explanationImageUrl: v })}
            />

            {/* Metadata */}
            <div className="space-y-4 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="q-hasmath"
                  checked={draft.hasMath}
                  onCheckedChange={(v) => patch({ hasMath: v === true })}
                />
                <Label htmlFor="q-hasmath" className="text-sm font-normal">
                  {t('admin.questions.hasMath')}
                </Label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="q-source">{t('admin.questions.source')}</Label>
                  <Select
                    value={draft.source}
                    onValueChange={(v) => patch({ source: v as QuestionSource })}
                  >
                    <SelectTrigger id="q-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="official">{t('admin.questions.sourceOfficial')}</SelectItem>
                      <SelectItem value="custom">{t('admin.questions.sourceCustom')}</SelectItem>
                      <SelectItem value="imported">{t('admin.questions.sourceImported')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="q-source-ref">{t('admin.questions.sourceRef')}</Label>
                  <Input
                    id="q-source-ref"
                    value={draft.sourceRef}
                    onChange={(e) => patch({ sourceRef: e.target.value })}
                    placeholder={t('admin.questions.sourceRefPlaceholder')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('admin.questions.tags')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(allTags.data ?? []).map((tag) => {
                    const active = draft.tagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          patch({
                            tagIds: active
                              ? draft.tagIds.filter((id) => id !== tag.id)
                              : [...draft.tagIds, tag.id],
                          })
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:border-primary'
                        )}
                      >
                        {tag.name}
                      </button>
                    )
                  })}
                  {(allTags.data ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('admin.questions.noTags')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Readiness + live student view ── */}
          <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
            <QuestionReadiness items={checklist} />
            <QuestionPreviewCard
              answerType={draft.answerType}
              stem={draft.stem}
              stemImageUrl={draft.stemImageUrl}
              passage={draft.passage}
              passageImageUrl={draft.passageImageUrl}
              choices={draft.choices}
              correctAnswer={draft.correctAnswer}
              explanation={draft.explanation}
            />
            {questionId && (
              <DeleteQuestion questionId={questionId} onDeleted={onDeleted} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Inline delete with a confirm step — no modal for a single-row destructive action. */
function DeleteQuestion({
  questionId,
  onDeleted,
}: {
  questionId: string
  onDeleted: () => void
}) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = React.useState(false)

  const remove = useMutation({
    mutationFn: () => adminQuestionsAPI.remove(questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] })
      toast({ variant: 'success', title: t('admin.questions.deleteDone') })
      onDeleted()
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.questions.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-medium text-error hover:underline"
      >
        {t('admin.questions.delete')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-error/40 bg-error-light/40 p-3">
      <span className="flex-1 text-sm text-error-dark">{t('admin.questions.deleteConfirm')}</span>
      <Button variant="destructive" size="sm" loading={remove.isPending} onClick={() => remove.mutate()}>
        {t('admin.questions.deleteYes')}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
        {t('admin.questions.cancel')}
      </Button>
    </div>
  )
}
