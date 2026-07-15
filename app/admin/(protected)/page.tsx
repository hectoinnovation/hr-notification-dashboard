import { DashboardContent } from '@/components/ai/DashboardContent'

export default function AdminDashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">AI 해커톤 대시보드</h1>
      <DashboardContent />
    </div>
  )
}
