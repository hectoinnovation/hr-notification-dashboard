export function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 flex items-center justify-center">
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}
