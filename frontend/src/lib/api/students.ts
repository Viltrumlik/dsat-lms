// ═══════════════════════════════════════
// DSAT LMS v2 — Students API (CRM person layer)
// Domain: Academy
// Description: A student's own CRM profile (self-serve demographics) + the staff
//   surface (read/update demographics, lifecycle status, guardians). Staff calls
//   are used by the 4B profile shell; all are row-scoped server-side.
// ═══════════════════════════════════════

import { del, get, patch, post } from './client'
import type {
  Guardian,
  GuardianRelation,
  LifecycleStatus,
  StudentProfile,
  StudentProfileUpdate,
} from '@/types'

export interface GuardianInput {
  relation: GuardianRelation
  name: string
  phone?: string
  telegram?: string
  email?: string
  isEmergency?: boolean
}

export const studentsAPI = {
  // Self-serve (role=student).
  getMyProfile: () => get<StudentProfile>('/students/me/'),
  updateMyProfile: (payload: StudentProfileUpdate) =>
    patch<StudentProfile>('/students/me/', payload),

  // Staff surface (consumed by the 4B profile shell).
  getProfile: (userId: string) => get<StudentProfile>(`/students/${userId}/`),
  updateProfile: (userId: string, payload: StudentProfileUpdate) =>
    patch<StudentProfile>(`/students/${userId}/`, payload),
  changeStatus: (userId: string, status: LifecycleStatus) =>
    post<StudentProfile>(`/students/${userId}/status/`, { status }),
  listGuardians: (userId: string) => get<Guardian[]>(`/students/${userId}/guardians/`),
  createGuardian: (userId: string, payload: GuardianInput) =>
    post<Guardian>(`/students/${userId}/guardians/`, payload),
  updateGuardian: (guardianId: string, payload: Partial<GuardianInput>) =>
    patch<Guardian>(`/students/guardians/${guardianId}/`, payload),
  removeGuardian: (guardianId: string) => del<void>(`/students/guardians/${guardianId}/`),
}
