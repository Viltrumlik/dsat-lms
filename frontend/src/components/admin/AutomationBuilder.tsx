// Domain: Automation (admin)
// Description: Create / edit an automation rule — name, trigger (daily or event),
//   the visual condition tree, and the action list. Save persists via the write
//   serializer (which validates the DSL); Test dry-runs a saved rule against the
//   cohort with no side effects.
'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Save } from 'lucide-react'
import { automationAPI } from '@/lib/api/admin/automation'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
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
import { Textarea } from '@/components/ui/textarea'
import { ConditionGroup, newGroup } from '@/components/admin/automation/ConditionBuilder'
import { ActionListEditor } from '@/components/admin/automation/ActionListEditor'
import type {
  AutomationCatalog,
  AutomationDryRun,
  AutomationRule,
  AutomationTrigger,
  ConditionNode,
  RuleAction,
} from '@/types'

interface Draft {
  name: string
  description: string
  triggerType: AutomationTrigger
  eventKey: string
  conditions: Extract<ConditionNode, { type: 'group' }>
  actions: RuleAction[]
}

function toDraft(catalog: AutomationCatalog, rule: AutomationRule | null): Draft {
  if (rule) {
    const conditions =
      rule.conditions?.type === 'group' ? rule.conditions : newGroup()
    return {
      name: rule.name,
      description: rule.description,
      triggerType: rule.triggerType,
      eventKey: rule.eventKey,
      conditions: conditions as Extract<ConditionNode, { type: 'group' }>,
      actions: rule.actions,
    }
  }
  return {
    name: '',
    description: '',
    triggerType: 'scheduled_daily',
    eventKey: catalog.events[0]?.key ?? '',
    conditions: newGroup() as Extract<ConditionNode, { type: 'group' }>,
    actions: [],
  }
}

export function AutomationBuilder({
  catalog,
  rule,
  open,
  onOpenChange,
}: {
  catalog: AutomationCatalog
  rule: AutomationRule | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(catalog, rule))
  const [preview, setPreview] = React.useState<AutomationDryRun | null>(null)

  // Reset the form whenever the dialog opens for a different rule.
  React.useEffect(() => {
    if (open) {
      setDraft(toDraft(catalog, rule))
      setPreview(null)
    }
  }, [open, rule, catalog])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'automation-rules'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'automation-logs'] })
  }
  const onError = (err: unknown) =>
    toast({ variant: 'error', title: t('admin.automation.saveFailed'), description: parseApiError(err).message })

  const payload = () => ({
    name: draft.name.trim(),
    description: draft.description.trim(),
    trigger_type: draft.triggerType,
    event_key: draft.triggerType === 'event' ? draft.eventKey : '',
    conditions: draft.conditions,
    actions: draft.actions,
  })

  const save = useMutation({
    mutationFn: () =>
      rule ? automationAPI.updateRule(rule.id, payload()) : automationAPI.createRule(payload()),
    onSuccess: () => {
      invalidate()
      toast({ variant: 'success', title: t('admin.automation.saved') })
      onOpenChange(false)
    },
    onError,
  })

  const test = useMutation({
    mutationFn: () => automationAPI.testRule((rule as AutomationRule).id),
    onSuccess: (result: AutomationDryRun) => setPreview(result),
    onError,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {rule ? t('admin.automation.editRule') : t('admin.automation.newRule')}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
          {/* Basics */}
          <div className="space-y-2">
            <Label htmlFor="rule-name">{t('admin.automation.name')}</Label>
            <Input
              id="rule-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t('admin.automation.namePlaceholder')}
            />
            <Textarea
              value={draft.description}
              rows={1}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder={t('admin.automation.descriptionPlaceholder')}
            />
          </div>

          {/* Trigger */}
          <div className="flex flex-wrap items-center gap-2">
            <Label className="w-full text-sm font-semibold">{t('admin.automation.trigger')}</Label>
            <Select
              value={draft.triggerType}
              onValueChange={(v) => setDraft({ ...draft, triggerType: v as AutomationTrigger })}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.triggers.map((tr) => (
                  <SelectItem key={tr.key} value={tr.key}>
                    {tr.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {draft.triggerType === 'event' && (
              <Select value={draft.eventKey} onValueChange={(v) => setDraft({ ...draft, eventKey: v })}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder={t('admin.automation.pickEvent')} />
                </SelectTrigger>
                <SelectContent>
                  {catalog.events.map((ev) => (
                    <SelectItem key={ev.key} value={ev.key}>
                      {ev.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t('admin.automation.conditions')}</Label>
            <p className="text-xs text-muted-foreground">{t('admin.automation.conditionsHint')}</p>
            <ConditionGroup
              node={draft.conditions}
              catalog={catalog}
              depth={1}
              onChange={(n) =>
                setDraft({ ...draft, conditions: n as Extract<ConditionNode, { type: 'group' }> })
              }
            />
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t('admin.automation.actions')}</Label>
            <ActionListEditor
              catalog={catalog}
              actions={draft.actions}
              onChange={(a) => setDraft({ ...draft, actions: a })}
            />
          </div>

          {/* Dry-run preview */}
          {preview && (
            <div className="rounded-md border border-primary-200 bg-primary-50 p-3 text-sm dark:border-primary-800/50 dark:bg-primary-900/20">
              {t('admin.automation.dryRunResult', {
                matched: preview.matchedCount,
                total: preview.cohortSize,
              })}
              {preview.sample.length > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  — {preview.sample.map((s) => s.label).join(', ')}
                  {preview.matchedCount > preview.sample.length ? '…' : ''}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            disabled={!rule || test.isPending}
            loading={test.isPending}
            onClick={() => test.mutate()}
            title={!rule ? t('admin.automation.saveFirst') : undefined}
          >
            <FlaskConical className="h-4 w-4" /> {t('admin.automation.test')}
          </Button>
          <Button loading={save.isPending} disabled={!draft.name.trim()} onClick={() => save.mutate()}>
            <Save className="h-4 w-4" /> {t('admin.automation.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
