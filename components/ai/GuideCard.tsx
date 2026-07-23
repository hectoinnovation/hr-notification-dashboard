'use client'

import { useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import type { AiGuide } from '@/lib/ai-tasks'
import { Modal } from '@/components/ui/Modal'

// @tailwindcss/typography 없이 마크다운 요소별로 직접 스타일을 입힌다
// (globals.css/Tailwind 설정 등 공용 파일은 건드리지 않기 위함)
const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 mt-3 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-900 mt-2 mb-1">{children}</h3>,
  p:  ({ children }) => <p className="text-sm text-gray-700 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-gray-700 space-y-0.5">{children}</ol>,
  a:  ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-orange-600 hover:underline">{children}</a>,
  strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
  code: ({ children }) => <code className="text-xs bg-gray-100 rounded px-1 py-0.5">{children}</code>,
}

const CATEGORY_COLOR: Record<string, string> = {
  'AI 뉴스': 'bg-blue-50 text-blue-700 border-blue-200',
  '프롬프트': 'bg-purple-50 text-purple-700 border-purple-200',
  '활용 사례': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '바이브코딩': 'bg-orange-50 text-orange-700 border-orange-200',
  '추천 툴': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  '교육자료': 'bg-amber-50 text-amber-700 border-amber-200',
  '기타': 'bg-gray-50 text-gray-600 border-gray-200',
}

// 카드 미리보기용 — 마크다운 기호를 걷어낸 순수 텍스트 2~3줄만 보여준다
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${CATEGORY_COLOR[category] ?? CATEGORY_COLOR['기타']}`}>
      {category}
    </span>
  )
}

function RequiredBadge({ emphasized = false }: { emphasized?: boolean }) {
  if (emphasized) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-bold text-white bg-red-600 px-3 py-1 rounded-md flex-shrink-0">
        🔥 필독
      </span>
    )
  }
  return (
    <span className="text-xs font-bold text-white bg-red-500 px-1.5 py-0.5 rounded flex-shrink-0">
      필독
    </span>
  )
}

// highlightRequired: 필독 자료를 시각적으로 강조할지 여부 — 공개 화면(/ai/guides)에서만
// true로 넘겨준다. 관리자 화면은 기존 디자인을 그대로 유지하기 위해 기본값 false.
// 필독 카드는 크기(폰트/패딩)를 키우지 않고 테두리·그림자·배경 톤·배지로만 차별화한다 —
// 그리드 폭(sm:col-span-2 lg:col-span-2)은 페이지 쪽에서 이미 담당한다.
export function GuideCard({ guide, highlightRequired = false }: {
  guide: AiGuide; highlightRequired?: boolean
}) {
  const [showDetail, setShowDetail] = useState(false)
  const dateLabel = guide.created_at.slice(0, 10).replace(/-/g, '.')
  const showRequiredAccent = highlightRequired && guide.is_required

  return (
    <>
      <div className={`rounded-2xl border overflow-hidden transition-all duration-150 flex flex-col ${
        showRequiredAccent
          ? 'bg-amber-50/60 border-2 border-red-300 shadow-md hover:shadow-lg hover:border-red-400 hover:-translate-y-0.5'
          : 'bg-white border-gray-200 shadow-sm hover:shadow-md hover:border-orange-200'
      }`}>
        <button onClick={() => setShowDetail(true)} className="text-left flex-1 flex flex-col">
          <div className="aspect-video w-full bg-gray-50 flex items-center justify-center overflow-hidden">
            {guide.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={guide.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">🤖</span>
            )}
          </div>
          <div className="p-4 space-y-2 flex-1">
            {showRequiredAccent ? (
              <div className="flex items-center gap-2 flex-wrap">
                <RequiredBadge emphasized />
                <CategoryBadge category={guide.category} />
              </div>
            ) : (
              <CategoryBadge category={guide.category} />
            )}
            <h3 className="text-sm font-bold text-gray-900 line-clamp-2">
              {guide.is_required && !showRequiredAccent && <RequiredBadge />} <span>{guide.title}</span>
            </h3>
            <p className="text-xs text-gray-500 line-clamp-3">{stripMarkdown(guide.description)}</p>
            <p className="text-xs text-gray-400 pt-1">{guide.author} · {dateLabel}</p>
          </div>
        </button>
        {guide.url && (
          <div className="px-4 pb-4">
            <a href={guide.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="block text-center text-xs font-semibold bg-orange-50 hover:bg-orange-100 text-orange-600 px-3 py-2 rounded-lg transition-colors">
              자료 보기 ↗
            </a>
          </div>
        )}
      </div>

      {showDetail && (
        <Modal title={guide.title} onClose={() => setShowDetail(false)} maxWidth="max-w-2xl">
          <div className="space-y-3">
            {guide.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={guide.image_url} alt="" className="w-full rounded-lg object-cover max-h-64" />
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {guide.is_required && <RequiredBadge />}
              <CategoryBadge category={guide.category} />
              <span className="text-xs text-gray-400">{guide.author} · {dateLabel}</span>
            </div>
            <div className="text-sm text-gray-700 space-y-2">
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>{guide.description}</ReactMarkdown>
            </div>
            {guide.url && (
              <a href={guide.url} target="_blank" rel="noreferrer"
                className="inline-block text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors">
                자료 보기 ↗
              </a>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
