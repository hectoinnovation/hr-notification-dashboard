'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'

// 등록 시 비밀번호 최소 길이(app/ai/page.tsx)와 동일한 규칙을 적용해 일관성을 유지한다.
const MIN_LENGTH = 4

export function ChangePasswordModal({ onClose, onSubmit }: {
  onClose: () => void
  onSubmit: (newPassword: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = password.trim().length >= MIN_LENGTH && password === confirmPassword

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(password.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <Modal title="비밀번호 변경" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-gray-400">앞으로 이 과제를 수정·삭제·완료 처리할 때 사용할 새 비밀번호를 입력해주세요.</p>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">새 비밀번호<span className="text-red-400 ml-0.5">*</span></label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus
            placeholder="4자 이상 입력"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">새 비밀번호 확인<span className="text-red-400 ml-0.5">*</span></label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="다시 한 번 입력"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
        </div>
        {password.length > 0 && password.trim().length < MIN_LENGTH && (
          <p className="text-xs text-red-500">비밀번호는 4자 이상 입력해주세요.</p>
        )}
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <p className="text-xs text-red-500">비밀번호가 일치하지 않습니다.</p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={submit} disabled={saving || !canSubmit}
            className="text-sm px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-40 transition-colors">
            {saving ? '변경 중...' : '변경하기'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
