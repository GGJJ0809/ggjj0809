import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { mealTrendData } from '@/mocks/dashboard';

export default function MealTrendChart() {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">就餐人次趋势</h3>
          <p className="text-xs text-slate-400 mt-0.5">近7日三餐就餐数据</p>
        </div>
        <div className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
          <i className="ri-calendar-line mr-1" />近7日
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={mealTrendData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }} barSize={10}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="breakfast" name="早餐" fill="#6ee7b7" radius={[3, 3, 0, 0]} />
          <Bar dataKey="lunch" name="午餐" fill="#10b981" radius={[3, 3, 0, 0]} />
          <Bar dataKey="dinner" name="晚餐" fill="#047857" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}