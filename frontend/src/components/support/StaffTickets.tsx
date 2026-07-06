// Domain: Support (staff)
// Description: The shared ticket queue — any staff sees all tickets, filters by
//   status/assignment, opens a thread to answer, claim (assign to me), and
//   close/reopen.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { Inbox } from 'lucide-react'
import { supportAPI } from '@/lib/api/support'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TicketStatusBadge } from './TicketStatusBadge'
import { TicketThread } from './TicketThread'
import type { TicketStatus } from '@/types'

function StaffTicketDialog({
  ticketId,
  onClose,
}: {
  ticketId: string | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [reply, setReply] = React.useState('')
  const qk = ['support', 'staff-ticket', ticketId]

  const { data: ticket } = useQuery({
    queryKey: qk,
    queryFn: () => supportAPI.staffTickets.get(ticketId as string),
    enabled: !!ticketId,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk })
    queryClient.invalidateQueries({ queryKey: ['support', 'staff-tickets'] })
  }

  const onError = (label: string) => (err: unknown) =>
    toast({ variant: 'error', title: t(label), description: parseApiError(err).message })

  const sendReply = useMutation({
    mutationFn: () => supportAPI.staffTickets.reply(ticketId as string, reply.trim()),
    onSuccess: () => {
      setReply('')
      invalidate()
    },
    onError: onError('teacher.tickets.replyFailed'),
  })
  const assign = useMutation({
    mutationFn: (assignee: string | null) =>
      supportAPI.staffTickets.assign(ticketId as string, assignee),
    onSuccess: invalidate,
    onError: onError('teacher.tickets.actionFailed'),
  })
  const setStatus = useMutation({
    mutationFn: (status: 'open' | 'closed') =>
      supportAPI.staffTickets.setStatus(ticketId as string, status),
    onSuccess: invalidate,
    onError: onError('teacher.tickets.actionFailed'),
  })

  const assignedToMe = ticket?.assignedTo?.id === user?.id

  return (
    <Dialog open={!!ticketId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ticket && <TicketStatusBadge status={ticket.status} />}
            {ticket && (
              <Badge variant={ticket.subject === 'math' ? 'math' : 'rw'}>
                {t(`support.subject.${ticket.subject}`)}
              </Badge>
            )}
            <span className="text-sm font-normal text-muted-foreground">
              {ticket?.student.fullName}
            </span>
          </DialogTitle>
        </DialogHeader>

        {ticket && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {assignedToMe ? (
                <Button variant="outline" size="sm" onClick={() => assign.mutate(null)} loading={assign.isPending}>
                  {t('teacher.tickets.unassign')}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => assign.mutate(user!.id)} loading={assign.isPending}>
                  {t('teacher.tickets.assignToMe')}
                </Button>
              )}
              {ticket.assignedTo && (
                <span className="text-xs text-muted-foreground">
                  {t('teacher.tickets.assignedTo', { name: ticket.assignedTo.fullName })}
                </span>
              )}
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

            {ticket.status !== 'closed' && (
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
                  placeholder={t('teacher.tickets.answerPlaceholder')}
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button type="submit" loading={sendReply.isPending} disabled={!reply.trim()}>
                    {t('teacher.tickets.answer')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function StaffTickets() {
  const { t, locale } = useI18n()
  const dfLocale = locale === 'uz' ? uzDate : undefined
  const [status, setStatus] = React.useState<'all' | TicketStatus>('all')
  const [assigned, setAssigned] = React.useState<'all' | 'me' | 'unassigned'>('all')
  const [openId, setOpenId] = React.useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['support', 'staff-tickets', status, assigned],
    queryFn: () =>
      supportAPI.staffTickets.list({
        ...(status !== 'all' ? { status } : {}),
        ...(assigned !== 'all' ? { assigned } : {}),
      }),
  })

  const tickets = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('teacher.tickets.allStatuses')}</SelectItem>
            <SelectItem value="open">{t('support.ticketStatus.open')}</SelectItem>
            <SelectItem value="answered">{t('support.ticketStatus.answered')}</SelectItem>
            <SelectItem value="closed">{t('support.ticketStatus.closed')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assigned} onValueChange={(v) => setAssigned(v as typeof assigned)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('teacher.tickets.allAssignments')}</SelectItem>
            <SelectItem value="me">{t('teacher.tickets.assignedToMe')}</SelectItem>
            <SelectItem value="unassigned">{t('teacher.tickets.unassigned')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}
      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('teacher.tickets.loadFailed')}
          </CardContent>
        </Card>
      )}
      {data && tickets.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.tickets.empty')}</p>
          </CardContent>
        </Card>
      )}
      {data && tickets.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('teacher.tickets.student')}</TableHead>
                <TableHead>{t('teacher.tickets.subject')}</TableHead>
                <TableHead>{t('teacher.tickets.question')}</TableHead>
                <TableHead>{t('teacher.tickets.status')}</TableHead>
                <TableHead>{t('teacher.tickets.assignee')}</TableHead>
                <TableHead>{t('teacher.tickets.activity')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  className="cursor-pointer"
                  onClick={() => setOpenId(ticket.id)}
                >
                  <TableCell className="font-medium">{ticket.student.fullName}</TableCell>
                  <TableCell>
                    <Badge variant={ticket.subject === 'math' ? 'math' : 'rw'}>
                      {t(`support.subject.${ticket.subject}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {ticket.body}
                  </TableCell>
                  <TableCell>
                    <TicketStatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ticket.assignedTo?.fullName ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(ticket.lastReplyAt ?? ticket.createdAt), 'PP · HH:mm', {
                      locale: dfLocale,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <StaffTicketDialog ticketId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
