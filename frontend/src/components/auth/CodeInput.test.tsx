// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { CodeInput } from './CodeInput'

/** The real usage: the parent owns the value and clears it on a bad code. */
function Harness({ onComplete }: { onComplete: (value: string) => void }) {
  const [code, setCode] = React.useState('')
  return (
    <CodeInput
      label="Code"
      value={code}
      onChange={setCode}
      onComplete={(value) => {
        onComplete(value)
        if (value === '000000') setCode('') // the parent rejecting a wrong code
      }}
    />
  )
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Code'), { target: { value } })

describe('CodeInput', () => {
  it('fires once the sixth digit lands', () => {
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    type('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('fires again for the right code after a wrong one was cleared', () => {
    // The path a student takes after a typo. A latching "have we fired" flag
    // silently swallows this second completion.
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    type('000000')
    type('511513')
    expect(onComplete).toHaveBeenNthCalledWith(1, '000000')
    expect(onComplete).toHaveBeenNthCalledWith(2, '511513')
  })

  it('does not fire before the code is complete', () => {
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    type('12345')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('keeps only digits, and only six of them', () => {
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    // A pasted "123 456" from a mail client, and a stray seventh character.
    type('12 34-5678')
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })
})
