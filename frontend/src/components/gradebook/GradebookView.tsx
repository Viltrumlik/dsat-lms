// Domain: Academy (staff)
// Description: The gradebook grid — students × homework, with inline grade entry.
//   Manual grades win; exam-backed cells show the session score (editing overrides
//   it). Row-scoped server-side. Backed by /teacher|admin/gradebook/.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gradebookAPI } from '@/lib/api/gradebook'
import { teacherAPI } from '@/lib/api/teacher'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GradebookCell } from '@/types'

function GradeCell({
  cell,
  classId,
  admin,
}: {
  cell: GradebookCell
  classId: string
  admin: boolean
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [value, setValue] = React.useState(cell.grade === null ? '' : String(cell.grade))

  React.useEffect(() => {
    setValue(cell.grade === null ? '' : String(cell.grade))
  }, [cell.grade])

  const save = useMutation({
    mutationFn: (grade: number | null) => gradebookAPI.patchGrade(cell.submissionId as string, { grade }),
    onSuccess: (data) => queryClient.setQueryData(['gradebook', admin, classId], data),
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  if (!cell.submissionId) {
    return <span className="text-muted-foreground">—</span>
  }

  const commit = () => {
    const current = cell.grade === null ? '' : String(cell.grade)
    if (value === current) return
    save.mutate(value.trim() === '' ? null : Number(value))
  }

  return (
    <Input
      type="number"
      min={0}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={cell.gradeSource === 'session' ? 'w-20 border-dashed text-muted-foreground' : 'w-20'}
      aria-label="grade"
    />
  )
}

export function GradebookView({ admin = false }: { admin?: boolean }) {
  const t = useT()
  const [classId, setClassId] = React.useState('')
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherAPI.classes })

  React.useEffect(() => {
    if (!classId && classes.data && classes.data.length > 0) setClassId(classes.data[0].id)
  }, [classes.data, classId])

  const gradebook = useQuery({
    queryKey: ['gradebook', admin, classId],
    queryFn: () => (admin ? gradebookAPI.getAdmin(classId) : gradebookAPI.get(classId)),
    enabled: !!classId,
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('gradebook.title')}</h1>
        <p className="text-muted-foreground">{t('gradebook.subtitle')}</p>
      </div>

      <Select value={classId} onValueChange={setClassId}>
        <SelectTrigger className="w-64" aria-label={t('gradebook.class')}>
          <SelectValue placeholder={t('gradebook.selectClass')} />
        </SelectTrigger>
        <SelectContent>
          {(classes.data ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {gradebook.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {gradebook.data && gradebook.data.items.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('gradebook.noItems')}
          </CardContent>
        </Card>
      )}

      {gradebook.data && gradebook.data.items.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium">
                    {t('gradebook.student')}
                  </th>
                  {gradebook.data.items.map((item) => (
                    <th key={item.id} className="px-3 py-3 text-left font-medium">
                      {item.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gradebook.data.rows.map((row) => (
                  <tr key={row.student.id} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium">
                      {row.student.fullName || row.student.email}
                    </td>
                    {row.cells.map((cell, i) => (
                      <td key={i} className="px-3 py-2">
                        <GradeCell cell={cell} classId={classId} admin={admin} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">{t('gradebook.hint')}</p>
    </div>
  )
}
