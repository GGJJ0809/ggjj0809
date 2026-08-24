import { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { useSensorHttpConfig, syncSensorsToGateway, loadSensorGateway } from '@/hooks/useSensorHttpConfig';
import type { SensorHttpDevice, SensorType } from '@/hooks/useSensorHttpConfig';
import SensorHttpConfigModal from './components/SensorHttpConfigModal';
import SensorPullPanel from './components/SensorPullPanel';
import GatewayConfigCard from './components/GatewayConfigCard';
import SensorZoneBindings from './components/SensorZoneBindings';

const TYPE_CONFIG: Record<SensorType, { label: string; icon: string; color: string; bg: string; border: string }> = {
  temp_humidity: { label: '温湿度', icon: 'ri-temp-hot-line', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' },
  smoke: { label: '烟感', icon: 'ri-fire-line', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  air_quality: { label: '空气质量', icon: 'ri-haze-2-line', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

const STATUS_CONFIG = {
  ok: { dot: 'bg-emerald-400', text: 'text-emerald-600', bg: 'bg-emerald-50', label: '正常' },
  error: { dot: 'bg-red-400', text: 'text-red-600', bg: 'bg-red-50', label: '异常' },
  idle: { dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50', label: '待配置' },
};

const ZONE_COLORS: Record<string, string> = {
  '面点加工间': 'bg-amber-50 text-amber-700',
  '冷菜加工间': 'bg-cyan-50 text-cyan-700',
  '操作间': 'bg-violet-50 text-violet-700',
  '蔬菜加工间': 'bg-emerald-50 text-emerald-700',
  '肉类加工间': 'bg-red-50 text-red-700',
  '主食库房': 'bg-orange-50 text-orange-700',
  '管理办公室': 'bg-slate-100 text-slate-600',
};

export default function SensorsPage() {
  const { devices, addDevice, updateDevice, removeDevice, loadPresets } = useSensorHttpConfig();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<SensorHttpDevice | null>(null);
  const [addSensorType, setAddSensorType] = useState<SensorType>('temp_humidity');
  const [showPullPanel, setShowPullPanel] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | SensorType>('all');
  const [presetMsg, setPresetMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const filtered = typeFilter === 'all' ? devices : devices.filter((d) => d.sensorType === typeFilter);

  const thCount = devices.filter((d) => d.sensorType === 'temp_humidity').length;
  const smokeCount = devices.filter((d) => d.sensorType === 'smoke').length;
  const aqCount = devices.filter((d) => d.sensorType === 'air_quality').length;
  const enabledCount = devices.filter((d) => d.enabled).length;

  const handleSyncToGateway = useCallback(async () => {
    const cfg = loadSensorGateway();
    const sn = cfg?.gatewaySn?.trim() || '';
    const key = cfg?.gatewayKey?.trim() || '';
    if (!sn) {
      setSyncResult('请先在上方「传感器网关配置」卡片中填写网关 SN');
      setTimeout(() => setSyncResult(''), 3000);
      return;
    }
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await syncSensorsToGateway(sn, key, devices);
      if (res.ok) {
        setSyncResult(`已同步 ${res.count} 个传感器到网关 ${sn}`);
      } else {
        setSyncResult(`同步失败：${res.msg}`);
      }
    } catch {
      setSyncResult('同步失败：网络错误');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(''), 4000);
    }
  }, [devices]);

  // 传感器配置变更时自动同步到后端
  const devicesRef = { current: devices.length };
  useEffect(() => {
    const cfg = loadSensorGateway();
    const sn = cfg?.gatewaySn?.trim() || '';
    const key = cfg?.gatewayKey?.trim() || '';
    if (sn && devices.length > 0 && devices.length !== devicesRef.current) {
      devicesRef.current = devices.length;
      const timer = setTimeout(() => {
        syncSensorsToGateway(sn, key, devices).then((res) => {
          if (res.ok) console.log(`[SensorsPage] 自动同步完成: ${res.count} 个`);
        }).catch(() => {});
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [devices]);

  const handleLoadPresets = () => {
    const cfg = loadSensorGateway();
    const mid = cfg?.merchantId || '{merchantId}';
    const gsn = cfg?.gatewaySn || '{gatewaySn}';
    const added = loadPresets();
    if (added === 0) {
      setPresetMsg('所有预置传感器已存在，无需重复添加');
    } else {
      setPresetMsg(`已成功添加 ${added} 个传感器，填写网关 SN + KEY + 商户号后同步即可。系统自动监听 Topic: back-device-iot-sensor/${mid}/${gsn}`);
    }
    setTimeout(() => setPresetMsg(''), 4000);
  };

  const handleSave = (form: Omit<SensorHttpDevice, 'id'>) => {
    if (editingDevice) {
      updateDevice(editingDevice.id, form);
    } else {
      addDevice(form);
    }
    setShowConfigModal(false);
    setEditingDevice(null);
  };

  const handleEdit = (d: SensorHttpDevice) => {
    setEditingDevice(d);
    setShowConfigModal(true);
  };

  const handleAdd = (type: SensorType) => {
    setAddSensorType(type);
    setEditingDevice(null);
    setShowConfigModal(true);
  };

  const zoneGroups = filtered.reduce<Record<string, SensorHttpDevice[]>>((acc, d) => {
    if (!acc[d.zone]) acc[d.zone] = [];
    acc[d.zone].push(d);
    return acc;
  }, {});

  return (
    <AppLayout title="传感器管理" breadcrumb={['环境监测', '传感器管理']}>

      {/* 传感器网关配置卡片 */}
      <GatewayConfigCard />

      {/* 传感器区域绑定配置 */}
      <SensorZoneBindings />

      {presetMsg && (
        <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <i className="ri-checkbox-circle-line text-emerald-500" />
          {presetMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: '温湿度传感器', value: thCount, icon: 'ri-temp-hot-line', color: 'text-sky-600', bg: 'bg-sky-50', total: 7 },
          { label: '烟感传感器', value: smokeCount, icon: 'ri-fire-line', color: 'text-orange-600', bg: 'bg-orange-50', total: 3 },
          { label: '空气质量传感器', value: aqCount, icon: 'ri-haze-2-line', color: 'text-emerald-600', bg: 'bg-emerald-50', total: 1 },
          { label: '已启用', value: enabledCount, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50', total: null },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${item.bg}`}>
              <i className={`${item.icon} ${item.color} text-lg`} />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-bold text-slate-800">{item.value}</p>
                {item.total !== null && (
                  <p className="text-xs text-slate-400">/ {item.total}</p>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick start banner — only show if no devices */}
      {devices.length === 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-emerald-50 border border-amber-100 rounded-2xl p-6 mb-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-white border border-amber-100 flex-shrink-0">
              <i className="ri-magic-line text-amber-600 text-xl" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-800">一键导入传感器配置</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                已预置 <strong>7 个温湿度传感器</strong>、<strong>3 个烟感传感器</strong>和 <strong>1 个空气质量传感器</strong>，
                系统统一监听 Topic: back-device-iot-sensor/{'{'}merchantId{'}'}/{'{'}gatewaySn{'}'}，按 deviceSn 自动匹配。
                导入后填写网关 SN + KEY + 商户号并同步即可接收数据。
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleLoadPresets}
                  className="flex items-center gap-2 text-sm bg-amber-500 text-white px-4 py-2.5 rounded-xl hover:bg-amber-600 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-magic-line" />
                  一键导入全部传感器（11 个）
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {syncResult && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${syncResult.includes('失败') ? 'bg-red-50 border border-red-100 text-red-700' : 'bg-emerald-50 border border-emerald-100 text-emerald-700'}`}>
          <i className={syncResult.includes('失败') ? 'ri-error-warning-line text-red-500' : 'ri-checkbox-circle-line text-emerald-500'} />
          {syncResult}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {([
          ['all', '全部', devices.length],
          ['temp_humidity', '温湿度', thCount],
          ['smoke', '烟感', smokeCount],
          ['air_quality', '空气质量', aqCount],
        ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                typeFilter === key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {key === 'temp_humidity' && <i className="ri-temp-hot-line" />}
              {key === 'smoke' && <i className="ri-fire-line" />}
              {key === 'air_quality' && <i className="ri-haze-2-line" />}
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${typeFilter === key ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSyncToGateway}
            disabled={syncing || !loadSensorGateway()?.gatewaySn?.trim()}
            className="flex items-center gap-1.5 text-xs border border-amber-200 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className={`${syncing ? 'ri-loader-4-line animate-spin' : 'ri-upload-cloud-2-line'}`} />
            {syncing ? '同步中...' : '同步到网关'}
          </button>
          {devices.length > 0 && (
            <button
              type="button"
              onClick={handleLoadPresets}
              className="flex items-center gap-1.5 text-xs border border-amber-200 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-magic-line" />导入预设
            </button>
          )}
          {devices.length > 0 && (
            <button
              type="button"
              onClick={() => enabledCount > 0 ? setShowPullPanel(true) : null}
              disabled={enabledCount === 0}
              title={enabledCount === 0 ? '请先启用传感器' : '查看 MQTT 实时推送数据'}
              className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
                enabledCount > 0
                  ? 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                  : 'border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed'
              }`}
            >
              <i className="ri-signal-tower-line" />MQTT 监控
              {enabledCount === 0 && <span className="text-[10px] text-slate-400 ml-0.5">(未启用)</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleAdd('temp_humidity')}
            className="flex items-center gap-1.5 text-xs border border-sky-200 text-sky-600 bg-sky-50 px-3 py-1.5 rounded-lg hover:bg-sky-100 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />添加温湿度
          </button>
          <button
            type="button"
            onClick={() => handleAdd('air_quality')}
            className="flex items-center gap-1.5 text-xs border border-emerald-200 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />添加空气质量
          </button>
          <button
            type="button"
            onClick={() => handleAdd('smoke')}
            className="flex items-center gap-1.5 text-xs border border-orange-200 text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />添加烟感
          </button>
        </div>
      </div>

      {/* Device grid grouped by zone */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-16 text-slate-400">
          <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-slate-100 mb-4">
            <i className="ri-sensor-line text-3xl" />
          </div>
          <p className="text-sm font-medium text-slate-500">暂无传感器</p>
          <p className="text-xs mt-1">点击上方「一键导入全部传感器」快速配置所有传感器</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(zoneGroups).map(([zone, zoneDevices]) => (
            <div key={zone} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-50 bg-slate-50/60">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ZONE_COLORS[zone] ?? 'bg-slate-100 text-slate-600'}`}>
                  {zone}
                </span>
                <span className="text-xs text-slate-400">{zoneDevices.length} 个传感器</span>
                {zoneDevices.some((d) => d.sensorType === 'smoke') && (
                  <span className="flex items-center gap-1 text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                    <i className="ri-fire-line text-xs" />含烟感
                  </span>
                )}
                {zoneDevices.some((d) => d.sensorType === 'air_quality') && (
                  <span className="flex items-center gap-1 text-xs text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    <i className="ri-haze-2-line text-xs" />含空气质量
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-50">
                {zoneDevices.map((d) => {
                  const tc = TYPE_CONFIG[d.sensorType];
                  const sc = STATUS_CONFIG[d.lastStatus ?? 'idle'];
                  return (
                    <div key={d.id} className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 flex items-center justify-center rounded-xl ${tc.bg} flex-shrink-0`}>
                            <i className={`${tc.icon} ${tc.color} text-base`} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{d.name}</p>
                            <p className="text-xs font-mono text-slate-400 mt-0.5">{d.sensorId}</p>
                          </div>
                        </div>
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <i className="ri-signal-tower-line text-emerald-500 text-xs flex-shrink-0" />
                          <span className="text-xs font-mono text-emerald-700 truncate">
                            back-device-iot-sensor/{(loadSensorGateway()?.merchantId) || '{merchantId}'}/{(loadSensorGateway()?.gatewaySn) || '{gatewaySn}'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${tc.bg} ${tc.color}`}>
                          <i className={tc.icon} />{tc.label}
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="ri-time-line" />
                          {d.pollInterval}秒/次
                        </span>
                        <span className={`flex items-center gap-1 ml-auto ${d.enabled ? 'text-emerald-500' : 'text-slate-300'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${d.enabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                          {d.enabled ? '已启用' : '未启用'}
                        </span>
                      </div>

                      <div className="flex gap-2 pt-1 border-t border-slate-50">
                        <button
                          type="button"
                          onClick={() => handleEdit(d)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg cursor-pointer whitespace-nowrap transition-colors text-slate-600 border border-slate-200 hover:bg-slate-50"
                        >
                          <i className="ri-edit-line" />
                          编辑配置
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDevice(d.id, { enabled: !d.enabled })}
                          className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
                            d.enabled
                              ? 'text-amber-600 border border-amber-200 bg-amber-50 hover:bg-amber-100'
                              : 'text-slate-500 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {d.enabled ? '停用' : '启用'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDevice(d.id)}
                          className="text-xs text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-delete-bin-line" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {devices.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <i className="ri-signal-tower-line text-emerald-400" />
            <span>网关 Topic: back-device-iot-sensor/{(loadSensorGateway()?.merchantId) || '{merchantId}'}/{(loadSensorGateway()?.gatewaySn) || '{gatewaySn}'} · 系统按 deviceSn 自动识别传感器</span>
          </div>
        </div>
      )}

      {showConfigModal && (
        <SensorHttpConfigModal
          device={editingDevice}
          initialSensorType={addSensorType}
          onSave={handleSave}
          onClose={() => { setShowConfigModal(false); setEditingDevice(null); }}
        />
      )}

      {showPullPanel && (
        <SensorPullPanel
          devices={devices}
          onClose={() => setShowPullPanel(false)}
        />
      )}
    </AppLayout>
  );
}