'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { ResolutionType } from '@/lib/ai-tasks'
import { TaskForm, EMPTY_TASK_FORM, type TaskFormData } from '@/components/ai/TaskForm'

export default function AiRegisterPage() {
  const router = useRouter()
  const [resolutionType, setResolutionType] = useState<ResolutionType | null>(null)
  const [form, setForm] = useState<TaskFormData>(EMPTY_TASK_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = resolutionType !== null && form.title.trim() && form.author.trim()

  async function handleSubmit() {
    if (!canSubmit || !resolutionType) return
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.from('ai_tasks').insert({
      title: form.title.trim(),
      department: form.department,
      author: form.author.trim(),
      resolution_type: resolutionType,
      current_work: form.current_work || null,
      problem_definition: form.problem_definition || null,
      expected_effect: form.expected_effect || null,
      ai_plan: form.ai_plan || null,
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    router.push(resolutionType === 'self' ? '/ai/self' : '/ai/help')
  }

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-lg font-bold text-gray-900">AI 과제 등록</h1>

      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">해결 방식<span className="text-red-400 ml-0.5">*</span></label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setResolutionType('self')}
            className={`text-sm font-semibold px-4 py-3 rounded-lg border transition-colors ${
              resolutionType === 'self' ? 'bg-purple-500 border-purple-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300'
            }`}>
            자체 해결
          </button>
          <button onClick={() => setResolutionType('help')}
            className={`text-sm font-semibold px-4 py-3 rounded-lg border transition-colors ${
              resolutionType === 'help' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-amber-300'
            }`}>
            도움 필요
          </button>
        </div>
      </div>

      <TaskForm form={form} onChange={setForm} />

      {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">등록 실패: {error}</p>}

      <div className="flex justify-end">
        <button onClick={handleSubmit} disabled={!canSubmit || submitting}
          className="text-sm px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-40 transition-colors">
          {submitting ? '등록 중...' : '등록하기'}
        </button>
      </div>
    </div>
  )
}
