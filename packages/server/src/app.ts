import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCoreRouter } from '@smorg/core/server'
import { createItinerariumRouter, publicTripRoutes } from '@smorg/itinerarium/server'
import type { AppConfig } from './config.js'
import { createMailer } from './mailer.js'
import { csrfOrigin } from './middleware/csrf.js'
import { requireAuth } from './middleware/auth.js'
import { requireInstalled } from './middleware/install_guard.js'
import { authRoutes, meRoute } from './auth/routes.js'
import { appsRoutes } from './apps/routes.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const shellDist = path.join(rootDir, 'packages/shell/dist')

export function createApp(config: AppConfig) {
  const mailer = createMailer(config)
  const app = new Hono()

  app.use('/api/*', csrfOrigin(config.appOrigin, config.nodeEnv))

  app.route('/api/auth', authRoutes({
    secret: config.sessionHmacSecret,
    mailer,
    cookieSecure: config.cookieSecure,
  }))
  app.route('/api/me', meRoute(config.sessionHmacSecret))
  app.route('/api/apps', appsRoutes(config.sessionHmacSecret))

  const core = new Hono()
  core.use('*', requireAuth(config.sessionHmacSecret))
  core.use('*', requireInstalled('core'))
  core.route('/', createCoreRouter())
  app.route('/api/apps/core', core)

  const itinerarium = new Hono()
  itinerarium.use('*', requireAuth(config.sessionHmacSecret))
  itinerarium.use('*', requireInstalled('itinerarium'))
  itinerarium.route('/', createItinerariumRouter({
    sessionHmacSecret: config.sessionHmacSecret,
    appOrigin: config.appOrigin,
  }))
  app.route('/api/apps/itinerarium', itinerarium)

  app.route('/api/public/itinerarium', publicTripRoutes())

  app.get('/api/health', (c) => c.json({ ok: true, data: { status: 'up' } }))

  if (config.nodeEnv === 'production') {
    app.use('/*', serveStatic({ root: shellDist }))
    app.get('*', serveStatic({ path: path.join(shellDist, 'index.html') }))
  }

  return app
}
