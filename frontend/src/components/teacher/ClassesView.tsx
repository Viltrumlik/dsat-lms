// Domain: Academy (teacher)
// Description: The teacher's classes — table of own classes with student counts
//   and a create-class dialog.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ChevronRight, Plus, Users } from 'lucide-react'
import { teacherAPI } from '@/lib/api/teacher'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function CreateClassDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = React.useState('')

  const create = useMutation({
    mutationFn: () => teacherAPI.createClass(name.trim()),
    onSuccess: (klass) => {
      onOpenChange(false)
      setName('')
      queryClient.invalidateQueries({ queryKey: ['teacher', 'classes'] })
      toast({
        variant: 'success',
        title: t('teacher.classes.createdTitle'),
        description: klass.name,
      })
    },
    onError: (err) => {
      toast({
        variant: 'error',
        title: t('teacher.classes.createFailed'),
        description: parseApiError(err).message,
      })
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) create.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('teacher.classes.createTitle')}</DialogTitle>
          <DialogDescription>{t('teacher.classes.createDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="class-name">{t('teacher.classes.nameLabel')}</Label>
            <Input
              id="class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('teacher.classes.namePlaceholder')}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('teacher.common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
              {t('teacher.classes.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ClassesView() {
  const { t, locale } = useI18n()
  const [createOpen, setCreateOpen] = React.useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['teacher', 'classes'],
    queryFn: teacherAPI.classes,
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t('teacher.classes.create')}
        </Button>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('teacher.classes.loadFailed')}
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.classes.empty')}</p>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('teacher.classes.name')}</TableHead>
                <TableHead>{t('teacher.classes.students')}</TableHead>
                <TableHead>{t('teacher.classes.created')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((klass) => (
                <TableRow key={klass.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/teacher/classes/${klass.id}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      {klass.name}
                      {!klass.isActive && (
                        <Badge variant="secondary">{t('teacher.classes.inactive')}</Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{klass.studentCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(klass.createdAt), 'PP', {
                      locale: locale === 'uz' ? uzDate : undefined,
                    })}
                  </TableCell>
                  <TableCell className="w-10 text-right">
                    <Link
                      href={`/teacher/classes/${klass.id}`}
                      aria-label={klass.name}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <CreateClassDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
