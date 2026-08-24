import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/feature/AppLayout';
import { nowBeijing } from '@/lib/dateUtils';
import ZoneCard from './components/ZoneCard';
import { useEnvironment } from './hooks/useEnvironment';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const metricItems = [
  { key: 'pm25', label: 'PM2.5', unit: 'μg/m³', icon: 'ri-haze-2-line', color: '#ef4444', thresholdKey: 'pm25' },
  { key: 'pm10', label: 'PM10', unit: 'μg/m³', icon: 'ri-cloud-windy-line', color: '#f59e0b', thresholdKey: 'pm10' },
  { key: 'temp', label: '温度', unit: '℃', icon: 'ri-temp-hot-line', color: '#10b981', thresholdKey: 'temp' },
  { key: 'humidity', label: '湿度', unit: '%', icon: 'ri-drop-line', color: '#06b6d4', thresholdKey: 'humidity' },
  { key: 'co2', label: 'CO₂', unit: 'ppm', icon: 'ri-leaf-line', color: '#8b5cf6', thresholdKey: 'co2' },
];

function safeDateTime(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function safeDateFull(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN').replace(/\//g, '-');
}

export default function AirQualityPage() {
  const { zones, history, loading, error, fetchHistory, insertReading, thresholds, zoneNameMap, updateZoneNameMap, getZoneDisplayName } = useEnvironment();
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [activeMetric, setActiveMetric] = useState('pm25');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [testZone, setTestZone] = useState<string>('');
  const [editingNames, setEditingNames] = useState(false);
  const [draftNameMap, setDraftNameMap] = useState<Record<string, string>>();

  useEffect(() => {
    if (zones.length > 0 && !selectedZone) {
      setSelectedZone(zones[0].zone);
    }
  }, [zones, selectedZone]);

  useEffect(() => {
    if (testZone === '' && zones.length > 0) {
      setTestZone(zones[0].zone);
    }
  }, [zones, testZone]);

  useEffect(() => {
    if (selectedZone) fetchHistory(selectedZone);
  }, [selectedZone, fetchHistory]);

  useEffect(() => {
    const t = setInterval(() => setLastRefresh(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const zone = zones.find((z) => z.zone === selectedZone) ?? zones[0] ?? null;
  const metric = metricItems.find((m) => m.key === activeMetric);
  const threshold = metric ? thresholds[metric.thresholdKey as keyof typeof thresholds] : 0;

  const warningZones = zones.filter((z) => z.status === 'warning' || z.status === 'danger');

  const chartData = history.map((r) => ({
    time: safeDateTime(r.recorded_at),
    pm25: r.pm25 ?? 0,
    pm10: r.pm10 ?? 0,
    temp: r.temp ?? 0,
    humidity: r.humidity ?? 0,
    co2: r.co2 ?? 0,
  }));

  const handleExport = () => {
    if (!zone) return;
    const rows = [
      ['时间', 'PM2.5', 'PM10', '温度', '湿度', 'CO2'],
      ...history.map((r) => [
        safeDateFull(r.recorded_at),
        r.pm25 ?? '', r.pm10 ?? '', r.temp ?? '', r.humidity ?? '', r.co2 ?? '',
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `环境数据_${getZoneDisplayName(zone.zone)}_${new Date().toLocaleDateString('zh-CN')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTestInsert = async () => {
    const targetZone = testZone.trim() || '操作间';
    await insertReading({
      zone: targetZone,
      sensor_id: 'TEST',
      pm25: Math.round(Math.random() * 80),
      pm10: Math.round(Math.random() * 100),
      temp: Math.round((20 + Math.random() * 15) * 10) / 10,
      humidity: Math.round(50 + Math.random() * 40),
      co2: Math.round(400 + Math.random() * 800),
      recorded_at: nowBeijing(),
      source: 'manual',
    });
    // 如果目标区域刚好是当前选中区域，刷新历史
    if (selectedZone === targetZone) {
      fetchHistory(targetZone);
    }
  };

  const startEditingNames = () => {
    setDraftNameMap({ ...zoneNameMap });
    setEditingNames(true);
  };

  const saveNames = () => {
    updateZoneNameMap(draftNameMap);
    setEditingNames(false);
  };

  const cancelEditingNames = () => {
    setEditingNames(false);
    setDraftNameMap({});
  };

  const updateDraftName = (rawZone: string, name: string) => {
    setDraftNameMap((prev) => ({ ...prev, [rawZone]: name }));
  };

  const removeAlias = (rawZone: string) => {
    setDraftNameMap((prev) => {
      const next = { ...prev };
      delete next[rawZone];
      return next;
    });
  };

  return (
    <AppLayout title="空气质量监测" breadcrumb={['环境监测', '空气质量监测']}>
      {error && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <i className="ri-error-warning-fill text-red-500 text-lg" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">数据加载失败</p>
            <p className="text-xs text-red-600 mt-0.5">{error}，请检查网络或数据库连接</p>
          </div>
        </div>
      )}

      {warningZones.length > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <i className="ri-alarm-warning-fill text-red-500 text-lg" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">空气质量预警</p>
            <p className="text-xs text-red-600 mt-0.5">
              {warningZones.map((z) => getZoneDisplayName(z.zone)).join('、')} 区域空气质量指标超出安全阈值
            </p>
          </div>
          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />实时告警
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Zone cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">区域概览</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 更新
              </span>
              {loading && <i className="ri-loader-4-line animate-spin text-slate-400 text-sm" />}
              <button
                type="button"
                onClick={editingNames ? cancelEditingNames : startEditingNames}
                className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                title={editingNames ? '取消编辑' : '编辑区域显示名称'}
              >
                <i className={editingNames ? 'ri-close-line' : 'ri-edit-line'} />
                {editingNames ? '取消' : '编辑名称'}
              </button>
            </div>
          </div>

          {/* 区域名称编辑面板 */}
          {editingNames && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">区域名称别名</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveNames}
                    className="flex items-center gap-1 text-xs bg-emerald-500 text-white px-2.5 py-1 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-save-line" />保存
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditingNames}
                    className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-2.5 py-1 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-close-line" />取消
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                为传感器原始 ID 设置中文显示名称，仅在当前设备生效。
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {zones.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">暂无区域数据</p>
                ) : (
                  zones.map((z) => (
                    <div key={z.zone} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-mono w-24 truncate flex-shrink-0" title={z.zone}>
                        {z.zone}
                      </span>
                      <i className="ri-arrow-right-line text-xs text-slate-300 flex-shrink-0" />
                      <input
                        type="text"
                        value={draftNameMap[z.zone] ?? zoneNameMap[z.zone] ?? ''}
                        onChange={(e) => updateDraftName(z.zone, e.target.value)}
                        placeholder="输入中文名称，如：操作间"
                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-emerald-400 outline-none bg-white"
                      />
                      {(draftNameMap[z.zone] ?? zoneNameMap[z.zone]) && (
                        <button
                          type="button"
                          onClick={() => removeAlias(z.zone)}
                          className="text-xs text-slate-400 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer flex-shrink-0"
                          title="清除别名"
                        >
                          <i className="ri-delete-bin-line" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {loading && zones.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <i className="ri-loader-4-line animate-spin text-2xl mr-2" />
              <span className="text-sm">加载数据...</span>
            </div>
          ) : zones.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-white rounded-xl border border-slate-100">
              <i className="ri-bar-chart-grouped-line text-3xl mb-2" />
              <p className="text-sm">暂无监测区域数据</p>
              <p className="text-xs mt-1 text-center px-4">传感器已在线但尚未配置区域映射，请前往传感器管理页配置区域绑定</p>
              <Link to="/environment/sensors" className="mt-3 text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                去配置传感器
              </Link>
            </div>
          ) : (
            zones.map((z) => (
              <ZoneCard
                key={z.zone}
                zone={getZoneDisplayName(z.zone)}
                pm25={z.pm25}
                pm10={z.pm10}
                temp={z.temp}
                humidity={z.humidity}
                status={z.status}
                isSelected={selectedZone === z.zone}
                onClick={() => setSelectedZone(z.zone)}
              />
            ))
          )}
        </div>

        {/* Right: Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {zone ? (
            <>
              <div className="bg-white rounded-xl border border-slate-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">{getZoneDisplayName(zone.zone)} — 实时监测数据</h3>
                    <p className="text-xs text-slate-400 mt-0.5">数据每30秒自动刷新 · 来源: 数据库</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={zones.some((z) => z.zone === testZone) ? testZone : '__custom__'}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setTestZone('');
                          } else {
                            setTestZone(e.target.value);
                          }
                        }}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-slate-400"
                      >
                        {zones.map((z) => (
                          <option key={z.zone} value={z.zone}>{getZoneDisplayName(z.zone)}</option>
                        ))}
                        <option value="__custom__">+ 手动输入区域</option>
                      </select>
                      {!zones.some((z) => z.zone === testZone) && (
                        <input
                          type="text"
                          placeholder="输入区域名称"
                          value={testZone}
                          onChange={(e) => setTestZone(e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-36 focus:outline-none focus:border-slate-400"
                        />
                      )}
                      <button
                        type="button"
                        onClick={handleTestInsert}
                        className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                        title="模拟传感器推送一条数据（测试用）"
                      >
                        <i className="ri-pulse-line" />模拟推送
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleExport}
                      className="flex items-center gap-1.5 text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-download-line" />导出数据
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {metricItems.map((m) => {
                    const value = zone[m.key as keyof typeof zone] as number;
                    const thresh = thresholds[m.thresholdKey as keyof typeof thresholds];
                    const isOver = value > thresh;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setActiveMetric(m.key)}
                        className={`p-3 rounded-xl border-2 text-left cursor-pointer transition-all ${
                          activeMetric === m.key ? 'border-slate-800 bg-slate-50' : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <i className={`${m.icon} text-base`} style={{ color: m.color }} />
                          <span className="text-xs text-slate-500">{m.label}</span>
                          {isOver && <span className="text-xs text-red-500 font-bold">!</span>}
                        </div>
                        <p className="text-xl font-bold" style={{ color: isOver ? '#ef4444' : '#1e293b' }}>
                          {value}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{m.unit}</p>
                        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min((value / (thresh * 1.5)) * 100, 100)}%`,
                              backgroundColor: isOver ? '#ef4444' : m.color,
                            }}
                          />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">阈值 {thresh}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* History chart */}
              <div className="bg-white rounded-xl border border-slate-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">历史趋势 — {metric?.label}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">今日数据 · {chartData.length} 条记录</p>
                  </div>
                </div>
                {chartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                    <i className="ri-bar-chart-line text-3xl mb-2" />
                    <p className="text-sm">暂无今日历史数据</p>
                    <p className="text-xs mt-1">点击「模拟推送」可测试数据写入</p>
                  </div>
                ) : (
                  <div className="w-full" style={{ minHeight: 200 }}>
                    <ResponsiveContainer width="100%" height={200} minWidth={300} minHeight={200}>
                      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }} />
                        <ReferenceLine
                          y={threshold}
                          stroke="#ef4444"
                          strokeDasharray="4 2"
                          label={{ value: `阈值 ${threshold}`, fill: '#ef4444', fontSize: 10, position: 'right' }}
                        />
                        <Line type="monotone" dataKey={metric?.key} stroke={metric?.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} name={metric?.label} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Sensor integration tip */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 flex-shrink-0">
                    <i className="ri-sensor-line text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-700">传感器对接说明</p>
                    <p className="text-xs text-slate-500 mt-1">
                      前往「传感器管理」配置 HTTP 接口，填写设备地址并启用自动轮询，数据将自动采集并显示在本页面。支持温湿度、空气质量、烟感等多种传感器。
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link to="/environment/sensors" className="text-xs bg-emerald-500 text-white px-3 py-1 rounded-full hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                        去配置传感器 <i className="ri-arrow-right-line" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-slate-100 text-slate-400">
              <i className="ri-bar-chart-grouped-line text-3xl mb-2" />
              <p className="text-sm">暂无监测区域数据</p>
              <p className="text-xs mt-1">请先配置传感器或导入环境数据</p>
              <Link to="/environment/sensors" className="mt-3 text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                去配置传感器
              </Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}