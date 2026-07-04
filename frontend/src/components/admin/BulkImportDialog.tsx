// Domain: Admin
// Description: Bulk-create users from CSV — paste text or pick a .csv file, submit,
//   and see a created/skipped/errors summary.
'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminUsersAPI, type ImportResult } from '@/lib/api/admin/users'
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

const SAMPLE = 'email,first_name,last_name,role,password'

export function BulkImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [csv, setCsv] = React.useState('')
  const [result, setResult] = React.useState<ImportResult | null>(null)

  React.useEffect(() => {
    if (open) {
      setCsv('')
      setResult(null)
    }
  }, [open])

  const run = useMutation({
    mutationFn: () => adminUsersAPI.importCsv(csv),
    onSuccess: (res) => {
      setResult(res)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast({ variant: 'success', title: t('admin.import.done', { count: res.createdCount }) })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.import.failed'), description: parseApiError(err).message }),
  })

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then(setCsv)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.import.title')}</DialogTitle>
          <DialogDescription>{t('admin.import.desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
          <div className="space-y-2">
            <Label htmlFor="csv-text">{t('admin.import.pasteLabel')}</Label>
            <Textarea
              id="csv-text"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={6}
              placeholder={SAMPLE}
              className="font-mono text-xs"
            />
          </div>
          {result && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p>
                <span className="font-medium text-success-dark">{result.createdCount}</span>{' '}
                {t('admin.import.created')} ·{' '}
                <span className="font-medium">{result.skippedCount}</span> {t('admin.import.skipped')} ·{' '}
                <span className="font-medium text-error">{result.errorCount}</span> {t('admin.import.errors')}
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {result.errors.slice(0, 8).map((e) => (
                    <li key={e.line}>
                      {t('admin.import.line', { line: e.line })}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? t('admin.import.close') : t('admin.common.cancel')}
          </Button>
          <Button loading={run.isPending} disabled={!csv.trim()} onClick={() => run.mutate()}>
            {t('admin.import.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
