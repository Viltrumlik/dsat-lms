// Domain: Admin (CRM)
// Description: The Student-360 — a tabbed profile hosting the CRM person layer
//   (tags, notes, unified activity timeline) plus the reused analytics drilldown.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { teacherAPI } from '@/lib/api/teacher'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FullPageSpinner } from '@/components/ui/spinner'
import { StudentAnalytics } from '@/components/teacher/StudentAnalytics'
import { TagPicker } from '@/components/admin/TagPicker'
import { NotesPanel } from '@/components/admin/NotesPanel'
import { ActivityTimeline } from '@/components/admin/ActivityTimeline'

export function Student360({ studentId }: { studentId: string }) {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: ['teacher', 'student-analytics', studentId],
    queryFn: () => teacherAPI.studentAnalytics(studentId),
  })

  if (query.isLoading) return <FullPageSpinner label={t('common.loading')} />
  if (query.isError || !query.data)
    return <p className="text-sm text-muted-foreground">{t('admin.students.loadFailed')}</p>

  const student = query.data.student

  return (
    <div className="space-y-6">
      <Link
        href="/admin/students"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('admin.students.back')}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{student.fullName || student.email}</h1>
        <p className="text-muted-foreground">{student.email}</p>
        <div className="mt-3">
          <TagPicker entityType="student" entityId={studentId} />
        </div>
      </div>

      <Tabs defaultValue="scores">
        <TabsList>
          <TabsTrigger value="scores">{t('admin.students.tabScores')}</TabsTrigger>
          <TabsTrigger value="notes">{t('admin.students.tabNotes')}</TabsTrigger>
          <TabsTrigger value="activity">{t('admin.students.tabActivity')}</TabsTrigger>
        </TabsList>

        <TabsContent value="scores">
          {/* The analytics drilldown is self-contained (fetches + renders). */}
          <StudentAnalytics studentId={studentId} backHref="/admin/students" />
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent className="p-5">
              <NotesPanel studentId={studentId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="p-5">
              <ActivityTimeline studentId={studentId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
