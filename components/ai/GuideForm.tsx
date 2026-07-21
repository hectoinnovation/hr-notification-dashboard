'use client'

import { useState } from 'react'
import type { GuideCategory } from '@/lib/ai-tasks'
import { uploadGuideImage } from '@/lib/ai-tasks'

export type GuideFormData = {
  title: string
  description: string
  category: GuideCategory
  url: string
  image_url: string
  author: string
}

export const EMPTY_GUIDE_FORM: GuideFormData = {
  title: '', description: '', category: '기타', url: '', image_url: '', author: '',
}

const CATEGORIES: GuideCategory[] = ['AI 뉴스', '프롬프트', '활용 사례', '바이브코딩', '추천 툴', '교육자료', '기타']

type MetaState = 'idle' | 'loading' | 'success' | 'error'

export function GuideForm({ form, onChange }: { form: GuideFormData; onChange: (f: GuideFormData) => void }) {
  const [metaState, setMetaState] = useState<MetaState>('idle')
  const [metaError, setMetaError] = useState('')
  const [preview, setPreview] = useState<{ title?: string | null; description?: string | null; image?: string | null } | null>(null)
  const [fetchedUrl, setFetchedUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  function set<K extends keyof GuideFormData>(key: K, value: GuideFormData[K]) {
    onChange({ ...form, [key]: value })
  }

  async function fetchMetadata() {
    const url = form.url.trim()
    if (!url) return
    setMetaState('loading')
    setMetaError('')
    try {
      const res = await fetch('/api/ai-guides/fetch-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMetaState('error')
        setMetaError(data.error ?? '메타데이터를 가져오지 못했습니다.')
        return
      }
      setPreview({ title: data.title, description: data.description, image: data.image })
      setFetchedUrl(url)
      // 사용자가 직접 입력한 값이 있으면 그대로 두고, 비어있는 필드만 자동 채움
      const next = { ...form }
      if (!next.title.trim() && data.title) next.title = data.title
      if (!next.description.trim() && data.description) next.description = data.description
      if (!next.image_url.trim() && data.image) next.image_url = data.image
      onChange(next)
      setMetaState('success')
    } catch {
      setMetaState('error')
      setMetaError('메타데이터를 가져오지 못했습니다.')
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const url = await uploadGuideImage(file)
      set('image_url', url)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">링크(URL) <span className="text-gray-300">(선택)</span></label>
        <div className="flex gap-2">
          <input value={form.url} onChange={e => set('url', e.target.value)}
            onBlur={() => { if (form.url.trim() && form.url.trim() !== fetchedUrl) fetchMetadata() }}
            placeholder="https://..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
          <button type="button" onClick={fetchMetadata} disabled={!form.url.trim() || metaState === 'loading'}
            className="text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap">
            메타데이터 불러오기
          </button>
        </div>
        {metaState === 'loading' && <p className="text-xs text-gray-400 mt-1.5">링크 정보를 가져오는 중...</p>}
        {metaState === 'error' && <p className="text-xs text-red-500 mt-1.5">{metaError || '메타데이터를 가져오지 못했습니다.'}</p>}
        {metaState === 'success' && preview && (
          <div className="mt-2 flex gap-3 items-center bg-gray-50 border border-gray-200 rounded-lg p-2.5">
            {preview.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.image} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0" />
            ) : (
              <span className="w-14 h-14 rounded bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">🤖</span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{preview.title || '(제목 없음)'}</p>
              <p className="text-xs text-gray-500 line-clamp-2">{preview.description || ''}</p>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">제목<span className="text-red-400 ml-0.5">*</span></label>
        <input value={form.title} onChange={e => set('title', e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">카테고리<span className="text-red-400 ml-0.5">*</span></label>
          <select value={form.category} onChange={e => set('category', e.target.value as GuideCategory)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">작성자<span className="text-red-400 ml-0.5">*</span></label>
          <input value={form.author} onChange={e => set('author', e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">
          설명<span className="text-red-400 ml-0.5">*</span> <span className="text-gray-300 font-normal">(Markdown 지원)</span>
        </label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={5}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none font-mono" />
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">대표 이미지 <span className="text-gray-300">(선택)</span></label>
        <div className="flex items-center gap-3">
          {form.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
          ) : (
            <span className="w-16 h-16 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-2xl flex-shrink-0">🤖</span>
          )}
          <div className="space-y-1">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
              {uploading ? '업로드 중…' : '이미지 업로드'}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
            {form.image_url && (
              <button type="button" onClick={() => set('image_url', '')} className="block text-xs text-gray-400 hover:text-red-500">
                이미지 제거
              </button>
            )}
            {uploadError && <p className="text-xs text-red-500">업로드 실패: {uploadError}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
