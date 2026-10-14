import type { Context } from 'hono'
import type { MineralResponse } from '@smorg/ui'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Mineral's statusCodeFromResult: ok:false → error.statusCode ?? 400, else 200. */
const { statusCodeFromResult } = require('@foxtware/mineral/server.utils.js') as {
  statusCodeFromResult: (result: MineralResponse) => number
}

/** Mineral's customFetch for any server-side outbound HTTP. */
export const { customFetch } = require('@foxtware/mineral/api/utils.js') as {
  customFetch: (
    url: string,
    options?: Record<string, unknown>,
  ) => Promise<MineralResponse>
}

export { statusCodeFromResult }

export function ok<T>(data?: T, meta?: Record<string, unknown>): MineralResponse<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data }
}

export function fail(
  code: string,
  message: string,
  options: { field?: string, details?: unknown, statusCode?: number } = {},
): MineralResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      field: options.field,
      details: options.details,
      statusCode: options.statusCode,
    },
  }
}

export function sendMineral(c: Context, result: MineralResponse) {
  const status = result.error?.code === 'UNAUTHORIZED'
    ? 401
    : result.error?.code === 'NOT_FOUND'
      ? 404
      : statusCodeFromResult(result)
  return c.json(result, status as 200)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
