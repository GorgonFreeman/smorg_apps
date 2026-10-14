import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { getPool } from '@smorg/db'
import { fail, sendMineral } from '../mineral.js'
import {
  SESSION_COOKIE,
  resolveSession,
  type SessionUser,
} from '../auth/session.js'

export type AuthVariables = {
  user: SessionUser
}

export function requireAuth(secret: string) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) {
      return sendMineral(c, fail('UNAUTHORIZED', 'Sign in required', { statusCode: 401 }))
    }

    const pool = getPool()
    const client = await pool.connect()
    try {
      const user = await resolveSession(client, token, secret)
      if (!user) {
        return sendMineral(c, fail('UNAUTHORIZED', 'Sign in required', { statusCode: 401 }))
      }
      c.set('user', user)
    } finally {
      client.release()
    }

    await next()
  })
}
