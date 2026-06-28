// Domain: Public (auth)
// Description: Centered, branded shell for auth pages.
import Link from 'next/link'
import { GraduationCap } from 'lucide-react'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-muted/40 to-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </span>
          <span className="text-xl font-bold tracking-tight">DSAT LMS</span>
        </Link>
        {children}
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Digital SAT preparation, done right.
      </p>
    </div>
  )
}
