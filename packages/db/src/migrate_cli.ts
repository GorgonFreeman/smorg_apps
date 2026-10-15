import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { runMigrations } from './migrate.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
loadEnv({ path: path.join(root, '.env') })

const ownerUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL
if (!ownerUrl) {
  throw new Error('DATABASE_OWNER_URL or DATABASE_URL is required')
}

await runMigrations(ownerUrl, [
  {
    app: 'platform',
    dir: path.join(root, 'packages/db/migrations'),
  },
  {
    app: 'core',
    dir: path.join(root, 'apps/core/migrations'),
  },
  {
    app: 'itinerarium',
    dir: path.join(root, 'apps/itinerarium/migrations'),
  },
])
