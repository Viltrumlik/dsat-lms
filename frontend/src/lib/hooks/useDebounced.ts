// Domain: Shared
// Description: Debounces a rapidly-changing value (search boxes, filters) so
//   downstream queries only fire once the user pauses.
'use client'

import * as React from 'react'

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value)

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
