// Domain: Test Engine
// Description: The header's "More" (⋮) menu — help, shortcuts, and the exit /
//   pause action, mirroring the official app's overflow menu.
'use client'

import * as React from 'react'
import { CircleHelp, Keyboard, MoreVertical, PauseCircle } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useT } from '@/lib/i18n/I18nProvider'

// Keep in sync with useExamShortcuts — only list keys the engine actually binds.
const SHORTCUT_KEYS = [
  { keys: '←  /  →', labelKey: 'testEngine.shortcuts.navigate' },
  { keys: 'A – D', labelKey: 'testEngine.shortcuts.choose' },
  { keys: 'M', labelKey: 'testEngine.shortcuts.mark' },
  { keys: 'Esc', labelKey: 'testEngine.shortcuts.close' },
]

export function MoreMenu({ onPause }: { onPause: () => void }) {
  const t = useT()
  const [helpOpen, setHelpOpen] = React.useState(false)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex flex-col items-center gap-0.5 text-bb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue"
            aria-label={t('testEngine.more')}
          >
            <MoreVertical className="h-6 w-6" />
            <span className="text-[13px] font-semibold">{t('testEngine.more')}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[13rem]">
          <DropdownMenuItem onSelect={() => setHelpOpen(true)}>
            <CircleHelp className="h-4 w-4" /> {t('testEngine.menu.help')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard className="h-4 w-4" /> {t('testEngine.menu.shortcuts')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onPause}>
            <PauseCircle className="h-4 w-4" /> {t('testEngine.menu.saveAndExit')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('testEngine.menu.help')}</DialogTitle>
            <DialogDescription>{t('testEngine.help.body')}</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t('testEngine.help.tipMark')}</li>
            <li>{t('testEngine.help.tipEliminate')}</li>
            <li>{t('testEngine.help.tipHighlight')}</li>
            <li>{t('testEngine.help.tipNavigator')}</li>
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('testEngine.menu.shortcuts')}</DialogTitle>
          </DialogHeader>
          <dl className="divide-y divide-border text-sm">
            {SHORTCUT_KEYS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between gap-4 py-2">
                <dt className="text-muted-foreground">{t(s.labelKey)}</dt>
                <dd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                  {s.keys}
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  )
}
