// ═══════════════════════════════════════
// DSAT LMS v2 — Client Providers
// Domain: All
// Description: TanStack Query + Toast + Theme + Auth. Mounted once in layout.tsx.
// ═══════════════════════════════════════

'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { ThemeProvider } from '@/lib/theme/ThemeProvider'
import { ToastProvider } from '@/components/ui/toast'
import { AuthProvider } from '@/lib/auth/AuthProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Don't retry auth/client errors.
              if (error instanceof AxiosError) {
                const status = error.response?.status
                if (status && status >= 400 && status < 500) return false
              }
              return failureCount < 2
            },
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
