// Domain: Automation (admin)
// Description: Recursive visual editor for the condition DSL tree — AND/OR groups
//   of leaf conditions (field · operator · value), driven entirely by the backend
//   catalog. Emits the same JSON shape the validator accepts. Depth/breadth are
//   bounded to the catalog limits so a rule can't be built past what the server
//   allows.
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
import type { AutomationCatalog, CatalogField, ConditionNode } from '@/types'

function fieldSpec(catalog: AutomationCatalog, key: string): CatalogField | undefined {
  return catalog.fields.find((f) => f.key === key)
}

function defaultValue(field: CatalogField, op: string): unknown {
  if (op === 'in') return field.choices.length ? [field.choices[0]] : []
  if (field.type === 'number') return 0
  return field.choices[0] ?? ''
}

export function newCondition(catalog: AutomationCatalog): ConditionNode {
  const field = catalog.fields[0]
  const op = field.ops[0]
  return { type: 'condition', field: field.key, op, value: defaultValue(field, op) }
}

export function newGroup(): ConditionNode {
  return { type: 'group', op: 'and', children: [] }
}

function LeafEditor({
  node,
  catalog,
  onChange,
  onRemove,
}: {
  node: Extract<ConditionNode, { type: 'condition' }>
  catalog: AutomationCatalog
  onChange: (n: ConditionNode) => void
  onRemove: () => void
}) {
  const t = useT()
  const spec = fieldSpec(catalog, node.field) ?? catalog.fields[0]
  const opLabel = (op: string) =>
    catalog.operators.find((o) => o.op === op)?.label ?? op

  const changeField = (key: string) => {
    const f = fieldSpec(catalog, key)!
    const op = f.ops.includes(node.op) ? node.op : f.ops[0]
    onChange({ type: 'condition', field: key, op, value: defaultValue(f, op) })
  }
  const changeOp = (op: string) =>
    onChange({ ...node, op, value: defaultValue(spec, op) })

  const toggleChoice = (choice: string) => {
    const arr = Array.isArray(node.value) ? [...(node.value as string[])] : []
    const i = arr.indexOf(choice)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(choice)
    onChange({ ...node, value: arr })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2">
      <Select value={node.field} onValueChange={changeField}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {catalog.fields.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={node.op} onValueChange={changeOp}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {spec.ops.map((op) => (
            <SelectItem key={op} value={op}>
              {opLabel(op)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value editor */}
      {node.op === 'in' ? (
        <div className="flex flex-wrap gap-1">
          {spec.choices.map((c) => {
            const on = Array.isArray(node.value) && (node.value as string[]).includes(c)
            return (
              <button
                type="button"
                key={c}
                onClick={() => toggleChoice(c)}
                className={
                  on
                    ? 'rounded-full bg-primary-600 px-2.5 py-0.5 text-xs text-white'
                    : 'rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground'
                }
              >
                {c}
              </button>
            )
          })}
        </div>
      ) : spec.type === 'number' ? (
        <Input
          type="number"
          value={String(node.value ?? '')}
          // Coerce an empty field to 0 — the DSL value must always be a number, or
          // the backend rejects the whole rule with an opaque 400 on save.
          onChange={(e) =>
            onChange({ ...node, value: e.target.value === '' ? 0 : Number(e.target.value) })
          }
          className="w-28"
        />
      ) : (
        <Select value={String(node.value ?? '')} onValueChange={(v) => onChange({ ...node, value: v })}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spec.choices.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto"
        onClick={onRemove}
        aria-label={t('admin.automation.remove')}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  )
}

export function ConditionGroup({
  node,
  catalog,
  depth,
  onChange,
  onRemove,
}: {
  node: Extract<ConditionNode, { type: 'group' }>
  catalog: AutomationCatalog
  depth: number
  onChange: (n: ConditionNode) => void
  onRemove?: () => void
}) {
  const t = useT()
  // Backend counts a leaf's depth as its group's depth + 1 and rejects depth >
  // maxDepth. So a condition is only allowed while depth < maxDepth, and a nested
  // group (which must still be able to hold a condition) only while depth <
  // maxDepth - 1. Match those exactly so the UI never builds a rejected tree.
  const canAddCondition = depth < catalog.limits.maxDepth
  const canNest = depth < catalog.limits.maxDepth - 1
  const canAdd = node.children.length < catalog.limits.maxChildren

  const setChild = (i: number, child: ConditionNode) => {
    const children = [...node.children]
    children[i] = child
    onChange({ ...node, children })
  }
  const removeChild = (i: number) =>
    onChange({ ...node, children: node.children.filter((_, j) => j !== i) })
  const add = (child: ConditionNode) =>
    onChange({ ...node, children: [...node.children, child] })

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Select value={node.op} onValueChange={(v) => onChange({ ...node, op: v as 'and' | 'or' })}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">{t('admin.automation.matchAll')}</SelectItem>
            <SelectItem value="or">{t('admin.automation.matchAny')}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{t('admin.automation.ofTheFollowing')}</span>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={onRemove}
            aria-label={t('admin.automation.removeGroup')}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {node.children.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">{t('admin.automation.noConditions')}</p>
      )}

      <div className="space-y-2 pl-3">
        {node.children.map((child, i) =>
          child.type === 'group' ? (
            <ConditionGroup
              key={i}
              node={child}
              catalog={catalog}
              depth={depth + 1}
              onChange={(c) => setChild(i, c)}
              onRemove={() => removeChild(i)}
            />
          ) : (
            <LeafEditor
              key={i}
              node={child}
              catalog={catalog}
              onChange={(c) => setChild(i, c)}
              onRemove={() => removeChild(i)}
            />
          )
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd || !canAddCondition}
          onClick={() => add(newCondition(catalog))}
        >
          <Plus className="h-4 w-4" /> {t('admin.automation.addCondition')}
        </Button>
        {canNest && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canAdd}
            onClick={() => add(newGroup())}
          >
            <Plus className="h-4 w-4" /> {t('admin.automation.addGroup')}
          </Button>
        )}
      </div>
    </div>
  )
}
