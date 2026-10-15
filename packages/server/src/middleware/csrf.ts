import { createMiddleware } from 'hono/factory'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    )
  } catch {
    return false
  }
}

export function csrfOrigin(appOrigin: string, nodeEnv: string) {
  return createMiddleware(async (c, next) => {
    if (SAFE.has(c.req.method)) {
      await next()
      return
    }
    const origin = c.req.header('origin')
    if (!origin) {
      await next()
      return
    }
    const allowed = origin === appOrigin
      || (nodeEnv !== 'production' && isLocalDevOrigin(origin))
    if (!allowed) {
      return c.json(
        {
          ok: false,
          error: { code: 'CSRF', message: 'Invalid origin', statusCode: 403 },
        },
        403,
      )
    }
    await next()
  })
}
