import { aiEventTypes, deviceStatusData } from '@/mocks/dashboard';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export default function AIEventsSummary() {
  const total = aiEventTypes.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">今日AI识别事件</h3>
          <p className="text-xs text-slate-400 mt-0.5">共识别 {total} 条行为事件</p>
        </div>
        <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-medium">AI分析中</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {aiEventTypes.map((evt) => (
          <div key={evt.name} className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-lg">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white">
              <i className={`${evt.icon} ${evt.color} text-base`} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{evt.count}</p>
              <p className="text-xs text-slate-500">{evt.name}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-50 pt-4">
        <p className="text-xs font-medium text-slate-600 mb-3">设备在线状态</p>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={80} height={80}>
            <PieChart>
              <Pie
                data={deviceStatusData}
                cx="50%"
                cy="50%"
                innerRadius={25}
                outerRadius={38}
                dataKey="value"
                strokeWidth={0}
              >
                {deviceStatusData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 11 }}
                formatter={(value: number, name: string) => [value, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1.5">
            {deviceStatusData.map((d) => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-slate-500">{d.name}</span>
                </div>
                <span className="text-xs font-semibold text-slate-700">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}