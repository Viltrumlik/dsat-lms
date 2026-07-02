// ═══════════════════════════════════════
// DSAT LMS v2 — Answer comparison
// Domain: Question Bank / Test Engine
// Description: Grid-in answers compare as exact rationals (BigInt cross-
//   multiplication — no float error), so equivalent forms all count:
//   7/2 == 3.5, .5 == 0.5, 36.0 == 36. Non-numeric answers (MCQ letters, text)
//   fall back to case-insensitive string equality. Mirrors the backend's
//   answers_match() in apps/assessments/services.py.
// ═══════════════════════════════════════

interface Rational {
  num: bigint
  den: bigint
}

function parseRational(raw: string): Rational | null {
  const s = raw.trim()

  const fraction = /^([+-]?\d+)\s*\/\s*(\d+)$/.exec(s)
  if (fraction) {
    const den = BigInt(fraction[2])
    if (den === 0n) return null
    return { num: BigInt(fraction[1]), den }
  }

  const decimal = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s)
  if (!decimal) return null
  const sign = decimal[1]
  const whole = decimal[2] ?? ''
  const frac = decimal[3] ?? ''
  if (whole === '' && frac === '') return null
  const num = BigInt(whole + frac || '0') * (sign === '-' ? -1n : 1n)
  return { num, den: 10n ** BigInt(frac.length) }
}

export function answersMatch(chosen: string, correct: string): boolean {
  const a = parseRational(chosen)
  const b = parseRational(correct)
  if (a && b) return a.num * b.den === b.num * a.den
  return chosen.trim().toLowerCase() === correct.trim().toLowerCase()
}
