// Domain: Automation (admin)
// Description: Editor for a rule's action list — pick an action type, fill its
//   catalog-declared params (enum → select, text → textarea, string → input).
//   Bounded to catalog.limits.maxActions.
'use client'

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { AutomationCatalog, CatalogAction, RuleAction } from '@/types'

function blankAction(spec: CatalogAction): RuleAction {
  const params: Record<string, unknown> = {}
  for (const p of spec.params) {
    if (p.kind === 'enum') params[p.key] = p.choices[0] ?? ''
    else params[p.key] = ''
  }
  return { type: spec.type, params }
}

export function ActionListEditor({
  catalog,
  actions,
  onChange,
}: {
  catalog: AutomationCatalog
  actions: RuleAction[]
  onChange: (a: RuleAction[]) => void
}) {
  const t = useT()
  const canAdd = actions.length < catalog.limits.maxActions

  const specFor = (type: string) => catalog.actions.find((a) => a.type === type)

  const setAction = (i: number, action: RuleAction) =>
    onChange(actions.map((a, j) => (j === i ? action : a)))
  const removeAction = (i: number) => onChange(actions.filter((_, j) => j !== i))
  const changeType = (i: number, type: string) => {
    const spec = specFor(type)!
    setAction(i, blankAction(spec))
  }
  const setParam = (i: number, key: string, value: unknown) => {
    const action = actions[i]
    setAction(i, { ...action, params: { ...action.params, [key]: value } })
  }

  return (
    <div className="space-y-2">
      {actions.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('admin.automation.noActions')}</p>
      )}
      {actions.map((action, i) => {
        const spec = specFor(action.type)
        return (
          <div
            key={i}
            className="flex flex-wrap items-start gap-2 rounded-md border border-border bg-background p-2"
          >
            <Select value={action.type} onValueChange={(v) => changeType(i, v)}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.actions.map((a) => (
                  <SelectItem key={a.type} value={a.type}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-1 flex-wrap items-start gap-2">
              {spec?.params.map((p) => {
                const val = (action.params[p.key] ?? '') as string
                if (p.kind === 'enum') {
                  return (
                    <Select key={p.key} value={val} onValueChange={(v) => setParam(i, p.key, v)}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder={p.key} />
                      </SelectTrigger>
                      <SelectContent>
                        {p.choices.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                }
                if (p.kind === 'text') {
                  return (
                    <Textarea
                      key={p.key}
                      value={val}
                      rows={1}
                      placeholder={t(`admin.automation.param.${p.key}`)}
                      onChange={(e) => setParam(i, p.key, e.target.value)}
                      className="min-w-[12rem] flex-1"
                    />
                  )
                }
                return (
                  <Input
                    key={p.key}
                    value={val}
                    placeholder={t(`admin.automation.param.${p.key}`)}
                    onChange={(e) => setParam(i, p.key, e.target.value)}
                    className="w-44"
                  />
                )
              })}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeAction(i)}
              aria-label={t('admin.automation.remove')}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        )
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canAdd || catalog.actions.length === 0}
        onClick={() => onChange([...actions, blankAction(catalog.actions[0])])}
      >
        <Plus className="h-4 w-4" /> {t('admin.automation.addAction')}
      </Button>
    </div>
  )
}
