import { serve } from '@hono/node-server'
import { getPool, withTx } from '@smorg/db'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { syncAppsRegistry } from './apps/registry.js'

const config = loadConfig()
getPool(config.databaseUrl)

await withTx(async (client) => {
  await syncAppsRegistry(client)
})

const app = createApp(config)

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`smorg server listening on http://localhost:${ info.port }`)
})
