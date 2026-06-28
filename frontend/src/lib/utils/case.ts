// ═══════════════════════════════════════
// DSAT LMS v2 — Case transform
// Domain: All (API layer)
// Description: Deep snake_case ⇄ camelCase conversion for request/response bodies.
//   Backend (Django REST) speaks snake_case; the frontend types are camelCase.
//   client.ts camelizes every response payload and decamelizes every request body
//   so the rest of the app never sees snake_case.
//
//   Object keys that are not plain identifiers (e.g. UUID map keys like
//   "a1b2c3d4-..." used in client_session_data.questions) contain no underscores
//   and no uppercase letters, so both transforms leave them untouched — the
//   round-trip is symmetric.
// ═══════════════════════════════════════

type Plain = Record<string, unknown>

function isPlainObject(value: unknown): value is Plain {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function transformKeys<T>(input: T, keyFn: (k: string) => string): T {
  if (Array.isArray(input)) {
    return input.map((item) => transformKeys(item, keyFn)) as unknown as T
  }
  if (isPlainObject(input)) {
    const out: Plain = {}
    for (const [k, v] of Object.entries(input)) {
      out[keyFn(k)] = transformKeys(v, keyFn)
    }
    return out as unknown as T
  }
  return input
}

/** Recursively convert all object keys from snake_case to camelCase. */
export function camelizeKeys<T>(input: T): T {
  return transformKeys(input, snakeToCamel)
}

/** Recursively convert all object keys from camelCase to snake_case. */
export function decamelizeKeys<T>(input: T): T {
  return transformKeys(input, camelToSnake)
}
