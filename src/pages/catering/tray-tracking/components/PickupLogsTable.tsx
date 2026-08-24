import { PickupLog } from '../hooks/useTrayTracking';

const CATEGORY_COLORS: Record<string, string> = {
  荤菜: 'bg-red-50 text-red-600',
  素菜: 'bg-emerald-50 text-emerald-600',
  家常菜: 'bg-amber-50 text-amber-600',
  主食: 'bg-orange-50 text-orange-600',
  汤品: 'bg-sky-50 text-sky-600',
  凉菜: 'bg-teal-50 text-teal-600',
};

interface PickupLogsTableProps {
  logs: PickupLog[];
  loading: boolean;
  stations?: Record<string, { tare_weight: number }>;
  onAdd?: () => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatWeight(g: number) {
  if (g >= 1000) return `${(g / 1000).toFixed(2)}kg`;
  return `${Math.round(g)}g`;
}

export default function PickupLogsTable({ logs, loading, stations = {}, onAdd }: PickupLogsTableProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-100">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">取餐明细记录</h3>
          <p className="text-xs text-slate-400 mt-0.5">每次取餐的详细数据（取餐量 = 取餐前重量 - 取餐后重量）</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">共 {logs.length} 条</span>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-1.5 text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-add-line" />
              录入取餐记录
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <i className="ri-inbox-2-line text-3xl mb-2" />
            <p className="text-sm">暂无取餐记录</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50">
                {['取餐时间', '托盘编号', '菜品名称', '菜系', '取餐前(g)', '取餐后(g)', '本次取餐量', '皮重', '剩余净重', '人员ID'].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const tareWeight = stations[log.station_code]?.tare_weight || 0;
                const displayWeightAfter = Math.max(0, (log.weight_before || 0) - (log.pickup_weight || 0));
                const netWeightAfter = Math.max(0, displayWeightAfter - tareWeight);
                return (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatTime(log.pickup_time)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{log.station_code}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{log.dish_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[log.category] || 'bg-slate-50 text-slate-500'}`}>
                        {log.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{log.weight_before?.toFixed(0)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{displayWeightAfter.toFixed(0)}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-slate-800">
                        {log.pickup_weight >= 1000
                          ? `${(log.pickup_weight / 1000).toFixed(2)}kg`
                          : `${Math.round(log.pickup_weight)}g`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{tareWeight > 0 ? `${tareWeight.toFixed(0)}g` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <span className={netWeightAfter > 0 ? 'text-slate-700' : 'text-slate-300'}>
                        {tareWeight > 0 ? formatWeight(netWeightAfter) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{log.person_id || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}