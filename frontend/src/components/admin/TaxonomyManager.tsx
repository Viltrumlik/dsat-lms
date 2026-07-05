// Domain: Admin (content studio)
// Description: Manage question categories + tags — the reference data the question
//   editor selects from. Create / delete (backend enforces in-use guards).
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import {
  adminCategoriesAPI,
  adminTagsAPI,
  type CategoryPayload,
  type TagPayload,
} from '@/lib/api/admin/taxonomy'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MODULE_LABEL_KEY } from '@/components/question-bank/labels'
import type { QuestionModule } from '@/types'

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function CategoriesCard() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [module, setModule] = React.useState<QuestionModule>('math')
  const [name, setName] = React.useState('')

  const list = useQuery({ queryKey: ['admin', 'taxonomy', 'categories'], queryFn: () => adminCategoriesAPI.list() })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'taxonomy', 'categories'] })

  const create = useMutation({
    mutationFn: (payload: CategoryPayload) => adminCategoriesAPI.create(payload),
    onSuccess: () => {
      setName('')
      invalidate()
      toast({ variant: 'success', title: t('admin.taxonomy.categoryAdded') })
    },
    onError: (err) => toast({ variant: 'error', title: t('admin.taxonomy.failed'), description: parseApiError(err).message }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => adminCategoriesAPI.remove(id),
    onSuccess: invalidate,
    onError: (err) => toast({ variant: 'error', title: t('admin.taxonomy.failed'), description: parseApiError(err).message }),
  })

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="font-semibold">{t('admin.taxonomy.categories')}</h2>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate({ module, name: name.trim(), slug: slugify(name) })
          }}
        >
          <div className="w-40 space-y-1">
            <Label htmlFor="cat-module">{t('admin.taxonomy.module')}</Label>
            <Select value={module} onValueChange={(v) => setModule(v as QuestionModule)}>
              <SelectTrigger id="cat-module">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="math">{t(MODULE_LABEL_KEY.math)}</SelectItem>
                <SelectItem value="reading_writing">{t(MODULE_LABEL_KEY.reading_writing)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="cat-name">{t('admin.taxonomy.name')}</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Algebra" />
          </div>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            <Plus className="h-4 w-4" /> {t('admin.taxonomy.add')}
          </Button>
        </form>
        <ul className="divide-y divide-border">
          {(list.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {c.name} <span className="text-xs text-muted-foreground">· {t(MODULE_LABEL_KEY[c.module])}</span>
              </span>
              <Button variant="ghost" size="icon" aria-label={t('admin.taxonomy.delete')} onClick={() => remove.mutate(c.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {list.data && list.data.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">{t('admin.taxonomy.noCategories')}</li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}

function TagsCard() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = React.useState('')
  const [color, setColor] = React.useState('#4F46E5')

  const list = useQuery({ queryKey: ['admin', 'taxonomy', 'tags'], queryFn: () => adminTagsAPI.list() })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'taxonomy', 'tags'] })

  const create = useMutation({
    mutationFn: (payload: TagPayload) => adminTagsAPI.create(payload),
    onSuccess: () => {
      setName('')
      invalidate()
      toast({ variant: 'success', title: t('admin.taxonomy.tagAdded') })
    },
    onError: (err) => toast({ variant: 'error', title: t('admin.taxonomy.failed'), description: parseApiError(err).message }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => adminTagsAPI.remove(id),
    onSuccess: invalidate,
    onError: (err) => toast({ variant: 'error', title: t('admin.taxonomy.failed'), description: parseApiError(err).message }),
  })

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="font-semibold">{t('admin.taxonomy.tags')}</h2>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate({ name: name.trim(), slug: slugify(name), color })
          }}
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="tag-name">{t('admin.taxonomy.name')}</Label>
            <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Parabolas" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tag-color">{t('admin.taxonomy.color')}</Label>
            <input
              id="tag-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 rounded border border-input bg-background"
            />
          </div>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            <Plus className="h-4 w-4" /> {t('admin.taxonomy.add')}
          </Button>
        </form>
        <ul className="divide-y divide-border">
          {(list.data ?? []).map((tag) => (
            <li key={tag.id} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color || '#999' }} />
                {tag.name}
              </span>
              <Button variant="ghost" size="icon" aria-label={t('admin.taxonomy.delete')} onClick={() => remove.mutate(tag.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {list.data && list.data.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">{t('admin.taxonomy.noTags')}</li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}

export function TaxonomyManager() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CategoriesCard />
      <TagsCard />
    </div>
  )
}
