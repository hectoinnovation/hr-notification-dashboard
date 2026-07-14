import type { ReactNode } from 'react'
import { AiNav } from '@/components/ai/AiNav'

export default function AiLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AiNav />
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
