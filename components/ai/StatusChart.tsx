'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'

const COLORS = ['#3b82f6', '#f97316', '#a855f7', '#f59e0b']

/**
 * 범용 소형 막대그래프. 진행 상태(진행중/완료)와 해결 방식(자체 해결/도움 필요)은
 * 서로 다른 축이므로 하나의 차트에 섞지 않고, title로 구분된 별도 차트 인스턴스로 사용한다.
 */
export function StatusChart({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <p className="text-xs font-semibold text-gray-600 mb-3">{title}</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
