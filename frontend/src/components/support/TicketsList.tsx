// Domain: Support
// Description: A student's support tickets — list + "Ask a question" dialog with
//   subject/priority, body, and optional file attachments (via the files pipeline).
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { MessageSquarePlus, Paperclip, Plus, X } from 'lucide-react'
import { supportAPI } from '@/lib/api/support'
import { filesAPI } from '@/lib/api/files'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TicketStatusBadge } from './TicketStatusBadge'
import type { SupportSubject, TicketPriority } from '@/types'

const QK = ['support', 'my-tickets']

function AskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [subject, setSubject] = React.useState<SupportSubject>('math')
  const [priority, setPriority] = React.useState<TicketPriority>('normal')
  const [body, setBody] = React.useState('')
  const [files, setFiles] = React.useState<{ id: string; name: string }[]>([])
  const [uploading, setUploading] = React.useState(false)

  function reset() {
    setSubject('math')
    setPriority('normal')
    setBody('')
    setFiles([])
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (picked.length === 0) return
    setUploading(true)
    try {
      for (const file of picked) {
        const att = await filesAPI.upload({ file, kind: 'document' })
        setFiles((prev) => [...prev, { id: att.id, name: att.originalName }])
      }
    } catch (err) {
      toast({ variant: 'error', title: t('support.ask.uploadFailed'), description: parseApiError(err).message })
    } finally {
      setUploading(false)
    }
  }

  const create = useMutation({
    mutationFn: () =>
      supportAPI.tickets.create({
        subject,
        priority,
        body: body.trim(),
        attachmentIds: files.map((f) => f.id),
      }),
    onSuccess: () => {
      onOpenChange(false)
      reset()
      queryClient.invalidateQueries({ queryKey: QK })
      toast({ variant: 'success', title: t('support.ask.submitted') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('support.ask.failed'), description: parseApiError(err).message }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('support.ask.title')}</DialogTitle>
          <DialogDescription>{t('support.ask.desc')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim()) create.mutate()
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('support.ask.subject')}</Label>
              <Select value={subject} onValueChange={(v) => setSubject(v as SupportSubject)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="math">{t('support.subject.math')}</SelectItem>
                  <SelectItem value="reading_writing">
                    {t('support.subject.reading_writing')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('support.ask.priority')}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('support.priority.low')}</SelectItem>
                  <SelectItem value="normal">{t('support.priority.normal')}</SelectItem>
                  <SelectItem value="high">{t('support.priority.high')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ticket-body">{t('support.ask.body')}</Label>
            <Textarea
              id="ticket-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('support.ask.bodyPlaceholder')}
              rows={5}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ticket-files" className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> {t('support.ask.attachments')}
            </Label>
            <input
              id="ticket-files"
              type="file"
              multiple
              onChange={onPickFiles}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                  >
                    {f.name}
                    <button
                      type="button"
                      aria-label={t('support.ask.removeFile')}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('teacher.common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!body.trim() || uploading}>
              {t('support.ask.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TicketsList() {
  const { t, locale } = useI18n()
  const dfLocale = locale === 'uz' ? uzDate : undefined
  const [askOpen, setAskOpen] = React.useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: QK,
    queryFn: () => supportAPI.tickets.list(),
  })

  const tickets = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAskOpen(true)}>
          <Plus className="h-4 w-4" /> {t('support.ask.cta')}
        </Button>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}
      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('support.tickets.loadFailed')}
          </CardContent>
        </Card>
      )}
      {data && tickets.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <MessageSquarePlus className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('support.tickets.empty')}</p>
            <Button onClick={() => setAskOpen(true)}>{t('support.ask.cta')}</Button>
          </CardContent>
        </Card>
      )}

      {tickets.map((ticket) => (
        <Link key={ticket.id} href={`/support/tickets/${ticket.id}`}>
          <Card className="transition-colors hover:border-primary">
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center gap-2">
                <TicketStatusBadge status={ticket.status} />
                <Badge variant={ticket.subject === 'math' ? 'math' : 'rw'}>
                  {t(`support.subject.${ticket.subject}`)}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {format(new Date(ticket.lastReplyAt ?? ticket.createdAt), 'PP · HH:mm', {
                    locale: dfLocale,
                  })}
                </span>
              </div>
              <p className="line-clamp-2 text-sm">{ticket.body}</p>
              <p className="text-xs text-muted-foreground">
                {t('support.tickets.replyCount', { n: ticket.replyCount })}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}

      <AskDialog open={askOpen} onOpenChange={setAskOpen} />
    </div>
  )
}
