export function KpiCard({ icon, value, label, sub, color = 'text-orange-600' }: {
  icon: string; value: number | string; label: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-lg">{icon}</span>
        <span className={`text-2xl font-black ${color}`}>{value}</span>
      </div>
      <p className="text-xs font-medium text-gray-600">{label}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
