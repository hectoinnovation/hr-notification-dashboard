'use client'
import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

interface SetupData {
  secret: string
  qrDataUrl: string
  isNew: boolean
}

export default function OtpPage() {
  const router = useRouter()
  const [setup, setSetup] = useState<SetupData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/auth/setup')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadErr(data.error); return }
        setSetup(data)
      })
      .catch(() => setLoadErr('OTP 설정을 불러오지 못했습니다.'))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      router.push('/')
    } catch {
      setError('인증 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-orange-100 rounded-2xl mb-4">
            <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900">2단계 인증</h1>
          <p className="text-sm text-gray-500 mt-1">Google Authenticator OTP</p>
        </div>

        {loadErr && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{loadErr}</p>
        )}

        {setup?.isNew && setup.qrDataUrl && (
          <div className="space-y-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-xs font-semibold text-orange-700">최초 설정 — QR 코드 스캔</p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qrDataUrl} alt="OTP QR Code" className="w-40 h-40 rounded-lg" />
            </div>
            <p className="text-xs text-orange-600">Google Authenticator 앱에서 위 QR 코드를 스캔하세요.</p>
            <div className="bg-white border border-orange-200 rounded-lg px-3 py-2 space-y-1">
              <p className="text-xs text-gray-400">시크릿 키 (수동 입력용)</p>
              <p className="text-xs font-mono font-semibold text-gray-700 break-all select-all">{setup.secret}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">OTP 코드 (6자리)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={token}
              onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              placeholder="000000"
              autoComplete="one-time-code"
              required
            />
          </div>
          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit" disabled={submitting || token.length < 6}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
          >
            {submitting ? '인증 중...' : '인증'}
          </button>
        </form>

        <button
          onClick={() => router.push('/login')}
          className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors text-center"
        >
          ← 로그인으로 돌아가기
        </button>
      </div>
    </div>
  )
}
