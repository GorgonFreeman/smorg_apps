import type { TxClient } from '@smorg/db'

export async function installApp(
  client: TxClient,
  userId: string,
  slug: string,
): Promise<{ installed: boolean }> {
  const app = await client.query<{ slug: string, version: string }>(
    `select slug, version from platform.apps where slug = $1`,
    [slug],
  )
  if (!app.rows[0]) {
    return { installed: false }
  }

  await client.query(
    `
      insert into platform.installations (user_id, app_slug, app_version)
      values ($1, $2, $3)
      on conflict (user_id, app_slug) do nothing
    `,
    [userId, slug, app.rows[0].version],
  )
  return { installed: true }
}

export async function isInstalled(
  client: TxClient,
  userId: string,
  slug: string,
): Promise<boolean> {
  const result = await client.query(
    `
      select 1 from platform.installations
      where user_id = $1 and app_slug = $2
    `,
    [userId, slug],
  )
  return (result.rowCount ?? 0) > 0
}
