import { Hono } from 'hono'
import { withUserTx } from '@smorg/db'
import { fail, ok, optionalText, send, type UserVar } from './mineral.js'
import { mapTrip, type TripRow } from './types.js'

export function tripsRoutes() {
  const app = new Hono<{ Variables: UserVar }>()

  app.get('/trips', async (c) => {
    const user = c.get('user')
    const rows = await withUserTx(user.id, async (client) => {
      const result = await client.query<TripRow>(
        `
          select t.*,
            (select count(*)::int from itinerarium.events e where e.trip_id = t.id) as event_count
          from itinerarium.trips t
          order by coalesce(t.start_date, t.created_at::date) desc, t.created_at desc
        `,
      )
      return result.rows
    })
    return send(c, ok(rows.map(mapTrip)))
  })

  app.post('/trips', async (c) => {
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const name = optionalText(body.name)
    if (!name) {
      return send(c, fail('VALIDATION_ERROR', 'name is required', { field: 'name' }))
    }
    const timezone = optionalText(body.timezone) ?? 'UTC'
    const startDate = optionalText(body.startDate)
    const endDate = optionalText(body.endDate)

    const row = await withUserTx(user.id, async (client) => {
      const result = await client.query<TripRow>(
        `
          insert into itinerarium.trips (user_id, name, start_date, end_date, timezone)
          values ($1, $2, $3::date, $4::date, $5)
          returning *, 0 as event_count
        `,
        [user.id, name, startDate, endDate, timezone],
      )
      return result.rows[0]
    })
    return send(c, ok(mapTrip(row)))
  })

  app.get('/trips/:tripId', async (c) => {
    const user = c.get('user')
    const tripId = c.req.param('tripId')
    const row = await withUserTx(user.id, async (client) => {
      const result = await client.query<TripRow>(
        `
          select t.*,
            (select count(*)::int from itinerarium.events e where e.trip_id = t.id) as event_count
          from itinerarium.trips t
          where t.id = $1
        `,
        [tripId],
      )
      return result.rows[0] ?? null
    })
    if (!row) {
      return send(c, fail('NOT_FOUND', 'Trip not found', { statusCode: 404 }))
    }
    return send(c, ok(mapTrip(row)))
  })

  app.patch('/trips/:tripId', async (c) => {
    const user = c.get('user')
    const tripId = c.req.param('tripId')
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>

    const row = await withUserTx(user.id, async (client) => {
      const existing = await client.query<TripRow>(
        `select * from itinerarium.trips where id = $1`,
        [tripId],
      )
      if (!existing.rows[0]) {
        return null
      }
      const result = await client.query<TripRow>(
        `
          update itinerarium.trips set
            name = case when $2::boolean then $3 else name end,
            start_date = case when $4::boolean then $5::date else start_date end,
            end_date = case when $6::boolean then $7::date else end_date end,
            timezone = case when $8::boolean then $9 else timezone end,
            updated_at = now()
          where id = $1
          returning *,
            (select count(*)::int from itinerarium.events e where e.trip_id = $1) as event_count
        `,
        [
          tripId,
          body.name !== undefined,
          optionalText(body.name),
          body.startDate !== undefined,
          optionalText(body.startDate),
          body.endDate !== undefined,
          optionalText(body.endDate),
          body.timezone !== undefined,
          optionalText(body.timezone) ?? 'UTC',
        ],
      )
      return result.rows[0]
    })
    if (!row) {
      return send(c, fail('NOT_FOUND', 'Trip not found', { statusCode: 404 }))
    }
    return send(c, ok(mapTrip(row)))
  })

  app.delete('/trips/:tripId', async (c) => {
    const user = c.get('user')
    const tripId = c.req.param('tripId')
    const deleted = await withUserTx(user.id, async (client) => {
      const result = await client.query(
        `delete from itinerarium.trips where id = $1 returning id`,
        [tripId],
      )
      return (result.rowCount ?? 0) > 0
    })
    if (!deleted) {
      return send(c, fail('NOT_FOUND', 'Trip not found', { statusCode: 404 }))
    }
    return send(c, ok())
  })

  return app
}
