// Domain: All
// Description: The last error boundary. Catches what error.tsx cannot — a throw
//   in the ROOT layout itself, which includes the providers: I18nProvider,
//   ThemeProvider, QueryClientProvider, AuthProvider.
//
// Which is exactly why this file uses none of them. When the root layout has
// already failed, `useT` would throw again inside the boundary meant to handle
// the first throw, and the user gets a blank page instead of an error page. So
// the copy here is hard-coded bilingual and the styling is inline: no context,
// no dictionary, no CSS that a failed build might not have shipped.
//
// It must also render its own <html> and <body>, because the root layout that
// normally provides them is the thing that broke.
'use client'

import * as React from 'react'
import { reportClientError } from '@/lib/monitoring/report'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    reportClientError(error, { boundary: 'global' })
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          background: '#ffffff',
          color: '#0f172a',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ margin: 0, maxWidth: '28rem', color: '#475569' }}>
          Xatolik yuz berdi. Sahifani qayta yuklab koʻring.
          <br />
          An unexpected error occurred. Please reload the page.
        </p>
        {error.digest ? (
          // The one thing worth showing: it is what ties this screen to the
          // server log entry when someone reports it.
          <code style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{error.digest}</code>
        ) : null}
        <button
          onClick={reset}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1.25rem',
            borderRadius: '0.5rem',
            border: 0,
            background: '#0f172a',
            color: '#ffffff',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Qayta urinish / Try again
        </button>
      </body>
    </html>
  )
}
