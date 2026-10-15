import { Hono } from 'hono'
import { documentsRoutes } from './documents.js'
import { eventsRoutes } from './events.js'
import { settingsRoutes } from './settings.js'
import { shareRoutes } from './share.js'
import { tripsRoutes } from './trips.js'
import type { UserVar } from './mineral.js'

export type ItinerariumServerOptions = {
  sessionHmacSecret: string
  appOrigin: string
}

export function createItinerariumRouter(options: ItinerariumServerOptions) {
  const app = new Hono<{ Variables: UserVar }>()
  // Hono copies child routes onto the parent; register specific paths before /trips/:id.
  app.route('/', eventsRoutes())
  app.route('/', documentsRoutes(options.sessionHmacSecret))
  app.route('/', shareRoutes(options.appOrigin))
  app.route('/', settingsRoutes(options.sessionHmacSecret))
  app.route('/', tripsRoutes())
  return app
}

export { publicTripRoutes } from './public_trip.js'
