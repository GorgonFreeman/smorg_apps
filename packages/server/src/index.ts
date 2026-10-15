import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { serve } from '@hono/node-server'
import { getPool, withTx } from '@smorg/db'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { syncAppsRegistry } from './apps/registry.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const envPath = path.join(rootDir, '.env')
if (existsSync(envPath)) {
  loadEnv({ path: envPath })
}

const config = loadConfig()
getPool(config.databaseUrl)

await withTx(async (client) => {
  await syncAppsRegistry(client)
})

const app = createApp(config)

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: '0.0.0.0',
}, (info) => {
  console.log(`smorg server listening on http://0.0.0.0:${ info.port }`)
})
