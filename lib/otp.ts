import { generateSecret, generateURI, verifySync } from 'otplib'
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'

const DATA_DIR      = path.join(process.cwd(), 'data')
const SECRET_FILE   = path.join(DATA_DIR, 'otp-secret.txt')
const CONFIRM_FILE  = path.join(DATA_DIR, 'otp-confirmed.txt')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

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
    ensureDataDir()
    fs.writeFileSync(SECRET_FILE, secret, 'utf8')
  } catch { /* ignore */ }
  return secret
}

/** OTP가 최초 등록(scan + verify) 완료 여부 */
export function isOtpConfirmed(): boolean {
  // env에 시크릿이 명시된 경우엔 항상 등록 완료로 간주
  if (process.env.OTP_SECRET) return true
  return fs.existsSync(CONFIRM_FILE)
}

export function markOtpConfirmed(): void {
  try {
    ensureDataDir()
    fs.writeFileSync(CONFIRM_FILE, new Date().toISOString(), 'utf8')
  } catch { /* ignore */ }
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
