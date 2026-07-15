// Domain: Admin (CRM)
// Description: Free-form staff notes on a student — add, pin/unpin, delete. Pinned
//   notes sort first (server-ordered).
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import { studentNotesAPI } from '@/lib/api/admin/crm'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function NotesPanel({ studentId }: { studentId: string }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [body, setBody] = React.useState('')

  const key = ['admin', 'student-notes', studentId]
  const query = useQuery({ queryKey: key, queryFn: () => studentNotesAPI.list(studentId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })
  const onError = (err: unknown) =>
    toast({ variant: 'error', title: t('admin.notes.actionFailed'), description: parseApiError(err).message })

  const add = useMutation({
    mutationFn: () => studentNotesAPI.create(studentId, body.trim()),
    onSuccess: () => {
      setBody('')
      invalidate()
    },
    onError,
  })
  const togglePin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      studentNotesAPI.update(studentId, id, { pinned }),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => studentNotesAPI.remove(studentId, id),
    onSuccess: invalidate,
    onError,
  })

  const notes = query.data ?? []

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim()) add.mutate()
        }}
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={t('admin.notes.placeholder')}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={add.isPending} disabled={!body.trim()}>
            <Plus className="h-4 w-4" /> {t('admin.notes.add')}
          </Button>
        </div>
      </form>

      {query.isLoading && <div className="h-16 animate-pulse rounded bg-muted" />}
      {notes.length === 0 && !query.isLoading && (
        <p className="text-sm text-muted-foreground">{t('admin.notes.empty')}</p>
      )}
      <ul className="space-y-2">
        {notes.map((note) => (
          <li
            key={note.id}
            className={`rounded-md border p-3 text-sm ${note.pinned ? 'border-primary/40 bg-primary-50/30 dark:bg-primary-800/20' : 'border-border'}`}
          >
            <p className="whitespace-pre-wrap">{note.body}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {new Date(note.createdAt).toLocaleString()}
                {note.author ? ` · ${note.author.fullName || note.author.email}` : ''}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={note.pinned ? t('admin.notes.unpin') : t('admin.notes.pin')}
                  onClick={() => togglePin.mutate({ id: note.id, pinned: !note.pinned })}
                >
                  {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.notes.delete')}
                  onClick={() => remove.mutate(note.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
