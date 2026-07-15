// Domain: Admin (CRM)
// Description: Leads kanban — columns per pipeline stage, cards draggable between
//   columns (native HTML5 drag, optimistic move with rollback) plus a per-card
//   stage Select as the accessible write path. Click a card to open its detail.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'
import { leadsAPI, type LeadWritePayload } from '@/lib/api/admin/leads'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LeadDetail } from '@/components/admin/LeadDetail'
import type { LeadBoard, LeadListItem, LeadStage } from '@/types'

const STAGES: LeadStage[] = ['new', 'contacted', 'trial', 'registered', 'lost']

const BOARD_KEY = ['admin', 'leads-board']

function moveCard(board: LeadBoard, id: string, toStage: LeadStage): LeadBoard {
  let moved: LeadListItem | undefined
  const columns = {} as LeadBoard['columns']
  for (const stage of STAGES) {
    columns[stage] = (board.columns[stage] ?? []).filter((c) => {
      if (c.id === id) {
        moved = c
        return false
      }
      return true
    })
  }
  if (moved) columns[toStage] = [{ ...moved, stage: toStage }, ...columns[toStage]]
  return { columns }
}

function CreateLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<LeadWritePayload>({ name: '', email: '', phone: '' })

  React.useEffect(() => {
    if (open) setForm({ name: '', email: '', phone: '' })
  }, [open])

  const create = useMutation({
    mutationFn: () => leadsAPI.create(form),
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: BOARD_KEY })
      toast({ variant: 'success', title: t('admin.leads.created') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.leads.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.leads.newLead')}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (form.name.trim()) create.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="ld-name">{t('admin.leads.name')}</Label>
            <Input
              id="ld-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ld-email">{t('admin.leads.email')}</Label>
              <Input
                id="ld-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ld-phone">{t('admin.leads.phone')}</Label>
              <Input
                id="ld-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!form.name.trim()}>
              {t('admin.leads.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function LeadsBoard() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [dragOver, setDragOver] = React.useState<LeadStage | null>(null)

  const query = useQuery({ queryKey: BOARD_KEY, queryFn: () => leadsAPI.board() })

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) =>
      leadsAPI.update(id, { stage }),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY })
      const prev = queryClient.getQueryData<LeadBoard>(BOARD_KEY)
      if (prev) queryClient.setQueryData<LeadBoard>(BOARD_KEY, moveCard(prev, id, stage))
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(BOARD_KEY, ctx.prev)
      toast({
        variant: 'error',
        title: t('admin.leads.actionFailed'),
        description: parseApiError(err).message,
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: BOARD_KEY }),
  })

  const moveTo = (id: string, stage: LeadStage) => move.mutate({ id, stage })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t('admin.leads.newLead')}
        </Button>
      </div>

      {query.isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          {STAGES.map((s) => (
            <div key={s} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('admin.leads.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          {STAGES.map((stage) => {
            const cards = query.data.columns[stage] ?? []
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(stage)
                }}
                onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
                onDrop={() => {
                  if (dragId) moveTo(dragId, stage)
                  setDragId(null)
                  setDragOver(null)
                }}
                className={`rounded-lg border p-2 transition-colors ${
                  dragOver === stage ? 'border-primary bg-primary-50/40 dark:bg-primary-800/20' : 'border-border bg-muted/30'
                }`}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold">{t(`admin.leads.stageLabel.${stage}`)}</span>
                  <Badge variant="secondary">{cards.length}</Badge>
                </div>
                <div className="space-y-2">
                  {cards.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => setDragId(null)}
                      className="cursor-grab rounded-md border border-border bg-card p-2.5 text-sm shadow-sm active:cursor-grabbing"
                    >
                      <button
                        type="button"
                        className="block w-full text-left font-medium hover:underline"
                        onClick={() => setDetailId(lead.id)}
                      >
                        {lead.name}
                      </button>
                      {lead.email && (
                        <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {lead.openTasks > 0 && (
                          <Badge variant="outline" className="gap-1">
                            <Users className="h-3 w-3" /> {lead.openTasks}
                          </Badge>
                        )}
                        <Select value={lead.stage} onValueChange={(v) => moveTo(lead.id, v as LeadStage)}>
                          <SelectTrigger className="ml-auto h-7 w-28" aria-label={t('admin.leads.stage')}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {t(`admin.leads.stageLabel.${s}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                      {t('admin.leads.emptyColumn')}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreateLeadDialog open={createOpen} onOpenChange={setCreateOpen} />
      <LeadDetail
        leadId={detailId}
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) setDetailId(null)
        }}
      />
    </div>
  )
}
