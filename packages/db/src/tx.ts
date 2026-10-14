import type pg from 'pg'
import { getPool } from './pool.js'

export type TxClient = pg.PoolClient

/** Run work in a transaction with RLS app.user_id set (fails closed if missing). */
export async function withUserTx<T>(
  userId: string,
  fn: (client: TxClient) => Promise<T>,
  pool = getPool(),
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('app.user_id', $1, true)`, [userId])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

/** Transaction without RLS user context (auth, migrations bookkeeping). */
export async function withTx<T>(
  fn: (client: TxClient) => Promise<T>,
  pool = getPool(),
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
