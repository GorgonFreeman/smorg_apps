import { Hono } from 'hono'
import { peopleRoutes } from './people.js'

export function createCoreRouter() {
  const app = new Hono()
  app.route('/people', peopleRoutes())
  return app
}
