import { Hono } from 'hono'
import { withUserTx } from '@smorg/db'
import { fail, ok, optionalText, send, type UserVar } from './mineral.js'
import { insertAtPosition, placeEventByStartAt } from './ordering.js'
import {
  mapDocument,
  mapEvent,
  syncTimeFields,
  type DocumentRow,
  type EventRow,
} from './types.js'

export function eventsRoutes() {
  const app = new Hono<{ Variables: UserVar }>()

  app.get('/trips/:tripId/events', async (c) => {
    const user = c.get('user')
    const tripId = c.req.param('tripId')
    const data = await withUserTx(user.id, async (client) => {
      const trip = await client.query(`select id from itinerarium.trips where id = $1`, [tripId])
      if (!trip.rows[0]) {
        return null
      }
      const events = await client.query<EventRow>(
        `select * from itinerarium.events where trip_id = $1 order by position asc, id asc`,
        [tripId],
      )
      const docs = await client.query<DocumentRow>(
        `
          select d.* from itinerarium.documents d
          join itinerarium.events e on e.id = d.event_id
          where e.trip_id = $1
          order by d.created_at asc
        `,
        [tripId],
      )
      return {
        events: events.rows.map(mapEvent),
        documents: docs.rows.map(mapDocument),
      }
    })
    if (!data) {
      return send(c, fail('NOT_FOUND', 'Trip not found', { statusCode: 404 }))
    }
    return send(c, ok(data))
  })

  app.post('/trips/:tripId/events', async (c) => {
    const user = c.get('user')
    const tripId = c.req.param('tripId')
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const title = optionalText(body.title)
    if (!title) {
      return send(c, fail('VALIDATION_ERROR', 'title is required', { field: 'title' }))
    }

    const times = syncTimeFields({
      startAt: optionalText(body.startAt),
      endAt: optionalText(body.endAt),
      durationMinutes: body.durationMinutes === undefined || body.durationMinutes === null
        ? null
        : Number(body.durationMinutes),
      preferDuration: body.preferDuration === true,
    })
    if ('error' in times) {
      return send(c, fail('VALIDATION_ERROR', times.error))
    }

    const insertIndex = body.insertAt === undefined ? null : Number(body.insertAt)

    const row = await withUserTx(user.id, async (client) => {
      const trip = await client.query(`select id from itinerarium.trips where id = $1`, [tripId])
      if (!trip.rows[0]) {
        return null
      }
      const maxPos = await client.query<{ m: number | null }>(
        `select max(position) as m from itinerarium.events where trip_id = $1`,
        [tripId],
      )
      const position = (maxPos.rows[0]?.m ?? -1) + 1
      const inserted = await client.query<EventRow>(
        `
          insert into itinerarium.events (
            trip_id, user_id, title, place_name, place_url,
            start_at, end_at, duration_minutes, notes, position
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          returning *
        `,
        [
          tripId,
          user.id,
          title,
          optionalText(body.placeName),
          optionalText(body.placeUrl),
          times.startAt,
          times.endAt,
          times.durationMinutes,
          optionalText(body.notes),
          position,
        ],
      )
      const event = inserted.rows[0]
      if (times.startAt) {
        await placeEventByStartAt(client, tripId, event.id, times.startAt)
      } else if (insertIndex !== null && Number.isFinite(insertIndex)) {
        await insertAtPosition(client, tripId, event.id, insertIndex)
      }
      const refreshed = await client.query<EventRow>(
        `select * from itinerarium.events where id = $1`,
        [event.id],
      )
      return refreshed.rows[0]
    })

    if (!row) {
      return send(c, fail('NOT_FOUND', 'Trip not found', { statusCode: 404 }))
    }
    return send(c, ok(mapEvent(row)))
  })

  app.patch('/events/:eventId', async (c) => {
    const user = c.get('user')
    const eventId = c.req.param('eventId')
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>

    const result = await withUserTx(user.id, async (client) => {
      const existing = await client.query<EventRow>(
        `select * from itinerarium.events where id = $1`,
        [eventId],
      )
      const current = existing.rows[0]
      if (!current) {
        return { kind: 'missing' as const }
      }

      const nextStart = body.startAt !== undefined
        ? optionalText(body.startAt)
        : (current.start_at ? current.start_at.toISOString() : null)
      const nextEnd = body.endAt !== undefined
        ? optionalText(body.endAt)
        : (current.end_at ? current.end_at.toISOString() : null)
      const nextDuration = body.durationMinutes !== undefined
        ? (body.durationMinutes === null ? null : Number(body.durationMinutes))
        : current.duration_minutes

      const times = syncTimeFields({
        startAt: nextStart,
        endAt: nextEnd,
        durationMinutes: nextDuration,
        preferDuration: body.preferDuration === true,
      })
      if ('error' in times) {
        return { kind: 'invalid' as const, message: times.error }
      }

      const updated = await client.query<EventRow>(
        `
          update itinerarium.events set
            title = case when $2::boolean then $3 else title end,
            place_name = case when $4::boolean then $5 else place_name end,
            place_url = case when $6::boolean then $7 else place_url end,
            start_at = $8,
            end_at = $9,
            duration_minutes = $10,
            notes = case when $11::boolean then $12 else notes end,
            updated_at = now()
          where id = $1
          returning *
        `,
        [
          eventId,
          body.title !== undefined,
          optionalText(body.title) ?? current.title,
          body.placeName !== undefined,
          optionalText(body.placeName),
          body.placeUrl !== undefined,
          optionalText(body.placeUrl),
          times.startAt,
          times.endAt,
          times.durationMinutes,
          body.notes !== undefined,
          optionalText(body.notes),
        ],
      )
      const row = updated.rows[0]
      const startChanged = (current.start_at?.toISOString() ?? null)
        !== (times.startAt?.toISOString() ?? null)
      if (startChanged) {
        await placeEventByStartAt(client, row.trip_id, row.id, times.startAt)
        const refreshed = await client.query<EventRow>(
          `select * from itinerarium.events where id = $1`,
          [eventId],
        )
        return { kind: 'ok' as const, row: refreshed.rows[0] }
      }
      return { kind: 'ok' as const, row }
    })

    if (result.kind === 'missing') {
      return send(c, fail('NOT_FOUND', 'Event not found', { statusCode: 404 }))
    }
    if (result.kind === 'invalid') {
      return send(c, fail('VALIDATION_ERROR', result.message))
    }
    return send(c, ok(mapEvent(result.row)))
  })

  app.delete('/events/:eventId', async (c) => {
    const user = c.get('user')
    const eventId = c.req.param('eventId')
    const deleted = await withUserTx(user.id, async (client) => {
      const existing = await client.query<EventRow>(
        `select * from itinerarium.events where id = $1`,
        [eventId],
      )
      const row = existing.rows[0]
      if (!row) {
        return false
      }
      await client.query(`delete from itinerarium.events where id = $1`, [eventId])
      const remaining = await client.query<{ id: string }>(
        `select id from itinerarium.events where trip_id = $1 order by position asc, id asc`,
        [row.trip_id],
      )
      for (let i = 0; i < remaining.rows.length; i += 1) {
        await client.query(
          `update itinerarium.events set position = $1 where id = $2`,
          [i, remaining.rows[i].id],
        )
      }
      return true
    })
    if (!deleted) {
      return send(c, fail('NOT_FOUND', 'Event not found', { statusCode: 404 }))
    }
    return send(c, ok())
  })

  return app
}
