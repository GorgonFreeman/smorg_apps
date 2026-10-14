export type AppConfig = {
  port: number
  databaseUrl: string
  sessionHmacSecret: string
  appOrigin: string
  nodeEnv: string
  cookieSecure: boolean
  smtp: {
    host?: string
    port: number
    user?: string
    pass?: string
    from?: string
  }
}

export function loadConfig(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL
  const sessionHmacSecret = process.env.SESSION_HMAC_SECRET
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  if (!sessionHmacSecret) {
    throw new Error('SESSION_HMAC_SECRET is required')
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development'
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl,
    sessionHmacSecret,
    appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
    nodeEnv,
    cookieSecure: nodeEnv === 'production',
    smtp: {
      host: process.env.SMTP_HOST || undefined,
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: process.env.SMTP_FROM || undefined,
    },
  }
}
