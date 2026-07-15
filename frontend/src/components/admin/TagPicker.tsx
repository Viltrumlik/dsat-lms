// Domain: Admin (CRM)
// Description: Assign/remove cross-entity tags on a student or lead. Shows current
//   tags as removable chips + a popover command palette to search/pick/create tags.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Tag as TagIcon, X } from 'lucide-react'
import { crmTagsAPI } from '@/lib/api/admin/crm'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { TaggableEntity } from '@/types'

export function TagPicker({
  entityType,
  entityId,
}: {
  entityType: TaggableEntity
  entityId: string
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const assignedKey = ['admin', 'entity-tags', entityType, entityId]
  const assigned = useQuery({ queryKey: assignedKey, queryFn: () => crmTagsAPI.forEntity(entityType, entityId) })
  const all = useQuery({ queryKey: ['admin', 'crm-tags'], queryFn: () => crmTagsAPI.list(), enabled: open })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: assignedKey })
    queryClient.invalidateQueries({ queryKey: ['admin', 'crm-tags'] })
  }
  const onError = (err: unknown) =>
    toast({ variant: 'error', title: t('admin.tags.actionFailed'), description: parseApiError(err).message })

  const assign = useMutation({
    mutationFn: (tagId: string) => crmTagsAPI.assign(entityType, entityId, tagId),
    onSuccess: invalidate,
    onError,
  })
  const unassign = useMutation({
    mutationFn: (tagId: string) => crmTagsAPI.unassign(entityType, entityId, tagId),
    onSuccess: invalidate,
    onError,
  })
  const create = useMutation({
    mutationFn: (name: string) => crmTagsAPI.create(name),
    onSuccess: (tag) => {
      setSearch('')
      assign.mutate(tag.id)
    },
    onError,
  })

  const assignedTags = assigned.data ?? []
  const assignedIds = new Set(assignedTags.map((tg) => tg.id))
  const options = (all.data ?? []).filter((tg) => !assignedIds.has(tg.id))
  const q = search.trim()
  const exactMatch = (all.data ?? []).some((tg) => tg.name.toLowerCase() === q.toLowerCase())

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assignedTags.map((tg) => (
        <Badge key={tg.id} variant="secondary" className="gap-1">
          {tg.name}
          <button
            type="button"
            aria-label={t('admin.tags.remove')}
            onClick={() => unassign.mutate(tg.id)}
            className="opacity-60 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs">
            <Plus className="h-3 w-3" /> {t('admin.tags.tag')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={t('admin.tags.searchOrCreate')}
            />
            <CommandList>
              <CommandEmpty>{t('admin.tags.noTags')}</CommandEmpty>
              <CommandGroup>
                {options.map((tg) => (
                  <CommandItem key={tg.id} value={tg.name} onSelect={() => assign.mutate(tg.id)}>
                    <TagIcon className="h-4 w-4" /> {tg.name}
                  </CommandItem>
                ))}
                {q && !exactMatch && (
                  <CommandItem value={`__create__${q}`} onSelect={() => create.mutate(q)}>
                    <Plus className="h-4 w-4" /> {t('admin.tags.create', { name: q })}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
