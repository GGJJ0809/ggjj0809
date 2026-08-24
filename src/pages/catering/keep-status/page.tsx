import { useState } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { useKeepDashboard, type DoorInfo } from '@/pages/catering/samples/hooks/useKeepDashboard';
import DoorCard from '@/pages/catering/samples/components/DoorCard';
import TempChart from '@/pages/catering/samples/components/TempChart';

const mealLabels: Record<string, string> = { '早餐': '早餐', '午餐': '午餐', '晚餐': '晚餐' };
const mealTimesLabel: Record<number, string> = { 0: '早餐', 1: '午餐', 2: '晚餐' };

function resolvePhotoUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/keep-uploads/')) return `http://localhost:${(typeof window !== 'undefined' && (window as any)._localServerPort) || 8081}${url}`;
  return url;
}

export default function KeepStatusPage() {
  const { data, loading, error, refresh } = useKeepDashboard();
  const [selectedDoor, setSelectedDoor] = useState<DoorInfo | null>(null);
  const [mealFilter, setMealFilter] = useState<number | null>(null);

  const device = data?.device;
  const doors = data?.doors ?? [];
  const mealSummary = data?.mealSummary ?? {};
  const menuCounts = data?.menuCounts ?? { breakfast: 0, lunch: 0, dinner: 0 };
  const latestTemp = data?.latestTemp ?? null;
  const tempHistory = data?.tempHistory ?? [];

  const filteredDoors = mealFilter === null
    ? doors
    : doors.filter((d) => d.state === 0 || d.mealTimes === mealFilter);

  const usedCount = doors.filter((d) => d.state === 1).length;
  const emptyCount = doors.filter((d) => d.state === 0).length;
  const expiredCount = doors.filter((d) => d.state === 1 && d.isExpired).length;

  // Capacity data per meal
  const mealCapacity = [
    { key: '早餐', mealTimes: 0, menuCount: menuCounts.breakfast },
    { key: '午餐', mealTimes: 1, menuCount: menuCounts.lunch },
    { key: '晚餐', mealTimes: 2, menuCount: menuCounts.dinner },
  ].map((m) => {
    const summary = mealSummary[m.key];
    const kept = summary?.kept ?? 0;
    const total = m.menuCount || summary?.total || 0;
    return { ...m, kept, total };
  });

  const now = new Date();
  const todayStr = `${now.getMonth() + 1}月${now.getDate()}日`;

  return (
    <AppLayout title="留样柜实时状态" breadcrumb={['餐饮管理', '留样柜实时状态']}>
      {/* Header bar */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${device?.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-foreground-300'}`} />
          <span className="text-sm font-medium text-foreground-700">
            智能留样终端 · {device?.model || 'MS-LYG-40OEZJ'}
            <span className={`ml-2 text-xs font-normal ${device?.status === 'online' ? 'text-emerald-500' : 'text-foreground-400'}`}>
              {device?.status === 'online' ? '在线' : '离线'}
            </span>
          </span>
          {device?.lastHeartbeat && (
            <span className="text-xs text-foreground-400">
              最后心跳: {new Date(device.lastHeartbeat).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refresh}
            className="flex items-center gap-1 text-xs border border-background-200 px-3 py-1.5 rounded-lg hover:bg-background-100 cursor-pointer whitespace-nowrap transition-colors">
            <i className="ri-refresh-line" />刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-3">
          <i className="ri-error-warning-fill text-red-500" />
          <div className="flex-1">
            <p className="text-sm text-red-600">无法连接本地服务: {error}</p>
            <p className="text-xs text-red-400">请确保应用正在运行</p>
          </div>
          <button type="button" onClick={refresh}
            className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2 py-1 rounded cursor-pointer whitespace-nowrap">
            重试
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400 mr-3" />
          <span className="text-sm text-foreground-400">加载中...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: cabinet overview + door grid */}
          <div className="lg:col-span-2 space-y-4">
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: '总槽位', value: device?.cabinetCount ?? 12, color: 'text-foreground-700', bg: 'bg-background-100' },
                { label: '已留样', value: usedCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: '空闲', value: emptyCount, color: 'text-foreground-500', bg: 'bg-background-100' },
                { label: '已过期', value: expiredCount, color: 'text-red-500', bg: 'bg-red-50' },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl border border-background-200 p-3 text-center`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-foreground-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Meal capacity */}
            <div className="bg-background-50 rounded-xl border border-background-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground-800">今日留样容量 · {todayStr}</h3>
                <div className="flex items-center gap-1.5">
                  {[null, 0, 1, 2].map((m) => (
                    <button
                      key={String(m)}
                      type="button"
                      onClick={() => setMealFilter(m)}
                      className={`text-xs px-2.5 py-1 rounded-full cursor-pointer whitespace-nowrap transition-colors ${mealFilter === m ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200'}`}
                    >
                      {m === null ? '全部' : mealTimesLabel[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {mealCapacity.map((m) => (
                  <div key={m.key} className="bg-background-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-foreground-700">{m.key}</span>
                      <span className="text-xs text-foreground-500">
                        {m.kept}/{m.total > 0 ? m.total : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-background-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary-500 transition-all"
                        style={{ width: m.total > 0 ? `${Math.min(100, Math.round((m.kept / m.total) * 100))}%` : '0%' }}
                      />
                    </div>
                    {m.total > 0 && (
                      <p className="text-[10px] text-foreground-400 mt-1">
                        {m.kept >= m.total ? '留样完成' : `还需留样 ${m.total - m.kept} 道`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Door grid */}
            <div className="bg-background-50 rounded-xl border border-background-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground-800">柜门状态</h3>
                <div className="flex items-center gap-3 text-xs text-foreground-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm border-2 border-emerald-300 bg-emerald-50 inline-block" />已留样
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm border-2 border-red-300 bg-red-50 inline-block" />已过期
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm border-2 border-background-200 bg-background-100 inline-block" />空闲
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {filteredDoors.map((door) => (
                  <DoorCard key={door.num} door={door} onClick={() => setSelectedDoor(door)} />
                ))}
              </div>
            </div>
          </div>

          {/* Right: temperature + usage */}
          <div className="space-y-4">
            {/* Latest temp */}
            <div className="bg-background-50 rounded-xl border border-background-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                <h3 className="text-sm font-semibold text-foreground-800">实时温度</h3>
              </div>
              {latestTemp ? (
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <span className={`text-4xl font-bold ${(latestTemp.temperature ?? 0) > 8 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {latestTemp.temperature != null ? latestTemp.temperature.toFixed(1) : '--'}
                    </span>
                    <span className="text-foreground-500 text-lg mb-1">°C</span>
                    {(latestTemp.temperature ?? 0) > 8 && (
                      <span className="text-xs text-red-500 mb-1 flex items-center gap-0.5">
                        <i className="ri-alert-line" />超温告警
                      </span>
                    )}
                  </div>
                  {latestTemp.humidity != null && (
                    <div className="flex items-center gap-2 text-sm">
                      <i className="ri-drop-line text-primary-400" />
                      <span className="text-foreground-600">湿度: {latestTemp.humidity.toFixed(1)}%</span>
                    </div>
                  )}
                  <div className="text-xs text-foreground-400">
                    更新时间: {new Date(latestTemp.recordedAt).toLocaleTimeString('zh-CN')}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {[
                      { label: '正常范围', value: '0~8°C', ok: true },
                      { label: '当前状态', value: (latestTemp.temperature ?? 0) > 8 ? '超温' : '正常', ok: (latestTemp.temperature ?? 0) <= 8 },
                    ].map((s) => (
                      <div key={s.label} className={`rounded-lg px-2.5 py-2 text-center ${s.ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <p className={`text-xs font-semibold ${s.ok ? 'text-emerald-600' : 'text-red-500'}`}>{s.value}</p>
                        <p className="text-[10px] text-foreground-400">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-foreground-400">
                  <i className="ri-temp-hot-line text-3xl mb-2 block" />
                  <p className="text-xs">暂无温度数据</p>
                  <p className="text-[10px] text-foreground-300 mt-1">等待设备上报温度</p>
                </div>
              )}
            </div>

            {/* Temp chart */}
            <TempChart history={tempHistory} latest={latestTemp} />

            {/* Usage situation */}
            <div className="bg-background-50 rounded-xl border border-background-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-primary-400 inline-block" />
                <h3 className="text-sm font-semibold text-foreground-800">使用情况</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5 text-xs text-foreground-600">
                    <span>当前温度 {latestTemp?.temperature != null ? `${latestTemp.temperature.toFixed(1)}摄氏度` : '--'}</span>
                    <span className="text-foreground-400">{latestTemp?.temperature != null ? `${Math.min(100, Math.round(((latestTemp.temperature) / 12) * 100))}%` : ''}</span>
                  </div>
                  <div className="h-2 rounded-full bg-background-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(latestTemp?.temperature ?? 0) > 8 ? 'bg-red-400' : 'bg-emerald-400'}`}
                      style={{ width: latestTemp?.temperature != null ? `${Math.min(100, Math.round(((latestTemp.temperature) / 12) * 100))}%` : '0%' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5 text-xs text-foreground-600">
                    <span>留样槽位 {usedCount} 个</span>
                    <span className="text-foreground-400">{device?.cabinetCount ? `${Math.round((usedCount / device.cabinetCount) * 100)}%` : ''}</span>
                  </div>
                  <div className="h-2 rounded-full bg-background-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: device?.cabinetCount ? `${Math.min(100, Math.round((usedCount / device.cabinetCount) * 100))}%` : '0%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Door detail modal */}
      {selectedDoor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-background-50 rounded-2xl w-full max-w-sm p-6 border border-background-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground-800">{selectedDoor.num}号柜门</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  selectedDoor.state === 0 ? 'bg-background-100 text-foreground-400' :
                  selectedDoor.isExpired ? 'bg-red-50 text-red-500' :
                  'bg-emerald-50 text-emerald-600'
                }`}>
                  {selectedDoor.state === 0 ? '空闲' : selectedDoor.isExpired ? '已过期' : '留样中'}
                </span>
              </div>
              <button type="button" onClick={() => setSelectedDoor(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-background-100 cursor-pointer">
                <i className="ri-close-line text-foreground-500" />
              </button>
            </div>
            {selectedDoor.state === 0 ? (
              <div className="text-center py-8 text-foreground-400">
                <i className="ri-inbox-line text-4xl block mb-2" />
                <p className="text-sm">该柜门当前为空</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {selectedDoor.photoUrl && (
                  <div className="rounded-xl overflow-hidden w-full h-40">
                    <img
                      src={resolvePhotoUrl(selectedDoor.photoUrl)}
                      alt={selectedDoor.cookName}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                {[
                  { label: '菜品', value: selectedDoor.cookName },
                  { label: '餐次', value: `${selectedDoor.date} ${selectedDoor.meal}` },
                  { label: '操作人', value: selectedDoor.operator || '—' },
                  { label: '留样时长', value: `${selectedDoor.hoursKept} 小时 / 48 小时` },
                  { label: '状态',
                    value: selectedDoor.isExpired
                      ? `已过期 +${selectedDoor.hoursExpired}小时`
                      : `留样中，剩余 ${Math.max(0, 48 - selectedDoor.hoursKept)} 小时` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-1.5 border-b border-background-100">
                    <span className="text-xs text-foreground-400 w-16">{label}</span>
                    <span className={`text-sm text-right ${label === '状态' && selectedDoor.isExpired ? 'text-red-500' : 'text-foreground-700'}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setSelectedDoor(null)}
              className="mt-4 w-full text-sm border border-background-200 rounded-xl py-2 text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap">
              关闭
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}