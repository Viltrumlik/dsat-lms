// Domain: Support
// Description: Star-rating dialog for a completed session (1–5 + optional comment).
'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { supportAPI } from '@/lib/api/support'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'

export function RatingDialog({
  bookingId,
  open,
  onOpenChange,
}: {
  bookingId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [score, setScore] = React.useState(0)
  const [comment, setComment] = React.useState('')

  const rate = useMutation({
    mutationFn: () => supportAPI.bookings.rate(bookingId, { score, comment: comment.trim() }),
    onSuccess: () => {
      onOpenChange(false)
      setScore(0)
      setComment('')
      queryClient.invalidateQueries({ queryKey: ['support', 'my-bookings'] })
      toast({ variant: 'success', title: t('support.rating.submitted') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('support.rating.failed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('support.rating.title')}</DialogTitle>
          <DialogDescription>{t('support.rating.desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center gap-1" role="radiogroup" aria-label={t('support.rating.scoreLabel')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                aria-label={String(n)}
                onClick={() => setScore(n)}
                className="p-1"
              >
                <Star
                  className={cn(
                    'h-8 w-8 transition-colors',
                    n <= score ? 'fill-warning text-warning' : 'text-muted-foreground'
                  )}
                />
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rating-comment">{t('support.rating.commentLabel')}</Label>
            <Textarea
              id="rating-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('teacher.common.cancel')}
          </Button>
          <Button onClick={() => rate.mutate()} loading={rate.isPending} disabled={score < 1}>
            {t('support.rating.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
