import { createSign, randomUUID } from 'node:crypto'

export type ServiceAccount = {
  client_email: string
  private_key: string
  token_uri?: string
}

export function parseServiceAccountJson(raw: string): ServiceAccount {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (
    typeof parsed.client_email !== 'string'
    || typeof parsed.private_key !== 'string'
  ) {
    throw new Error('Service account JSON must include client_email and private_key')
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    token_uri: typeof parsed.token_uri === 'string'
      ? parsed.token_uri
      : 'https://oauth2.googleapis.com/token',
  }
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64url')
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signingInput = `${ header }.${ claim }`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = b64url(signer.sign(sa.private_key))
  const assertion = `${ signingInput }.${ signature }`

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })
  const response = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await response.json() as { access_token?: string, error?: string }
  if (!response.ok || !json.access_token) {
    throw new Error(json.error ?? 'Failed to get Drive access token')
  }
  return json.access_token
}

export type DriveUploadResult = {
  driveFileId: string
  driveWebViewLink: string
}

export async function uploadToDrive(
  sa: ServiceAccount,
  file: { fileName: string, mimeType: string, bytes: Buffer },
): Promise<DriveUploadResult> {
  const accessToken = await getAccessToken(sa)
  const boundary = `smorg_${ randomUUID() }`
  const meta = JSON.stringify({
    name: file.fileName,
    mimeType: file.mimeType,
  })
  const preamble = Buffer.from(
    `--${ boundary }\r\n`
    + 'Content-Type: application/json; charset=UTF-8\r\n\r\n'
    + `${ meta }\r\n`
    + `--${ boundary }\r\n`
    + `Content-Type: ${ file.mimeType }\r\n\r\n`,
  )
  const closing = Buffer.from(`\r\n--${ boundary }--`)
  const body = Buffer.concat([preamble, file.bytes, closing])

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ accessToken }`,
        'Content-Type': `multipart/related; boundary=${ boundary }`,
      },
      body,
    },
  )
  const json = await response.json() as {
    id?: string
    webViewLink?: string
    error?: { message?: string }
  }
  if (!response.ok || !json.id) {
    throw new Error(json.error?.message ?? 'Drive upload failed')
  }
  return {
    driveFileId: json.id,
    driveWebViewLink: json.webViewLink
      ?? `https://drive.google.com/file/d/${ json.id }/view`,
  }
}
