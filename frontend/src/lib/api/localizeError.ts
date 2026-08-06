// ═══════════════════════════════════════
// DSAT LMS v2 — Localized API errors
// Domain: All
// Description: Turn a parsed error envelope into a sentence in the user's language.
//
// Server messages are written in English. That was fine while the only reader
// was a developer, and wrong the moment a student in an Uzbek interface got told
// "That code is not correct. 3 attempts left." — the one screen where the
// message IS the instruction.
//
// So: the server sends a stable code (`CODE_EXPIRED`, `CODE_INVALID`, …) plus
// any numbers the sentence needs (`attemptsLeft`), and the sentence is built
// here. Codes we have no translation for fall through to the server's English,
// which is worse than a translation and much better than nothing — a new error
// code on the backend must never render as a blank or a raw key.
// ═══════════════════════════════════════

import type { ParsedApiError } from './errors'

type Translate = (key: string, vars?: Record<string, string | number>) => string

/** API error code → i18n key under `errors.api.*`. */
const TRANSLATED: Record<string, string> = {
  CODE_NO_CODE: 'errors.api.codeNoCode',
  CODE_EXPIRED: 'errors.api.codeExpired',
  CODE_TOO_MANY_ATTEMPTS: 'errors.api.codeTooManyAttempts',
  CODE_INVALID: 'errors.api.codeInvalid',
  EMAIL_RATE_LIMITED: 'errors.api.emailRateLimited',
  NETWORK_ERROR: 'errors.api.network',
}

export function localizeApiError(t: Translate, parsed: ParsedApiError): string {
  const key = TRANSLATED[parsed.code]
  if (!key) return parsed.message

  // CODE_INVALID is the one that needs a number, and it only carries one while
  // attempts remain — the last wrong guess comes back as TOO_MANY_ATTEMPTS.
  if (parsed.code === 'CODE_INVALID') {
    const left = parsed.extra.attemptsLeft
    if (typeof left !== 'number') return t('errors.api.codeInvalidPlain')
    return t(key, { count: left })
  }
  return t(key)
}
