// ═══════════════════════════════════════
// DSAT LMS v2 — Client error reporting
// Domain: All
// Description: Send a browser-side crash to the backend, which logs it — and,
//   where SENTRY_DSN is configured, forwards it as a Sentry event.
//
// The backend has had error tracking since deploy; the frontend had none. So an
// exam surface that broke in a student's browser produced a message in a console
// nobody was looking at, and the first anyone heard of it was a student saying
// "it doesn't work". Errors on the surface a student actually touches were the
// ones we could not see.
//
// Deliberately NOT @sentry/nextjs: that is a large dependency, a build plugin
// and a second DSN to manage, for a signal that fits in one POST. Reports land
// in the same Sentry project as the server's, because the server is what sends
// them.
//
// Rules this obeys, because a reporter that misbehaves is worse than none:
//   · never throws — a failure here must not replace the error being reported
//   · never blocks — fire and forget, `keepalive` so it survives the unload
//   · never loops — a report that fails is dropped, not retried
//   · never floods — capped per page load; a render loop can throw thousands
//   · sends no credentials — no Authorization header, no cookies
// ═══════════════════════════════════════

const MAX_REPORTS_PER_PAGE = 5
const MAX_MESSAGE = 500
const MAX_STACK = 4000

let sent = 0

export function reportClientError(
  error: unknown,
  context: Record<string, string> = {}
): void {
  // Always leave a trace locally, whatever happens to the network call.
  // eslint-disable-next-line no-console
  console.error(error)

  if (typeof window === 'undefined') return
  if (sent >= MAX_REPORTS_PER_PAGE) return
  sent += 1

  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const base = process.env.NEXT_PUBLIC_API_URL ?? ''
    void fetch(`${base}/api/v1/client-errors/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: err.message.slice(0, MAX_MESSAGE),
        stack: (err.stack ?? '').slice(0, MAX_STACK),
        digest: (err as { digest?: string }).digest ?? '',
        url: window.location.href.slice(0, MAX_MESSAGE),
        user_agent: navigator.userAgent.slice(0, MAX_MESSAGE),
        context,
      }),
      // No cookies: this endpoint is unauthenticated by design, and a crash
      // report is not worth widening what a session token is sent to.
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Reporting must never become the error.
  }
}
