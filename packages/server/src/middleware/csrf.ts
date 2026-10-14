import { createMiddleware } from 'hono/factory'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

export function csrfOrigin(appOrigin: string) {
  return createMiddleware(async (c, next) => {
    if (SAFE.has(c.req.method)) {
      await next()
      return
    }
    const origin = c.req.header('origin')
    if (origin && origin !== appOrigin) {
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
