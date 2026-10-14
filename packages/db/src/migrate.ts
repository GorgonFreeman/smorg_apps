import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

export type MigrationSource = {
  app: string
  dir: string
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    create schema if not exists platform;
    create table if not exists platform.migrations (
      app text not null,
      filename text not null,
      applied_at timestamptz not null default now(),
      primary key (app, filename)
    );
  `)
}

async function listSqlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir)
  return entries.filter((name) => name.endsWith('.sql')).sort()
}

export async function runMigrations(
  connectionString: string,
  sources: MigrationSource[],
): Promise<void> {
  const pool = new pg.Pool({ connectionString })
  const client = await pool.connect()
  try {
    await ensureMigrationsTable(client)

    for (const source of sources) {
      const files = await listSqlFiles(source.dir)
      for (const filename of files) {
        const applied = await client.query(
          `select 1 from platform.migrations where app = $1 and filename = $2`,
          [source.app, filename],
        )
        if (applied.rowCount) {
          continue
        }

        const sql = await readFile(path.join(source.dir, filename), 'utf8')
        await client.query('begin')
        try {
          await client.query(sql)
          await client.query(
            `insert into platform.migrations (app, filename) values ($1, $2)`,
            [source.app, filename],
          )
          await client.query('commit')
          console.log('applied', source.app, filename)
        } catch (error) {
          await client.query('rollback')
          throw error
        }
      }
    }
  } finally {
    client.release()
    await pool.end()
  }
}
