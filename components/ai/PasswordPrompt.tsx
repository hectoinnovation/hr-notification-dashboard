'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'

export function PasswordPrompt({ title, onVerify, onClose }: {
  title: string
  onVerify: (password: string) => Promise<boolean>
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!password) return
    setChecking(true)
    setError(null)
    const ok = await onVerify(password)
    setChecking(false)
    if (!ok) setError('비밀번호가 일치하지 않습니다.')
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-gray-400">등록 시 입력한 수정 비밀번호를 입력해주세요.</p>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }} autoFocus
          placeholder="비밀번호 입력"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={submit} disabled={checking || !password}
            className="text-sm px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-40 transition-colors">
            {checking ? '확인 중...' : '확인'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
