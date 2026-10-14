import { createMiddleware } from 'hono/factory'
import { getPool } from '@smorg/db'
import { fail, sendMineral } from '../mineral.js'
import { isInstalled } from '../apps/install.js'
import type { AuthVariables } from './auth.js'

export function requireInstalled(slug: string) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const user = c.get('user')
    const pool = getPool()
    const client = await pool.connect()
    try {
      const installed = await isInstalled(client, user.id, slug)
      if (!installed) {
        return sendMineral(
          c,
          fail('NOT_INSTALLED', 'Install this app first', { statusCode: 403 }),
        )
      }
    } finally {
      client.release()
    }
    await next()
  })
}
