import type { ReactNode } from 'react'

export function FormSection({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-500 text-white text-[11px] font-bold tracking-wide flex-shrink-0">
          STEP {step}
        </span>
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  )
}
