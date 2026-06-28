import { redirect } from 'next/navigation'

export default function Home() {
  // The (student) layout guard bounces unauthenticated users to /login.
  redirect('/dashboard')
}
