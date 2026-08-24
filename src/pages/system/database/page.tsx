import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { nowBeijing } from '@/lib/dateUtils';

interface TableStat {
  name: string;
  count: number;
}

interface DbInfo {
  path: string;
  size: number;
  modifiedAt: string | null;
}

const TABLE_NAMES = [
  'acceptance_records',
  'environment_readings',
  'sample_records',
  'ai_recognition_events',
  'tray_stations',
  'tray_pickup_logs',
  'alarm_events',
  'product_items',
  'product_categories',
  'order_headers',
  'order_items',
  'suppliers',
  'dish_nutrition',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function DatabasePage() {
  const [stats, setStats] = useState<TableStat[]>([]);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  const api = (window as any).electronAPI;
  const isElectron = !!api?.dbInfo;

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      if (isElectron && api.dbInfo) {
        const info = await api.dbInfo();
        setDbInfo(info);
      }

      const results: TableStat[] = [];
      for (const table of TABLE_NAMES) {
        try {
          const res = await api.dbQuery(`SELECT COUNT(*) as c FROM \`${table}\``, []);
          results.push({ name: table, count: res.data?.[0]?.c ?? 0 });
        } catch {
          results.push({ name: table, count: 0 });
        }
      }
      setStats(results);
    } finally {
      setLoading(false);
    }
  }, [isElectron, api]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleBackup = async () => {
    if (!isElectron) {
      showToast('error', '备份功能仅在桌面端可用');
      return;
    }
    setActionLoading(true);
    try {
      const result = await api.dbBackup();
      if (result.success) {
        setLastBackupAt(nowBeijing());
        showToast('success', `备份成功: ${formatBytes(result.size)}`);
      } else {
        showToast('error', result.message || '备份失败');
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '备份失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!isElectron) {
      showToast('error', '恢复功能仅在桌面端可用');
      return;
    }
    if (!window.confirm('确定要从备份文件恢复数据库吗？当前数据将被覆盖，系统会自动备份当前数据库。恢复后需要重启应用。')) {
      return;
    }
    setActionLoading(true);
    try {
      const result = await api.dbRestore();
      if (result.success) {
        showToast('success', result.message || '恢复成功，请重启应用');
      } else {
        showToast('error', result.message || '恢复失败');
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '恢复失败');
    } finally {
      setActionLoading(false);
    }
  };

  const totalRecords = stats.reduce((sum, s) => sum + s.count, 0);
  const activeTables = stats.filter((s) => s.count > 0).length;

  return (
    <AppLayout title="数据库管理" breadcrumb={['系统管理', '数据库管理']}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            <i className={toast.type === 'success' ? 'ri-checkbox-circle-line text-emerald-500' : 'ri-error-warning-line text-red-500'} />
            {toast.message}
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: '数据库文件',
            value: dbInfo ? formatBytes(dbInfo.size) : '—',
            icon: 'ri-database-2-line',
            color: 'text-slate-700',
            bg: 'bg-slate-100',
          },
          {
            label: '总记录数',
            value: totalRecords.toLocaleString(),
            icon: 'ri-file-list-3-line',
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            label: '活跃数据表',
            value: `${activeTables} / ${TABLE_NAMES.length}`,
            icon: 'ri-table-line',
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: '最后修改',
            value: dbInfo?.modifiedAt
              ? new Date(dbInfo.modifiedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
              : '—',
            icon: 'ri-time-line',
            color: 'text-slate-600',
            bg: 'bg-slate-100',
          },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-100 p-5 flex items-center gap-3">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${card.bg}`}>
              <i className={`${card.icon} ${card.color} text-xl`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table Stats */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">数据表统计</h3>
              <p className="text-xs text-slate-400 mt-0.5">各业务模块数据记录数量</p>
            </div>
            <button
              type="button"
              onClick={fetchStats}
              disabled={loading}
              className="text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap flex items-center gap-1 disabled:opacity-50"
            >
              <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">数据表</th>
                  <th className="text-left text-xs font-medium text-slate-400 px-5 py-3">中文名称</th>
                  <th className="text-right text-xs font-medium text-slate-400 px-5 py-3">记录数</th>
                  <th className="text-right text-xs font-medium text-slate-400 px-5 py-3">占比</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const pct = totalRecords > 0 ? (s.count / totalRecords) * 100 : 0;
                  const labelMap: Record<string, string> = {
                    acceptance_records: '食材验收记录',
                    environment_readings: '环境传感器读数',
                    sample_records: '留样管理记录',
                    ai_recognition_events: 'AI识别事件',
                    tray_stations: '取餐托盘站点',
                    tray_pickup_logs: '取餐记录日志',
                    alarm_events: '系统报警事件',
                    product_items: '菜品产品信息',
                    product_categories: '菜品分类',
                    order_headers: '订单主表',
                    order_items: '订单明细',
                    suppliers: '供应商信息',
                    dish_nutrition: '菜品营养成分',
                  };
                  return (
                    <tr key={s.name} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono text-slate-500">{s.name}</td>
                      <td className="px-5 py-3 text-xs text-slate-700">{labelMap[s.name] || s.name}</td>
                      <td className="px-5 py-3 text-xs text-right font-semibold text-slate-800">
                        {s.count.toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-400 rounded-full"
                              style={{ width: `${Math.max(pct, 1)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions Panel */}
        <div className="space-y-4">
          {/* Database Info */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">数据库信息</h3>
            <div className="space-y-3">
              <div className="flex items-start justify-between py-2 border-b border-slate-50">
                <span className="text-xs text-slate-400">存储路径</span>
                <span className="text-xs text-slate-600 text-right max-w-[200px] break-all font-mono">
                  {dbInfo?.path || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <span className="text-xs text-slate-400">文件大小</span>
                <span className="text-xs font-semibold text-slate-700">
                  {dbInfo ? formatBytes(dbInfo.size) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <span className="text-xs text-slate-400">最后备份</span>
                <span className="text-xs text-slate-600">
                  {lastBackupAt
                    ? new Date(lastBackupAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : '未备份'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-slate-400">运行环境</span>
                <span className={`text-xs font-medium ${isElectron ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isElectron ? '本地 SQLite' : '云端 Supabase'}
                </span>
              </div>
            </div>
          </div>

          {/* Backup / Restore */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">备份与恢复</h3>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleBackup}
                disabled={actionLoading || !isElectron}
                className="w-full flex items-center justify-center gap-2 text-sm bg-emerald-500 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-download-cloud-line" />
                {actionLoading ? '处理中...' : '一键备份数据库'}
              </button>

              <button
                type="button"
                onClick={handleRestore}
                disabled={actionLoading || !isElectron}
                className="w-full flex items-center justify-center gap-2 text-sm border border-slate-200 text-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-upload-cloud-line" />
                从备份文件恢复
              </button>

              {!isElectron && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  <i className="ri-information-line mr-1" />
                  当前运行在浏览器环境，备份/恢复功能需在 Electron 桌面端使用
                </p>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">使用提示</h3>
            <ul className="space-y-2 text-xs text-slate-500">
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0" />
                数据库文件位于用户数据目录，重装系统前请备份
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0" />
                恢复操作会自动备份当前数据库，防止误操作
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0" />
                备份文件可直接复制到其他电脑恢复使用
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0" />
                局域网环境下所有数据完全本地存储
              </li>
            </ul>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}