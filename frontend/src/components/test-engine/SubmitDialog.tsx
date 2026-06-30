// Domain: Test Engine
// Description: Submit confirmation with an unanswered-count warning.
'use client'

import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useI18n, plural } from '@/lib/i18n/I18nProvider'

interface SubmitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unansweredCount: number
  totalCount: number
  submitting: boolean
  onConfirm: () => void
}

export function SubmitDialog({
  open,
  onOpenChange,
  unansweredCount,
  totalCount,
  submitting,
  onConfirm,
}: SubmitDialogProps) {
  const { t, locale } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('testEngine.submit.title')}</DialogTitle>
          <DialogDescription>
            {t('testEngine.submit.description', {
              answered: totalCount - unansweredCount,
              total: totalCount,
            })}
          </DialogDescription>
        </DialogHeader>

        {unansweredCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning-light/60 p-3 text-warning-dark">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              {plural(
                locale,
                unansweredCount,
                t('testEngine.submit.unansweredOne', { count: unansweredCount }),
                t('testEngine.submit.unansweredOther', { count: unansweredCount })
              )}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('testEngine.submit.keepWorking')}
          </Button>
          <Button onClick={onConfirm} loading={submitting}>
            {t('testEngine.submit.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
