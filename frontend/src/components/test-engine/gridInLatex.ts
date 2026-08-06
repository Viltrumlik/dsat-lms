// Domain: Test Engine
// Description: Render a student-produced answer as maths for the live preview.
//
// A grid-in is typed on one line — `3/4`, `-1/3`, `15.2` — and read back as a
// fraction. Showing `3/4` as plain text is what the field already contains; the
// preview earns its place by showing what it MEANS, so a student can see they
// typed the fraction they intended before committing to it.

/** A number the preview is willing to typeset: optional sign, digits, one dot. */
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/

/** `a/b` where both sides are numbers. */
const FRACTION = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\/([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/

/**
 * TeX for `value`, or null when it is not something we can safely typeset.
 *
 * Null rather than a best effort on purpose: a half-typed `3/` or a stray letter
 * handed to KaTeX renders as an error in red, which tells a student their answer
 * is wrong when all they have done is not finished typing it. Plain text is the
 * honest fallback.
 */
export function gridInLatex(value: string): string | null {
  const entered = value.trim()
  if (!entered) return null

  const fraction = FRACTION.exec(entered)
  if (fraction) {
    const [, numerator, denominator] = fraction
    // Keep a leading minus outside the fraction, the way it is written by hand.
    if (numerator.startsWith('-')) {
      return `-\\frac{${numerator.slice(1)}}{${denominator}}`
    }
    return `\\frac{${numerator}}{${denominator}}`
  }

  if (NUMBER.test(entered)) return entered
  return null
}
