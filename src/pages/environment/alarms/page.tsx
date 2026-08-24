import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';
import { syncUpdate, syncInsert } from '@/lib/dbSync';
import { nowBeijing } from '@/lib/dateUtils';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

interface AlarmEvent {
  id: number;
  alarm_code: string;
  occurred_at: string;
  alarm_type: string;
  level: string;
  sensor_id: string | null;
  zone: string | null;
  message: string;
  status: string;
  operator: string | null;
  source: string | null;
  raw_value: number | null;
}

const levelConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  high: { label: '高', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  medium: { label: '中', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400' },
  low: { label: '低', bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-300' },
};

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  unconfirmed: { label: '待确认', bg: 'bg-red-50', text: 'text-red-600' },
  confirmed: { label: '已确认', bg: 'bg-amber-50', text: 'text-amber-600' },
  resolved: { label: '已解决', bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

const statusTabs = ['全部', '待确认', '已确认', '已解决'];
const levelTabs = ['全部', '高', '中', '低'];
const statusMap: Record<string, string> = { '待确认': 'unconfirmed', '已确认': 'confirmed', '已解决': 'resolved' };
const levelMap: Record<string, string> = { '高': 'high', '中': 'medium', '低': 'low' };

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-');
}

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('全部');
  const [levelTab, setLevelTab] = useState('全部');
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchAlarms = useCallback(async () => {
    const { data, error } = await supabase
      .from('alarm_events')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(200);
    if (!error && data) {
      setAlarms(data as AlarmEvent[]);
    }
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchAlarms();
    const channel = supabase
      .channel('alarm_events_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alarm_events' }, () => {
        fetchAlarms();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAlarms]);

  const handleConfirm = async (id: number) => {
    const updateData = { status: 'confirmed', updated_at: nowBeijing() };
    await supabase.from('alarm_events').update(updateData).eq('id', id);
    if (!isElectron()) {
      await syncUpdate('alarm_events', updateData, id);
    }
    setAlarms((prev) => prev.map((a) => a.id === id ? { ...a, status: 'confirmed' } : a));
  };

  const handleResolve = async (id: number) => {
    const updateData = { status: 'resolved', updated_at: nowBeijing() };
    await supabase.from('alarm_events').update(updateData).eq('id', id);
    if (!isElectron()) {
      await syncUpdate('alarm_events', updateData, id);
    }
    setAlarms((prev) => prev.map((a) => a.id === id ? { ...a, status: 'resolved' } : a));
  };

  const filtered = alarms.filter((a) => {
    const matchStatus = statusTab === '全部' || a.status === statusMap[statusTab];
    const matchLevel = levelTab === '全部' || a.level === levelMap[levelTab];
    const matchSearch = !search ||
      a.message.includes(search) ||
      (a.zone ?? '').includes(search) ||
      a.alarm_type.includes(search) ||
      (a.sensor_id ?? '').includes(search);
    return matchStatus && matchLevel && matchSearch;
  });

  const unconfirmedCount = alarms.filter((a) => a.status === 'unconfirmed').length;
  const smokeAlarmCount = alarms.filter((a) => a.alarm_type === '烟感报警' && a.status === 'unconfirmed').length;

  return (
    <AppLayout title="报警管理" breadcrumb={['环境监测', '报警管理']}>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: '待确认报警', value: alarms.filter((a) => a.status === 'unconfirmed').length, color: 'text-red-600', bg: 'bg-red-50', icon: 'ri-error-warning-line' },
          { label: '今日报警总数', value: alarms.length, color: 'text-slate-700', bg: 'bg-slate-100', icon: 'ri-alarm-warning-line' },
          { label: '已解决', value: alarms.filter((a) => a.status === 'resolved').length, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'ri-checkbox-circle-line' },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${item.bg}`}>
              <i className={`${item.icon} ${item.color} text-xl`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{item.value}</p>
              <p className="text-xs text-slate-500">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 烟感紧急报警提示横幅 */}
      {smokeAlarmCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-red-100 flex-shrink-0">
            <i className="ri-fire-fill text-red-600 text-base animate-pulse" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-red-700 font-bold">
              烟感传感器紧急报警！{smokeAlarmCount} 个区域检测到烟雾，请立即处理！
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              烟感报警由传感器自动触发，可能涉及火灾风险，请优先确认处理
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setStatusTab('待确认'); setLevelTab('高'); }}
            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 cursor-pointer whitespace-nowrap flex-shrink-0"
          >
            查看详情
          </button>
        </div>
      )}

      {unconfirmedCount > 0 && smokeAlarmCount === 0 && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <i className="ri-alarm-warning-fill text-amber-500 text-lg animate-pulse" />
          <p className="text-sm text-amber-700 font-medium">当前有 <strong>{unconfirmedCount}</strong> 条报警待确认处理，请及时响应！</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 px-5 py-4 border-b border-slate-50">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">状态：</span>
            {statusTabs.map((tab) => (
              <button key={tab} type="button" onClick={() => setStatusTab(tab)}
                className={`text-xs px-2.5 py-1 rounded-full cursor-pointer whitespace-nowrap transition-colors ${statusTab === tab ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">级别：</span>
            {levelTabs.map((tab) => (
              <button key={tab} type="button" onClick={() => setLevelTab(tab)}
                className={`text-xs px-2.5 py-1 rounded-full cursor-pointer whitespace-nowrap transition-colors ${levelTab === tab ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <i className="ri-refresh-line" />
              <span>刷新于 {lastRefresh.toLocaleTimeString('zh-CN')}</span>
            </div>
            <button
              type="button"
              onClick={fetchAlarms}
              className="text-xs border border-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              <i className="ri-refresh-line" />手动刷新
            </button>
            <div className="relative">
              <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
              <input type="text" placeholder="搜索报警内容..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="text-sm pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 w-48" />
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <i className="ri-loader-4-line animate-spin text-2xl mr-2" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  {['报警编号', '报警时间', '类型', '级别', '传感器', '区域', '报警内容', '来源', '状态', '操作'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((alarm) => {
                  const lvl = levelConfig[alarm.level] ?? levelConfig.low;
                  const sts = statusConfig[alarm.status] ?? statusConfig.unconfirmed;
                  const isSmoke = alarm.alarm_type === '烟感报警';
                  return (
                    <tr key={alarm.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${
                      alarm.status === 'unconfirmed' && isSmoke ? 'bg-red-50/40' :
                      alarm.status === 'unconfirmed' ? 'bg-amber-50/20' : ''
                    }`}>
                      <td className="px-4 py-3 text-xs font-mono text-slate-400">{alarm.alarm_code}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatTime(alarm.occurred_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`flex items-center gap-1 text-xs ${isSmoke ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                          {isSmoke && <i className="ri-fire-fill text-red-500" />}
                          {alarm.alarm_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${lvl.bg} ${lvl.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${lvl.dot}`} />{lvl.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-400">{alarm.sensor_id ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{alarm.zone ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-700 max-w-xs">{alarm.message}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          alarm.source === 'sensor'
                            ? 'bg-orange-50 text-orange-600'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {alarm.source === 'sensor' ? '传感器' : '手动'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sts.bg} ${sts.text}`}>{sts.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {alarm.status === 'unconfirmed' && (
                            <button type="button" onClick={() => handleConfirm(alarm.id)}
                              className="text-xs bg-amber-500 text-white px-2 py-1 rounded hover:bg-amber-600 cursor-pointer whitespace-nowrap">
                              确认
                            </button>
                          )}
                          {alarm.status === 'confirmed' && (
                            <button type="button" onClick={() => handleResolve(alarm.id)}
                              className="text-xs bg-emerald-500 text-white px-2 py-1 rounded hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                              解决
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <i className="ri-checkbox-circle-line text-3xl mb-2 block text-emerald-300" />
            <p className="text-sm">暂无符合条件的报警记录</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}