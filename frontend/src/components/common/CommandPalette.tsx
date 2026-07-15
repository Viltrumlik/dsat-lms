// Domain: Admin
// Description: Global ⌘K/Ctrl-K command palette — quick-action shortcuts plus live
//   grouped search across users/questions/exams/classes. Mounted once in the admin
//   shell. Server-driven (shouldFilter off); navigates on select.
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList,
  FilePlus,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react'
import { adminSearchAPI } from '@/lib/api/admin/search'
import { useT } from '@/lib/i18n/I18nProvider'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

const QUICK_ACTIONS = [
  { key: 'newQuestion', url: '/admin/questions/new', icon: FilePlus },
  { key: 'users', url: '/admin/users', icon: Users },
  { key: 'exams', url: '/admin/exams', icon: ClipboardList },
  { key: 'dashboard', url: '/admin', icon: LayoutDashboard },
  { key: 'settings', url: '/admin/settings', icon: Settings },
] as const

export function CommandPalette() {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [debounced, setDebounced] = React.useState('')

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(id)
  }, [q])

  React.useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const search = useQuery({
    queryKey: ['admin', 'search', debounced],
    queryFn: () => adminSearchAPI.query(debounced),
    enabled: open && debounced.length >= 2,
  })

  const go = (url: string) => {
    setOpen(false)
    router.push(url)
  }

  const groups = search.data?.groups ?? []
  const searching = debounced.length >= 2

  return (
    <CommandDialog open={open} onOpenChange={setOpen} label={t('admin.search.title')}>
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder={t('admin.search.placeholder')}
      />
      <CommandList>
        {!searching && (
          <CommandGroup heading={t('admin.search.quickActions')}>
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon
              return (
                <CommandItem key={a.url} value={a.key} onSelect={() => go(a.url)}>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {t(`admin.search.actions.${a.key}`)}
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        {searching && groups.length === 0 && !search.isFetching && (
          <CommandEmpty>{t('admin.search.noResults')}</CommandEmpty>
        )}

        {searching &&
          groups.map((g) => (
            <CommandGroup key={g.type} heading={t(`admin.search.groups.${g.type}`)}>
              {g.items.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`${g.type}-${hit.id}`}
                  onSelect={() => go(hit.url)}
                >
                  <div className="min-w-0">
                    <div className="truncate">{hit.title}</div>
                    {hit.subtitle && (
                      <div className="truncate text-xs text-muted-foreground">{hit.subtitle}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
      </CommandList>
    </CommandDialog>
  )
}
