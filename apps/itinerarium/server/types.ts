export type TripRow = {
  id: string
  user_id: string
  name: string
  start_date: string | null
  end_date: string | null
  timezone: string
  created_at: Date
  updated_at: Date
  event_count?: string | number
}

export type EventRow = {
  id: string
  trip_id: string
  user_id: string
  title: string
  place_name: string | null
  place_url: string | null
  start_at: Date | null
  end_at: Date | null
  duration_minutes: number | null
  notes: string | null
  position: number
  created_at: Date
  updated_at: Date
}

export type DocumentRow = {
  id: string
  event_id: string
  user_id: string
  file_name: string
  mime_type: string
  byte_size: number
  storage: 'local' | 'drive'
  local_key: string | null
  drive_file_id: string | null
  drive_web_view_link: string | null
  created_at: Date
}

export type Trip = {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  timezone: string
  eventCount?: number
  createdAt: string
  updatedAt: string
}

export type TripEvent = {
  id: string
  tripId: string
  title: string
  placeName: string | null
  placeUrl: string | null
  startAt: string | null
  endAt: string | null
  durationMinutes: number | null
  notes: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export type DocMeta = {
  id: string
  eventId: string
  fileName: string
  mimeType: string
  byteSize: number
  storage: 'local' | 'drive'
  localKey: string | null
  driveFileId: string | null
  driveWebViewLink: string | null
  createdAt: string
}

function dateOnly(value: string | Date | null): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'string') {
    return value.slice(0, 10)
  }
  // pg returns DATE as UTC midnight
  const y = value.getUTCFullYear()
  const m = String(value.getUTCMonth() + 1).padStart(2, '0')
  const d = String(value.getUTCDate()).padStart(2, '0')
  return `${ y }-${ m }-${ d }`
}

export function mapTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    timezone: row.timezone,
    eventCount: row.event_count === undefined ? undefined : Number(row.event_count),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export function mapEvent(row: EventRow): TripEvent {
  return {
    id: row.id,
    tripId: row.trip_id,
    title: row.title,
    placeName: row.place_name,
    placeUrl: row.place_url,
    startAt: row.start_at ? new Date(row.start_at).toISOString() : null,
    endAt: row.end_at ? new Date(row.end_at).toISOString() : null,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    position: row.position,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export function mapDocument(row: DocumentRow): DocMeta {
  return {
    id: row.id,
    eventId: row.event_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    storage: row.storage,
    localKey: row.local_key,
    driveFileId: row.drive_file_id,
    driveWebViewLink: row.drive_web_view_link,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export function syncTimeFields(input: {
  startAt: string | null
  endAt: string | null
  durationMinutes: number | null
  preferDuration?: boolean
}): { startAt: Date | null, endAt: Date | null, durationMinutes: number | null } | { error: string } {
  const startAt = input.startAt ? new Date(input.startAt) : null
  if (input.startAt && Number.isNaN(startAt!.getTime())) {
    return { error: 'Invalid startAt' }
  }

  if (!startAt) {
    return { startAt: null, endAt: null, durationMinutes: null }
  }

  let endAt = input.endAt ? new Date(input.endAt) : null
  if (input.endAt && Number.isNaN(endAt!.getTime())) {
    return { error: 'Invalid endAt' }
  }

  let durationMinutes = input.durationMinutes

  if (input.preferDuration && durationMinutes != null) {
    if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
      return { error: 'durationMinutes must be a non-negative number' }
    }
    endAt = new Date(startAt.getTime() + durationMinutes * 60_000)
  } else if (endAt) {
    if (endAt.getTime() < startAt.getTime()) {
      return { error: 'endAt must be on or after startAt' }
    }
    durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000)
  } else if (durationMinutes != null) {
    if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
      return { error: 'durationMinutes must be a non-negative number' }
    }
    endAt = new Date(startAt.getTime() + durationMinutes * 60_000)
  }

  return { startAt, endAt, durationMinutes }
}
