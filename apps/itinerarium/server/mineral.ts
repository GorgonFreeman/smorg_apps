export type MineralResponse<T = unknown> = {
  ok: boolean
  data?: T
  error?: { code: string, message: string, field?: string, statusCode?: number }
  meta?: Record<string, unknown>
}

export function ok<T>(data?: T, meta?: Record<string, unknown>): MineralResponse<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data }
}

export function fail(
  code: string,
  message: string,
  options: { field?: string, statusCode?: number } = {},
): MineralResponse {
  return {
    ok: false,
    error: { code, message, field: options.field, statusCode: options.statusCode },
  }
}

export function send(
  c: { json: (body: unknown, status?: number) => Response },
  result: MineralResponse,
) {
  const status = result.error?.statusCode ?? (result.ok ? 200 : 400)
  return c.json(result, status)
}

export type UserVar = { user: { id: string, email: string } }

export function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }
  return String(value).trim() || null
}
