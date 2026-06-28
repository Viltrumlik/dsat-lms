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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit your test?</DialogTitle>
          <DialogDescription>
            You&apos;ve answered {totalCount - unansweredCount} of {totalCount} questions. Once
            submitted, your test will be graded and can&apos;t be changed.
          </DialogDescription>
        </DialogHeader>

        {unansweredCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning-light/60 p-3 text-warning-dark">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              {unansweredCount} question{unansweredCount === 1 ? '' : 's'} still unanswered.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep working
          </Button>
          <Button onClick={onConfirm} loading={submitting}>
            Submit test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
