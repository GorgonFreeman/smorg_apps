import type { MineralResponse } from './mineral_types.js'

export type SmorgFetchOptions = {
  method?: string
  headers?: Record<string, string>
  params?: Record<string, string | number | undefined | null>
  body?: unknown
}

function withParams(url: string, params?: SmorgFetchOptions['params']): string {
  if (!params) {
    return url
  }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }
    search.append(key, String(value))
  }
  const qs = search.toString()
  if (!qs) {
    return url
  }
  return url + (url.includes('?') ? '&' : '?') + qs
}

/**
 * Browser/session-aware mineral customFetch.
 * Uses the same call shape as @foxtware/mineral customFetch, adds credentials,
 * and returns the Smorg mineral envelope from the JSON body (no double-wrap).
 */
export async function customFetch<T = unknown>(
  url: string,
  {
    method = 'get',
    headers = {},
    params,
    body,
  }: SmorgFetchOptions = {},
): Promise<MineralResponse<T>> {
  const requestHeaders: Record<string, string> = { ...headers }
  if (!requestHeaders['x-request-id']) {
    requestHeaders['x-request-id'] = String(Date.now())
  }

  let requestBody: BodyInit | undefined
  if (body !== undefined && body !== null) {
    if (!requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json'
    }
    requestBody = typeof body === 'string' ? body : JSON.stringify(body)
  }

  try {
    const response = await fetch(withParams(url, params), {
      method,
      headers: requestHeaders,
      body: requestBody,
      credentials: 'include',
    })

    const parsed = await response.json().catch(() => null)

    if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
      return parsed as MineralResponse<T>
    }

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: 'HTTP_ERROR',
          message: `Request failed with status ${ response.status }`,
          details: parsed,
          statusCode: response.status,
        },
      }
    }

    return { ok: true, data: parsed as T }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
        details: error,
      },
    }
  }
}

export { customFetch as smorgFetch }
