import { Hono } from 'hono'
import { withTx } from '@smorg/db'
import { fail, ok, sendMineral } from '../mineral.js'
import { requireAuth, type AuthVariables } from '../middleware/auth.js'
import { getManifest } from './registry.js'
import { installApp } from './install.js'

export function appsRoutes(secret: string) {
  const app = new Hono<{ Variables: AuthVariables }>()

  app.get('/', requireAuth(secret), async (c) => {
    const result = await withTx(async (client) => {
      const rows = await client.query<{
        slug: string
        name: string
        color: string | null
        version: string
        uses: string[] | null
      }>(`select slug, name, color, version from platform.apps order by name`)
      return rows.rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        color: row.color ?? '#9CA3AF',
        version: row.version,
        uses: getManifest(row.slug)?.uses ?? [],
      }))
    })
    return sendMineral(c, ok(result, { total: result.length }))
  })

  app.get('/installed', requireAuth(secret), async (c) => {
    const user = c.get('user')
    const result = await withTx(async (client) => {
      const rows = await client.query<{
        slug: string
        name: string
        color: string | null
        version: string
      }>(
        `
          select a.slug, a.name, a.color, a.version
          from platform.installations i
          join platform.apps a on a.slug = i.app_slug
          where i.user_id = $1
          order by a.name
        `,
        [user.id],
      )
      return rows.rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        color: row.color ?? '#9CA3AF',
        version: row.version,
        uses: getManifest(row.slug)?.uses ?? [],
      }))
    })
    return sendMineral(c, ok(result, { total: result.length }))
  })

  app.post('/install', requireAuth(secret), async (c) => {
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as {
      slug?: string
      consent?: boolean
    }
    if (!body.slug) {
      return sendMineral(c, fail('VALIDATION_ERROR', 'slug is required', { field: 'slug' }))
    }
    if (body.consent !== true) {
      return sendMineral(c, fail('VALIDATION_ERROR', 'consent is required', { field: 'consent' }))
    }
    if (!getManifest(body.slug)) {
      return sendMineral(c, fail('NOT_FOUND', 'App not found', { statusCode: 404 }))
    }

    const result = await withTx(async (client) => {
      return installApp(client, user.id, body.slug!)
    })
    if (!result.installed) {
      return sendMineral(c, fail('NOT_FOUND', 'App not found', { statusCode: 404 }))
    }
    return sendMineral(c, ok({ slug: body.slug }))
  })

  return app
}
