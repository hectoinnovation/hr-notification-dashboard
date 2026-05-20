export default function BlockedPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-2xl">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-bold text-gray-900">접근 차단</h1>
          <p className="text-sm text-gray-500">허용되지 않은 IP 주소입니다.</p>
          <p className="text-xs text-gray-400">접근 권한이 필요한 경우 관리자에게 문의하세요.</p>
        </div>
      </div>
    </div>
  )
}
