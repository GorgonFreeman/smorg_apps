import { Hono } from 'hono'
import { withUserTx } from '@smorg/db'
import { decryptString } from './crypto_box.js'
import { parseServiceAccountJson, uploadToDrive } from './drive.js'
import { fail, ok, optionalText, send, type UserVar } from './mineral.js'
import { mapDocument, type DocumentRow } from './types.js'

const MAX_BYTES = 20 * 1024 * 1024
const MAX_DOCS_PER_EVENT = 20

const ALLOWED_PREFIXES = ['image/']
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

function mimeAllowed(mime: string): boolean {
  if (ALLOWED_TYPES.has(mime)) {
    return true
  }
  return ALLOWED_PREFIXES.some((p) => mime.startsWith(p))
}

export function documentsRoutes(secret: string) {
  const app = new Hono<{ Variables: UserVar }>()

  app.post('/events/:eventId/documents', async (c) => {
    const user = c.get('user')
    const eventId = c.req.param('eventId')
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>

    const fileName = optionalText(body.fileName)
    const mimeType = optionalText(body.mimeType)
    const storage = optionalText(body.storage) as 'local' | 'drive' | null
    const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64 : null

    if (!fileName || !mimeType || !storage) {
      return send(c, fail('VALIDATION_ERROR', 'fileName, mimeType, and storage are required'))
    }
    if (storage !== 'local' && storage !== 'drive') {
      return send(c, fail('VALIDATION_ERROR', 'storage must be local or drive'))
    }
    if (!mimeAllowed(mimeType)) {
      return send(c, fail('VALIDATION_ERROR', 'File type not allowed'))
    }

    let bytes: Buffer | null = null
    if (storage === 'drive') {
      if (!contentBase64) {
        return send(c, fail('VALIDATION_ERROR', 'contentBase64 is required for Drive uploads'))
      }
      bytes = Buffer.from(contentBase64, 'base64')
      if (bytes.byteLength > MAX_BYTES) {
        return send(c, fail('VALIDATION_ERROR', 'File exceeds 20 MB limit'))
      }
    } else {
      const byteSize = Number(body.byteSize)
      if (!Number.isFinite(byteSize) || byteSize < 0 || byteSize > MAX_BYTES) {
        return send(c, fail('VALIDATION_ERROR', 'byteSize must be between 0 and 20 MB'))
      }
    }

    try {
      const row = await withUserTx(user.id, async (client) => {
        const event = await client.query<{ id: string }>(
          `select id from itinerarium.events where id = $1`,
          [eventId],
        )
        if (!event.rows[0]) {
          return { kind: 'missing' as const }
        }
        const count = await client.query<{ n: string }>(
          `select count(*)::text as n from itinerarium.documents where event_id = $1`,
          [eventId],
        )
        if (Number(count.rows[0]?.n ?? 0) >= MAX_DOCS_PER_EVENT) {
          return { kind: 'limit' as const }
        }

        let driveFileId: string | null = null
        let driveWebViewLink: string | null = null
        let localKey: string | null = null
        let byteSize = Number(body.byteSize) || 0

        if (storage === 'drive' && bytes) {
          const settings = await client.query<{ drive_service_account_enc: string | null }>(
            `select drive_service_account_enc from itinerarium.settings where user_id = $1`,
            [user.id],
          )
          const enc = settings.rows[0]?.drive_service_account_enc
          if (!enc) {
            return { kind: 'no_drive' as const }
          }
          const sa = parseServiceAccountJson(decryptString(enc, secret))
          const uploaded = await uploadToDrive(sa, {
            fileName,
            mimeType,
            bytes,
          })
          driveFileId = uploaded.driveFileId
          driveWebViewLink = uploaded.driveWebViewLink
          byteSize = bytes.byteLength
        } else {
          localKey = typeof body.localKey === 'string' && body.localKey
            ? body.localKey
            : null
        }

        const inserted = await client.query<DocumentRow>(
          `
            insert into itinerarium.documents (
              event_id, user_id, file_name, mime_type, byte_size,
              storage, local_key, drive_file_id, drive_web_view_link
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            returning *
          `,
          [
            eventId,
            user.id,
            fileName,
            mimeType,
            byteSize,
            storage,
            localKey,
            driveFileId,
            driveWebViewLink,
          ],
        )
        const doc = inserted.rows[0]
        if (storage === 'local' && !doc.local_key) {
          await client.query(
            `update itinerarium.documents set local_key = $1 where id = $2`,
            [doc.id, doc.id],
          )
          doc.local_key = doc.id
        }
        return { kind: 'ok' as const, row: doc }
      })

      if (row.kind === 'missing') {
        return send(c, fail('NOT_FOUND', 'Event not found', { statusCode: 404 }))
      }
      if (row.kind === 'limit') {
        return send(c, fail('VALIDATION_ERROR', 'Maximum 20 documents per event'))
      }
      if (row.kind === 'no_drive') {
        return send(c, fail('VALIDATION_ERROR', 'Configure Google Drive in Settings first'))
      }
      return send(c, ok(mapDocument(row.row)))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      return send(c, fail('DRIVE_ERROR', message, { statusCode: 502 }))
    }
  })

  app.delete('/documents/:documentId', async (c) => {
    const user = c.get('user')
    const documentId = c.req.param('documentId')
    const deleted = await withUserTx(user.id, async (client) => {
      const result = await client.query(
        `delete from itinerarium.documents where id = $1 returning id`,
        [documentId],
      )
      return (result.rowCount ?? 0) > 0
    })
    if (!deleted) {
      return send(c, fail('NOT_FOUND', 'Document not found', { statusCode: 404 }))
    }
    return send(c, ok())
  })

  return app
}
