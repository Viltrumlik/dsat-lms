// ═══════════════════════════════════════
// DSAT LMS v2 — Settings form schemas (Zod)
// Domain: Identity
// ═══════════════════════════════════════

import { z } from 'zod'

export const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  // Kept as strings (native inputs); converted to number/null on submit.
  satTargetScore: z
    .string()
    .refine(
      (v) => {
        if (v.trim() === '') return true
        const n = Number(v)
        return Number.isInteger(n) && n >= 400 && n <= 1600
      },
      { message: 'Enter a score between 400 and 1600.' }
    ),
  examDate: z.string(), // yyyy-mm-dd from <input type="date">, '' = unset
})
export type ProfileValues = z.infer<typeof profileSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
