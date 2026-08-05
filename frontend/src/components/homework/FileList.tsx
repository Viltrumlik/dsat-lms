// Domain: Homework
// Description: A row of attached files with an auth'd download.
//   Attachments are private and served behind a Bearer-gated endpoint, so a
//   plain <a href> would 401 — filesAPI.download fetches the blob with the
//   in-memory token and hands it to the browser.
'use client'

import * as React from 'react'
import { Download, Paperclip } from 'lucide-react'
import { filesAPI } from '@/lib/api/files'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import type { HomeworkFile } from '@/types'

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileList({ files, label }: { files: HomeworkFile[]; label?: string }) {
  const t = useT()
  const { toast } = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)

  if (files.length === 0) return null

  const download = async (file: HomeworkFile) => {
    setBusy(file.id)
    try {
      await filesAPI.download(`/api/v1/files/${file.id}/download/`, file.originalName)
    } catch {
      toast({ variant: 'error', title: t('homework.files.downloadFailed') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <ul className="space-y-1.5">
        {files.map((file) => (
          <li key={file.id}>
            <button
              type="button"
              onClick={() => download(file)}
              disabled={busy === file.id}
              className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
            >
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {humanSize(file.size)}
              </span>
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
