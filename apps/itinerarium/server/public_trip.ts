import { Hono } from 'hono'
import { getPool } from '@smorg/db'
import { fail, ok, send } from './mineral.js'
import {
  mapDocument,
  mapEvent,
  mapTrip,
  type DocumentRow,
  type EventRow,
  type TripRow,
} from './types.js'

/** Unauthenticated public trip view via share token (sets app.share_token for RLS). */
export function publicTripRoutes() {
  const app = new Hono()

  app.get('/:token', async (c) => {
    const token = c.req.param('token')
    if (!token) {
      return send(c, fail('NOT_FOUND', 'Share link not found', { statusCode: 404 }))
    }

    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(`select set_config('app.share_token', $1, true)`, [token])

      const share = await client.query<{ trip_id: string }>(
        `
          select trip_id from itinerarium.share_links
          where token = $1 and revoked_at is null
        `,
        [token],
      )
      if (!share.rows[0]) {
        await client.query('rollback')
        return send(c, fail('NOT_FOUND', 'Share link not found', { statusCode: 404 }))
      }
      const tripId = share.rows[0].trip_id

      const tripResult = await client.query<TripRow>(
        `select *, null::int as event_count from itinerarium.trips where id = $1`,
        [tripId],
      )
      const trip = tripResult.rows[0]
      if (!trip) {
        await client.query('rollback')
        return send(c, fail('NOT_FOUND', 'Trip not found', { statusCode: 404 }))
      }

      const events = await client.query<EventRow>(
        `select * from itinerarium.events where trip_id = $1 order by position asc, id asc`,
        [tripId],
      )
      const docs = await client.query<DocumentRow>(
        `
          select d.* from itinerarium.documents d
          join itinerarium.events e on e.id = d.event_id
          where e.trip_id = $1 and d.storage = 'drive'
          order by d.created_at asc
        `,
        [tripId],
      )

      await client.query('commit')
      return send(c, ok({
        trip: mapTrip(trip),
        events: events.rows.map(mapEvent),
        documents: docs.rows.map(mapDocument),
      }))
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  })

  return app
}
