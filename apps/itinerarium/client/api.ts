import { customFetch, type MineralResponse } from '@smorg/ui'

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

export type ShareLink = {
  id: string
  tripId: string
  token: string
  url: string
  createdAt: string
  revokedAt: string | null
}

export type DriveSettings = {
  configured: boolean
  clientEmail: string | null
}

const base = '/api/apps/itinerarium'

export function listTrips() {
  return customFetch<Trip[]>(`${ base }/trips`)
}

export function createTrip(body: {
  name: string
  startDate?: string | null
  endDate?: string | null
  timezone?: string
}) {
  return customFetch<Trip>(`${ base }/trips`, { method: 'post', body })
}

export function getTrip(tripId: string) {
  return customFetch<Trip>(`${ base }/trips/${ tripId }`)
}

export function deleteTrip(tripId: string) {
  return customFetch(`${ base }/trips/${ tripId }`, { method: 'delete' })
}

export function listEvents(tripId: string) {
  return customFetch<{ events: TripEvent[], documents: DocMeta[] }>(
    `${ base }/trips/${ tripId }/events`,
  )
}

export function createEvent(tripId: string, body: Record<string, unknown>) {
  return customFetch<TripEvent>(`${ base }/trips/${ tripId }/events`, {
    method: 'post',
    body,
  })
}

export function updateEvent(eventId: string, body: Record<string, unknown>) {
  return customFetch<TripEvent>(`${ base }/events/${ eventId }`, {
    method: 'patch',
    body,
  })
}

export function deleteEvent(eventId: string) {
  return customFetch(`${ base }/events/${ eventId }`, { method: 'delete' })
}

export function addDocument(eventId: string, body: Record<string, unknown>) {
  return customFetch<DocMeta>(`${ base }/events/${ eventId }/documents`, {
    method: 'post',
    body,
  })
}

export function removeDocument(documentId: string) {
  return customFetch(`${ base }/documents/${ documentId }`, { method: 'delete' })
}

export function getShare(tripId: string) {
  return customFetch<ShareLink | null>(`${ base }/trips/${ tripId }/share`)
}

export function createShare(tripId: string) {
  return customFetch<ShareLink>(`${ base }/trips/${ tripId }/share`, { method: 'post' })
}

export function revokeShare(tripId: string) {
  return customFetch(`${ base }/trips/${ tripId }/share`, { method: 'delete' })
}

export function getSettings() {
  return customFetch<DriveSettings>(`${ base }/settings`)
}

export function saveDriveSettings(serviceAccountJson: string) {
  return customFetch<DriveSettings>(`${ base }/settings/drive`, {
    method: 'put',
    body: { serviceAccountJson },
  })
}

export function clearDriveSettings() {
  return customFetch<DriveSettings>(`${ base }/settings/drive`, { method: 'delete' })
}

export function getPublicTrip(token: string): Promise<MineralResponse<{
  trip: Trip
  events: TripEvent[]
  documents: DocMeta[]
}>> {
  return customFetch(`/api/public/itinerarium/${ token }`)
}
