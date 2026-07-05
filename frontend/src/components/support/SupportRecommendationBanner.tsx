// Domain: Support
// Description: Proactive recommendation banner (S4) on the student dashboard —
//   shows active nudges from the trigger sweep with a pre-filled "Book help"
//   deep-link into the booking wizard, and a dismiss action.
'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, X } from 'lucide-react'
import { supportAPI } from '@/lib/api/support'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useToast } from '@/components/ui/toast'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import type { SupportRecommendation } from '@/types'

function bookHref(rec: SupportRecommendation) {
  const params = new URLSearchParams()
  if (rec.subject) params.set('subject', rec.subject)
  if (rec.topic) params.set('topic', rec.topic)
  params.set('rec', rec.id)
  return `/support/book?${params.toString()}`
}

const ACCENT: Record<SupportRecommendation['severity'], string> = {
  critical: 'border-l-4 border-l-error',
  warning: 'border-l-4 border-l-warning',
  info: 'border-l-4 border-l-primary',
}

export function SupportRecommendationBanner() {
  const t = useT()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['support', 'recommendations'],
    queryFn: supportAPI.recommendations.list,
    enabled: !!user && user.role !== 'public', // recs are academy-student only
  })

  const dismiss = useMutation({
    mutationFn: (id: string) => supportAPI.recommendations.dismiss(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['support', 'recommendations'] }),
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('support.recommendation.dismissFailed'),
        description: parseApiError(err).message,
      }),
  })

  const recs = data ?? []
  if (recs.length === 0) return null

  return (
    <div className="space-y-2">
      {recs.map((rec) => (
        <Card key={rec.id} className={cn(ACCENT[rec.severity])}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm">
                {t(`support.recommendation.rule.${rec.ruleKey}`, { topic: rec.topic })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href={bookHref(rec)} className={buttonVariants({ size: 'sm' })}>
                {t('support.recommendation.book')}
              </Link>
              <button
                type="button"
                aria-label={t('support.recommendation.dismiss')}
                onClick={() => dismiss.mutate(rec.id)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
