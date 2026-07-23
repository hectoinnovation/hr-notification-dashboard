import Link from 'next/link'

const STEPS = [
  'AI 활용 방법 참고',
  '해결하고 싶은 업무 등록',
  'AI를 활용하여 해결',
  '결과물 제출 후 완료 처리',
  '다른 팀원들과 결과 공유',
]

export default function AiAboutPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">🤖 AI 해커톤 안내</h1>
        <p className="text-sm text-gray-400 mt-0.5">처음이신가요? 아래 순서대로 참여해보세요.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-2">
        <p className="text-sm font-bold text-orange-600">AI 해커톤이란?</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          반복 업무나 해결하고 싶은 업무를 AI를 활용하여 해결하고 결과를 공유하는 사내 AI 해커톤입니다.
        </p>
        <p className="text-sm text-gray-600 leading-relaxed">
          반복 업무를 AI로 자동화하는 것이 목표가 아닙니다.
          업무의 본질을 고민하고, AI와 함께 더 가치 있는 일에 집중하는 경험을 만드는 것이 이번 AI 해커톤의 목적입니다.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-2">
        <p className="text-sm font-bold text-gray-800">참여하면 얻을 수 있는 것</p>
        <ul className="text-sm text-gray-600 leading-relaxed list-disc list-inside space-y-1">
          <li>반복 업무를 줄이는 아이디어를 발견할 수 있습니다.</li>
          <li>AI를 실제 업무에 적용하는 경험을 쌓을 수 있습니다.</li>
          <li>다른 팀의 AI 활용 사례를 함께 공유하고 배울 수 있습니다.</li>
        </ul>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-1">
        <p className="text-sm font-bold text-gray-800 mb-3">진행 방법</p>
        {STEPS.map((step, i) => (
          <div key={step}>
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <p className="text-sm text-gray-700">{step}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div className="ml-3 pl-[1px] text-gray-300 text-xs leading-tight">↓</div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Link href="/ai/guides"
          className="text-center text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          AI 활용 방법 보러가기
        </Link>
        <Link href="/ai"
          className="text-center text-sm font-bold px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors">
          AI 과제 등록하기
        </Link>
        <Link href="/ai/tasks"
          className="text-center text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          등록된 과제 보기
        </Link>
      </div>
    </div>
  )
}
