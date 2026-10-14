import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex')
}

export function hashOtp(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('hex')
}

export function otpMatches(code: string, codeHash: string, secret: string): boolean {
  const a = Buffer.from(hashOtp(code, secret))
  const b = Buffer.from(codeHash)
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(a, b)
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function newOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}
