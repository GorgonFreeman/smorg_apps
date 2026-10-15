import type { TxClient } from '@smorg/db'

export type EventOrderRow = {
  id: string
  start_at: Date | null
  position: number
}

/** Renumber positions 0..n-1 in the given order. */
export async function renumberPositions(
  client: TxClient,
  tripId: string,
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await client.query(
      `update itinerarium.events set position = $1, updated_at = now()
       where id = $2 and trip_id = $3`,
      [i, orderedIds[i], tripId],
    )
  }
}

/**
 * Move event so timed events stay in non-decreasing start_at order.
 * Untimed events keep relative places; only the moved event is relocated.
 */
export async function placeEventByStartAt(
  client: TxClient,
  tripId: string,
  eventId: string,
  startAt: Date | null,
): Promise<void> {
  const result = await client.query<EventOrderRow>(
    `select id, start_at, position from itinerarium.events
     where trip_id = $1 order by position asc, id asc`,
    [tripId],
  )
  const rows = result.rows
  const without = rows.filter((r) => r.id !== eventId)
  const moved = rows.find((r) => r.id === eventId)
  if (!moved) {
    return
  }

  let insertAt = without.length
  if (startAt) {
    insertAt = without.length
    for (let i = 0; i < without.length; i += 1) {
      const otherStart = without[i].start_at
      if (otherStart && otherStart.getTime() > startAt.getTime()) {
        insertAt = i
        break
      }
    }
  } else {
    insertAt = Math.min(moved.position, without.length)
  }

  const ordered = [
    ...without.slice(0, insertAt),
    moved,
    ...without.slice(insertAt),
  ]
  await renumberPositions(client, tripId, ordered.map((r) => r.id))
}

export async function insertAtPosition(
  client: TxClient,
  tripId: string,
  eventId: string,
  index: number,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `select id from itinerarium.events
     where trip_id = $1 and id <> $2
     order by position asc, id asc`,
    [tripId, eventId],
  )
  const ids = result.rows.map((r) => r.id)
  const clamped = Math.max(0, Math.min(index, ids.length))
  ids.splice(clamped, 0, eventId)
  await renumberPositions(client, tripId, ids)
}
