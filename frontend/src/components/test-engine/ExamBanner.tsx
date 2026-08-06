// Domain: Test Engine
// Description: The navy banner above the test body. Every exam type gets one —
//   only the wording changes (practice test / past paper / mock / midterm /
//   assessment / homework), so the surface is identical across systems.
'use client'

import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { bannerKey } from './examLabels'

export function ExamBanner() {
  const t = useT()
  const examType = useSessionStore((s) => s.meta?.examType)

  return (
    <div className="px-3 pt-3">
      <div className="rounded-lg bg-bb-banner px-4 py-1.5 text-center text-[13px] font-bold uppercase tracking-[0.06em] text-white">
        {t(bannerKey(examType))}
      </div>
    </div>
  )
}
