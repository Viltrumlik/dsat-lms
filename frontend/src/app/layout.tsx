// ═══════════════════════════════════════
// DSAT LMS v2 — Root Layout
// Domain: All
// Description: html/body shell, global styles (incl. KaTeX), no-FOUC theme
//   script, and the client Providers tree.
// ═══════════════════════════════════════

import './globals.css'
import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { Providers } from './providers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/lib/i18n/config'

export const metadata: Metadata = {
  title: {
    default: 'DSAT LMS',
    template: '%s · DSAT LMS',
  },
  description: 'Digital SAT Learning Management System',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

// Applies the persisted theme before first paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('dsat-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d){document.documentElement.classList.add('dark');}}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  )
}
