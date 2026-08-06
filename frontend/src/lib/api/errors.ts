// ═══════════════════════════════════════
// DSAT LMS v2 — API error parsing
// Domain: All
// Description: Normalizes the backend error envelope into something the UI can
//   show (toast message) and forms can map (field errors → RHF camelCase keys).
// ═══════════════════════════════════════

import { AxiosError } from 'axios'
import type { APIError } from '@/types'
import { snakeToCamel } from '@/lib/utils/case'

export interface ParsedApiError {
  code: string
  message: string
  /** Field-level validation errors, keyed by camelCase field name. */
  fields: Record<string, string>
  /**
   * Extra keys the server put alongside `code` — currently `attemptsLeft` on a
   * refused verification code. They exist so a translated sentence can be built
   * client-side instead of parsing numbers back out of an English one.
   */
  extra: Record<string, unknown>
}

/** Reserved envelope keys; anything else in `error` is caller-supplied detail. */
const ENVELOPE_KEYS = new Set(['code', 'message', 'field', 'fields'])

function isApiErrorBody(body: unknown): body is APIError {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    (body as { success: unknown }).success === false &&
    'error' in body
  )
}

export function parseApiError(err: unknown): ParsedApiError {
  const fallback: ParsedApiError = {
    code: 'UNKNOWN_ERROR',
    message: 'Something went wrong. Please try again.',
    fields: {},
    extra: {},
  }

  if (err instanceof AxiosError) {
    const body = err.response?.data
    if (isApiErrorBody(body)) {
      const fields: Record<string, string> = {}
      if (body.error.fields) {
        for (const [key, msgs] of Object.entries(body.error.fields)) {
          fields[snakeToCamel(key)] = Array.isArray(msgs) ? msgs[0] : String(msgs)
        }
      }
      // snakeToCamel here for the same reason it is used on `fields` above: the
      // response interceptor camelizes SUCCESS bodies only, so an error envelope
      // reaches us exactly as Django wrote it — `attempts_left`, not
      // `attemptsLeft`. Without this the callers below look up a key that is
      // never there and silently render the sentence without its number.
      const extra: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(body.error)) {
        if (!ENVELOPE_KEYS.has(key)) extra[snakeToCamel(key)] = value
      }
      return {
        code: body.error.code ?? fallback.code,
        message: body.error.message ?? fallback.message,
        fields,
        extra,
      }
    }
    if (err.code === 'ERR_NETWORK') {
      return { ...fallback, code: 'NETWORK_ERROR', message: 'Cannot reach the server.' }
    }
    if (err.message) return { ...fallback, message: err.message }
  }

  return fallback
}
