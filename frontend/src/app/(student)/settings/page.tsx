// Domain: Identity (settings)
// Description: Account settings — profile fields + password change.
'use client'

import { useAuth } from '@/lib/auth/AuthProvider'
import { useT } from '@/lib/i18n/I18nProvider'
import { ProfileForm } from '@/components/settings/ProfileForm'
import { ChangePasswordForm } from '@/components/settings/ChangePasswordForm'

export default function SettingsPage() {
  const { user } = useAuth()
  const t = useT()

  if (!user) return null // RequireAuth gates this; guard for the first paint

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>
      <ProfileForm user={user} />
      <ChangePasswordForm />
    </div>
  )
}
