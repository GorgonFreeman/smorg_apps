import { Hono } from 'hono'
import { withUserTx } from '@smorg/db'
import { decryptString, encryptString } from './crypto_box.js'
import { parseServiceAccountJson } from './drive.js'
import { fail, ok, send, type UserVar } from './mineral.js'

export function settingsRoutes(secret: string) {
  const app = new Hono<{ Variables: UserVar }>()

  app.get('/settings', async (c) => {
    const user = c.get('user')
    const data = await withUserTx(user.id, async (client) => {
      const result = await client.query<{ drive_service_account_enc: string | null }>(
        `select drive_service_account_enc from itinerarium.settings where user_id = $1`,
        [user.id],
      )
      const enc = result.rows[0]?.drive_service_account_enc ?? null
      if (!enc) {
        return { configured: false, clientEmail: null as string | null }
      }
      try {
        const sa = parseServiceAccountJson(decryptString(enc, secret))
        return { configured: true, clientEmail: sa.client_email }
      } catch {
        return { configured: true, clientEmail: null as string | null }
      }
    })
    return send(c, ok(data))
  })

  app.put('/settings/drive', async (c) => {
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const json = typeof body.serviceAccountJson === 'string' ? body.serviceAccountJson.trim() : ''
    if (!json) {
      return send(c, fail('VALIDATION_ERROR', 'serviceAccountJson is required'))
    }
    try {
      parseServiceAccountJson(json)
    } catch (error) {
      return send(c, fail(
        'VALIDATION_ERROR',
        error instanceof Error ? error.message : 'Invalid service account JSON',
      ))
    }
    const enc = encryptString(json, secret)
    await withUserTx(user.id, async (client) => {
      await client.query(
        `
          insert into itinerarium.settings (user_id, drive_service_account_enc, updated_at)
          values ($1, $2, now())
          on conflict (user_id) do update set
            drive_service_account_enc = excluded.drive_service_account_enc,
            updated_at = now()
        `,
        [user.id, enc],
      )
    })
    const sa = parseServiceAccountJson(json)
    return send(c, ok({ configured: true, clientEmail: sa.client_email }))
  })

  app.delete('/settings/drive', async (c) => {
    const user = c.get('user')
    await withUserTx(user.id, async (client) => {
      await client.query(
        `
          insert into itinerarium.settings (user_id, drive_service_account_enc, updated_at)
          values ($1, null, now())
          on conflict (user_id) do update set
            drive_service_account_enc = null,
            updated_at = now()
        `,
        [user.id],
      )
    })
    return send(c, ok({ configured: false, clientEmail: null }))
  })

  return app
}
