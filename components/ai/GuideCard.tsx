import type { AiGuide } from '@/lib/ai-tasks'

const CATEGORY_COLOR: Record<string, string> = {
  '영상': 'bg-red-50 text-red-700 border-red-200',
  '문서': 'bg-blue-50 text-blue-700 border-blue-200',
  '블로그': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '프롬프트': 'bg-purple-50 text-purple-700 border-purple-200',
  '기타': 'bg-gray-50 text-gray-600 border-gray-200',
}

export function GuideCard({ guide }: { guide: AiGuide }) {
  return (
    <a href={guide.url} target="_blank" rel="noreferrer"
      className="block bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-orange-300 hover:shadow-md transition-all">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${CATEGORY_COLOR[guide.category] ?? CATEGORY_COLOR['기타']}`}>
          {guide.category}
        </span>
      </div>
      <h3 className="text-sm font-bold text-gray-900 mb-1">{guide.title}</h3>
      {guide.description && <p className="text-xs text-gray-500 line-clamp-2">{guide.description}</p>}
    </a>
  )
}
