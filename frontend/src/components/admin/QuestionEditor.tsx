// Domain: Admin (content studio)
// Description: Author / edit a question with a live KaTeX preview (reuses
//   MarkdownMath), plus the review lifecycle. Editing is allowed only in DRAFT
//   (§9) — published questions are read-only and revised via "new version".
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Copy, Send, X } from 'lucide-react'
import { adminQuestionsAPI, type QuestionWritePayload } from '@/lib/api/admin/questions'
import { adminCategoriesAPI, adminTagsAPI } from '@/lib/api/admin/taxonomy'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Textarea } from '@/components/ui/textarea'
import { FullPageSpinner } from '@/components/ui/spinner'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'
import type { AnswerType, QuestionModule, QuestionSource, QuestionStatus } from '@/types'

const LABELS = ['A', 'B', 'C', 'D'] as const
type ChoiceMap = Record<(typeof LABELS)[number], string>
const STATUS_BADGE: Record<QuestionStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  review: 'warning',
  published: 'success',
  archived: 'outline',
}

export function QuestionEditor({ mode, questionId }: { mode: 'create' | 'edit'; questionId?: string }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [moduleVal, setModuleVal] = React.useState<QuestionModule>('math')
  const [categoryId, setCategoryId] = React.useState('')
  const [difficulty, setDifficulty] = React.useState(3)
  const [answerType, setAnswerType] = React.useState<AnswerType>('mcq')
  const [stem, setStem] = React.useState('')
  const [passage, setPassage] = React.useState('')
  const [choices, setChoices] = React.useState<ChoiceMap>({ A: '', B: '', C: '', D: '' })
  const [correctAnswer, setCorrectAnswer] = React.useState('')
  const [explanation, setExplanation] = React.useState('')
  const [hasMath, setHasMath] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [rejectNote, setRejectNote] = React.useState('')
  const [tagIds, setTagIds] = React.useState<string[]>([])
  const [source, setSource] = React.useState<QuestionSource>('custom')
  const [sourceRef, setSourceRef] = React.useState('')

  const detail = useQuery({
    queryKey: ['admin', 'question', questionId],
    queryFn: () => adminQuestionsAPI.get(questionId!),
    enabled: mode === 'edit' && !!questionId,
  })
  const reviews = useQuery({
    queryKey: ['admin', 'question-reviews', questionId],
    queryFn: () => adminQuestionsAPI.reviews(questionId!),
    enabled: mode === 'edit' && !!questionId,
  })
  const categories = useQuery({
    queryKey: ['admin', 'categories', moduleVal],
    queryFn: () => adminCategoriesAPI.list(moduleVal),
  })
  const allTags = useQuery({ queryKey: ['admin', 'tags-all'], queryFn: () => adminTagsAPI.list() })

  const status = detail.data?.status
  const readOnly = mode === 'edit' && status !== undefined && status !== 'draft'

  // Seed the form from the fetched question (edit mode).
  React.useEffect(() => {
    const q = detail.data
    if (!q) return
    setModuleVal(q.module)
    setCategoryId(q.category.id)
    setDifficulty(q.difficulty)
    setAnswerType(q.answerType)
    setStem(q.stem)
    setPassage(q.passage ?? '')
    setCorrectAnswer(q.correctAnswer)
    setExplanation(q.explanation ?? '')
    setHasMath(q.hasMath)
    const next: ChoiceMap = { A: '', B: '', C: '', D: '' }
    for (const c of q.choices) if (c.label in next) next[c.label as keyof ChoiceMap] = c.text
    setChoices(next)
    setTagIds(q.tags.map((tag) => tag.id))
    setSource(q.source)
    setSourceRef(q.sourceRef ?? '')
  }, [detail.data])

  function buildPayload(): QuestionWritePayload {
    const choiceList =
      answerType === 'mcq'
        ? LABELS.filter((l) => choices[l].trim() !== '').map((l, i) => ({
            label: l,
            text: choices[l],
            sortOrder: i,
          }))
        : undefined
    return {
      module: moduleVal,
      category: categoryId,
      difficulty,
      answerType,
      hasMath,
      stem,
      passage: passage.trim() ? passage : null,
      correctAnswer,
      explanation: explanation.trim() ? explanation : null,
      choices: choiceList,
      tags: tagIds,
      source,
      sourceRef: sourceRef.trim() ? sourceRef : null,
    }
  }

  const save = useMutation({
    mutationFn: () =>
      mode === 'create'
        ? adminQuestionsAPI.create(buildPayload())
        : adminQuestionsAPI.update(questionId!, buildPayload()),
    onSuccess: (q) => {
      setErrors({})
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'question', q.id] })
      toast({ variant: 'success', title: t('admin.questions.saved') })
      if (mode === 'create') router.push(`/admin/questions/${q.id}`)
    },
    onError: (err) => {
      const parsed = parseApiError(err)
      setErrors(parsed.fields)
      if (Object.keys(parsed.fields).length === 0)
        toast({ variant: 'error', title: t('admin.questions.saveFailed'), description: parsed.message })
    },
  })

  const lifecycle = useMutation<
    unknown,
    unknown,
    { kind: 'submit' | 'approve' | 'reject' | 'newVersion' }
  >({
    mutationFn: ({ kind }) => {
      const id = questionId!
      if (kind === 'submit') return adminQuestionsAPI.submit(id)
      if (kind === 'approve') return adminQuestionsAPI.approve(id)
      if (kind === 'reject') return adminQuestionsAPI.reject(id, rejectNote.trim())
      return adminQuestionsAPI.newVersion(id)
    },
    onSuccess: (res, { kind }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'question', questionId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'question-reviews', questionId] })
      setRejectOpen(false)
      setRejectNote('')
      toast({ variant: 'success', title: t(`admin.questions.${kind}Done`) })
      if (kind === 'newVersion') router.push(`/admin/questions/${(res as { id: string }).id}`)
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.questions.actionFailed'), description: parseApiError(err).message }),
  })

  const canSave =
    stem.trim() &&
    categoryId &&
    correctAnswer.trim() &&
    (answerType === 'grid_in' || LABELS.some((l) => choices[l].trim()))

  if (mode === 'edit' && detail.isLoading) return <FullPageSpinner label={t('common.loading')} />

  const disabled = readOnly || save.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/admin/questions"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t('admin.questions.backToList')}
        </Link>
        {status && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>v{detail.data?.version}</span>
            <Badge variant={STATUS_BADGE[status]}>{t(`admin.questions.statusLabel.${status}`)}</Badge>
          </div>
        )}
      </div>

      {readOnly && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="text-muted-foreground">{t('admin.questions.readOnlyHint')}</span>
            {status === 'published' && (
              <Button size="sm" loading={lifecycle.isPending} onClick={() => lifecycle.mutate({ kind: 'newVersion' })}>
                <Copy className="h-4 w-4" /> {t('admin.questions.newVersion')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Form ── */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="q-module">{t('admin.questions.module')}</Label>
              <Select
                value={moduleVal}
                onValueChange={(v) => {
                  setModuleVal(v as QuestionModule)
                  setCategoryId('')
                }}
                disabled={disabled}
              >
                <SelectTrigger id="q-module">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="math">{t('modules.math')}</SelectItem>
                  <SelectItem value="reading_writing">{t('modules.reading_writing')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="q-difficulty">{t('admin.questions.difficulty')}</Label>
              <Select value={String(difficulty)} onValueChange={(v) => setDifficulty(Number(v))} disabled={disabled}>
                <SelectTrigger id="q-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {t(`questionBank.difficulty.${d}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="q-category">{t('admin.questions.category')}</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={disabled}>
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
            <Label htmlFor="q-type">{t('admin.questions.answerType')}</Label>
            <Select value={answerType} onValueChange={(v) => setAnswerType(v as AnswerType)} disabled={disabled}>
              <SelectTrigger id="q-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mcq">{t('questionBank.answerType.mcq')}</SelectItem>
                <SelectItem value="grid_in">{t('questionBank.answerType.grid_in')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="q-stem">{t('admin.questions.stem')}</Label>
            <Textarea
              id="q-stem"
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              rows={4}
              placeholder={t('admin.questions.stemPlaceholder')}
              disabled={disabled}
              aria-invalid={errors.stem ? true : undefined}
            />
            <FieldError message={errors.stem} />
          </div>

          {moduleVal === 'reading_writing' && (
            <div className="space-y-2">
              <Label htmlFor="q-passage">{t('admin.questions.passage')}</Label>
              <Textarea
                id="q-passage"
                value={passage}
                onChange={(e) => setPassage(e.target.value)}
                rows={4}
                disabled={disabled}
              />
            </div>
          )}

          {answerType === 'mcq' ? (
            <div className="space-y-2">
              <Label>{t('admin.questions.choices')}</Label>
              {LABELS.map((l) => (
                <div key={l} className="flex items-start gap-2">
                  <span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
                    {l}
                  </span>
                  <Textarea
                    value={choices[l]}
                    onChange={(e) => setChoices((prev) => ({ ...prev, [l]: e.target.value }))}
                    rows={1}
                    placeholder={t('admin.questions.choicePlaceholder', { label: l })}
                    disabled={disabled}
                  />
                </div>
              ))}
              <FieldError message={errors.choices} />
              <div className="space-y-2 pt-1">
                <Label htmlFor="q-correct">{t('admin.questions.correctAnswer')}</Label>
                <Select value={correctAnswer} onValueChange={setCorrectAnswer} disabled={disabled}>
                  <SelectTrigger id="q-correct" className="w-28">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {LABELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.correctAnswer} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="q-correct-grid">{t('admin.questions.correctAnswer')}</Label>
              <Input
                id="q-correct-grid"
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                placeholder={t('admin.questions.gridPlaceholder')}
                className="w-40 font-mono"
                disabled={disabled}
                aria-invalid={errors.correctAnswer ? true : undefined}
              />
              <FieldError message={errors.correctAnswer} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="q-explanation">{t('admin.questions.explanation')}</Label>
            <Textarea
              id="q-explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={3}
              disabled={disabled}
            />
          </div>

          {(allTags.data?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <Label>{t('admin.questions.tags')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {allTags.data!.map((tag) => {
                  const on = tagIds.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        setTagIds((prev) => (on ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]))
                      }
                      className={
                        'rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-50 ' +
                        (on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted')
                      }
                    >
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="q-source">{t('admin.questions.source')}</Label>
              <Select value={source} onValueChange={(v) => setSource(v as QuestionSource)} disabled={disabled}>
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
              <Label htmlFor="q-sourceref">{t('admin.questions.sourceRef')}</Label>
              <Input
                id="q-sourceref"
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder={t('admin.questions.sourceRefPlaceholder')}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="q-hasmath" checked={hasMath} onCheckedChange={(v) => setHasMath(v === true)} disabled={disabled} />
            <Label htmlFor="q-hasmath" className="text-sm font-normal">
              {t('admin.questions.hasMath')}
            </Label>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
                {t('admin.questions.save')}
              </Button>
              {mode === 'edit' && status === 'draft' && (
                <Button variant="outline" loading={lifecycle.isPending} onClick={() => lifecycle.mutate({ kind: 'submit' })}>
                  <Send className="h-4 w-4" /> {t('admin.questions.submit')}
                </Button>
              )}
            </div>
          )}

          {status === 'review' && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button loading={lifecycle.isPending} onClick={() => lifecycle.mutate({ kind: 'approve' })}>
                <CheckCircle2 className="h-4 w-4" /> {t('admin.questions.approve')}
              </Button>
              <Button variant="destructive" onClick={() => setRejectOpen(true)}>
                <X className="h-4 w-4" /> {t('admin.questions.reject')}
              </Button>
            </div>
          )}
        </div>

        {/* ── Preview + reviews ── */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('admin.questions.preview')}
              </p>
              {passage.trim() && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <MarkdownMath content={passage} />
                </div>
              )}
              {stem.trim() ? (
                <MarkdownMath content={stem} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('admin.questions.previewEmpty')}</p>
              )}
              {answerType === 'mcq' &&
                LABELS.filter((l) => choices[l].trim()).map((l) => (
                  <div
                    key={l}
                    className={
                      'flex items-start gap-3 rounded-lg border-2 p-3 ' +
                      (correctAnswer === l ? 'border-success bg-success-light' : 'border-border')
                    }
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
                      {l}
                    </span>
                    <div className="flex-1 pt-0.5">
                      <MarkdownMath content={choices[l]} className="[&_p]:m-0" />
                    </div>
                  </div>
                ))}
              {answerType === 'grid_in' && correctAnswer.trim() && (
                <p className="text-sm">
                  {t('admin.questions.correctAnswer')}:{' '}
                  <span className="font-mono font-semibold">{correctAnswer}</span>
                </p>
              )}
              {explanation.trim() && (
                <div className="border-t border-border pt-3">
                  <p className="mb-1 text-sm font-medium">{t('admin.questions.explanation')}</p>
                  <MarkdownMath content={explanation} className="text-sm" />
                </div>
              )}
            </CardContent>
          </Card>

          {mode === 'edit' && (reviews.data?.length ?? 0) > 0 && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('admin.questions.reviewHistory')}
                </p>
                {reviews.data!.map((rv) => (
                  <div key={rv.id} className="text-sm">
                    <span className="font-medium">{rv.reviewer.fullName || rv.reviewer.email}</span>{' '}
                    <Badge variant={rv.status === 'approved' ? 'success' : 'error'}>
                      {t(`admin.questions.reviewStatus.${rv.status}`)}
                    </Badge>
                    {rv.note && <p className="mt-0.5 text-muted-foreground">{rv.note}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.questions.rejectTitle')}</DialogTitle>
            <DialogDescription>{t('admin.questions.rejectDesc')}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
            placeholder={t('admin.questions.rejectPlaceholder')}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={lifecycle.isPending}
              disabled={!rejectNote.trim()}
              onClick={() => lifecycle.mutate({ kind: 'reject' })}
            >
              {t('admin.questions.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
