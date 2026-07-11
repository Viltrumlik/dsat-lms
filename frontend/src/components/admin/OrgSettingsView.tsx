// Domain: Identity (admin)
// Description: Org-settings editor — branding + academic year + display timezone +
//   default email sender, the grading scheme (band → minimum %), and feature flags.
//   Backed by GET/PATCH /admin/org-settings/ (IsAdmin).
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminOrgSettingsAPI } from '@/lib/api/admin/org-settings'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import type { OrgSetting } from '@/types'

type FormState = Pick<
  OrgSetting,
  | 'academyName'
  | 'academicYear'
  | 'displayTimezone'
  | 'defaultEmailSender'
  | 'logoUrl'
  | 'gradingThresholds'
  | 'featureFlags'
>

const toForm = (s: OrgSetting): FormState => ({
  academyName: s.academyName,
  academicYear: s.academicYear,
  displayTimezone: s.displayTimezone,
  defaultEmailSender: s.defaultEmailSender,
  logoUrl: s.logoUrl,
  gradingThresholds: { ...s.gradingThresholds },
  featureFlags: { ...s.featureFlags },
})

export function OrgSettingsView() {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<FormState | null>(null)

  const query = useQuery({ queryKey: ['admin', 'org-settings'], queryFn: adminOrgSettingsAPI.get })

  React.useEffect(() => {
    if (query.data) setForm(toForm(query.data))
  }, [query.data])

  const save = useMutation({
    mutationFn: (payload: FormState) => adminOrgSettingsAPI.update(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'org-settings'], data)
      setForm(toForm(data))
      toast({ variant: 'success', title: t('admin.settings.saved') })
    },
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  if (query.isLoading || !form) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
          {t('admin.settings.loadFailed')}
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            {t('common.tryAgain')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))

  const flagKeys = Object.keys(form.featureFlags)
  const bandKeys = Object.keys(form.gradingThresholds)

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(form)
      }}
    >
      {/* Branding & general */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.settings.branding.title')}</CardTitle>
          <CardDescription>{t('admin.settings.branding.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="academyName">{t('admin.settings.branding.academyName')}</Label>
            <Input
              id="academyName"
              value={form.academyName}
              onChange={(e) => set('academyName', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="academicYear">{t('admin.settings.branding.academicYear')}</Label>
            <Input
              id="academicYear"
              placeholder="2025-2026"
              value={form.academicYear}
              onChange={(e) => set('academicYear', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="displayTimezone">{t('admin.settings.branding.displayTimezone')}</Label>
            <Input
              id="displayTimezone"
              value={form.displayTimezone}
              onChange={(e) => set('displayTimezone', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="defaultEmailSender">
              {t('admin.settings.branding.defaultEmailSender')}
            </Label>
            <Input
              id="defaultEmailSender"
              type="email"
              placeholder="noreply@example.com"
              value={form.defaultEmailSender}
              onChange={(e) => set('defaultEmailSender', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="logoUrl">{t('admin.settings.branding.logoUrl')}</Label>
            <Input
              id="logoUrl"
              type="url"
              placeholder="https://…"
              value={form.logoUrl}
              onChange={(e) => set('logoUrl', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Grading scheme */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.settings.grading.title')}</CardTitle>
          <CardDescription>{t('admin.settings.grading.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bandKeys.map((band) => (
            <div key={band}>
              <Label htmlFor={`band-${band}`}>{band}</Label>
              <Input
                id={`band-${band}`}
                type="number"
                min={0}
                max={100}
                value={form.gradingThresholds[band]}
                onChange={(e) =>
                  set('gradingThresholds', {
                    ...form.gradingThresholds,
                    [band]: e.target.value === '' ? 0 : Number(e.target.value),
                  })
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Feature flags */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.settings.flags.title')}</CardTitle>
          <CardDescription>{t('admin.settings.flags.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {flagKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('admin.settings.flags.empty')}</p>
          ) : (
            flagKeys.map((flag) => (
              <label key={flag} className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">{flag}</span>
                <Switch
                  checked={form.featureFlags[flag]}
                  onCheckedChange={(checked) =>
                    set('featureFlags', { ...form.featureFlags, [flag]: checked })
                  }
                />
              </label>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>
          {t('admin.settings.save')}
        </Button>
      </div>
    </form>
  )
}
