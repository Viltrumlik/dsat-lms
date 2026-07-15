// Domain: Analytics (admin)
// Description: Platform insights — weakest students (with risk), most-active
//   teachers, exam difficulty, and attendance by class. Backed by /admin/analytics/.
'use client'

import { useQuery } from '@tanstack/react-query'
import { adminPlatformAnalyticsAPI } from '@/lib/api/admin/platform-analytics'
import { useT } from '@/lib/i18n/I18nProvider'
import { RiskBadge } from '@/components/teacher/RiskBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const pctOrDash = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">{children}</CardContent>
    </Card>
  )
}

export function PlatformAnalyticsView() {
  const t = useT()
  const query = useQuery({
    queryKey: ['admin', 'platform-analytics'],
    queryFn: adminPlatformAnalyticsAPI.overview,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.analytics.title')}</h1>
        <p className="text-muted-foreground">{t('admin.analytics.subtitle')}</p>
      </div>

      {query.isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('admin.analytics.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title={t('admin.analytics.weakStudents')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.analytics.student')}</TableHead>
                  <TableHead>{t('admin.analytics.accuracy')}</TableHead>
                  <TableHead>{t('admin.analytics.attendance')}</TableHead>
                  <TableHead>{t('admin.analytics.risk')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.weakStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t('admin.analytics.allHealthy')}
                    </TableCell>
                  </TableRow>
                ) : (
                  query.data.weakStudents.map((w) => (
                    <TableRow key={w.student.id}>
                      <TableCell className="font-medium">
                        {w.student.fullName || w.student.email}
                      </TableCell>
                      <TableCell className="tabular-nums">{pctOrDash(w.accuracy)}</TableCell>
                      <TableCell className="tabular-nums">{pctOrDash(w.attendance)}</TableCell>
                      <TableCell>
                        <RiskBadge level={w.risk} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Section>

          <Section title={t('admin.analytics.activeTeachers')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.analytics.teacher')}</TableHead>
                  <TableHead>{t('admin.analytics.classes')}</TableHead>
                  <TableHead>{t('admin.analytics.students')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.activeTeachers.map((r) => (
                  <TableRow key={r.teacher.id}>
                    <TableCell className="font-medium">
                      {r.teacher.fullName || r.teacher.email}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.classes}</TableCell>
                    <TableCell className="tabular-nums">{r.students}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title={t('admin.analytics.examDifficulty')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.analytics.exam')}</TableHead>
                  <TableHead>{t('admin.analytics.avgAccuracy')}</TableHead>
                  <TableHead>{t('admin.analytics.attempts')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.examDifficulty.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.exam}</TableCell>
                    <TableCell className="tabular-nums">{pctOrDash(r.avgAccuracy)}</TableCell>
                    <TableCell className="tabular-nums">{r.attempts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title={t('admin.analytics.attendanceByClass')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.analytics.class')}</TableHead>
                  <TableHead>{t('admin.analytics.rate')}</TableHead>
                  <TableHead>{t('admin.analytics.marked')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.attendanceByClass.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.class}</TableCell>
                    <TableCell className="tabular-nums">{Math.round(r.rate)}%</TableCell>
                    <TableCell className="tabular-nums">{r.marked}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </div>
      )}
    </div>
  )
}
