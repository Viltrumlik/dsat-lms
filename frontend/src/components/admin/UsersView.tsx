// Domain: Admin
// Description: The user directory — searchable, filterable, cursor-paginated table
//   with per-row actions (edit, change role, set password, deactivate/reactivate,
//   soft-delete) and a create dialog. Self-destructive actions are disabled (the
//   API also rejects them) so an admin can't lock themselves out.
'use client'

import * as React from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import {
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react'
import { adminUsersAPI, type AdminUserListParams } from '@/lib/api/admin/users'
import { cursorFromUrl } from '@/lib/api/client'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { RoleBadge } from '@/components/common/RoleBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AdminUser, UserRole } from '@/types'
import { UserFormDialog } from './UserFormDialog'
import { BulkImportDialog } from './BulkImportDialog'

const ROLES: UserRole[] = [
  'public',
  'student',
  'teacher',
  'receptionist',
  'academic_manager',
  'admin',
]
type ConfirmAction = 'deactivate' | 'reactivate' | 'delete'

// ─────────────────────────────────────
// Role dialog
// ─────────────────────────────────────

function RoleDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [role, setRole] = React.useState<UserRole>(user.role)

  React.useEffect(() => {
    if (open) setRole(user.role)
  }, [open, user])

  const save = useMutation({
    mutationFn: () => adminUsersAPI.changeRole(user.id, role),
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast({ variant: 'success', title: t('admin.users.roleUpdated'), description: user.email })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.users.actionFailed'), description: parseApiError(err).message }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.users.roleTitle')}</DialogTitle>
          <DialogDescription>{user.fullName || user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="role-select">{t('admin.users.role')}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <SelectTrigger id="role-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`admin.roles.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={role === user.role}
            onClick={() => save.mutate()}
          >
            {t('admin.users.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────
// Set-password dialog
// ─────────────────────────────────────

function PasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | undefined>()

  React.useEffect(() => {
    if (open) {
      setPassword('')
      setError(undefined)
    }
  }, [open])

  const save = useMutation({
    mutationFn: () => adminUsersAPI.setPassword(user.id, password),
    onSuccess: () => {
      onOpenChange(false)
      toast({ variant: 'success', title: t('admin.users.passwordSet'), description: user.email })
    },
    onError: (err) => {
      const parsed = parseApiError(err)
      setError(parsed.fields.newPassword ?? parsed.message)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length >= 8) save.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.users.passwordTitle')}</DialogTitle>
          <DialogDescription>{t('admin.users.passwordDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-pass">{t('admin.users.newPassword')}</Label>
            <Input
              id="new-pass"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(undefined)
              }}
              placeholder={t('admin.users.passwordHint')}
              aria-invalid={error ? true : undefined}
              autoFocus
            />
            <FieldError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending} disabled={password.length < 8}>
              {t('admin.users.setPassword')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────
// Confirm (deactivate / reactivate / delete)
// ─────────────────────────────────────

function ConfirmDialog({
  action,
  user,
  open,
  onOpenChange,
}: {
  action: ConfirmAction
  user: AdminUser
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const run = useMutation<unknown>({
    mutationFn: () => {
      if (action === 'deactivate') return adminUsersAPI.deactivate(user.id)
      if (action === 'reactivate') return adminUsersAPI.reactivate(user.id)
      return adminUsersAPI.remove(user.id)
    },
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast({ variant: 'success', title: t(`admin.users.${action}Done`), description: user.email })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.users.actionFailed'), description: parseApiError(err).message }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`admin.users.${action}Title`)}</DialogTitle>
          <DialogDescription>
            {t(`admin.users.${action}Desc`, { name: user.fullName || user.email })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          <Button
            variant={action === 'reactivate' ? 'default' : 'destructive'}
            loading={run.isPending}
            onClick={() => run.mutate()}
          >
            {t(`admin.users.${action}Confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────
// Status badge
// ─────────────────────────────────────

function StatusBadge({ user }: { user: AdminUser }) {
  const { t } = useI18n()
  if (user.deletedAt) return <Badge variant="error">{t('admin.users.statusDeleted')}</Badge>
  if (!user.isActive) return <Badge variant="secondary">{t('admin.users.statusInactive')}</Badge>
  return <Badge variant="success">{t('admin.users.statusActive')}</Badge>
}

// ─────────────────────────────────────
// Main view
// ─────────────────────────────────────

export function UsersView() {
  const { t, locale } = useI18n()
  const { user: currentUser } = useAuth()

  const [search, setSearch] = React.useState('')
  const [searchQ, setSearchQ] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState<UserRole | 'all'>('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'inactive'>('all')
  const [includeDeleted, setIncludeDeleted] = React.useState(false)

  // Dialog state
  const [formDialog, setFormDialog] = React.useState<{ mode: 'create' | 'edit'; user?: AdminUser } | null>(null)
  const [importOpen, setImportOpen] = React.useState(false)
  const [roleUser, setRoleUser] = React.useState<AdminUser | null>(null)
  const [passwordUser, setPasswordUser] = React.useState<AdminUser | null>(null)
  const [confirm, setConfirm] = React.useState<{ action: ConfirmAction; user: AdminUser } | null>(null)

  React.useEffect(() => {
    const id = setTimeout(() => setSearchQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const listParams: AdminUserListParams = {
    role: roleFilter === 'all' ? undefined : roleFilter,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
    search: searchQ || undefined,
    includeDeleted: includeDeleted || undefined,
  }

  const query = useInfiniteQuery({
    queryKey: ['admin', 'users', listParams],
    queryFn: ({ pageParam }) => adminUsersAPI.list({ ...listParams, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })

  const users = query.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            aria-label={t('admin.users.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as UserRole | 'all')}>
          <SelectTrigger className="sm:w-40" aria-label={t('admin.users.role')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.users.allRoles')}</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`admin.roles.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}
        >
          <SelectTrigger className="sm:w-40" aria-label={t('admin.users.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.users.allStatuses')}</SelectItem>
            <SelectItem value="active">{t('admin.users.statusActive')}</SelectItem>
            <SelectItem value="inactive">{t('admin.users.statusInactive')}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> {t('admin.import.button')}
        </Button>
        <Button onClick={() => setFormDialog({ mode: 'create' })}>
          <Plus className="h-4 w-4" /> {t('admin.users.newUser')}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="include-deleted"
          checked={includeDeleted}
          onCheckedChange={(v) => setIncludeDeleted(v === true)}
        />
        <Label htmlFor="include-deleted" className="text-sm font-normal text-muted-foreground">
          {t('admin.users.showDeleted')}
        </Label>
      </div>

      {/* States */}
      {query.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('admin.users.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && users.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('admin.users.empty')}</p>
          </CardContent>
        </Card>
      )}

      {query.data && users.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.users.user')}</TableHead>
                  <TableHead>{t('admin.users.role')}</TableHead>
                  <TableHead>{t('admin.users.status')}</TableHead>
                  <TableHead>{t('admin.users.verified')}</TableHead>
                  <TableHead>{t('admin.users.created')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = currentUser?.id === u.id
                  const canReactivate = !u.isActive || Boolean(u.deletedAt)
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.fullName || '—'}</div>
                        <div className="text-sm text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge user={u} />
                      </TableCell>
                      <TableCell>
                        {u.isEmailVerified ? (
                          <span className="text-sm text-success-dark">{t('admin.users.yes')}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t('admin.users.no')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(u.createdAt), 'PP', {
                          locale: locale === 'uz' ? uzDate : undefined,
                        })}
                      </TableCell>
                      <TableCell className="w-10 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('admin.users.actions')}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setFormDialog({ mode: 'edit', user: u })}>
                              <Pencil className="h-4 w-4" /> {t('admin.users.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isSelf}
                              onSelect={() => setRoleUser(u)}
                            >
                              <Shield className="h-4 w-4" /> {t('admin.users.changeRole')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isSelf}
                              onSelect={() => setPasswordUser(u)}
                            >
                              <KeyRound className="h-4 w-4" /> {t('admin.users.setPassword')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {canReactivate ? (
                              <DropdownMenuItem
                                onSelect={() => setConfirm({ action: 'reactivate', user: u })}
                              >
                                <UserCheck className="h-4 w-4" /> {t('admin.users.reactivate')}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                disabled={isSelf}
                                onSelect={() => setConfirm({ action: 'deactivate', user: u })}
                              >
                                <UserX className="h-4 w-4" /> {t('admin.users.deactivate')}
                              </DropdownMenuItem>
                            )}
                            {!u.deletedAt && (
                              <DropdownMenuItem
                                disabled={isSelf}
                                className="text-error data-[highlighted]:text-error"
                                onSelect={() => setConfirm({ action: 'delete', user: u })}
                              >
                                <Trash2 className="h-4 w-4" /> {t('admin.users.delete')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t('admin.users.loadMore')}
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />
      {formDialog && (
        <UserFormDialog
          mode={formDialog.mode}
          user={formDialog.user}
          open
          onOpenChange={(o) => !o && setFormDialog(null)}
        />
      )}
      {roleUser && (
        <RoleDialog user={roleUser} open onOpenChange={(o) => !o && setRoleUser(null)} />
      )}
      {passwordUser && (
        <PasswordDialog user={passwordUser} open onOpenChange={(o) => !o && setPasswordUser(null)} />
      )}
      {confirm && (
        <ConfirmDialog
          action={confirm.action}
          user={confirm.user}
          open
          onOpenChange={(o) => !o && setConfirm(null)}
        />
      )}
    </div>
  )
}
