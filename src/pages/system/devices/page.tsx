import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';
import { getDeviceTypeByModel } from '@/lib/deviceHelpers';
import AddDeviceModal from './components/AddDeviceModal';

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

const DEVICE_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  temp_humidity: { label: '温湿度传感器', icon: 'ri-temp-hot-line', color: 'text-sky-600', bg: 'bg-sky-50' },
  smoke: { label: '烟感传感器', icon: 'ri-fire-line', color: 'text-orange-600', bg: 'bg-orange-50' },
  air_quality: { label: '空气质量传感器', icon: 'ri-haze-2-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
};

const MAINTENANCE_LABELS: Record<string, string> = {
  monthly: '每月',
  quarterly: '每季度',
  semiannual: '每半年',
  annual: '每年',
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

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

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

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

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

  return (
    <AppLayout title="设备管理" breadcrumb={['系统管理', '设备管理']}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm border shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'
        }`}>
          <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
          {toast.msg}
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
          <p className="text-sm font-medium text-slate-500">暂无设备</p>
          <p className="text-xs mt-1 mb-4">点击「新增设备」添加传感器等设备</p>
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
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">设备SN</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">所属区域</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">通信地址</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">状态</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">更新时间</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((device) => {
                  const dt = getDeviceTypeByModel(device.device_model);
                  const tc = DEVICE_TYPE_CONFIG[dt];
                  const isOnline = device.status === 'online';
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
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                        {device.device_sn}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {device.zone || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600">
                        {device.communication_address !== null ? device.communication_address : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          isOnline
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                          {isOnline ? '在线' : '离线'}
                        </span>
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
    </AppLayout>
  );
}