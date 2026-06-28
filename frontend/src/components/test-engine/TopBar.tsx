// Domain: Test Engine
// Description: Fullscreen test header — exam/section title, timer, pause.
'use client'

import { Pause } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { Button } from '@/components/ui/button'
import { TimerDisplay } from './TimerDisplay'

export function TopBar({ onTimeUp, onPause }: { onTimeUp: () => void; onPause: () => void }) {
  const examTitle = useSessionStore((s) => s.meta?.examTitle)
  const section = useSessionStore((s) => s.sections[s.currentSectionIndex])

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{examTitle}</p>
        {section && (
          <p className="truncate text-xs text-muted-foreground">
            {section.title || `Section ${section.sectionNumber}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <TimerDisplay onTimeUp={onTimeUp} />
        <Button variant="ghost" size="sm" onClick={onPause} aria-label="Pause test">
          <Pause className="h-4 w-4" /> Pause
        </Button>
      </div>
    </header>
  )
}
