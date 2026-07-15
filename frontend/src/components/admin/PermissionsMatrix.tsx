// Domain: Identity (admin)
// Description: Role × capability switch grid (Phase 5.6a). Toggling a cell stages a
//   sparse override; Save PUTs the edits. Admin's column is read-only (always
//   omnipotent). NOTE: this configures COARSE UI capability gating — per-endpoint
//   enforcement stays role-based server-side.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, RotateCcw, Save, ShieldCheck } from 'lucide-react'
import { adminPermissionsAPI } from '@/lib/api/admin/permissions'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import type { PermissionMatrix, PermissionOverride } from '@/types'

const cellKey = (role: string, capability: string) => `${role}|${capability}`

export function PermissionsMatrix() {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  // Staged toggles overlaying the fetched matrix: cellKey → desired `allowed`.
  const [edits, setEdits] = React.useState<Map<string, boolean>>(new Map())

  const query = useQuery({
    queryKey: ['admin', 'permissions-matrix'],
    queryFn: adminPermissionsAPI.getMatrix,
  })
  const data = query.data

  const save = useMutation({
    mutationFn: (overrides: PermissionOverride[]) => adminPermissionsAPI.updateMatrix(overrides),
    onSuccess: (fresh: PermissionMatrix) => {
      queryClient.setQueryData(['admin', 'permissions-matrix'], fresh)
      setEdits(new Map())
      toast({ variant: 'success', title: t('admin.permissions.saved') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.permissions.saveFailed'), description: parseApiError(err).message }),
  })

  if (query.isLoading || !data) {
    return <Skeleton className="h-96 w-full rounded-xl" />
  }
  if (query.isError) {
    return <p className="text-sm text-muted-foreground">{t('admin.permissions.loadFailed')}</p>
  }

  const editable = new Set(data.editableRoles)
  // Effective value of a cell = staged edit if present, else the server value.
  const effective = (role: string, capability: string, serverAllowed: boolean) => {
    const k = cellKey(role, capability)
    return edits.has(k) ? (edits.get(k) as boolean) : serverAllowed
  }

  const toggle = (role: string, capability: string, serverAllowed: boolean, next: boolean) => {
    setEdits((prev) => {
      const copy = new Map(prev)
      const k = cellKey(role, capability)
      // Toggling back to the server value clears the stage entry.
      if (next === serverAllowed) copy.delete(k)
      else copy.set(k, next)
      return copy
    })
  }

  const onSave = () => {
    const overrides: PermissionOverride[] = []
    for (const [k, allowed] of edits) {
      const [role, capability] = k.split('|')
      overrides.push({ role, capability, allowed })
    }
    if (overrides.length) save.mutate(overrides)
  }

  const dirty = edits.size > 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t('admin.permissions.title')}</CardTitle>
          <CardDescription>{t('admin.permissions.subtitle')}</CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => setEdits(new Map())}
          >
            <RotateCcw className="h-4 w-4" /> {t('admin.permissions.reset')}
          </Button>
          <Button size="sm" loading={save.isPending} disabled={!dirty} onClick={onSave}>
            <Save className="h-4 w-4" /> {t('admin.permissions.save')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                  {t('admin.permissions.capabilityCol')}
                </th>
                {data.roles.map((role) => (
                  <th key={role} className="px-3 py-2 text-center font-medium">
                    {t(`admin.permissions.role.${role}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.capabilities.map((capability) => (
                <tr key={capability} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{t(`admin.permissions.capability.${capability}`)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(`admin.permissions.capabilityHint.${capability}`)}
                    </div>
                  </td>
                  {data.matrix.map((row) => {
                    const cell = row.cells.find((c) => c.capability === capability)!
                    const val = effective(row.role, capability, cell.allowed)
                    const isEditable = editable.has(row.role)
                    const changed = edits.has(cellKey(row.role, capability))
                    const overridden = val !== cell.default
                    return (
                      <td key={row.role} className="px-3 py-3 text-center">
                        {isEditable ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <Switch
                              checked={val}
                              onCheckedChange={(next) =>
                                toggle(row.role, capability, cell.allowed, next === true)
                              }
                              aria-label={`${row.role} ${capability}`}
                            />
                            {(overridden || changed) && (
                              <span
                                className={
                                  changed
                                    ? 'text-[10px] font-medium text-warning'
                                    : 'text-[10px] text-muted-foreground'
                                }
                              >
                                {changed
                                  ? t('admin.permissions.unsaved')
                                  : t('admin.permissions.custom')}
                              </span>
                            )}
                          </div>
                        ) : (
                          // Admin: omnipotent, not overridable.
                          <ShieldCheck className="mx-auto h-4 w-4 text-success" aria-hidden />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5" /> {t('admin.permissions.enforcementNote')}
        </p>
      </CardContent>
    </Card>
  )
}
