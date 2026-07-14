'use client'

export type TaskFormData = {
  title: string
  team: string
  author: string
  current_work: string
  problem_definition: string
  expected_effect: string
  ai_plan: string
}

export const EMPTY_TASK_FORM: TaskFormData = {
  title: '', team: '', author: '',
  current_work: '', problem_definition: '', expected_effect: '', ai_plan: '',
}

function Field({ label, value, onChange, required, textarea }: {
  label: string; value: string; onChange: (v: string) => void
  required?: boolean; textarea?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 block mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
      )}
    </div>
  )
}

export function TaskForm({ form, onChange }: {
  form: TaskFormData; onChange: (f: TaskFormData) => void
}) {
  const set = <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) => onChange({ ...form, [key]: value })
  return (
    <div className="space-y-3">
      <Field label="제목" value={form.title} onChange={v => set('title', v)} required />
      <Field label="팀" value={form.team} onChange={v => set('team', v)} required />
      <Field label="작성자" value={form.author} onChange={v => set('author', v)} required />
      <Field label="현재 업무" value={form.current_work} onChange={v => set('current_work', v)} textarea />
      <Field label="문제 정의" value={form.problem_definition} onChange={v => set('problem_definition', v)} textarea />
      <Field label="기대 효과" value={form.expected_effect} onChange={v => set('expected_effect', v)} textarea />
      <Field label="AI 활용 계획" value={form.ai_plan} onChange={v => set('ai_plan', v)} textarea />
    </div>
  )
}
