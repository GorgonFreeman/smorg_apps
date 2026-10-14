import { Hono } from 'hono'
import { withUserTx } from '@smorg/db'

type UserVar = { user: { id: string, email: string } }

type MineralResponse<T = unknown> = {
  ok: boolean
  data?: T
  error?: { code: string, message: string, field?: string, statusCode?: number }
  meta?: Record<string, unknown>
}

function ok<T>(data?: T, meta?: Record<string, unknown>): MineralResponse<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data }
}

function fail(
  code: string,
  message: string,
  options: { field?: string, statusCode?: number } = {},
): MineralResponse {
  return {
    ok: false,
    error: { code, message, field: options.field, statusCode: options.statusCode },
  }
}

function send(c: { json: (body: unknown, status?: number) => Response }, result: MineralResponse) {
  const status = result.error?.statusCode ?? (result.ok ? 200 : 400)
  return c.json(result, status)
}

export type Person = {
  id: string
  handle: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type PersonRow = {
  id: string
  handle: string
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  created_at: Date
  updated_at: Date
}

const HANDLE_RE = /^[a-z0-9._-]+$/

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    handle: row.handle,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function normalizeHandle(handle: unknown): MineralResponse<string> {
  if (typeof handle !== 'string' || !handle.trim()) {
    return fail('VALIDATION_ERROR', 'handle is required', { field: 'handle' })
  }
  const value = handle.trim().toLowerCase()
  if (!HANDLE_RE.test(value)) {
    return fail(
      'VALIDATION_ERROR',
      'handle must be lowercase letters, digits, ., _, or -',
      { field: 'handle' },
    )
  }
  return ok(value)
}

function normalizeOptionalEmail(email: unknown): MineralResponse<string | null> {
  if (email === undefined || email === null || email === '') {
    return ok(null)
  }
  if (typeof email !== 'string') {
    return fail('VALIDATION_ERROR', 'email must be a string', { field: 'email' })
  }
  const value = email.trim().toLowerCase()
  if (!value.includes('@')) {
    return fail('VALIDATION_ERROR', 'Enter a valid email', { field: 'email' })
  }
  return ok(value)
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }
  return String(value)
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code: string }).code === '23505'
}

