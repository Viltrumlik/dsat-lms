// Domain: Admin (content studio)
// Description: The review lifecycle for one question — submit / approve /
//   reject-with-note, plus the review history behind a popover.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, History, Send, X } from 'lucide-react'
import { adminQuestionsAPI } from '@/lib/api/admin/questions'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { QuestionStatus } from '@/types'

const STATUS_BADGE: Record<QuestionStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  review: 'warning',
  published: 'success',
  archived: 'outline',
}

export function LifecycleActions({
  questionId,
  status,
}: {
  questionId: string
  status: QuestionStatus
}) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [note, setNote] = React.useState('')

  const reviews = useQuery({
    queryKey: ['admin', 'question-reviews', questionId],
    queryFn: () => adminQuestionsAPI.reviews(questionId),
    enabled: historyOpen,
  })

  const act = useMutation<unknown, unknown, { kind: 'submit' | 'approve' | 'reject' }>({
    mutationFn: ({ kind }) => {
      if (kind === 'submit') return adminQuestionsAPI.submit(questionId)
      if (kind === 'approve') return adminQuestionsAPI.approve(questionId)
      return adminQuestionsAPI.reject(questionId, note.trim())
    },
    onSuccess: (_res, { kind }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'question', questionId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'question-reviews', questionId] })
      setRejectOpen(false)
      setNote('')
      toast({ variant: 'success', title: t(`admin.questions.${kind}Done`) })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.questions.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <div className="flex items-center gap-2">
      <Badge variant={STATUS_BADGE[status]}>{t(`admin.questions.statusLabel.${status}`)}</Badge>

      {status === 'draft' && (
        <Button
          size="sm"
          variant="outline"
          loading={act.isPending}
          onClick={() => act.mutate({ kind: 'submit' })}
        >
          <Send className="h-4 w-4" /> {t('admin.questions.submit')}
        </Button>
      )}
      {status === 'review' && (
        <>
          <Button size="sm" loading={act.isPending} onClick={() => act.mutate({ kind: 'approve' })}>
            <CheckCircle2 className="h-4 w-4" /> {t('admin.questions.approve')}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>
            <X className="h-4 w-4" /> {t('admin.questions.reject')}
          </Button>
        </>
      )}

      <Button
        size="icon"
        variant="ghost"
        aria-label={t('admin.questions.reviewHistory')}
        onClick={() => setHistoryOpen(true)}
      >
        <History className="h-4 w-4" />
      </Button>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.questions.rejectTitle')}</DialogTitle>
            <DialogDescription>{t('admin.questions.rejectDesc')}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.questions.rejectPlaceholder')}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t('admin.questions.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!note.trim()}
              loading={act.isPending}
              onClick={() => act.mutate({ kind: 'reject' })}
            >
              {t('admin.questions.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.questions.reviewHistory')}</DialogTitle>
          </DialogHeader>
          {reviews.data && reviews.data.length > 0 ? (
            <ul className="divide-y divide-border text-sm">
              {reviews.data.map((r) => (
                <li key={r.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.reviewer.fullName}</span>
                    <Badge variant={r.status === 'approved' ? 'success' : 'error'}>
                      {t(`admin.questions.reviewStatus.${r.status}`)}
                    </Badge>
                  </div>
                  {r.note && <p className="mt-1 text-muted-foreground">{r.note}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('admin.questions.noReviews')}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
