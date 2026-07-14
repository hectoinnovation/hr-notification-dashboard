import type { ReactNode } from 'react'
import { AdminNav } from '@/components/ai/AdminNav'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