export function peopleRoutes() {
  const app = new Hono<{ Variables: UserVar }>()

  app.get('/', async (c) => {
    const user = c.get('user')
    const q = (c.req.query('q') ?? '').trim()

    const rows = await withUserTx(user.id, async (client) => {
      if (!q) {
        const result = await client.query<PersonRow>(
          `select * from core.people order by handle asc`,
        )
        return result.rows
      }

      const like = `%${ q.replace(/[%_]/g, '\\$&') }%`
      const result = await client.query<PersonRow>(
        `
          select *
          from core.people
          where
            handle ilike $1 escape '\\'
            or coalesce(first_name, '') ilike $1 escape '\\'
            or coalesce(middle_name, '') ilike $1 escape '\\'
            or coalesce(last_name, '') ilike $1 escape '\\'
            or coalesce(email, '') ilike $1 escape '\\'
            or coalesce(phone, '') ilike $1 escape '\\'
            or coalesce(notes, '') ilike $1 escape '\\'
            or (
              coalesce(handle, '') || ' ' ||
              coalesce(first_name, '') || ' ' ||
              coalesce(middle_name, '') || ' ' ||
              coalesce(last_name, '') || ' ' ||
              coalesce(email, '') || ' ' ||
              coalesce(phone, '') || ' ' ||
              coalesce(notes, '')
            ) % $2
          order by
            similarity(
              coalesce(handle, '') || ' ' ||
              coalesce(first_name, '') || ' ' ||
              coalesce(last_name, ''),
              $2
            ) desc,
            handle asc
        `,
        [like, q],
      )
      return result.rows
    })

    const data = rows.map(mapPerson)
    return send(c, ok(data, { total: data.length }))
  })

  app.get('/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const row = await withUserTx(user.id, async (client) => {
      const result = await client.query<PersonRow>(
        `select * from core.people where id = $1`,
        [id],
      )
      return result.rows[0] ?? null
    })
    if (!row) {
      return send(c, fail('NOT_FOUND', 'Person not found', { statusCode: 404 }))
    }
    return send(c, ok(mapPerson(row)))
  })

  app.post('/', async (c) => {
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const handleResult = normalizeHandle(body.handle)
    if (!handleResult.ok || !handleResult.data) {
      return send(c, handleResult)
    }
    const emailResult = normalizeOptionalEmail(body.email)
    if (!emailResult.ok) {
      return send(c, emailResult)
    }

    try {
      const row = await withUserTx(user.id, async (client) => {
        const result = await client.query<PersonRow>(
          `
            insert into core.people (
              user_id, handle, first_name, middle_name, last_name, email, phone, notes
            ) values ($1, $2, $3, $4, $5, $6, $7, $8)
            returning *
          `,
          [
            user.id,
            handleResult.data,
            optionalText(body.firstName),
            optionalText(body.middleName),
            optionalText(body.lastName),
            emailResult.data,
            optionalText(body.phone),
            optionalText(body.notes),
          ],
        )
        return result.rows[0]
      })
      return send(c, ok(mapPerson(row)))
    } catch (error) {
      if (isUniqueViolation(error)) {
        return send(c, fail('HANDLE_TAKEN', 'That handle is already taken', { field: 'handle' }))
      }
      throw error
    }
  })

  app.patch('/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>

    let handle: string | undefined
    if (body.handle !== undefined) {
      const handleResult = normalizeHandle(body.handle)
      if (!handleResult.ok || !handleResult.data) {
        return send(c, handleResult)
      }
      handle = handleResult.data
    }

    let email: string | null | undefined
    if (body.email !== undefined) {
      const emailResult = normalizeOptionalEmail(body.email)
      if (!emailResult.ok) {
        return send(c, emailResult)
      }
      email = emailResult.data
    }

    try {
      const row = await withUserTx(user.id, async (client) => {
        const existing = await client.query<PersonRow>(
          `select * from core.people where id = $1`,
          [id],
        )
        if (!existing.rows[0]) {
          return null
        }

        const result = await client.query<PersonRow>(
          `
            update core.people set
              handle = coalesce($2, handle),
              first_name = case when $3::boolean then $4 else first_name end,
              middle_name = case when $5::boolean then $6 else middle_name end,
              last_name = case when $7::boolean then $8 else last_name end,
              email = case when $9::boolean then $10 else email end,
              phone = case when $11::boolean then $12 else phone end,
              notes = case when $13::boolean then $14 else notes end,
              updated_at = now()
            where id = $1
            returning *
          `,
          [
            id,
            handle ?? null,
            body.firstName !== undefined,
            optionalText(body.firstName),
            body.middleName !== undefined,
            optionalText(body.middleName),
            body.lastName !== undefined,
            optionalText(body.lastName),
            body.email !== undefined,
            email ?? null,
            body.phone !== undefined,
            optionalText(body.phone),
            body.notes !== undefined,
            optionalText(body.notes),
          ],
        )
        return result.rows[0]
      })

      if (!row) {
        return send(c, fail('NOT_FOUND', 'Person not found', { statusCode: 404 }))
      }
      return send(c, ok(mapPerson(row)))
    } catch (error) {
      if (isUniqueViolation(error)) {
        return send(c, fail('HANDLE_TAKEN', 'That handle is already taken', { field: 'handle' }))
      }
      throw error
    }
  })

  app.delete('/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const deleted = await withUserTx(user.id, async (client) => {
      const result = await client.query(
        `delete from core.people where id = $1 returning id`,
        [id],
      )
      return (result.rowCount ?? 0) > 0
    })
    if (!deleted) {
      return send(c, fail('NOT_FOUND', 'Person not found', { statusCode: 404 }))
    }
    return send(c, ok())
  })

  return app
}
