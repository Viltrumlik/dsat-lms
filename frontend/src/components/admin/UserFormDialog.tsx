// Domain: Admin
// Description: Create / edit a user. Create sets email, name, role, password and
//   verification; edit covers name, email and verification (role + password have
//   their own dialogs). Field errors from the API map back onto the inputs.
'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminUsersAPI } from '@/lib/api/admin/users'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import type { AdminUser, UserRole } from '@/types'

const ROLES: UserRole[] = ['public', 'student', 'teacher', 'admin']

export function UserFormDialog({
  mode,
  user,
  open,
  onOpenChange,
}: {
  mode: 'create' | 'edit'
  user?: AdminUser
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<UserRole>('student')
  const [password, setPassword] = React.useState('')
  const [isVerified, setIsVerified] = React.useState(true)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  // Reset the form whenever the dialog opens (seeded from the user in edit mode).
  React.useEffect(() => {
    if (!open) return
    setErrors({})
    setPassword('')
    if (mode === 'edit' && user) {
      setFirstName(user.firstName)
      setLastName(user.lastName)
      setEmail(user.email)
      setRole(user.role)
      setIsVerified(user.isEmailVerified)
    } else {
      setFirstName('')
      setLastName('')
      setEmail('')
      setRole('student')
      setIsVerified(true)
    }
  }, [open, mode, user])

  const save = useMutation({
    mutationFn: () => {
      if (mode === 'create') {
        return adminUsersAPI.create({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
          isEmailVerified: isVerified,
        })
      }
      return adminUsersAPI.update(user!.id, {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        isEmailVerified: isVerified,
      })
    },
    onSuccess: (saved) => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast({
        variant: 'success',
        title: mode === 'create' ? t('admin.users.createdTitle') : t('admin.users.updatedTitle'),
        description: saved.email,
      })
    },
    onError: (err) => {
      const parsed = parseApiError(err)
      setErrors(parsed.fields)
      if (Object.keys(parsed.fields).length === 0) {
        toast({
          variant: 'error',
          title: mode === 'create' ? t('admin.users.createFailed') : t('admin.users.updateFailed'),
          description: parsed.message,
        })
      }
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  const canSubmit =
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    (mode === 'edit' || password.length >= 8)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('admin.users.createTitle') : t('admin.users.editTitle')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' ? t('admin.users.createDesc') : t('admin.users.editDesc')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="u-first">{t('admin.users.firstName')}</Label>
              <Input
                id="u-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                aria-invalid={errors.firstName ? true : undefined}
                autoFocus
              />
              <FieldError message={errors.firstName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-last">{t('admin.users.lastName')}</Label>
              <Input
                id="u-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                aria-invalid={errors.lastName ? true : undefined}
              />
              <FieldError message={errors.lastName} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="u-email">{t('admin.users.email')}</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={errors.email ? true : undefined}
            />
            <FieldError message={errors.email} />
          </div>

          {mode === 'create' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="u-role">{t('admin.users.role')}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger id="u-role">
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
                <FieldError message={errors.role} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-password">{t('admin.users.password')}</Label>
                <Input
                  id="u-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('admin.users.passwordHint')}
                  aria-invalid={errors.password ? true : undefined}
                />
                <FieldError message={errors.password} />
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isVerified}
              onChange={(e) => setIsVerified(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            {t('admin.users.emailVerified')}
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!canSubmit}>
              {mode === 'create' ? t('admin.users.create') : t('admin.users.saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
