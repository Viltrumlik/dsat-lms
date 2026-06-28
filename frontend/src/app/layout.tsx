// ═══════════════════════════════════════
// DSAT LMS v2 — Root Layout
// Domain: All
// Description: html/body shell, global styles (incl. KaTeX), no-FOUC theme
//   script, and the client Providers tree.
// ═══════════════════════════════════════

import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Providers } from './providers'

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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
