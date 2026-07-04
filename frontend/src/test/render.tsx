// Domain: Test utils
// Description: Render a component inside the providers the admin surfaces need
//   (TanStack Query + i18n + toasts). Query retries are off so error states surface
//   immediately in tests.
import * as React from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/lib/i18n/I18nProvider'
import { ToastProvider } from '@/components/ui/toast'

export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider initialLocale="en">
        <ToastProvider>{ui}</ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}
