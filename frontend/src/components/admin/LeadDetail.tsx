// Domain: Admin (CRM)
// Description: Lead detail dialog — contact info, stage, the activity timeline
//   (add call/meeting/note), follow-up tasks (add + complete), and convert-to-student.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, GraduationCap, Phone, Plus, UserCheck } from 'lucide-react'
import { leadsAPI } from '@/lib/api/admin/leads'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { LeadActivityKind } from '@/types'

const ACTIVITY_KINDS: LeadActivityKind[] = ['note', 'call', 'meeting', 'email']

export function LeadDetail({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [activityKind, setActivityKind] = React.useState<LeadActivityKind>('note')
  const [activityBody, setActivityBody] = React.useState('')
  const [taskTitle, setTaskTitle] = React.useState('')
  const [taskDue, setTaskDue] = React.useState('')

  const query = useQuery({
    queryKey: ['admin', 'lead', leadId],
    queryFn: () => leadsAPI.get(leadId as string),
    enabled: open && !!leadId,
  })
  const lead = query.data

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'lead', leadId] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'leads-board'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'leads'] })
  }
  const onError = (err: unknown) =>
    toast({
      variant: 'error',
      title: t('admin.leads.actionFailed'),
      description: parseApiError(err).message,
    })

  const addActivity = useMutation({
    mutationFn: () => leadsAPI.addActivity(leadId as string, activityKind, activityBody.trim()),
    onSuccess: () => {
      setActivityBody('')
      invalidate()
    },
    onError,
  })

  const addTask = useMutation({
    mutationFn: () =>
      leadsAPI.addTask(leadId as string, taskTitle.trim(), new Date(taskDue).toISOString()),
    onSuccess: () => {
      setTaskTitle('')
      setTaskDue('')
      invalidate()
    },
    onError,
  })

  const toggleTask = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      leadsAPI.updateTask(id, { done }),
    onSuccess: invalidate,
    onError,
  })

  const convert = useMutation({
    mutationFn: () => leadsAPI.convert(leadId as string),
    onSuccess: () => {
      invalidate()
      toast({ variant: 'success', title: t('admin.leads.converted') })
    },
    onError,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lead ? lead.name : t('admin.leads.lead')}</DialogTitle>
        </DialogHeader>

        {query.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        )}
        {query.isError && (
          <p className="text-sm text-muted-foreground">{t('admin.leads.loadFailed')}</p>
        )}

        {lead && (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            {/* Contact + stage */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{t(`admin.leads.stageLabel.${lead.stage}`)}</Badge>
              {lead.email && <span className="text-muted-foreground">{lead.email}</span>}
              {lead.phone && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {lead.phone}
                </span>
              )}
              {lead.owner && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <UserCheck className="h-3.5 w-3.5" /> {lead.owner.fullName || lead.owner.email}
                </span>
              )}
            </div>
            {lead.note && <p className="rounded-md bg-muted/50 p-3 text-sm">{lead.note}</p>}

            {/* Convert */}
            {lead.convertedUser ? (
              <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
                <GraduationCap className="h-4 w-4" />
                {t('admin.leads.alreadyConverted', {
                  name: lead.convertedUser.fullName || lead.convertedUser.email,
                })}
              </div>
            ) : (
              <Button loading={convert.isPending} onClick={() => convert.mutate()}>
                <GraduationCap className="h-4 w-4" /> {t('admin.leads.convert')}
              </Button>
            )}

            {/* Follow-up tasks */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('admin.leads.tasks')}</h3>
              {lead.followUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('admin.leads.noTasks')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {lead.followUps.map((task) => (
                    <li key={task.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={task.done}
                        onCheckedChange={(v) => toggleTask.mutate({ id: task.id, done: v === true })}
                        aria-label={t('admin.leads.markDone')}
                      />
                      <span className={task.done ? 'text-muted-foreground line-through' : ''}>
                        {task.title}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(task.dueAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (taskTitle.trim() && taskDue) addTask.mutate()
                }}
              >
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={t('admin.leads.taskTitle')}
                  className="flex-1"
                />
                <Input
                  type="datetime-local"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  className="w-48"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  loading={addTask.isPending}
                  disabled={!taskTitle.trim() || !taskDue}
                >
                  <Plus className="h-4 w-4" /> {t('admin.leads.addTask')}
                </Button>
              </form>
            </div>

            {/* Activity timeline */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('admin.leads.timeline')}</h3>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (activityBody.trim()) addActivity.mutate()
                }}
              >
                <Select
                  value={activityKind}
                  onValueChange={(v) => setActivityKind(v as LeadActivityKind)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`admin.leads.activityKind.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={activityBody}
                  onChange={(e) => setActivityBody(e.target.value)}
                  rows={1}
                  placeholder={t('admin.leads.activityPlaceholder')}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  loading={addActivity.isPending}
                  disabled={!activityBody.trim()}
                >
                  <Plus className="h-4 w-4" /> {t('admin.leads.log')}
                </Button>
              </form>
              <ul className="space-y-2">
                {lead.activities.map((a) => (
                  <li key={a.id} className="flex gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p>
                        <span className="font-medium">{t(`admin.leads.activityKind.${a.kind}`)}</span>
                        {a.body ? ` — ${a.body}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.createdAt).toLocaleString()}
                        {a.author ? ` · ${a.author.fullName || a.author.email}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
