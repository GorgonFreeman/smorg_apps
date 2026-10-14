import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { withTx } from '@smorg/db'
import type { Mailer } from '../mailer.js'
import { ok, sendMineral } from '../mineral.js'
import { createAuthService } from './service.js'
import {
  SESSION_COOKIE,
  deleteSession,
} from './session.js'
import { requireAuth, type AuthVariables } from '../middleware/auth.js'

export function authRoutes(deps: {
  secret: string
  mailer: Mailer
  cookieSecure: boolean
}) {
  const auth = createAuthService(deps)
  const app = new Hono<{ Variables: AuthVariables }>()

  app.post('/request-code', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { email?: string }
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      ?? c.req.header('x-real-ip')
      ?? 'unknown'
    return sendMineral(c, await auth.requestCode(body.email ?? '', ip))
  })

  app.post('/verify', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { email?: string, code?: string }
    const result = await auth.verify(body.email ?? '', body.code ?? '')
    if (!result.ok || !result.data) {
      return sendMineral(c, result)
    }

    setCookie(c, SESSION_COOKIE, result.data.token, {
      httpOnly: true,
      secure: deps.cookieSecure,
      sameSite: 'Lax',
      path: '/',
      expires: result.data.expiresAt,
    })

    return sendMineral(c, ok({ user: result.data.user }))
  })

  app.post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (token) {
      await withTx(async (client) => {
        await deleteSession(client, token, deps.secret)
      })
    }
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return sendMineral(c, ok())
  })

  return app
}

export function meRoute(secret: string) {
  const app = new Hono<{ Variables: AuthVariables }>()
  app.get('/', requireAuth(secret), async (c) => {
    return sendMineral(c, ok(c.get('user')))
  })
  return app
}
