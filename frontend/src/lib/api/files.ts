// ═══════════════════════════════════════
// DSAT LMS v2 — Files API
// Domain: Files
// Description: Uploads pipeline client. Upload is multipart FormData — the axios
//   client skips the camel→snake transform for FormData (and drops the JSON
//   Content-Type so the browser sets the multipart boundary), so field names are
//   sent snake_case (`owner_id`) to match the DRF view. Responses are camelized.
// ═══════════════════════════════════════

import { del, getPaginated, post } from './client'
import type { Pagination } from '@/types'

export type AttachmentKind = 'avatar' | 'homework' | 'document' | 'note' | 'other'

export interface Attachment {
  id: string
  kind: AttachmentKind
  originalName: string
  contentType: string
  size: number
  ownerId: string
  uploadedById: string
  downloadUrl: string
  createdAt: string
}

export interface UploadParams {
  file: File
  kind?: AttachmentKind
  /** Upload on behalf of another user (full-access staff only). */
  ownerId?: string
}

export interface ListFilesParams {
  owner?: string
  kind?: AttachmentKind
  cursor?: string
}

export const filesAPI = {
  upload: ({ file, kind = 'document', ownerId }: UploadParams) => {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    if (ownerId) form.append('owner_id', ownerId) // snake_case: FormData isn't decamelized
    return post<Attachment>('/files/', form)
  },
  list: (params?: ListFilesParams): Promise<{ data: Attachment[]; pagination?: Pagination }> =>
    getPaginated<Attachment>('/files/', params),
  remove: (id: string) => del<void>(`/files/${id}/`),
  setAvatar: (id: string) => post<{ avatarUrl: string }>(`/files/${id}/set-avatar/`),
}
