// Domain: Notifications (admin)
// Description: Compose broadcasts to a segment (all students / all staff / a role /
//   a class) over in-app + email, with reusable templates. Drafts are sent on
//   demand; students receive in-app announcements in their existing feed. Backed by
//   /admin/announcements/ (IsAdmin).
'use client'

import * as React from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Megaphone, Plus, Send, Trash2 } from 'lucide-react'
import {
  adminAnnouncementsAPI,
  adminMessageTemplatesAPI,
  type AnnouncementPayload,
} from '@/lib/api/admin/announcements'
import { teacherAPI } from '@/lib/api/teacher'
import { cursorFromUrl } from '@/lib/api/client'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type { Announcement, AnnouncementAudience } from '@/types'

const ROLES = ['student', 'teacher', 'receptionist', 'academic_manager', 'admin']
const CHANNELS = ['in_app', 'email'] as const

function Composer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [audienceType, setAudienceType] = React.useState<AnnouncementAudience>('all_students')
  const [audienceRef, setAudienceRef] = React.useState('')
  const [channels, setChannels] = React.useState<Record<string, boolean>>({ in_app: true })

  React.useEffect(() => {
    if (open) {
      setTitle('')
      setBody('')
      setAudienceType('all_students')
      setAudienceRef('')
      setChannels({ in_app: true })
    }
  }, [open])

  const classes = useQuery({
    queryKey: ['teacher', 'classes'],
    queryFn: teacherAPI.classes,
    enabled: open && audienceType === 'class',
  })
  const templates = useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: adminMessageTemplatesAPI.list,
    enabled: open,
  })

  const create = useMutation({
    mutationFn: () => {
      const payload: AnnouncementPayload = {
        title: title.trim(),
        body: body.trim(),
        audienceType,
        audienceRef:
          audienceType === 'role' || audienceType === 'class' ? audienceRef : undefined,
        channels: CHANNELS.filter((c) => channels[c]),
      }
      return adminAnnouncementsAPI.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] })
      onOpenChange(false)
      toast({ variant: 'success', title: t('admin.announcements.created') })
    },
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  const needsRef = audienceType === 'role' || audienceType === 'class'
  const valid =
    title.trim() &&
    body.trim() &&
    CHANNELS.some((c) => channels[c]) &&
    (!needsRef || audienceRef)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('admin.announcements.new')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(templates.data ?? []).length > 0 && (
            <div>
              <Label>{t('admin.announcements.template')}</Label>
              <Select
                onValueChange={(id) => {
                  const tpl = templates.data?.find((x) => x.id === id)
                  if (tpl) {
                    if (!title) setTitle(tpl.subject || tpl.name)
                    setBody(tpl.body)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.announcements.insertTemplate')} />
                </SelectTrigger>
                <SelectContent>
                  {(templates.data ?? []).map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="a-title">{t('admin.announcements.title')}</Label>
            <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="a-body">{t('admin.announcements.body')}</Label>
            <Textarea id="a-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t('admin.announcements.audience')}</Label>
              <Select
                value={audienceType}
                onValueChange={(v) => {
                  setAudienceType(v as AnnouncementAudience)
                  setAudienceRef('')
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_students">
                    {t('admin.announcements.audiences.all_students')}
                  </SelectItem>
                  <SelectItem value="all_staff">
                    {t('admin.announcements.audiences.all_staff')}
                  </SelectItem>
                  <SelectItem value="role">{t('admin.announcements.audiences.role')}</SelectItem>
                  <SelectItem value="class">{t('admin.announcements.audiences.class')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audienceType === 'role' && (
              <div>
                <Label>{t('admin.announcements.role')}</Label>
                <Select value={audienceRef} onValueChange={setAudienceRef}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.announcements.pick')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`admin.roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {audienceType === 'class' && (
              <div>
                <Label>{t('admin.announcements.class')}</Label>
                <Select value={audienceRef} onValueChange={setAudienceRef}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.announcements.pick')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(classes.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label>{t('admin.announcements.channels')}</Label>
            <div className="mt-1 flex gap-4">
              {CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!channels[c]}
                    onCheckedChange={(v) => setChannels((m) => ({ ...m, [c]: v === true }))}
                  />
                  {t(`admin.announcements.channelNames.${c}`)}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>
            {t('admin.announcements.saveDraft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AnnouncementsView() {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [composerOpen, setComposerOpen] = React.useState(false)

  const query = useInfiniteQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: ({ pageParam }) => adminAnnouncementsAPI.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })
  const rows = query.data?.pages.flatMap((p) => p.data) ?? []

  const send = useMutation({
    mutationFn: (id: string) => adminAnnouncementsAPI.send(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] })
      toast({ variant: 'success', title: t('admin.announcements.sentToast', { n: data.sent }) })
    },
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminAnnouncementsAPI.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  const audienceLabel = (a: Announcement) => {
    if (a.audienceType === 'role') return t(`admin.roles.${a.audienceRef}`)
    return t(`admin.announcements.audiences.${a.audienceType}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('admin.announcements.heading')}</h1>
          <p className="text-muted-foreground">{t('admin.announcements.subtitle')}</p>
        </div>
        <Button onClick={() => setComposerOpen(true)}>
          <Plus className="h-4 w-4" /> {t('admin.announcements.new')}
        </Button>
      </div>

      {query.data && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Megaphone className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('admin.announcements.empty')}</p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.announcements.title')}</TableHead>
                  <TableHead>{t('admin.announcements.audience')}</TableHead>
                  <TableHead>{t('admin.announcements.status')}</TableHead>
                  <TableHead>{t('admin.announcements.delivered')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>{audienceLabel(a)}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === 'sent' ? 'success' : 'secondary'}>
                        {t(`admin.announcements.statuses.${a.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {a.status === 'sent'
                        ? a.deliveryCount
                        : a.sentAt
                          ? format(new Date(a.sentAt), 'PP')
                          : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {a.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={send.isPending && send.variables === a.id}
                            onClick={() => send.mutate(a.id)}
                          >
                            <Send className="h-4 w-4" /> {t('admin.announcements.send')}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('admin.announcements.delete')}
                          onClick={() => remove.mutate(a.id)}
                        >
                          <Trash2 className="h-4 w-4 text-error" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t('admin.announcements.loadMore')}
          </Button>
        </div>
      )}

      <Composer open={composerOpen} onOpenChange={setComposerOpen} />
    </div>
  )
}
