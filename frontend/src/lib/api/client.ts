// ═══════════════════════════════════════
// DSAT LMS v2 — API Client
// Domain: All
// Description: Axios instance + auth interceptors + typed responses.
//   - Bearer access token (in-memory) on every request.
//   - HttpOnly refresh cookie → single-flight refresh on 401, with a queue.
//   - snake_case ⇄ camelCase transform so the app only ever sees camelCase.
// ═══════════════════════════════════════

import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import type { APISuccess, Pagination } from '@/types'
import { camelizeKeys, decamelizeKeys } from '@/lib/utils/case'

// ─────────────────────────────────────
// Create instance
// ─────────────────────────────────────

export const apiClient: AxiosInstance = axios.create({
  baseURL: (process.env.NEXT_PUBLIC_API_URL ?? '') + '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // refresh token HttpOnly cookie uchun
  timeout: 15_000,
})

// ─────────────────────────────────────
// Token management (in-memory)
// ─────────────────────────────────────

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    delete apiClient.defaults.headers.common['Authorization']
  }
}

export function getAccessToken() {
  return accessToken
}

// ─────────────────────────────────────
// Request interceptor — token + camel→snake on body
// ─────────────────────────────────────

function isTransformableBody(data: unknown): data is object {
  if (data == null || typeof data !== 'object') return false
  if (typeof FormData !== 'undefined' && data instanceof FormData) return false
  if (typeof Blob !== 'undefined' && data instanceof Blob) return false
  if (data instanceof ArrayBuffer) return false
  if (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) return false
  return true
}

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${accessToken}`
    }
    if (isTransformableBody(config.data)) {
      config.data = decamelizeKeys(config.data)
    }
    if (config.params && typeof config.params === 'object') {
      config.params = decamelizeKeys(config.params)
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ─────────────────────────────────────
// Response interceptor — snake→camel + token refresh
// ─────────────────────────────────────

let isRefreshing = false
let refreshQueue: Array<{
  resolve: (token: string) => void
  reject: (error: Error) => void
}> = []

apiClient.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === 'object') {
      response.data = camelizeKeys(response.data)
    }
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined

    // Never try to refresh the refresh call itself.
    const isAuthRefresh = originalRequest?.url?.includes('/auth/refresh')

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRefresh
    ) {
      originalRequest._retry = true

      if (isRefreshing) {
        // Another refresh is in flight — queue this request.
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token) => {
              if (originalRequest.headers) {
                originalRequest.headers['Authorization'] = `Bearer ${token}`
              }
              resolve(apiClient(originalRequest))
            },
            reject,
          })
        })
      }

      isRefreshing = true

      try {
        // Response interceptor camelizes → data.data.accessToken
        const response = await apiClient.post<APISuccess<{ accessToken: string }>>(
          '/auth/refresh/'
        )
        const newToken = response.data.data.accessToken
        setAccessToken(newToken)

        refreshQueue.forEach((item) => item.resolve(newToken))
        refreshQueue = []

        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`
        }
        return apiClient(originalRequest)
      } catch (refreshError) {
        refreshQueue.forEach((item) => item.reject(refreshError as Error))
        refreshQueue = []
        setAccessToken(null)

        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

// ─────────────────────────────────────
// Type-safe request helpers (unwrap `data`)
// ─────────────────────────────────────

export async function get<T>(url: string, params?: object): Promise<T> {
  const response = await apiClient.get<APISuccess<T>>(url, { params })
  return response.data.data
}

export async function post<T>(url: string, data?: object): Promise<T> {
  const response = await apiClient.post<APISuccess<T>>(url, data)
  return response.data.data
}

export async function patch<T>(url: string, data?: object): Promise<T> {
  const response = await apiClient.patch<APISuccess<T>>(url, data)
  return response.data.data
}

export async function put<T>(url: string, data?: object): Promise<T> {
  const response = await apiClient.put<APISuccess<T>>(url, data)
  return response.data.data
}

export async function del<T>(url: string): Promise<T> {
  const response = await apiClient.delete<APISuccess<T>>(url)
  return response.data.data
}

/** List helper that also surfaces cursor pagination meta. */
export async function getPaginated<T>(
  url: string,
  params?: object
): Promise<{ data: T[]; pagination?: Pagination }> {
  const response = await apiClient.get<APISuccess<T[]>>(url, { params })
  return { data: response.data.data, pagination: response.data.meta?.pagination }
}
