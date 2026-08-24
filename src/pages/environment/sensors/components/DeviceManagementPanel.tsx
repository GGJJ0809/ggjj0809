import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getDeviceTypeByModel } from '@/lib/deviceHelpers';
import AddDeviceModal from '@/pages/system/devices/components/AddDeviceModal';

interface Device {
  id: number;
  device_model: string | null;
  device_name: string;
  device_number: string;
  device_sn: string;
  zone: string | null;
  cafeteria_name: string | null;
  location: string | null;
  maintenance_cycle: string | null;
  socket_meter_id: number | null;
  gateway_sn: string | null;
  gateway_ip: string | null;
  communication_address: number | null;
  temp_low_threshold: number | null;
  temp_high_threshold: number | null;
  humidity_low_threshold: number | null;
  humidity_high_threshold: number | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface DeviceReading {
  device_sn: string;
  temp: number | null;
  humidity: number | null;
  recorded_at: string | null;
  source?: string;
}

interface PollingStatus {
  running: boolean;
  lastPoll: string;
  lastError: string;
  successCount: number;
  failCount: number;
  deviceCount: number;
}

const DEVICE_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  temp_humidity: { label: '温湿度传感器', icon: 'ri-temp-hot-line', color: 'text-sky-600', bg: 'bg-sky-50' },
  smoke: { label: '烟感传感器', icon: 'ri-fire-line', color: 'text-orange-600', bg: 'bg-orange-50' },
  air_quality: { label: '空气质量传感器', icon: 'ri-haze-2-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function DeviceManagementPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Record<string, DeviceReading>>({});
  const [pollStatus, setPollStatus] = useState<PollingStatus>({
    running: false, lastPoll: '', lastError: '', successCount: 0, failCount: 0, deviceCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [pollLoading, setPollLoading] = useState(false);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: qErr } = await supabase
        .from('devices')
        .select('*')
        .order('created_at', { ascending: false });
      if (qErr) throw new Error(qErr.message);
      setDevices((data || []) as Device[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReadings = useCallback(async () => {
    try {
      const origin = window.location.origin;
      const res = await fetch(`${origin}/api/modbus/latest-readings`);
      const json = await res.json();
      if (json.code === 0) {
        const map: Record<string, DeviceReading> = {};
        (json.data || []).forEach((r: DeviceReading) => { map[r.device_sn] = r; });
        setReadings(map);
      }
    } catch {
      // 静默失败
    }
  }, []);

  const fetchPollStatus = useCallback(async () => {
    try {
      const origin = window.location.origin;
      const res = await fetch(`${origin}/api/modbus/poll/status`);
      const json = await res.json();
      if (json.code === 0) setPollStatus(json.data as PollingStatus);
    } catch {
      // 静默失败
    }
  }, []);

  const handleStartPolling = async () => {
    setPollLoading(true);
    try {
      const origin = window.location.origin;
      const res = await fetch(`${origin}/api/modbus/poll/start?interval=30`);
      const json = await res.json();
      if (json.code === 0) {
        showToast('success', 'Modbus 轮询已启动（30秒/次）');
        fetchPollStatus();
      }
    } catch {
      showToast('error', '轮询启动失败');
    } finally {
      setPollLoading(false);
    }
  };

  const handleStopPolling = async () => {
    setPollLoading(true);
    try {
      const origin = window.location.origin;
      const res = await fetch(`${origin}/api/modbus/poll/stop`);
      const json = await res.json();
      if (json.code === 0) {
        showToast('success', 'Modbus 轮询已停止');
        fetchPollStatus();
      }
    } catch {
      showToast('error', '轮询停止失败');
    } finally {
      setPollLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchPollStatus();
  }, [fetchDevices, fetchPollStatus]);

  // 定期刷新读数和轮询状态
  useEffect(() => {
    fetchReadings();
    const t = setInterval(() => {
      fetchReadings();
      fetchPollStatus();
    }, 10000);
    return () => clearInterval(t);
  }, [fetchReadings, fetchPollStatus]);

  const filtered = typeFilter === 'all'
    ? devices
    : devices.filter((d) => getDeviceTypeByModel(d.device_model) === typeFilter);

  const handleAdd = () => {
    setEditingDevice(null);
    setShowAddModal(true);
  };

  const handleEdit = (device: Device) => {
    setEditingDevice(device);
    setShowAddModal(true);
  };

  const handleDelete = async (device: Device) => {
    if (!window.confirm(`确定要删除设备「${device.device_name}」吗？`)) return;
    try {
      const { error: dErr } = await supabase
        .from('devices')
        .delete()
        .eq('id', device.id);
      if (dErr) throw new Error(dErr.message);
      showToast('success', '设备已删除');
      fetchDevices();
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleSave = async () => {
    setShowAddModal(false);
    setEditingDevice(null);
    await fetchDevices();
    showToast('success', editingDevice ? '设备已更新' : '设备已新增');
  };

  const thCount = devices.filter((d) => getDeviceTypeByModel(d.device_model) === 'temp_humidity').length;
  const smokeCount = devices.filter((d) => getDeviceTypeByModel(d.device_model) === 'smoke').length;
  const aqCount = devices.filter((d) => getDeviceTypeByModel(d.device_model) === 'air_quality').length;
  const onlineCount = devices.filter((d) => d.status === 'online').length;

  // 有 gateway_ip 或 gateway_sn (IP格式) 配置的设备
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const gwDevices = devices.filter((d) => {
    if (d.gateway_ip && d.gateway_ip.trim()) return true;
    if (d.gateway_sn && ipPattern.test(d.gateway_sn.trim())) return true;
    return false;
  });

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm border shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'
        }`}>
          <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
          {toast.msg}
        </div>
      )}

      {/* Modbus 轮询控制栏 */}
      {gwDevices.length > 0 && (
        <div className="mb-4 bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${pollStatus.running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            <div>
              <span className="text-sm font-semibold text-slate-800">
                {pollStatus.running ? 'Modbus 轮询运行中' : 'Modbus 轮询已停止'}
              </span>
              {pollStatus.lastPoll && (
                <span className="text-xs text-slate-400 ml-2">
                  上次轮询: {formatTime(pollStatus.lastPoll)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="bg-slate-50 px-2 py-0.5 rounded">网关设备: {gwDevices.length}</span>
            {pollStatus.running && (
              <>
                <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded">成功: {pollStatus.successCount}</span>
                {pollStatus.failCount > 0 && (
                  <span className="bg-red-50 text-red-500 px-2 py-0.5 rounded">失败: {pollStatus.failCount}</span>
                )}
              </>
            )}
            {pollStatus.lastError && (
              <span className="text-red-500 truncate max-w-[200px]" title={pollStatus.lastError}>{pollStatus.lastError}</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {pollStatus.running ? (
              <button
                type="button"
                onClick={handleStopPolling}
                disabled={pollLoading}
                className="flex items-center gap-1.5 text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <i className="ri-stop-line" />
                {pollLoading ? '停止中...' : '停止轮询'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartPolling}
                disabled={pollLoading}
                className="flex items-center gap-1.5 text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <i className="ri-play-line" />
                {pollLoading ? '启动中...' : '启动轮询'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 未配置网关提示 */}
      {gwDevices.length === 0 && devices.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
          <i className="ri-information-line text-amber-500 text-lg flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700">设备未配置网关IP地址</p>
            <p className="text-xs text-amber-600 mt-1">
              请在编辑设备时填写「网关IP地址」字段（如 192.168.2.151），轮询引擎按此 IP 通过 Modbus TCP 连接网关并自动读取传感器数据。
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: '设备总数', value: devices.length, icon: 'ri-hard-drive-line', color: 'text-slate-600', bg: 'bg-slate-50' },
          { label: '温湿度传感器', value: thCount, icon: 'ri-temp-hot-line', color: 'text-sky-600', bg: 'bg-sky-50' },
          { label: '烟感传感器', value: smokeCount, icon: 'ri-fire-line', color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: '在线设备', value: onlineCount, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${item.bg}`}>
              <i className={`${item.icon} ${item.color} text-lg`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{item.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {([
            ['all', '全部'],
            ['temp_humidity', '温湿度'],
            ['smoke', '烟感'],
            ['air_quality', '空气质量'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                typeFilter === key
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {key === 'temp_humidity' && <i className="ri-temp-hot-line" />}
              {key === 'smoke' && <i className="ri-fire-line" />}
              {key === 'air_quality' && <i className="ri-haze-2-line" />}
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchDevices}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1.5 text-xs bg-sky-500 text-white px-3 py-1.5 rounded-lg hover:bg-sky-600 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />新增设备
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <i className="ri-error-warning-fill text-red-500 text-lg" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">数据加载失败</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchDevices}
            className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200 cursor-pointer whitespace-nowrap"
          >
            重试
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && devices.length === 0 && !error && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <i className="ri-loader-4-line animate-spin text-2xl mr-2" />
          <span className="text-sm">加载设备列表...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && devices.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-16 text-slate-400">
          <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-slate-50 mb-4">
            <i className="ri-hard-drive-line text-3xl" />
          </div>
          <p className="text-sm font-medium text-slate-500">暂无 RS485/Modbus 设备</p>
          <p className="text-xs mt-1 mb-4">点击「新增设备」通过 RS485 通讯地址添加传感器</p>
          <button
            type="button"
            onClick={handleAdd}
            className="text-sm bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600 cursor-pointer whitespace-nowrap"
          >
            新增设备
          </button>
        </div>
      )}

      {/* Device table */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">设备名称</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">设备型号</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">设备编号</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">网关IP</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">网关SN</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">通信地址</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">温度</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">湿度</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">状态</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">更新时间</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((device) => {
                  const dt = getDeviceTypeByModel(device.device_model);
                  const tc = DEVICE_TYPE_CONFIG[dt];
                  const reading = readings[device.device_sn];
                  // 在线判断：DB status=online 或 5分钟内有 MQTT/Modbus 读数均视为在线
                  const hasRecentReading = (() => {
                    if (!reading?.recorded_at) return false;
                    const diff = Date.now() - new Date(reading.recorded_at).getTime();
                    return diff < 5 * 60 * 1000;
                  })();
                  const isOnline = device.status === 'online' || hasRecentReading;
                  const hasAlarm = device.temp_low_threshold != null || device.temp_high_threshold != null;
                  let tempAlarm = false;
                  let humAlarm = false;
                  if (reading) {
                    if (reading.temp != null) {
                      if (device.temp_low_threshold != null && reading.temp < device.temp_low_threshold) tempAlarm = true;
                      if (device.temp_high_threshold != null && reading.temp > device.temp_high_threshold) tempAlarm = true;
                    }
                    if (reading.humidity != null) {
                      if (device.humidity_low_threshold != null && reading.humidity < device.humidity_low_threshold) humAlarm = true;
                      if (device.humidity_high_threshold != null && reading.humidity > device.humidity_high_threshold) humAlarm = true;
                    }
                  }
                  return (
                    <tr key={device.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${tc ? tc.bg : 'bg-slate-50'} flex-shrink-0`}>
                            <i className={`${tc ? tc.icon : 'ri-sensor-line'} ${tc ? tc.color : 'text-slate-400'} text-sm`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{device.device_name}</p>
                            <p className="text-xs text-slate-400">{tc ? tc.label : dt}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                        {device.device_model || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                        {device.device_number}
                      </td>
                      <td className="px-4 py-3">
                        {device.gateway_ip ? (
                          <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {device.gateway_ip}
                          </span>
                        ) : (
                          <span className="text-xs text-red-400 flex items-center gap-1">
                            <i className="ri-error-warning-line text-[10px]" />未填
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                        {device.gateway_sn || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600">
                        {device.communication_address !== null ? device.communication_address : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {reading?.temp != null ? (
                          <span className={`text-xs font-semibold font-mono ${
                            tempAlarm ? 'text-red-600' : 'text-sky-600'
                          }`}>
                            {reading.temp.toFixed(1)}°C
                            {tempAlarm && <i className="ri-alert-line text-red-500 ml-1 text-[10px]" title="超出阈值范围" />}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {reading?.humidity != null ? (
                          <span className={`text-xs font-semibold font-mono ${
                            humAlarm ? 'text-red-600' : 'text-sky-600'
                          }`}>
                            {reading.humidity.toFixed(1)}%
                            {humAlarm && <i className="ri-alert-line text-red-500 ml-1 text-[10px]" title="超出阈值范围" />}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                            isOnline
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
                            {isOnline ? '在线' : '离线'}
                          </span>
                          {reading?.source && (
                            <span className="text-[10px] text-slate-400 pl-1">
                              {reading.source === 'mqtt' ? 'MQTT推送' : 'Modbus轮询'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {formatDateTime(device.updated_at || device.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(device)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                            title="编辑设备"
                          >
                            <i className="ri-edit-line text-sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(device)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                            title="删除设备"
                          >
                            <i className="ri-delete-bin-line text-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer info */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-50 bg-slate-50/30">
            <p className="text-xs text-slate-400">共 {filtered.length} 台设备</p>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />在线
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />离线
              </span>
              {filtered.some((d) => d.temp_low_threshold != null || d.temp_high_threshold != null || d.humidity_low_threshold != null || d.humidity_high_threshold != null) && (
                <span className="flex items-center gap-1 text-red-400">
                  <i className="ri-alert-line" />阈值告警
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filtered empty */}
      {!loading && !error && devices.length > 0 && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-12 text-slate-400">
          <i className="ri-filter-3-line text-3xl mb-2" />
          <p className="text-sm">当前筛选条件下暂无设备</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <AddDeviceModal
          device={editingDevice}
          onSave={handleSave}
          onClose={() => { setShowAddModal(false); setEditingDevice(null); }}
        />
      )}
    </div>
  );
}