// ═══════════════════════════════════════
// DSAT LMS v2 — URL helpers
// Domain: All
// ═══════════════════════════════════════

/**
 * Only allow same-origin, absolute internal paths as a redirect target.
 * Rejects external URLs, protocol-relative ("//evil.com"), backslash tricks
 * ("/\\evil.com"), and scheme URLs ("javascript:…") so a crafted ?next= can't
 * redirect users off the app. Anything unsafe falls back to `fallback`.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback
  }
  return raw
}
