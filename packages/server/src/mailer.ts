import nodemailer from 'nodemailer'
import type { AppConfig } from './config.js'

export interface Mailer {
  send(to: string, subject: string, body: string): Promise<void>
}

export function createMailer(config: AppConfig): Mailer {
  if (!config.smtp.host) {
    return {
      async send(to, subject, body) {
        console.log('mailer:console', { to, subject, body })
      },
    }
  }

  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: false,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
  })

  return {
    async send(to, subject, body) {
      await transport.sendMail({
        from: config.smtp.from ?? config.smtp.user,
        to,
        subject,
        text: body,
      })
    },
  }
}
