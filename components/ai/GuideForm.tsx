'use client'

import type { GuideCategory } from '@/lib/ai-tasks'

export type GuideFormData = {
  title: string
  category: GuideCategory
  description: string
  url: string
}

export const EMPTY_GUIDE_FORM: GuideFormData = { title: '', category: '문서', description: '', url: '' }

const CATEGORIES: GuideCategory[] = ['영상', '문서', '블로그', '프롬프트', '기타']

export function GuideForm({ form, onChange }: { form: GuideFormData; onChange: (f: GuideFormData) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">제목<span className="text-red-400 ml-0.5">*</span></label>
        <input value={form.title} onChange={e => onChange({ ...form, title: e.target.value })}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">구분<span className="text-red-400 ml-0.5">*</span></label>
        <select value={form.category} onChange={e => onChange({ ...form, category: e.target.value as GuideCategory })}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">설명</label>
        <textarea value={form.description} onChange={e => onChange({ ...form, description: e.target.value })} rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">URL<span className="text-red-400 ml-0.5">*</span></label>
        <input value={form.url} onChange={e => onChange({ ...form, url: e.target.value })} placeholder="https://..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
      </div>
    </div>
  )
}
