import type { ReactNode } from 'react'
import { AdminSidebar } from '@/components/ai/AdminSidebar'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 max-w-screen-xl mx-auto w-full">{children}</main>
    </div>
  )
}
