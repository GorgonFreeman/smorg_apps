import type { TxClient } from '@smorg/db'
import { hashToken, newSessionToken } from '../crypto_util.js'

export const SESSION_COOKIE = 'smorg_session'
export const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000
export const SESSION_SLIDE_THROTTLE_MS = 60 * 60 * 1000

export type SessionUser = {
  id: string
  email: string
}

export async function createSession(
  client: TxClient,
  userId: string,
  secret: string,
): Promise<{ token: string, expiresAt: Date }> {
  const token = newSessionToken()
  const tokenHash = hashToken(token, secret)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await client.query(
    `
      insert into platform.sessions (token_hash, user_id, expires_at)
      values ($1, $2, $3)
    `,
    [tokenHash, userId, expiresAt.toISOString()],
  )
  return { token, expiresAt }
}

export async function deleteSession(
  client: TxClient,
  token: string,
  secret: string,
): Promise<void> {
  await client.query(
    `delete from platform.sessions where token_hash = $1`,
    [hashToken(token, secret)],
  )
}

export async function resolveSession(
  client: TxClient,
  token: string,
  secret: string,
): Promise<SessionUser | null> {
  const tokenHash = hashToken(token, secret)
  const result = await client.query<{
    user_id: string
    email: string
    expires_at: Date
    last_seen_at: Date
  }>(
    `
      select s.user_id, u.email, s.expires_at, s.last_seen_at
      from platform.sessions s
      join platform.users u on u.id = s.user_id
      where s.token_hash = $1
    `,
    [tokenHash],
  )
  const row = result.rows[0]
  if (!row) {
    return null
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await client.query(`delete from platform.sessions where token_hash = $1`, [tokenHash])
    return null
  }

  const lastSeen = new Date(row.last_seen_at).getTime()
  if (Date.now() - lastSeen >= SESSION_SLIDE_THROTTLE_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    await client.query(
      `
        update platform.sessions
        set last_seen_at = now(), expires_at = $2
        where token_hash = $1
      `,
      [tokenHash, expiresAt.toISOString()],
    )
  }

  return { id: row.user_id, email: row.email }
}
