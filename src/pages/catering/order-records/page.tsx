import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';
import { todayBeijing, dateToBeijing } from '@/lib/dateUtils';

interface OrderRecord {
  id: number;
  dish_id: number;
  dish_name: string;
  category: string;
  device_info: string;
  created_at: string;
}

interface CategoryStat {
  category: string;
  count: number;
}

function formatDate(d: Date): string {
  return dateToBeijing(d);
}

export default function OrderRecordsPage() {
  const [records, setRecords] = useState<OrderRecord[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(todayBeijing());
  const [categoryFilter, setCategoryFilter] = useState('全部');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startDate = `${dateFilter}T00:00:00+08:00`;
      const endDate = `${dateFilter}T23:59:59+08:00`;

      let query = supabase
        .from('dish_order_records')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (categoryFilter !== '全部') {
        query = query.eq('category', categoryFilter);
      }

      const { data, error: fetchErr } = await query;

      if (fetchErr) throw new Error(fetchErr.message);
      setRecords((data || []) as OrderRecord[]);

      // 分类统计
      const statsMap = new Map<string, number>();
      (data || []).forEach((r) => {
        const cat = r.category || '其他';
        statsMap.set(cat, (statsMap.get(cat) || 0) + 1);
      });
      const stats: CategoryStat[] = Array.from(statsMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
      setCategoryStats(stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, categoryFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // 今日各菜品累计
  const dishCountMap = new Map<string, number>();
  records.forEach((r) => {
    dishCountMap.set(r.dish_name, (dishCountMap.get(r.dish_name) || 0) + 1);
  });

  const handleExport = () => {
    if (records.length === 0) return;
    const header = '菜品名称,分类,点餐时间,设备\n';
    const rows = records.map((r) =>
      `${r.dish_name},${r.category},${new Date(r.created_at).toLocaleString('zh-CN', { hour12: false })},${r.device_info}`
    ).join('\n');
    const csv = '\uFEFF' + header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `点餐记录_${dateFilter}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="点餐记录" breadcrumb={['餐饮管理', '点餐记录']}>
      <div className="space-y-4">
        {/* 筛选栏 */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 flex-shrink-0">日期</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 flex-shrink-0">分类</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400 cursor-pointer"
              >
                <option value="全部">全部</option>
                {Array.from(new Set(records.map((r) => r.category))).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleExport}
              disabled={records.length === 0}
              className="flex items-center gap-1.5 text-sm border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className="ri-download-2-line" />导出 CSV
            </button>
          </div>
        </div>

        {/* 分类统计卡片 */}
        {categoryStats.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categoryStats.map((s) => (
              <div key={s.category} className="bg-white rounded-xl border border-slate-100 p-4">
                <p className="text-xs text-slate-400 mb-1">{s.category}</p>
                <p className="text-2xl font-bold text-slate-800">{s.count}</p>
                <p className="text-xs text-slate-400 mt-0.5">次点餐</p>
              </div>
            ))}
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-400 mb-1">总计</p>
              <p className="text-2xl font-bold text-emerald-600">{records.length}</p>
              <p className="text-xs text-slate-400 mt-0.5">次点餐</p>
            </div>
          </div>
        )}

        {/* 当日各菜品累计 */}
        {dishCountMap.size > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              {dateFilter} 当日菜品累计
            </h3>
            <div className="flex flex-wrap gap-2">
              {Array.from(dishCountMap.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm"
                  >
                    <span className="font-medium">{name}</span>
                    <span className="bg-emerald-200 text-emerald-800 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                      {count}
                    </span>
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* 记录列表 */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <i className="ri-loader-4-line animate-spin text-xl mr-2" />
              <span className="text-sm">加载中...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <i className="ri-error-warning-line text-3xl mb-2 text-red-400" />
              <p className="text-sm mb-3">{error}</p>
              <button
                type="button"
                onClick={fetchRecords}
                className="text-sm border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                重试
              </button>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <i className="ri-inbox-2-line text-3xl mb-2" />
              <p className="text-sm">该日期暂无点餐记录</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 w-12">序号</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">菜品名称</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">分类</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">点餐时间</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">设备</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map((r, idx) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-2.5 text-slate-800 font-medium">{r.dish_name}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                          {r.category}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">
                        {new Date(r.created_at).toLocaleString('zh-CN', { hour12: false })}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{r.device_info}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}