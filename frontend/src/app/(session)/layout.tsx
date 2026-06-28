// Domain: Test Engine
// Description: Bare fullscreen shell — NO navbar/sidebar. Auth-guarded.
import { RequireAuth } from '@/components/common/RequireAuth'

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="min-h-[100dvh] bg-background">{children}</div>
    </RequireAuth>
  )
}
