export type MineralError = {
  code: string
  message: string
  details?: unknown
  field?: string
  statusCode?: number
}

export type MineralResponse<T = unknown> = {
  ok: boolean
  data?: T
  error?: MineralError
  meta?: Record<string, unknown>
  results?: MineralResponse[]
}
