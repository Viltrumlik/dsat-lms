// Domain: Admin (exam builder)
// Description: Assemble an exam — add/remove sections, and populate each section with
//   published questions from the bank (search picker), reorder them (up/down), and
//   remove them. Section questions come back position-sorted from the API.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { adminExamsAPI, type SectionWritePayload } from '@/lib/api/admin/exams'
import { adminQuestionsAPI } from '@/lib/api/admin/questions'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FullPageSpinner } from '@/components/ui/spinner'
import { DifficultyDots } from '@/components/question-bank/DifficultyDots'
import { MODULE_LABEL_KEY } from '@/components/question-bank/labels'
import type { AdminSection, QuestionModule } from '@/types'

const SECTION_MODULES: QuestionModule[] = ['reading_writing', 'math']

// ── Add-section dialog ──
function AddSectionDialog({
  examId,
  open,
  onOpenChange,
}: {
  examId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [payload, setPayload] = React.useState<SectionWritePayload>({ module: 'reading_writing', title: '' })

  React.useEffect(() => {
    if (open) setPayload({ module: 'reading_writing', title: '' })
  }, [open])

  const create = useMutation({
    mutationFn: () => adminExamsAPI.createSection(examId, payload),
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'exam', examId] })
      toast({ variant: 'success', title: t('admin.exams.sectionAdded') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.exams.actionFailed'), description: parseApiError(err).message }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.exams.addSection')}</DialogTitle>
          <DialogDescription>{t('admin.exams.addSectionDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sec-module">{t('admin.exams.module')}</Label>
            <Select
              value={payload.module}
              onValueChange={(v) => setPayload((p) => ({ ...p, module: v as QuestionModule }))}
            >
              <SelectTrigger id="sec-module">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_MODULES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(MODULE_LABEL_KEY[m])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sec-title">{t('admin.exams.sectionTitle')}</Label>
              <Input
                id="sec-title"
                value={payload.title}
                onChange={(e) => setPayload((p) => ({ ...p, title: e.target.value }))}
                placeholder={t('admin.exams.sectionTitlePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sec-time">{t('admin.exams.timeLimit')}</Label>
              <Input
                id="sec-time"
                type="number"
                min={0}
                value={payload.timeLimit ?? ''}
                onChange={(e) =>
                  setPayload((p) => ({ ...p, timeLimit: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            {t('admin.exams.addSection')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Question picker ──
function QuestionPickerDialog({
  examId,
  section,
  open,
  onOpenChange,
}: {
  examId: string
  section: AdminSection
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [searchQ, setSearchQ] = React.useState('')
  const existing = new Set(section.questions.map((q) => q.question.id))

  React.useEffect(() => {
    if (open) setSearch('')
  }, [open])
  React.useEffect(() => {
    const id = setTimeout(() => setSearchQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const results = useQuery({
    queryKey: ['admin', 'question-picker', section.module, searchQ],
    queryFn: () =>
      adminQuestionsAPI.list({ status: 'published', module: section.module, search: searchQ || undefined }),
    enabled: open,
  })

  const add = useMutation({
    mutationFn: (questionId: string) => adminExamsAPI.addQuestion(examId, section.id, questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'exam', examId] })
      toast({ variant: 'success', title: t('admin.exams.questionAdded') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.exams.actionFailed'), description: parseApiError(err).message }),
  })

  const rows = (results.data?.data ?? []).filter((q) => !existing.has(q.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.exams.addQuestion')}</DialogTitle>
          <DialogDescription>{t('admin.exams.pickerDesc')}</DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.exams.searchQuestions')}
          autoFocus
        />
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {results.isLoading && <p className="p-3 text-sm text-muted-foreground">{t('common.loading')}</p>}
          {results.data && rows.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">{t('admin.exams.noQuestions')}</p>
          )}
          {rows.map((q) => (
            <div key={q.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <div className="flex-1">
                <p className="line-clamp-2 text-sm">{q.stem}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <DifficultyDots level={q.difficulty} />
                  <span>{q.category.name}</span>
                </div>
              </div>
              <Button size="sm" variant="outline" loading={add.isPending} onClick={() => add.mutate(q.id)}>
                <Plus className="h-4 w-4" /> {t('admin.exams.add')}
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.exams.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Section card ──
function SectionCard({ examId, section }: { examId: string; section: AdminSection }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [pickerOpen, setPickerOpen] = React.useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'exam', examId] })
  const onError = (err: unknown) =>
    toast({ variant: 'error', title: t('admin.exams.actionFailed'), description: parseApiError(err).message })

  const removeSection = useMutation({
    mutationFn: () => adminExamsAPI.removeSection(examId, section.id),
    onSuccess: invalidate,
    onError,
  })
  const reorder = useMutation({
    mutationFn: (order: number[]) => adminExamsAPI.reorderQuestions(examId, section.id, order),
    onSuccess: invalidate,
    onError,
  })
  const removeQuestion = useMutation({
    mutationFn: (eqId: number) => adminExamsAPI.removeQuestion(examId, section.id, eqId),
    onSuccess: invalidate,
    onError,
  })

  const move = (index: number, dir: -1 | 1) => {
    const ids = section.questions.map((q) => q.id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorder.mutate(ids)
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {t('admin.exams.sectionN', { n: section.sectionNumber })}
              {section.title ? ` · ${section.title}` : ''}
            </span>
            <Badge variant={section.module === 'math' ? 'math' : 'rw'}>
              {t(MODULE_LABEL_KEY[section.module])}
            </Badge>
            {section.timeLimit != null && (
              <span className="text-xs text-muted-foreground">{section.timeLimit} {t('admin.exams.min')}</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('admin.exams.removeSection')}
            loading={removeSection.isPending}
            onClick={() => removeSection.mutate()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {section.questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.exams.sectionEmpty')}</p>
        ) : (
          <ol className="space-y-1.5">
            {section.questions.map((sq, i) => (
              <li key={sq.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                <span className="w-6 text-center text-sm font-medium tabular-nums text-muted-foreground">
                  {sq.position}
                </span>
                <span className="line-clamp-1 flex-1 text-sm">{sq.question.stem}</span>
                <DifficultyDots level={sq.question.difficulty} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.exams.moveUp')}
                  disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.exams.moveDown')}
                  disabled={i === section.questions.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.exams.removeQuestion')}
                  onClick={() => removeQuestion.mutate(sq.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        )}

        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="h-4 w-4" /> {t('admin.exams.addQuestion')}
        </Button>
      </CardContent>
      <QuestionPickerDialog examId={examId} section={section} open={pickerOpen} onOpenChange={setPickerOpen} />
    </Card>
  )
}

export function ExamBuilder({ examId }: { examId: string }) {
  const { t } = useI18n()
  const [addSectionOpen, setAddSectionOpen] = React.useState(false)

  const exam = useQuery({ queryKey: ['admin', 'exam', examId], queryFn: () => adminExamsAPI.get(examId) })

  if (exam.isLoading) return <FullPageSpinner label={t('common.loading')} />
  if (exam.isError || !exam.data)
    return <p className="text-sm text-muted-foreground">{t('admin.exams.loadFailed')}</p>

  const e = exam.data

  return (
    <div className="space-y-6">
      <Link
        href="/admin/exams"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('admin.exams.backToExams')}
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{e.title}</h1>
          <Badge variant="secondary">{t(`admin.exams.typeLabel.${e.type}`)}</Badge>
          <Badge variant={e.accessLevel === 'public' ? 'success' : 'outline'}>
            {t(e.accessLevel === 'public' ? 'admin.exams.accessPublic' : 'admin.exams.accessAcademy')}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {t(`modules.${e.module}`)}
          {e.timeLimit != null ? ` · ${e.timeLimit} ${t('admin.exams.min')}` : ''}
        </p>
      </div>

      <div className="space-y-4">
        {e.sections.map((s) => (
          <SectionCard key={s.id} examId={examId} section={s} />
        ))}
        {e.sections.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {t('admin.exams.noSections')}
            </CardContent>
          </Card>
        )}
      </div>

      <Button variant="outline" onClick={() => setAddSectionOpen(true)}>
        <Plus className="h-4 w-4" /> {t('admin.exams.addSection')}
      </Button>

      <AddSectionDialog examId={examId} open={addSectionOpen} onOpenChange={setAddSectionOpen} />
    </div>
  )
}
