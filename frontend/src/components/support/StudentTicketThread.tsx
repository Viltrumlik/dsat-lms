// Domain: Support
// Description: A student's ticket thread — read the conversation, reply (unless
//   closed), and close/reopen the ticket.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supportAPI } from '@/lib/api/support'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { TicketStatusBadge } from './TicketStatusBadge'
import { TicketThread } from './TicketThread'

export function StudentTicketThread({ ticketId }: { ticketId: string }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [reply, setReply] = React.useState('')
  const qk = ['support', 'ticket', ticketId]

  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: qk,
    queryFn: () => supportAPI.tickets.get(ticketId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk })
    queryClient.invalidateQueries({ queryKey: ['support', 'my-tickets'] })
  }

  const sendReply = useMutation({
    mutationFn: () => supportAPI.tickets.reply(ticketId, reply.trim()),
    onSuccess: () => {
      setReply('')
      invalidate()
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('support.tickets.replyFailed'), description: parseApiError(err).message }),
  })

  const setStatus = useMutation({
    mutationFn: (status: 'open' | 'closed') => supportAPI.tickets.setStatus(ticketId, status),
    onSuccess: invalidate,
    onError: (err) =>
      toast({ variant: 'error', title: t('support.tickets.statusFailed'), description: parseApiError(err).message }),
  })

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded bg-muted" />
  }
  if (isError || !ticket) {
    return <p className="text-sm text-muted-foreground">{t('support.tickets.notFound')}</p>
  }

  return (
    <div className="space-y-4">
      <Link href="/support/tickets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t('support.tickets.back')}
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <TicketStatusBadge status={ticket.status} />
        <Badge variant={ticket.subject === 'math' ? 'math' : 'rw'}>
          {t(`support.subject.${ticket.subject}`)}
        </Badge>
        <div className="ml-auto">
          {ticket.status === 'closed' ? (
            <Button variant="outline" size="sm" onClick={() => setStatus.mutate('open')} loading={setStatus.isPending}>
              {t('support.tickets.reopen')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setStatus.mutate('closed')} loading={setStatus.isPending}>
              {t('support.tickets.close')}
            </Button>
          )}
        </div>
      </div>

      <TicketThread ticket={ticket} />

      {ticket.status === 'closed' ? (
        <Card>
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            {t('support.tickets.closedHint')}
          </CardContent>
        </Card>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (reply.trim()) sendReply.mutate()
          }}
          className="space-y-2"
        >
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t('support.tickets.replyPlaceholder')}
            rows={3}
          />
          <div className="flex justify-end">
            <Button type="submit" loading={sendReply.isPending} disabled={!reply.trim()}>
              {t('support.tickets.send')}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
