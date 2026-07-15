export function FilterChip({ label, active, onClick, count }: {
  label: string; active: boolean; onClick: () => void; count?: number
}) {
  return (
    <button onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
        active ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
      }`}>
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  )
}
