// Domain: UI
// Description: Inline form field error message.
export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-sm text-error">{message}</p>
}
