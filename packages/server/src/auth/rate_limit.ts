import type { TxClient } from '@smorg/db'

const WINDOW_MS = 60_000

export async function hitRateLimit(
  client: TxClient,
  key: string,
  limit: number,
): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS)
  await client.query(
    `
      insert into platform.rate_limits (key, window_start, count)
      values ($1, $2, 1)
      on conflict (key, window_start)
      do update set count = platform.rate_limits.count + 1
    `,
    [key, windowStart.toISOString()],
  )
  const result = await client.query<{ count: number }>(
    `select count from platform.rate_limits where key = $1 and window_start = $2`,
    [key, windowStart.toISOString()],
  )
  return (result.rows[0]?.count ?? 0) > limit
}
