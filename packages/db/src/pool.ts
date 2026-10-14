import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | undefined

export function getPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }
  if (!pool) {
    pool = new Pool({ connectionString })
  }
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
