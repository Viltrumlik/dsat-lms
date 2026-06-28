// Domain: Test Engine
// Description: End-of-test review — per-section progress + jump-back grid + submit.
'use client'

import { Flag, Send } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

export function ReviewScreen({ onSubmit }: { onSubmit: () => void }) {
  const sections = useSessionStore((s) => s.sections)
  const questionStates = useSessionStore((s) => s.questionStates)
  const navigateTo = useSessionStore((s) => s.navigateTo)
  const setStatus = useSessionStore((s) => s.setStatus)

  const jumpTo = (sectionIdx: number, questionIdx: number) => {
    navigateTo(sectionIdx, questionIdx)
    setStatus('active')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 md:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Review your answers</h2>
          <p className="mt-1 text-muted-foreground">
            Tap any question to revisit it, or submit when you&apos;re ready.
          </p>
        </div>

        {sections.map((section, sIdx) => {
          const answered = section.questions.filter((q) => {
            const a = questionStates[q.id]?.answer
            return a != null && a !== ''
          }).length
          return (
            <div key={sIdx} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {section.title || `Section ${section.sectionNumber}`}
                </h3>
                <span className="text-sm text-muted-foreground">
                  {answered}/{section.questions.length} answered
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
                {section.questions.map((q, qIdx) => {
                  const st = questionStates[q.id]
                  const isAnswered = st?.answer != null && st.answer !== ''
                  const flagged = st?.flagged
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => jumpTo(sIdx, qIdx)}
                      className={cn(
                        'relative flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                        isAnswered
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:bg-muted'
                      )}
                    >
                      {qIdx + 1}
                      {flagged && (
                        <Flag className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-warning text-warning" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div className="sticky bottom-0 -mx-4 border-t border-border bg-card px-4 py-4 md:mx-0 md:rounded-lg md:border">
          <Button className="w-full" size="lg" onClick={onSubmit}>
            <Send className="h-4 w-4" /> Submit test
          </Button>
        </div>
      </div>
    </div>
  )
}
