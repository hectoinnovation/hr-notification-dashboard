import { generateSecret, generateURI, verifySync } from 'otplib'
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'

const SECRET_FILE = path.join(process.cwd(), 'data', 'otp-secret.txt')

export function getOtpSecret(): string | null {
  const envSecret = process.env.OTP_SECRET
  if (envSecret) return envSecret
  try {
    const s = fs.readFileSync(SECRET_FILE, 'utf8').trim()
    return s || null
  } catch {
    return null
  }
}

export function generateAndSaveSecret(): string {
  const secret = generateSecret()
  try {
    const dir = path.dirname(SECRET_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(SECRET_FILE, secret, 'utf8')
  } catch { /* ignore */ }
  return secret
}

export async function generateQrDataUrl(secret: string): Promise<string> {
  const otpauth = generateURI({ issuer: '입퇴사자 대시보드', label: 'admin', secret })
  return QRCode.toDataURL(otpauth, { width: 200, margin: 2 })
}

export function verifyOtp(token: string, secret: string): boolean {
  try {
    const result = verifySync({ token, secret })
    return !!(result && result.valid)
  } catch {
    return false
  }
}
