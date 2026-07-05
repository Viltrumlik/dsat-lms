// Domain: Files / Identity (settings)
// Description: Profile-photo card — uploads an avatar attachment, sets it as the
//   user's avatar, then refreshes the AuthProvider user. Avatars are public-by-UUID
//   so the download URL renders directly in <img>.
'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { filesAPI } from '@/lib/api/files'
import { parseApiError } from '@/lib/api/errors'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useT } from '@/lib/i18n/I18nProvider'
import type { User } from '@/types'

export function AvatarUploader({ user }: { user: User }) {
  const { refreshUser } = useAuth()
  const { toast } = useToast()
  const t = useT()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked after an error
    if (!file) return
    setBusy(true)
    try {
      const attachment = await filesAPI.upload({ file, kind: 'avatar' })
      await filesAPI.setAvatar(attachment.id)
      await refreshUser()
      toast({ variant: 'success', title: t('settings.avatar.updated') })
    } catch (err) {
      toast({
        variant: 'error',
        title: t('settings.avatar.failed'),
        description: parseApiError(err).message,
      })
    } finally {
      setBusy(false)
    }
  }

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.avatar.title')}</CardTitle>
        <CardDescription>{t('settings.avatar.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-muted-foreground">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{initials || '—'}</span>
            )}
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onPick}
            />
            <Button
              type="button"
              variant="outline"
              loading={busy}
              onClick={() => inputRef.current?.click()}
            >
              {t('settings.avatar.change')}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">{t('settings.avatar.hint')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
