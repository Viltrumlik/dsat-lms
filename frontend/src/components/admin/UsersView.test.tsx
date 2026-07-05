// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'

const { list } = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/lib/api/admin/users', () => ({
  adminUsersAPI: {
    list,
    create: vi.fn(),
    update: vi.fn(),
    changeRole: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    remove: vi.fn(),
    setPassword: vi.fn(),
    importCsv: vi.fn(),
  },
}))
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'admin1', role: 'admin' } }) }))

import { UsersView } from './UsersView'

function user(over = {}) {
  return {
    id: 'u1',
    email: 'student@dsat.local',
    firstName: 'Aziza',
    lastName: 'Karimova',
    fullName: 'Aziza Karimova',
    role: 'student',
    isActive: true,
    isStaff: false,
    isEmailVerified: true,
    avatarUrl: null,
    satTargetScore: null,
    examDate: null,
    timezone: 'UTC',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    ...over,
  }
}

beforeEach(() => list.mockReset())

describe('UsersView', () => {
  it('renders users + role/status from the API', async () => {
    list.mockResolvedValue({ data: [user()], pagination: { count: 1, next: null, previous: null } })
    renderWithProviders(<UsersView />)
    expect(await screen.findByText('Aziza Karimova')).toBeTruthy()
    expect(screen.getByText('student@dsat.local')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('shows the empty state', async () => {
    list.mockResolvedValue({ data: [], pagination: { count: 0, next: null, previous: null } })
    renderWithProviders(<UsersView />)
    expect(await screen.findByText(/No users match/i)).toBeTruthy()
  })
})
