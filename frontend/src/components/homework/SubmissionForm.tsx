// Domain: Homework
// Description: What a student hands in — a written response and/or files.
//   Files are uploaded to /files/ first (so they exist as owned Attachments)
//   and only their ids go with the submission; the server re-checks ownership,
//   so an id from anywhere else is refused.
'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Paperclip, Upload, X } from 'lucide-react'
import { filesAPI, type Attachment } from '@/lib/api/files'
import { homeworkAPI } from '@/lib/api/homework'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Homework } from '@/types'

export function SubmissionForm({ homework }: { homework: Homework }) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const isRedo = homework.mySubmission?.status === 'returned'
  const [text, setText] = React.useState(
    isRedo ? (homework.mySubmission?.responseText ?? '') : ''
  )
  const [staged, setStaged] = React.useState<Attachment[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = '' // let the same file be picked again after a remove
    if (files.length === 0) return
    setUploading(true)
    try {
      const uploaded = await Promise.all(
        files.map((file) => filesAPI.upload({ file, kind: 'homework' }))
      )
      setStaged((prev) => [...prev, ...uploaded])
    } catch (err) {
      toast({
        variant: 'error',
        title: t('homework.files.uploadFailed'),
        description: parseApiError(err).message,
      })
    } finally {
      setUploading(false)
    }
  }

  const submit = useMutation({
    mutationFn: () =>
      homeworkAPI.submit(homework.id, {
        responseText: text,
        attachmentIds: staged.map((a) => a.id),
      }),
    onSuccess: () => {
      setConfirmOpen(false)
      setStaged([])
      queryClient.invalidateQueries({ queryKey: ['homework'] })
      toast({
        variant: 'success',
        title: t('homework.submitSuccessTitle'),
        description: t('homework.submitSuccessDesc'),
      })
    },
    onError: (err) => {
      setConfirmOpen(false)
      toast({
        variant: 'error',
        title: t('homework.submitFailed'),
        description: parseApiError(err).message,
      })
    },
  })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="hw-response">{t('homework.form.responseLabel')}</Label>
        <Textarea
          id="hw-response"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('homework.form.responsePlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('homework.form.filesLabel')}</Label>
        <input ref={fileInput} type="file" multiple className="hidden" onChange={onPick} />
        <Button
          type="button"
          variant="outline"
          loading={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="h-4 w-4" /> {t('homework.form.addFiles')}
        </Button>

        {staged.length > 0 && (
          <ul className="space-y-1.5 pt-1">
            {staged.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
                <button
                  type="button"
                  aria-label={t('homework.form.removeFile')}
                  onClick={() => setStaged((prev) => prev.filter((f) => f.id !== file.id))}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button onClick={() => setConfirmOpen(true)} disabled={uploading}>
        {isRedo ? t('homework.form.resubmit') : t('homework.submit')}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('homework.confirm.title')}</DialogTitle>
            <DialogDescription>{t('homework.confirm.desc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('homework.confirm.cancel')}
            </Button>
            <Button loading={submit.isPending} onClick={() => submit.mutate()}>
              {t('homework.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
