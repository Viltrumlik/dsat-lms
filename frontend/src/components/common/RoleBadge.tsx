// Domain: Common
// Description: A small badge showing a user's role with a localized label and a
//   role-appropriate color. Reused across the admin + staff surfaces so role
//   styling stays consistent. Labels come from admin.roles.* (en + uz).
'use client'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { UserRole } from '@/types'

const ROLE_VARIANT: Record<UserRole, BadgeProps['variant']> = {
  admin: 'default',
  academic_manager: 'default',
  receptionist: 'warning',
  teacher: 'warning',
  student: 'success',
  public: 'secondary',
}

export function RoleBadge({ role }: { role: UserRole }) {
  const { t } = useI18n()
  return <Badge variant={ROLE_VARIANT[role]}>{t(`admin.roles.${role}`)}</Badge>
}
