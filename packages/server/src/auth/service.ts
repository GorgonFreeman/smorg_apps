import { withTx } from '@smorg/db'
import type { Mailer } from '../mailer.js'
import { hashOtp, newOtpCode, otpMatches } from '../crypto_util.js'
import { fail, normalizeEmail, ok } from '../mineral.js'
import { hitRateLimit } from './rate_limit.js'
import { createSession } from './session.js'
import { installApp } from '../apps/install.js'
import type { MineralResponse } from '@smorg/ui'

const OTP_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5

export function createAuthService(deps: {
  secret: string
  mailer: Mailer
}) {
  return {
    async requestCode(emailRaw: string, ip: string): Promise<MineralResponse> {
      const email = normalizeEmail(emailRaw)
      if (!email || !email.includes('@')) {
        return fail('VALIDATION_ERROR', 'Enter a valid email', { field: 'email' })
      }

      const limited = await withTx(async (client) => {
        return (
          (await hitRateLimit(client, `otp:email:${ email }`, 5)) ||
          (await hitRateLimit(client, `otp:ip:${ ip }`, 20)) ||
          (await hitRateLimit(client, 'otp:global', 200))
        )
      })
      if (limited) {
        // Same generic copy — do not reveal rate limit details to callers.
        return ok({
          message: 'If that email is valid, a code is on its way',
        })
      }

      await withTx(async (client) => {
        const code = newOtpCode()
        const codeHash = hashOtp(code, deps.secret)
        const expiresAt = new Date(Date.now() + OTP_TTL_MS)
        await client.query(
          `
            insert into platform.otp_codes (email, code_hash, expires_at)
            values ($1, $2, $3)
          `,
          [email, codeHash, expiresAt.toISOString()],
        )
        await deps.mailer.send(
          email,
          'Your Smorg login code',
          `Your login code is ${ code }. It expires in 10 minutes.`,
        )
      })

      return ok({
        message: 'If that email is valid, a code is on its way',
      })
    },

    async verify(
      emailRaw: string,
      codeRaw: string,
    ): Promise<MineralResponse<{ user: { id: string, email: string }, token: string, expiresAt: Date }>> {
      const email = normalizeEmail(emailRaw)
      const code = codeRaw.trim()
      if (!email || !code) {
        return fail('VALIDATION_ERROR', 'Email and code are required')
      }

      return withTx(async (client) => {
        const otpResult = await client.query<{
          id: string
          code_hash: string
          expires_at: Date
          attempts: number
        }>(
          `
            select id, code_hash, expires_at, attempts
            from platform.otp_codes
            where email = $1 and consumed_at is null
            order by created_at desc
            limit 1
          `,
          [email],
        )
        const otp = otpResult.rows[0]
        if (!otp) {
          return fail('INVALID_CODE', 'Invalid or expired code')
        }
        if (new Date(otp.expires_at).getTime() <= Date.now()) {
          return fail('INVALID_CODE', 'Invalid or expired code')
        }
        if (otp.attempts >= MAX_ATTEMPTS) {
          return fail('INVALID_CODE', 'Too many attempts')
        }

        if (!otpMatches(code, otp.code_hash, deps.secret)) {
          await client.query(
            `update platform.otp_codes set attempts = attempts + 1 where id = $1`,
            [otp.id],
          )
          return fail('INVALID_CODE', 'Invalid or expired code')
        }

        await client.query(
          `update platform.otp_codes set consumed_at = now() where id = $1`,
          [otp.id],
        )

        let user = await client.query<{ id: string, email: string }>(
          `select id, email from platform.users where email = $1`,
          [email],
        )
        if (!user.rows[0]) {
          user = await client.query<{ id: string, email: string }>(
            `
              insert into platform.users (email)
              values ($1)
              returning id, email
            `,
            [email],
          )
          await installApp(client, user.rows[0].id, 'core')
        }

        const session = await createSession(client, user.rows[0].id, deps.secret)
        return ok({
          user: user.rows[0],
          token: session.token,
          expiresAt: session.expiresAt,
        })
      })
    },
  }
}
