import type { TxClient } from '@smorg/db'
import coreManifest from '@smorg/core/manifest'

export type AppManifest = {
  slug: string
  name: string
  color?: string
  version: string
  uses: string[]
  migrations?: string
}

export const manifests: AppManifest[] = [coreManifest]

export async function syncAppsRegistry(client: TxClient): Promise<void> {
  for (const manifest of manifests) {
    await client.query(
      `
        insert into platform.apps (slug, name, color, version)
        values ($1, $2, $3, $4)
        on conflict (slug) do update set
          name = excluded.name,
          color = excluded.color,
          version = excluded.version
      `,
      [manifest.slug, manifest.name, manifest.color ?? null, manifest.version],
    )
  }
}

export function getManifest(slug: string): AppManifest | undefined {
  return manifests.find((m) => m.slug === slug)
}
