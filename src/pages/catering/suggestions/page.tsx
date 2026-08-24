import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { todayBeijing, dateToBeijing } from '@/lib/dateUtils';

interface Suggestion {
  id: number;
  content: string;
  created_at: string;
}

function formatDate(d: Date): string {
  return dateToBeijing(d);
}

function getApiBase() {
  try {
    const stored = localStorage.getItem('lan_server_base');
    if (stored) return stored.replace(/\/+$/, '');
  } catch { /* ignore */ }
  return window.location.origin;
}

async function lanGet(path: string) {
  const res = await fetch(getApiBase() + path);
  if (!res.ok) throw new Error(`LAN API ${path} 返回 ${res.status}`);
  return res.json();
}

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(todayBeijing());
  const [searchText, setSearchText] = useState('');

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await lanGet('/api/public/suggestions');
      if (result.code === 0) {
        setSuggestions((result.data || []) as Suggestion[]);
      } else {
        throw new Error(result.msg || '加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  // 按日期过滤和搜索过滤
  const filtered = suggestions.filter((s) => {
    const sDate = s.created_at?.slice(0, 10) || '';
    if (dateFilter && sDate !== dateFilter) return false;
    if (searchText && !s.content.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const handleExport = () => {
    if (filtered.length === 0) return;
    const header = '\uFEFF序号,建议内容,提交时间\n';
    const rows = filtered
      .map(
        (s, idx) =>
          `${idx + 1},"${s.content.replace(/"/g, '""')}","${(s.created_at || '').replace(/"/g, '""')}"`
      )
      .join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `用户建议_${dateFilter}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="用户建议" breadcrumb={['餐饮管理', '用户建议']}>
      <div className="space-y-4">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-400 mb-1">全部建议</p>
            <p className="text-2xl font-bold text-slate-800">{suggestions.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">条</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-400 mb-1">今日新增</p>
            <p className="text-2xl font-bold text-emerald-600">
              {suggestions.filter((s) => s.created_at?.slice(0, 10) === todayBeijing()).length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">条</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-400 mb-1">筛选结果</p>
            <p className="text-2xl font-bold text-slate-800">{filtered.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">条</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-400 mb-1">总字数</p>
            <p className="text-2xl font-bold text-slate-800">
              {suggestions.reduce((sum, s) => sum + (s.content?.length || 0), 0)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">字</p>
          </div>
        </div>

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
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer whitespace-nowrap"
            >
              清除日期
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <i className="ri-search-line text-slate-400 text-sm" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索建议内容..."
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:border-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 text-sm border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className="ri-download-2-line" />导出 CSV
            </button>
          </div>
        </div>

        {/* 建议列表 */}
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
                onClick={fetchSuggestions}
                className="text-sm border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                重试
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <i className="ri-lightbulb-line text-3xl mb-2" />
              <p className="text-sm">
                {suggestions.length === 0 ? '暂无用户建议' : '没有匹配的建议记录'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 w-14">序号</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">建议内容</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 w-44">提交时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-400 text-xs align-top">{idx + 1}</td>
                      <td className="px-4 py-3 text-slate-700 leading-relaxed align-top">
                        {s.content}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap align-top">
                        {s.created_at
                          ? new Date(s.created_at).toLocaleString('zh-CN', { hour12: false })
                          : '-'}
                      </td>
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