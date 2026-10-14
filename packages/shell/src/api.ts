import { customFetch, type MineralResponse } from '@smorg/ui'

export type User = { id: string, email: string }

export type AppInfo = {
  slug: string
  name: string
  color: string
  version: string
  uses: string[]
}

export async function getMe(): Promise<MineralResponse<User>> {
  return customFetch<User>('/api/me')
}

export async function requestCode(email: string) {
  return customFetch('/api/auth/request-code', {
    method: 'post',
    body: { email },
  })
}

export async function verifyCode(email: string, code: string) {
  return customFetch<{ user: User }>('/api/auth/verify', {
    method: 'post',
    body: { email, code },
  })
}

export async function logout() {
  return customFetch('/api/auth/logout', { method: 'post' })
}

export async function listApps() {
  return customFetch<AppInfo[]>('/api/apps')
}

export async function listInstalled() {
  return customFetch<AppInfo[]>('/api/apps/installed')
}

export async function installApp(slug: string) {
  return customFetch('/api/apps/install', {
    method: 'post',
    body: { slug, consent: true },
  })
}
