import { DashboardContent } from '@/components/ai/DashboardContent'

export default function AdminDashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">AI 과제 관리 대시보드</h1>
      <DashboardContent />
    </div>
  )
}
