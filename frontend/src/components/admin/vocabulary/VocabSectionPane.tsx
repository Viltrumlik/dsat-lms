// Domain: Admin (content studio)
// Description: One word list — its title and publish state, the decks inside it,
//   and the words inside the selected deck.
//
// The paste box is the primary way words get in. A six-hundred-word list is not
// going to be typed twenty-five rows at a time, so the per-word table is for
// corrections and the import is the front door.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Import, Plus, Trash2 } from 'lucide-react'
import { adminVocabularyAPI } from '@/lib/api/admin/vocabulary'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { AdminVocabWord } from '@/types'

function WordRow({ word, onSaved }: { word: AdminVocabWord; onSaved: () => void }) {
  const t = useT()
  const [draft, setDraft] = React.useState({ word: word.word, definition: word.definition })
  const dirty = draft.word !== word.word || draft.definition !== word.definition

  const save = useMutation({
    mutationFn: () => adminVocabularyAPI.updateWord(word.id, draft),
    onSuccess: onSaved,
  })
  const remove = useMutation({
    mutationFn: () => adminVocabularyAPI.deleteWord(word.id),
    onSuccess: onSaved,
  })

  return (
    <div className="flex items-start gap-2 border-b border-border py-1.5 last:border-0">
      <Input
        value={draft.word}
        onChange={(e) => setDraft({ ...draft, word: e.target.value })}
        className="h-8 w-40 shrink-0 text-sm"
        aria-label={t('admin.vocab.word')}
      />
      <Input
        value={draft.definition}
        onChange={(e) => setDraft({ ...draft, definition: e.target.value })}
        className="h-8 flex-1 text-sm"
        aria-label={t('admin.vocab.definition')}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0"
        disabled={!dirty}
        loading={save.isPending}
        onClick={() => save.mutate()}
      >
        {t('common.save')}
      </Button>
      <button
        type="button"
        aria-label={t('admin.vocab.deleteWord')}
        onClick={() => remove.mutate()}
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-error"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function ImportDialog({
  setId,
  open,
  onOpenChange,
  onImported,
}: {
  setId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const t = useT()
  const { toast } = useToast()
  const [text, setText] = React.useState('')

  const run = useMutation({
    mutationFn: () => adminVocabularyAPI.importWords(setId, text),
    onSuccess: (result) => {
      setText('')
      onOpenChange(false)
      onImported()
      toast({
        title: t('admin.vocab.imported'),
        description: t('admin.vocab.importedBody', { created: result.created }),
      })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.vocab.importFailed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('admin.vocab.importTitle')}</DialogTitle>
          <DialogDescription>{t('admin.vocab.importHint')}</DialogDescription>
        </DialogHeader>
        <Textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'abate; to become less intense\ncandid; frank and honest'}
          className="font-mono text-sm"
          aria-label={t('admin.vocab.importTitle')}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!text.trim()} loading={run.isPending} onClick={() => run.mutate()}>
            {t('admin.vocab.import')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function VocabSectionPane({
  sectionId,
  onDeleted,
}: {
  sectionId: string
  onDeleted: () => void
}) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedSetId, setSelectedSetId] = React.useState<string | null>(null)
  const [importOpen, setImportOpen] = React.useState(false)
  const [newWord, setNewWord] = React.useState({ word: '', definition: '' })

  const section = useQuery({
    queryKey: ['admin-vocab-section', sectionId],
    queryFn: () => adminVocabularyAPI.section(sectionId),
  })
  const sets = useQuery({
    queryKey: ['admin-vocab-sets', sectionId],
    queryFn: () => adminVocabularyAPI.sets(sectionId),
  })
  const words = useQuery({
    queryKey: ['admin-vocab-words', selectedSetId],
    queryFn: () => adminVocabularyAPI.words(selectedSetId as string),
    enabled: selectedSetId !== null,
  })

  const [title, setTitle] = React.useState('')
  const seeded = React.useRef(false)
  React.useEffect(() => {
    if (section.data && !seeded.current) {
      seeded.current = true
      setTitle(section.data.title)
    }
  }, [section.data])

  // Land on the first deck so the pane is never a dead end.
  React.useEffect(() => {
    const rows = sets.data
    if (!rows || rows.length === 0) return
    setSelectedSetId((current) =>
      current && rows.some((s) => s.id === current) ? current : rows[0].id
    )
  }, [sets.data])

  const refreshCounts = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-vocab-sections'] })
    queryClient.invalidateQueries({ queryKey: ['admin-vocab-section', sectionId] })
    queryClient.invalidateQueries({ queryKey: ['admin-vocab-sets', sectionId] })
  }
  const refreshWords = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-vocab-words', selectedSetId] })
    refreshCounts()
  }

  const saveSection = useMutation({
    mutationFn: (payload: { title?: string; status?: 'draft' | 'published' }) =>
      adminVocabularyAPI.updateSection(sectionId, payload),
    onSuccess: refreshCounts,
    onError: (err) =>
      toast({ variant: 'error', title: t('common.error'), description: parseApiError(err).message }),
  })
  const removeSection = useMutation({
    mutationFn: () => adminVocabularyAPI.deleteSection(sectionId),
    onSuccess: () => {
      onDeleted()
      queryClient.invalidateQueries({ queryKey: ['admin-vocab-sections'] })
    },
  })
  const addSet = useMutation({
    mutationFn: () =>
      adminVocabularyAPI.createSet(
        sectionId,
        t('admin.vocab.setN', { n: (sets.data?.length ?? 0) + 1 })
      ),
    onSuccess: (created) => {
      setSelectedSetId(created.id)
      refreshCounts()
    },
  })
  const removeSet = useMutation({
    mutationFn: (id: string) => adminVocabularyAPI.deleteSet(id),
    onSuccess: () => {
      setSelectedSetId(null)
      refreshCounts()
    },
  })
  const addWord = useMutation({
    mutationFn: () => adminVocabularyAPI.createWord(selectedSetId as string, newWord),
    onSuccess: () => {
      setNewWord({ word: '', definition: '' })
      refreshWords()
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('common.error'), description: parseApiError(err).message }),
  })

  if (section.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (!section.data) return null

  const published = section.data.status === 'published'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* List header — title, publish, delete */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== section.data?.title && saveSection.mutate({ title })}
          className="h-9 max-w-sm font-semibold"
          aria-label={t('admin.vocab.listTitle')}
        />
        <Badge variant={published ? 'success' : 'secondary'}>
          {t(`admin.vocab.status.${section.data.status}`)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {t('admin.vocab.countsLine', {
            sets: section.data.setCount,
            words: section.data.wordCount,
          })}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant={published ? 'outline' : 'default'}
            loading={saveSection.isPending}
            onClick={() =>
              saveSection.mutate({ status: published ? 'draft' : 'published' })
            }
          >
            {published ? t('admin.vocab.unpublish') : t('admin.vocab.publish')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={removeSection.isPending}
            onClick={() => removeSection.mutate()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Decks */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        {(sets.data ?? []).map((deck) => (
          <button
            key={deck.id}
            type="button"
            onClick={() => setSelectedSetId(deck.id)}
            aria-current={deck.id === selectedSetId}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              deck.id === selectedSetId
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted'
            )}
          >
            {deck.title}
            <span className="ml-1.5 opacity-70">{deck.wordCount}</span>
          </button>
        ))}
        <Button size="sm" variant="outline" loading={addSet.isPending} onClick={() => addSet.mutate()}>
          <Plus className="h-4 w-4" /> {t('admin.vocab.addSet')}
        </Button>
      </div>

      {/* Words in the selected deck */}
      {selectedSetId === null ? (
        <p className="p-10 text-center text-sm text-muted-foreground">
          {t('admin.vocab.noSets')}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Import className="h-4 w-4" /> {t('admin.vocab.import')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => removeSet.mutate(selectedSetId)}
              loading={removeSet.isPending}
            >
              <Trash2 className="h-4 w-4" /> {t('admin.vocab.deleteSet')}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {words.isLoading && (
              <div className="flex justify-center py-8">
                <Spinner className="h-5 w-5" />
              </div>
            )}
            {(words.data ?? []).map((word) => (
              <WordRow key={word.id} word={word} onSaved={refreshWords} />
            ))}

            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (newWord.word.trim() && newWord.definition.trim()) addWord.mutate()
              }}
            >
              <Input
                value={newWord.word}
                onChange={(e) => setNewWord({ ...newWord, word: e.target.value })}
                placeholder={t('admin.vocab.word')}
                className="h-8 w-40 shrink-0 text-sm"
                aria-label={t('admin.vocab.word')}
              />
              <Input
                value={newWord.definition}
                onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })}
                placeholder={t('admin.vocab.definition')}
                className="h-8 flex-1 text-sm"
                aria-label={t('admin.vocab.definition')}
              />
              <Button
                type="submit"
                size="sm"
                className="h-8"
                disabled={!newWord.word.trim() || !newWord.definition.trim()}
                loading={addWord.isPending}
              >
                <Plus className="h-4 w-4" /> {t('admin.vocab.addWord')}
              </Button>
            </form>
          </div>

          <ImportDialog
            setId={selectedSetId}
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={refreshWords}
          />
        </div>
      )}
    </div>
  )
}
