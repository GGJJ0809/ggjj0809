import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { todayBeijing } from '@/lib/dateUtils';
import { getLocalServerPort } from '@/lib/localServer';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

interface TrayDevice {
  station_id: number;
  station_name: string;
  station_code: string;
  dish_name: string;
  category: string;
  tare_weight: number;
  hw_last_weight: number | null;
  hw_last_seen: string | null;
  device_id: number;
  device_name: string;
  sn: string;
  hw_key: string;
  device_type: string | null;
}

interface TestResult {
  ok: boolean;
  status: number;
  data: any;
  error?: string;
  time: string;
}

interface PickupLog {
  id: number;
  station_code: string;
  dish_name: string;
  category: string;
  meal_type: string;
  pickup_time: string;
  weight_before: number;
  weight_after: number;
  pickup_weight: number;
  source: string;
}

export default function ScaleTestPanel() {
  const [devices, setDevices] = useState<TrayDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [weight, setWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [logs, setLogs] = useState<PickupLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchDevices = async () => {
    setLoading(true);
    let mapped: TrayDevice[] = [];

    // Electron 环境下优先从本地 SQLite 读取
    if (isElectron()) {
      try {
        const port = getLocalServerPort() || 8081;
        const res = await fetch(`http://localhost:${port}/api/public/tray-devices`);
        if (res.ok) {
          const json = await res.json();
          if (json.code === 0 && Array.isArray(json.data)) {
            mapped = json.data.map((d: any) => ({
              station_id: d.station_id,
              station_name: d.station_name,
              station_code: d.station_code,
              dish_name: d.dish_name,
              category: d.category,
              tare_weight: d.tare_weight || 0,
              hw_last_weight: d.hw_last_weight,
              hw_last_seen: d.hw_last_seen,
              device_id: d.device_id,
              device_name: d.device_name,
              sn: d.sn,
              hw_key: d.hw_key,
              device_type: d.device_type,
            }));
            console.log('[ScaleTestPanel] 从本地 SQLite 读取', mapped.length, '个设备');
          }
        }
      } catch (e: any) {
        console.log('[ScaleTestPanel] 本地 API 读取设备失败:', e.message);
      }
    }

    // 本地没有数据，再 fallback 到 Supabase
    if (mapped.length === 0) {
      const { data } = await supabase
        .from('tray_display_devices')
        .select('id, name, sn, hw_key, device_type, station_id, tray_stations!inner(*)')
        .not('station_id', 'is', null);

      if (data) {
        mapped = data.map((d: any) => ({
          station_id: d.tray_stations.id,
          station_name: d.tray_stations.name,
          station_code: d.tray_stations.station_code,
          dish_name: d.tray_stations.dish_name,
          category: d.tray_stations.category,
          tare_weight: d.tray_stations.tare_weight || 0,
          hw_last_weight: d.tray_stations.hw_last_weight,
          hw_last_seen: d.tray_stations.hw_last_seen,
          device_id: d.id,
          device_name: d.name,
          sn: d.sn,
          hw_key: d.hw_key,
          device_type: d.device_type,
        }));
      }
    }

    setDevices(mapped);
    if (mapped.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(mapped[0].device_id);
    }
    setLoading(false);
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    const today = todayBeijing();
    let allLogs: PickupLog[] = [];

    // Electron 环境下优先从本地 SQLite 读取
    if (isElectron()) {
      try {
        const port = getLocalServerPort() || 8081;
        const res = await fetch(`http://localhost:${port}/api/public/tray-pickup-logs?date=${today}`);
        if (res.ok) {
          const json = await res.json();
          if (json.code === 0 && Array.isArray(json.data)) {
            allLogs = json.data
              .filter((item: any) => item.source === 'auto' || item.source === 'scale')
              .map((item: any) => ({
                id: item.id,
                station_code: item.station_code || '',
                dish_name: item.dish_name || '',
                category: item.category || '',
                meal_type: item.meal_type || '',
                pickup_time: item.pickup_time || '',
                weight_before: Number(item.weight_before) || 0,
                weight_after: Number(item.weight_after) || 0,
                pickup_weight: Number(item.pickup_weight) || 0,
                source: item.source || 'auto',
              }));
            console.log('[ScaleTestPanel] 从本地 SQLite 读取', allLogs.length, '条取餐记录');
          }
        }
      } catch (e: any) {
        console.log('[ScaleTestPanel] 本地 API 读取取餐记录失败:', e.message);
      }
    }

    // 本地没有数据，再 fallback 到 Supabase
    if (allLogs.length === 0) {
      const { data } = await supabase
        .from('tray_pickup_logs')
        .select('*')
        .gte('pickup_time', `${today}T00:00:00`)
        .lte('pickup_time', `${today}T23:59:59`)
        .eq('source', 'auto')
        .order('pickup_time', { ascending: false })
        .limit(20);
      allLogs = data || [];
    }

    setLogs(allLogs);
    setLogsLoading(false);
  };

  useEffect(() => {
    fetchDevices();
    fetchLogs();
  }, []);

  const selectedDevice = devices.find((d) => d.device_id === selectedDeviceId);

  const handleSend = async () => {
    if (!selectedDevice) return;
    const w = Number(weight);
    if (isNaN(w) || w < 0) {
      alert('请输入有效的重量');
      return;
    }

    setSubmitting(true);
    let url = '';

    // Electron 环境下直接走本地 API
    if (isElectron()) {
      const port = getLocalServerPort() || 8081;
      url = `http://localhost:${port}/api/weight/report`;
    } else {
      const baseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
      try {
        const u = new URL(baseUrl);
        url = `${u.protocol}//${u.host}/functions/v1/scale-weight-api/api/weight/report`;
      } catch {
        setResults((prev) => [
          {
            ok: false,
            status: 0,
            data: null,
            error: 'Supabase URL 配置错误',
            time: new Date().toLocaleTimeString(),
          },
          ...prev,
        ]);
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sn: selectedDevice.sn,
          key: selectedDevice.hw_key,
          weight: w,
          // 测试面板手动上报标记为 manual，区别真实设备自动上报
          source: 'manual',
        }),
      });

      const json = await res.json();
      const result: TestResult = {
        ok: res.ok && json.code === 200,
        status: res.status,
        data: json.data || json,
        error: json.code !== 200 ? json.message : undefined,
        time: new Date().toLocaleTimeString(),
      };
      setResults((prev) => [result, ...prev].slice(0, 10));

      if (result.ok) {
        await fetchDevices();
        await fetchLogs();
      }
    } catch (err: any) {
      setResults((prev) => [
        {
          ok: false,
          status: 0,
          data: null,
          error: err.message || '请求失败',
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoSequence = async () => {
    if (!selectedDevice) return;
    const lastWeight = selectedDevice.hw_last_weight || 0;
    const steps = [lastWeight - 120, lastWeight - 280, lastWeight - 450, lastWeight - 600];
    const validSteps = steps.filter((w) => w > selectedDevice.tare_weight + 50);
    if (validSteps.length === 0) {
      alert('当前重量已接近皮重，无法继续模拟取餐');
      return;
    }
    for (const w of validSteps) {
      setWeight(String(Math.round(w)));
      await handleSend();
      await new Promise((r) => setTimeout(r, 800));
    }
  };

  const handleReset = async () => {
    if (!selectedDevice) return;
    const fullWeight = selectedDevice.tare_weight + 2000;
    setWeight(String(Math.round(fullWeight)));
    await handleSend();
  };

  return (
    <div className="space-y-5">
      {/* Test control panel */}
      <div className="bg-white rounded-xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">称重上报模拟</h3>
            <p className="text-xs text-slate-400 mt-0.5">模拟电子称重设备上报重量，验证自动取餐记录生成</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchDevices}
              className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line" />刷新设备
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Device selector */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">选择托盘 / 设备</label>
            <select
              value={selectedDeviceId ?? ''}
              onChange={(e) => setSelectedDeviceId(Number(e.target.value))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-slate-400 cursor-pointer"
            >
              {loading ? (
                <option>加载中...</option>
              ) : devices.length === 0 ? (
                <option>无可用设备</option>
              ) : (
                devices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.station_name} ({d.dish_name}) — {d.sn}
                  </option>
                ))
              )}
            </select>
            {selectedDevice && (
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                <p>
                  <span className="text-slate-400">托盘编码：</span>
                  {selectedDevice.station_code}
                </p>
                <p>
                  <span className="text-slate-400">皮重：</span>
                  {selectedDevice.tare_weight}g
                </p>
                <p>
                  <span className="text-slate-400">上次重量：</span>
                  {selectedDevice.hw_last_weight !== null ? `${selectedDevice.hw_last_weight}g` : '无'}
                </p>
                <p>
                  <span className="text-slate-400">上次上报：</span>
                  {selectedDevice.hw_last_seen
                    ? new Date(selectedDevice.hw_last_seen).toLocaleString()
                    : '无'}
                </p>
                <p className="font-mono text-slate-400 mt-1">
                  SN: {selectedDevice.sn} / Key: {selectedDevice.hw_key.slice(0, 8)}...
                </p>
              </div>
            )}
          </div>

          {/* Weight input */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">当前重量 (g)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="输入当前重量"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-slate-400"
              />
              <span className="text-xs text-slate-400">g</span>
            </div>
            {selectedDevice && (
              <div className="mt-2 text-xs text-slate-400">
                <p>
                  若输入重量 &lt; 上次重量 - 50g，系统将自动产生一条取餐记录
                </p>
                <p className="mt-0.5">
                  净重 = {Number(weight) > 0 ? Math.max(0, Number(weight) - selectedDevice.tare_weight) : 0}g
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={submitting || !selectedDevice || !weight}
              className="flex items-center justify-center gap-2 text-sm bg-slate-900 text-white px-4 py-2.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <i className="ri-send-plane-line" />
              )}
              发送上报
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={submitting || !selectedDevice}
                className="flex-1 text-xs text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <i className="ri-restart-line mr-1" />
                重置满量
              </button>
              <button
                type="button"
                onClick={handleAutoSequence}
                disabled={submitting || !selectedDevice}
                className="flex-1 text-xs text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <i className="ri-magic-line mr-1" />
                自动模拟
              </button>
            </div>
          </div>
        </div>

        {/* Quick weights */}
        {selectedDevice && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-slate-400">快捷重量：</span>
            {[
              selectedDevice.tare_weight + 50,
              selectedDevice.tare_weight + 500,
              selectedDevice.tare_weight + 1000,
              selectedDevice.tare_weight + 1500,
              selectedDevice.tare_weight + 2000,
            ].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeight(String(w))}
                className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded hover:bg-slate-200 cursor-pointer whitespace-nowrap"
              >
                {w}g
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">上报结果</h3>
          <div className="space-y-2">
            {results.map((r, idx) => (
              <div
                key={idx}
                className={`rounded-lg border px-4 py-3 text-sm ${
                  r.ok
                    ? 'bg-emerald-50 border-emerald-100'
                    : 'bg-red-50 border-red-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-medium ${r.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {r.ok ? '✓ 上报成功' : '✗ 上报失败'}
                  </span>
                  <span className="text-xs text-slate-400">{r.time}</span>
                </div>
                {r.ok && r.data && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400">产生记录:</span>{' '}
                      <span className={r.data.log_created ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
                        {r.data.log_created ? '是' : '否'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">取餐重量:</span>{' '}
                      {r.data.pickup_weight ? `${r.data.pickup_weight}g` : '—'}
                    </div>
                    <div>
                      <span className="text-slate-400">当前重量:</span>{' '}
                      {r.data.current_weight}g
                    </div>
                    <div>
                      <span className="text-slate-400">净重:</span>{' '}
                      {r.data.net_weight}g
                    </div>
                  </div>
                )}
                {r.error && (
                  <p className="text-xs text-red-600 mt-1">{r.error}</p>
                )}
                {!r.ok && r.data && (
                  <pre className="text-xs text-slate-500 mt-1 overflow-auto max-h-24">
                    {JSON.stringify(r.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs table */}
      <div className="bg-white rounded-xl border border-slate-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">今日自动取餐记录</h3>
            <p className="text-xs text-slate-400 mt-0.5">由称重设备自动上报生成的记录</p>
          </div>
          <button
            type="button"
            onClick={fetchLogs}
            className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line" />刷新
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50">
                {['时间', '托盘', '菜品', '餐段', '取餐前', '取餐后', '取餐量', '来源'].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logsLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                    暂无自动取餐记录
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(log.pickup_time).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {log.station_code}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {log.dish_name}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                        {log.meal_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{log.weight_before}g</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{Math.max(0, log.weight_before - log.pickup_weight)}g</td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-600 whitespace-nowrap">
                      {log.pickup_weight}g
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs">
                        {log.source === 'auto' ? '自动' : log.source}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}