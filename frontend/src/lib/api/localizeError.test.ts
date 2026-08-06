// Domain: All
// Covers: localizeApiError — that a known code is translated, that the count in
//   "3 attempts left" comes from the payload rather than being parsed back out
//   of an English sentence, and that an UNKNOWN code falls through to the
//   server's message instead of rendering a raw key or a blank.

import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { localizeApiError } from './localizeError'
import { parseApiError, type ParsedApiError } from './errors'
import { en } from '@/lib/i18n/dictionaries/en'
import { uz } from '@/lib/i18n/dictionaries/uz'

/** The real interpolation the provider does, without mounting React. */
function translator(dict: typeof en) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const hit = key.split('.').reduce<unknown>((acc, part) => {
      return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined
    }, dict)
    if (typeof hit !== 'string') return key
    return vars
      ? hit.replace(/\{(\w+)\}/g, (_m, name: string) => String(vars[name] ?? `{${name}}`))
      : hit
  }
}

const parsed = (over: Partial<ParsedApiError> = {}): ParsedApiError => ({
  code: 'CODE_INVALID',
  message: 'That code is not correct. 3 attempts left.',
  fields: {},
  extra: {},
  ...over,
})

describe('localizeApiError', () => {
  it('translates a known code', () => {
    const result = localizeApiError(translator(uz), parsed({ code: 'CODE_EXPIRED' }))
    expect(result).toBe('Kod muddati tugagan. Yangi kod soʻrang.')
  })

  it('takes the attempt count from the payload, not the English sentence', () => {
    const result = localizeApiError(
      translator(uz),
      parsed({ code: 'CODE_INVALID', extra: { attemptsLeft: 3 } })
    )
    expect(result).toBe('Kod notoʻgʻri. 3 ta urinish qoldi.')
    expect(result).not.toContain('{count}')
  })

  it('drops the count when the server did not send one', () => {
    const result = localizeApiError(translator(uz), parsed({ code: 'CODE_INVALID' }))
    expect(result).toBe('Kod notoʻgʻri.')
  })

  it('falls back to the server message for a code it does not know', () => {
    // A new backend error code must never render as a raw key or a blank.
    const result = localizeApiError(
      translator(uz),
      parsed({ code: 'SOME_FUTURE_ERROR', message: 'Something specific happened.' })
    )
    expect(result).toBe('Something specific happened.')
  })

  it('works in English too', () => {
    const result = localizeApiError(
      translator(en),
      parsed({ code: 'CODE_INVALID', extra: { attemptsLeft: 1 } })
    )
    expect(result).toBe('That code is not correct. 1 attempts left.')
  })
})

describe('parseApiError extra keys', () => {
  const envelope = (error: Record<string, unknown>) =>
    new AxiosError('bad request', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { success: false, error },
    })

  it('camelizes non-envelope keys into extra', () => {
    // The response interceptor camelizes SUCCESS bodies only, so an error
    // envelope arrives exactly as Django wrote it. If parseApiError did not
    // convert, localizeApiError would look for `attemptsLeft` and never find it
    // — the sentence would render without its number, silently.
    const result = parseApiError(
      envelope({ code: 'CODE_INVALID', message: 'nope', field: 'code', attempts_left: 2 })
    )
    expect(result.code).toBe('CODE_INVALID')
    expect(result.extra).toEqual({ attemptsLeft: 2 })
  })

  it('survives the round trip the app actually makes', () => {
    const raw = envelope({
      code: 'CODE_INVALID',
      message: 'That code is not correct. 2 attempts left.',
      field: 'code',
      attempts_left: 2,
    })
    const sentence = localizeApiError(translator(uz), parseApiError(raw))
    expect(sentence).toBe('Kod notoʻgʻri. 2 ta urinish qoldi.')
  })

  it('does not mistake envelope keys for detail', () => {
    const result = parseApiError(
      envelope({ code: 'VALIDATION_ERROR', message: 'nope', field: null })
    )
    expect(result.extra).toEqual({})
  })
})
