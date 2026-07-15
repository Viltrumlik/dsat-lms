// Domain: Automation (admin)
// Description: The automation control surface — a Rules tab (list + enable toggle +
//   edit + delete + "Run now" sweep) and an Activity log tab (recent rule runs).
//   Rules are authored in the AutomationBuilder dialog.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { automationAPI } from '@/lib/api/admin/automation'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AutomationBuilder } from '@/components/admin/AutomationBuilder'
import type { AutomationLog, AutomationRule } from '@/types'

const LOG_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  ok: 'success',
  skipped: 'warning',
  error: 'error',
}

export function AutomationView() {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [builderOpen, setBuilderOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AutomationRule | null>(null)

  const catalogQuery = useQuery({
    queryKey: ['admin', 'automation-catalog'],
    queryFn: automationAPI.catalog,
    staleTime: 5 * 60 * 1000,
  })
  const rulesQuery = useQuery({
    queryKey: ['admin', 'automation-rules'],
    queryFn: () => automationAPI.listRules(),
  })
  const logsQuery = useQuery({
    queryKey: ['admin', 'automation-logs'],
    queryFn: () => automationAPI.listLogs(),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'automation-rules'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'automation-logs'] })
  }
  const onError = (err: unknown) =>
    toast({ variant: 'error', title: t('admin.automation.actionFailed'), description: parseApiError(err).message })

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      automationAPI.updateRule(id, { enabled }),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => automationAPI.deleteRule(id),
    onSuccess: invalidate,
    onError,
  })
  const runSweep = useMutation({
    mutationFn: () => automationAPI.runSweep(),
    onSuccess: (r) => {
      invalidate()
      toast({
        variant: 'success',
        title: t('admin.automation.sweepDone', { acted: r.acted, matched: r.matched }),
      })
    },
    onError,
  })

  const openCreate = () => {
    setEditing(null)
    setBuilderOpen(true)
  }
  const openEdit = (rule: AutomationRule) => {
    setEditing(rule)
    setBuilderOpen(true)
  }

  const rules = rulesQuery.data?.data ?? []
  const logs = logsQuery.data?.data ?? []
  const catalog = catalogQuery.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('admin.automation.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('admin.automation.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" loading={runSweep.isPending} onClick={() => runSweep.mutate()}>
            <Play className="h-4 w-4" /> {t('admin.automation.runNow')}
          </Button>
          <Button onClick={openCreate} disabled={!catalog}>
            <Plus className="h-4 w-4" /> {t('admin.automation.newRule')}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">{t('admin.automation.rulesTab')}</TabsTrigger>
          <TabsTrigger value="logs">{t('admin.automation.logsTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-3">
          {rulesQuery.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : rules.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('admin.automation.noRules')}
              </CardContent>
            </Card>
          ) : (
            rules.map((rule) => (
              <Card key={rule.id}>
                <CardContent className="flex flex-wrap items-center gap-3 py-4">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(enabled) =>
                      toggle.mutate({ id: rule.id, enabled: enabled === true })
                    }
                    aria-label={t('admin.automation.toggle')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant="secondary">
                        {rule.triggerType === 'event'
                          ? t('admin.automation.triggerEvent')
                          : t('admin.automation.triggerDaily')}
                      </Badge>
                      {!rule.enabled && (
                        <Badge variant="warning">{t('admin.automation.disabled')}</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {rule.description || t('admin.automation.noDescription')} ·{' '}
                      {t('admin.automation.actionsCount', { count: rule.actions.length })} ·{' '}
                      {t('admin.automation.runsCount', { count: rule.logCount })}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(rule)} aria-label={t('admin.automation.edit')}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(t('admin.automation.confirmDelete'))) remove.mutate(rule.id)
                    }}
                    aria-label={t('admin.automation.delete')}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="logs">
          {logsQuery.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : logs.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('admin.automation.noLogs')}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {logs.map((log: AutomationLog) => (
                  <div key={log.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <Badge variant={LOG_STATUS_VARIANT[log.status] ?? 'secondary'}>{log.status}</Badge>
                    <span className="font-medium">{log.ruleName}</span>
                    <span className="text-muted-foreground">{log.subjectLabel}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {log.actionsTaken.length > 0
                        ? log.actionsTaken.map((a) => `${a.type ?? ''}:${a.status}`).join(', ')
                        : t('admin.automation.matchedNoActions')}{' '}
                      · {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {catalog && (
        <AutomationBuilder
          catalog={catalog}
          rule={editing}
          open={builderOpen}
          onOpenChange={setBuilderOpen}
        />
      )}
    </div>
  )
}
