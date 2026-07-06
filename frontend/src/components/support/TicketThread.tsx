// Domain: Support
// Description: Presentational ticket thread — the original question (with
//   attachments) followed by the reply messages. Shared by the student thread
//   page and the staff ticket dialog.
'use client'

import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { Paperclip } from 'lucide-react'
import { filesAPI } from '@/lib/api/files'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import type { SupportTicket, TicketAttachment } from '@/types'

function AttachmentChip({ attachment }: { attachment: TicketAttachment }) {
  const { t } = useI18n()
  const { toast } = useToast()
  return (
    <button
      type="button"
      onClick={() =>
        filesAPI
          .download(attachment.downloadUrl, attachment.originalName)
          .catch(() => toast({ variant: 'error', title: t('support.tickets.downloadFailed') }))
      }
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
    >
      <Paperclip className="h-3 w-3" /> {attachment.originalName}
    </button>
  )
}

function Message({
  name,
  time,
  body,
  isStaff,
  label,
  children,
}: {
  name: string
  time: string
  body: string
  isStaff: boolean
  label?: string
  children?: React.ReactNode
}) {
  const { locale } = useI18n()
  const dfLocale = locale === 'uz' ? uzDate : undefined
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        isStaff ? 'border-primary/40 bg-primary-50/50 dark:bg-primary-800/10' : 'border-border'
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-sm">
        <span className="font-medium">{name}</span>
        {label && <Badge variant={isStaff ? 'success' : 'secondary'}>{label}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          {format(new Date(time), 'PP · HH:mm', { locale: dfLocale })}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{body}</p>
      {children}
    </div>
  )
}

export function TicketThread({ ticket }: { ticket: SupportTicket }) {
  const { t } = useI18n()
  return (
    <div className="space-y-3">
      <Message
        name={ticket.student.fullName}
        time={ticket.createdAt}
        body={ticket.body}
        isStaff={false}
        label={t('support.tickets.question')}
      >
        {ticket.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {ticket.attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} />
            ))}
          </div>
        )}
      </Message>

      {ticket.replies.map((reply) => (
        <Message
          key={reply.id}
          name={reply.author.fullName}
          time={reply.createdAt}
          body={reply.body}
          isStaff={reply.isStaffAnswer}
          label={reply.isStaffAnswer ? t('support.tickets.staffAnswer') : undefined}
        />
      ))}
    </div>
  )
}
