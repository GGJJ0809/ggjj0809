import { useState, useEffect, useCallback } from 'react';
import { getLocalServerUrl } from '@/lib/localServer';
import { loadSensorGateway } from '@/hooks/useSensorHttpConfig';

const ZONES = [
  '面点加工间', '冷菜加工间', '操作间', '蔬菜加工间', '肉类加工间',
  '主食库房', '管理办公室', '后厨区', '就餐大厅', '备餐间', '冷库区', '验收区', '其他',
];

interface SensorBinding {
  id?: number;
  device_sn: string;
  zone: string;
  device_name: string;
  device_type: string;
  enabled: boolean;
}

interface MqttLog {
  sensorId: string;
  time: string;
  msg: string;
}

async function fetchRecentSensors(): Promise<string[]> {
  try {
    const resp = await fetch(getLocalServerUrl('/api/sensor/mqtt-logs?since=0'), {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const logs: MqttLog[] = json.data?.logs || [];
    // 从日志中提取 sensorId（过滤掉网关在线心跳）
    const snSet = new Set<string>();
    logs.forEach((l) => {
      if (l.sensorId && !/^(网关|GW)/.test(l.sensorId) && l.msg && !l.msg.includes('网关在线') && !l.msg.includes('网关心跳')) {
        snSet.add(l.sensorId);
      }
    });
    return Array.from(snSet);
  } catch {
    return [];
  }
}

async function fetchCurrentBindings(gatewaySn: string): Promise<SensorBinding[]> {
  if (!gatewaySn) return [];
  try {
    const resp = await fetch(getLocalServerUrl(`/api/v1/android/back/selectBindDeviceListByGateWaySN`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'machine-sn': gatewaySn },
      body: JSON.stringify({ content: { gatewaySn } }),
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const deviceInfo = json.data?.deviceInfo || {};
    const result: SensorBinding[] = [];
    for (const [dtype, devices] of Object.entries(deviceInfo)) {
      for (const dev of (devices as any[])) {
        result.push({
          device_sn: dev.deviceSn || dev.deviceNo || '',
          zone: dev.areaFullName || '',
          device_name: dev.deviceName || dev.deviceSn || '',
          device_type: dtype,
          enabled: dev.deviceNetworkState === 1,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

async function saveBinding(gatewaySn: string, bindings: SensorBinding[]): Promise<boolean> {
  try {
    const devices = bindings.map((b) => ({
      sensorId: b.device_sn,
      id: b.device_sn,
      name: b.device_name || b.device_sn,
      zone: b.zone,
      sensorType: b.device_type === 'TEMPERATURE_HUMIDITY_SENSOR' ? 'temp_humidity'
        : b.device_type === 'SMOKE_SENSOR' ? 'smoke' : 'temp_humidity',
      protocol: 'mqtt_push',
      enabled: b.enabled,
    }));
    const resp = await fetch(getLocalServerUrl('/api/sensor/sync-bindings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatewaySn, devices }),
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export default function SensorZoneBindings() {
  const [expanded, setExpanded] = useState(false);
  const [bindings, setBindings] = useState<SensorBinding[]>([]);
  const [recentSensors, setRecentSensors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState('');
  const [loading, setLoading] = useState(false);

  const gw = loadSensorGateway();
  const gatewaySn = gw?.gatewaySn?.trim() || '';

  const loadData = useCallback(async () => {
    setLoading(true);
    const [sensors, currentBindings] = await Promise.all([
      fetchRecentSensors(),
      fetchCurrentBindings(gatewaySn),
    ]);
    setRecentSensors(sensors);

    // 合并：已配置的绑定 + MQTT日志中出现的新传感器（未配置的）
    const merged: SensorBinding[] = [...currentBindings];
    for (const sn of sensors) {
      if (!merged.find((b) => b.device_sn === sn)) {
        merged.push({
          device_sn: sn,
          zone: '',
          device_name: sn,
          device_type: 'TEMPERATURE_HUMIDITY_SENSOR',
          enabled: true,
        });
      }
    }
    setBindings(merged);
    setLoading(false);
  }, [gatewaySn]);

  useEffect(() => {
    if (expanded) loadData();
  }, [expanded, loadData]);

  const updateBinding = (index: number, patch: Partial<SensorBinding>) => {
    setBindings((prev) => prev.map((b, i) => i === index ? { ...b, ...patch } : b));
  };

  const addBinding = () => {
    setBindings((prev) => [
      ...prev,
      { device_sn: '', zone: '', device_name: '', device_type: 'TEMPERATURE_HUMIDITY_SENSOR', enabled: true },
    ]);
  };

  const removeBinding = (index: number) => {
    setBindings((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!gatewaySn) {
      setSaveResult('请先在上方配置网关 SN');
      setTimeout(() => setSaveResult(''), 3000);
      return;
    }
    const valid = bindings.filter((b) => b.device_sn.trim() && b.zone.trim());
    if (valid.length === 0) {
      setSaveResult('请至少配置一个传感器SN和区域');
      setTimeout(() => setSaveResult(''), 3000);
      return;
    }
    setSaving(true);
    const ok = await saveBinding(gatewaySn, valid);
    setSaveResult(ok ? `已保存 ${valid.length} 个传感器区域绑定` : '保存失败，请检查服务是否运行');
    setSaving(false);
    setTimeout(() => setSaveResult(''), 4000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-sky-50">
            <i className="ri-map-pin-line text-sky-600 text-base" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">传感器区域绑定</p>
            <p className="text-xs text-slate-400 mt-0.5">
              将 MQTT 推送的 deviceSn 绑定到对应区域，空气质量页面才能正确显示
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bindings.filter((b) => b.zone).length > 0 && (
            <span className="text-xs bg-sky-50 text-sky-600 border border-sky-100 px-2 py-0.5 rounded-full">
              已绑定 {bindings.filter((b) => b.zone).length} 个
            </span>
          )}
          {expanded ? <i className="ri-arrow-up-s-line text-slate-400" /> : <i className="ri-arrow-down-s-line text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-50 pt-4 space-y-4">
          {/* 说明 */}
          <div className="flex items-start gap-3 bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
            <i className="ri-information-line text-sky-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-sky-700 leading-relaxed">
              <p className="font-semibold mb-1">为什么需要配置区域绑定？</p>
              <p>
                传感器网关推送数据时，子传感器用的是硬件 <strong>deviceSn</strong>（如 3000004171），
                而非预设的 sensorId（如 TH_MIANDIAN_01）。
                配置区域绑定后，系统才能把 deviceSn 对应到「面点加工间」等区域名称，
                空气质量页面才能正确分区显示数据。
              </p>
            </div>
          </div>

          {/* 操作栏 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <i className={`${loading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}`} />
              {loading ? '加载中...' : '刷新（从MQTT日志自动发现）'}
            </button>
            <button
              type="button"
              onClick={addBinding}
              className="flex items-center gap-1.5 text-xs border border-sky-200 text-sky-600 bg-sky-50 px-3 py-1.5 rounded-lg hover:bg-sky-100 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-add-line" />手动添加
            </button>
          </div>

          {/* 绑定列表 */}
          {bindings.length === 0 ? (
            <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <i className="ri-sensor-line text-2xl mb-2 block" />
              <p className="text-sm">暂无发现的传感器</p>
              <p className="text-xs mt-1">等待 MQTT 推送后点「刷新」自动发现，或手动添加 deviceSn</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500">
                <div className="col-span-4">设备 SN（deviceSn）</div>
                <div className="col-span-3">区域名称</div>
                <div className="col-span-3">传感器备注名</div>
                <div className="col-span-2 text-center">操作</div>
              </div>
              {bindings.map((b, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={b.device_sn}
                      onChange={(e) => updateBinding(i, { device_sn: e.target.value })}
                      placeholder="如：3000004171"
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-sky-400 outline-none bg-white font-mono"
                    />
                  </div>
                  <div className="col-span-3">
                    <select
                      value={b.zone}
                      onChange={(e) => updateBinding(i, { zone: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:border-sky-400 outline-none bg-white cursor-pointer"
                    >
                      <option value="">选择区域</option>
                      {ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={b.device_name}
                      onChange={(e) => updateBinding(i, { device_name: e.target.value })}
                      placeholder="如：温湿度传感器1"
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-sky-400 outline-none bg-white"
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateBinding(i, { enabled: !b.enabled })}
                      title={b.enabled ? '停用' : '启用'}
                      className={`text-xs px-2 py-1 rounded cursor-pointer ${b.enabled ? 'text-emerald-500 bg-emerald-50' : 'text-slate-400 bg-slate-50'}`}
                    >
                      <i className={b.enabled ? 'ri-eye-line' : 'ri-eye-off-line'} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBinding(i)}
                      className="text-xs text-red-400 px-2 py-1 rounded hover:bg-red-50 cursor-pointer"
                    >
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 保存按钮 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !gatewaySn}
              className="flex items-center gap-2 text-sm bg-sky-500 text-white px-4 py-2.5 rounded-xl hover:bg-sky-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <><i className="ri-loader-4-line animate-spin" />保存中...</>
              ) : (
                <><i className="ri-save-line" />保存区域绑定</>
              )}
            </button>
            {!gatewaySn && (
              <span className="text-xs text-amber-600">
                <i className="ri-alert-line mr-1" />请先在上方配置网关 SN
              </span>
            )}
            {saveResult && (
              <span className={`text-xs ${saveResult.includes('失败') || saveResult.includes('请') ? 'text-red-500' : 'text-emerald-600'}`}>
                <i className={`mr-1 ${saveResult.includes('失败') || saveResult.includes('请') ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'}`} />
                {saveResult}
              </span>
            )}
          </div>

          <div className="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
            <p className="font-medium text-slate-500 mb-1">使用步骤</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>确保网关已连接 MQTT Broker 并在推送数据</li>
              <li>点「刷新」从 MQTT 日志中自动发现传感器的 deviceSn</li>
              <li>为每个 deviceSn 选择对应的区域名称</li>
              <li>点「保存区域绑定」 → 重启 App 后空气质量页面会正确分区显示</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}