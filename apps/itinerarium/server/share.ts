import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { withUserTx } from '@smorg/db'
import { fail, ok, send, type UserVar } from './mineral.js'

type ShareRow = {
  id: string
  trip_id: string
  token: string
  created_at: Date
  revoked_at: Date | null
}

function mapShare(row: ShareRow, appOrigin: string) {
  return {
    id: row.id,
    tripId: row.trip_id,
    token: row.token,
    url: `${ appOrigin }/p/itinerarium/${ row.token }`,
    createdAt: new Date(row.created_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  }
}

export function shareRoutes(appOrigin: string) {
  const app = new Hono<{ Variables: UserVar }>()

  app.get('/trips/:tripId/share', async (c) => {
    const user = c.get('user')
    const tripId = c.req.param('tripId')
    const row = await withUserTx(user.id, async (client) => {
      const trip = await client.query(`select id from itinerarium.trips where id = $1`, [tripId])
      if (!trip.rows[0]) {
        return { kind: 'missing' as const }
      }
      const result = await client.query<ShareRow>(
        `
          select * from itinerarium.share_links
          where trip_id = $1 and revoked_at is null
          order by created_at desc
          limit 1
        `,
        [tripId],
      )
      return { kind: 'ok' as const, row: result.rows[0] ?? null }
    })
    if (row.kind === 'missing') {
      return send(c, fail('NOT_FOUND', 'Trip not found', { statusCode: 404 }))
    }
    return send(c, ok(row.row ? mapShare(row.row, appOrigin) : null))
  })

  app.post('/trips/:tripId/share', async (c) => {
    const user = c.get('user')
    const tripId = c.req.param('tripId')
    const row = await withUserTx(user.id, async (client) => {
      const trip = await client.query(`select id from itinerarium.trips where id = $1`, [tripId])
      if (!trip.rows[0]) {
        return null
      }
      await client.query(
        `
          update itinerarium.share_links
          set revoked_at = now()
          where trip_id = $1 and revoked_at is null
        `,
        [tripId],
      )
      const token = randomBytes(24).toString('base64url')
      const inserted = await client.query<ShareRow>(
        `
          insert into itinerarium.share_links (trip_id, user_id, token)
          values ($1, $2, $3)
          returning *
        `,
        [tripId, user.id, token],
      )
      return inserted.rows[0]
    })
    if (!row) {
      return send(c, fail('NOT_FOUND', 'Trip not found', { statusCode: 404 }))
    }
    return send(c, ok(mapShare(row, appOrigin)))
  })

  app.delete('/trips/:tripId/share', async (c) => {
    const user = c.get('user')
    const tripId = c.req.param('tripId')
    const revoked = await withUserTx(user.id, async (client) => {
      const result = await client.query(
        `
          update itinerarium.share_links
          set revoked_at = now()
          where trip_id = $1 and revoked_at is null
          returning id
        `,
        [tripId],
      )
      return (result.rowCount ?? 0) > 0
    })
    if (!revoked) {
      return send(c, fail('NOT_FOUND', 'No active share link', { statusCode: 404 }))
    }
    return send(c, ok())
  })

  return app
}
