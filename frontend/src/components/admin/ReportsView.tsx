// Domain: Analytics (admin)
// Description: Export tabular reports (per-student summary, per-class attendance)
//   as CSV or xlsx. Downloads via an auth'd blob fetch. Backed by /admin/reports/.
'use client'

import * as React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import {
  adminReportsAPI,
  type ReportFormat,
  type ReportKind,
} from '@/lib/api/admin/reports'
import { teacherAPI } from '@/lib/api/teacher'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const KINDS: ReportKind[] = ['students', 'attendance']
const FORMATS: ReportFormat[] = ['csv', 'xlsx']

export function ReportsView() {
  const t = useT()
  const { toast } = useToast()
  const [kind, setKind] = React.useState<ReportKind>('students')
  const [fmt, setFmt] = React.useState<ReportFormat>('csv')
  const [classId, setClassId] = React.useState('')

  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherAPI.classes })

  const download = useMutation({
    mutationFn: () => adminReportsAPI.download(kind, fmt, { classId: classId || undefined }),
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  const needsClass = kind === 'attendance'
  const disabled = needsClass && !classId

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.reports.title')}</h1>
        <p className="text-muted-foreground">{t('admin.reports.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.reports.export')}</CardTitle>
          <CardDescription>{t('admin.reports.exportHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div>
            <Label>{t('admin.reports.kind')}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ReportKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`admin.reports.kinds.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('admin.reports.class')}</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={needsClass ? t('admin.reports.pickClass') : t('admin.reports.allClasses')}
                />
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

          <div>
            <Label>{t('admin.reports.format')}</Label>
            <Select value={fmt} onValueChange={(v) => setFmt(v as ReportFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button loading={download.isPending} disabled={disabled} onClick={() => download.mutate()}>
            <Download className="h-4 w-4" /> {t('admin.reports.download')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
