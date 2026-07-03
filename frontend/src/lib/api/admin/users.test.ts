import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted so the mocks exist before vi.mock's factory (also hoisted) runs.
const { get, getPaginated, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  getPaginated: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

vi.mock('../client', () => ({ get, getPaginated, post, patch, del }))

// Imported after the mock so the module binds to the mocked helpers.
import { adminUsersAPI } from './users'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('adminUsersAPI', () => {
  it('list forwards filters + cursor to getPaginated', () => {
    adminUsersAPI.list({ role: 'teacher', isActive: false, search: 'a', cursor: 'c' })
    expect(getPaginated).toHaveBeenCalledWith('/admin/users/', {
      role: 'teacher',
      isActive: false,
      search: 'a',
      cursor: 'c',
    })
  })

  it('get hits the detail URL', () => {
    adminUsersAPI.get('u1')
    expect(get).toHaveBeenCalledWith('/admin/users/u1/')
  })

  it('create posts the payload to the collection', () => {
    const payload = {
      email: 'a@b.c',
      password: 'secret12',
      firstName: 'A',
      lastName: 'B',
      role: 'student' as const,
    }
    adminUsersAPI.create(payload)
    expect(post).toHaveBeenCalledWith('/admin/users/', payload)
  })

  it('update patches the detail URL', () => {
    adminUsersAPI.update('u1', { firstName: 'C' })
    expect(patch).toHaveBeenCalledWith('/admin/users/u1/', { firstName: 'C' })
  })

  it('changeRole patches the role action', () => {
    adminUsersAPI.changeRole('u1', 'admin')
    expect(patch).toHaveBeenCalledWith('/admin/users/u1/role/', { role: 'admin' })
  })

  it('deactivate / reactivate POST their actions', () => {
    adminUsersAPI.deactivate('u1')
    expect(post).toHaveBeenCalledWith('/admin/users/u1/deactivate/')
    adminUsersAPI.reactivate('u1')
    expect(post).toHaveBeenCalledWith('/admin/users/u1/reactivate/')
  })

  it('remove soft-deletes via del', () => {
    adminUsersAPI.remove('u1')
    expect(del).toHaveBeenCalledWith('/admin/users/u1/')
  })

  it('setPassword posts the new password', () => {
    adminUsersAPI.setPassword('u1', 'secret12')
    expect(post).toHaveBeenCalledWith('/admin/users/u1/set-password/', { newPassword: 'secret12' })
  })
})
