import Link from 'next/link'

export function EmptyState({ icon, label, description, actionLabel, actionHref }: {
  icon?: string
  label: string
  description?: string
  actionLabel?: string
  actionHref?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 px-4 flex flex-col items-center justify-center gap-1.5 text-center">
      {icon && <span className="text-3xl mb-1">{icon}</span>}
      <p className="text-sm text-gray-400">{label}</p>
      {description && <p className="text-xs text-gray-300">{description}</p>}
      {actionLabel && actionHref && (
        <Link href={actionHref}
          className="mt-2 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
