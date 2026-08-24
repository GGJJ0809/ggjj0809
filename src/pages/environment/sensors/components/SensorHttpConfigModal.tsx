import { useState } from 'react';
import type { SensorHttpDevice, SensorType } from '@/hooks/useSensorHttpConfig';
import { ZONES, createEmptyDevice, MQTT_MAPPINGS_BY_TYPE } from '@/hooks/useSensorHttpConfig';
import { loadSensorGateway } from '@/hooks/useSensorHttpConfig';

interface Props {
  device?: SensorHttpDevice | null;
  initialSensorType?: SensorType;
  onSave: (device: Omit<SensorHttpDevice, 'id'>) => void;
  onClose: () => void;
}

const DEVICE_MODELS: Record<SensorType, string[]> = {
  temp_humidity: [
    'ZHA-S500-WS(中安-温湿度)',
    'ZR-T-5(智仁-温湿度)',
    'TH-100A(通用-温湿度)',
    'WS-01(物联-温湿度)',
  ],
  smoke: [
    'JTY-GD-G3(海湾-烟感)',
    'JTY-GF-GST(GST-烟感)',
    'SMOKE-A1(通用-烟感)',
    'FS-200(火焰-烟感)',
  ],
  air_quality: [
    'ZHA-AQ-100(中安-空气质量)',
    'AQ-500(智仁-空气质量)',
    'PM-CO2-01(通用-空气质量)',
    'ENV-PRO(物联-空气质量)',
  ],
};

const MAINTENANCE_PERIODS = ['1个月', '3个月', '6个月', '1年', '2年'];

const TAB_LIST = [
  { key: 'basic', label: '基本信息', icon: 'ri-file-list-line' },
  { key: 'mqtt', label: 'MQTT配置', icon: 'ri-signal-tower-line' },
  { key: 'params', label: '设备参数', icon: 'ri-settings-3-line' },
] as const;

type TabKey = typeof TAB_LIST[number]['key'];

export default function SensorHttpConfigModal({ device, initialSensorType = 'temp_humidity', onSave, onClose }: Props) {
  const initForm = device
    ? { ...device, fieldMappings: device.fieldMappings.map((m) => ({ ...m })), headers: [] }
    : createEmptyDevice(initialSensorType);

  const [form, setForm] = useState<Omit<SensorHttpDevice, 'id'>>(initForm);
  const [tab, setTab] = useState<TabKey>('basic');

  const updateForm = <K extends keyof typeof form>(key: K, val: typeof form[K]) => {
    setForm((p) => ({ ...p, [key]: val }));
  };

  const handleSensorTypeChange = (type: SensorType) => {
    const mappings = MQTT_MAPPINGS_BY_TYPE[type].map((m) => ({ ...m }));
    setForm((p) => ({
      ...p,
      sensorType: type,
      pollInterval: type === 'smoke' ? 10 : 30,
      fieldMappings: mappings,
      deviceModel: '',
      tempLowThreshold: type === 'temp_humidity' ? 24 : undefined,
      tempHighThreshold: type === 'temp_humidity' ? 36 : undefined,
      humidityLowThreshold: type === 'temp_humidity' ? 24 : undefined,
      humidityHighThreshold: type === 'temp_humidity' ? 56 : undefined,
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) { alert('请填写设备名称'); return; }
    if (!form.sensorId.trim()) { alert('请填写传感器 ID（deviceSn）'); return; }
    onSave({ ...form, protocol: 'mqtt_push', mqttTopic: `back-device-iot-sensor/{merchantId}/{gatewaySn}` });
    onClose();
  };

  const gw = loadSensorGateway();

  const models = DEVICE_MODELS[form.sensorType];
  const isTempHumidity = form.sensorType === 'temp_humidity';
  const isSmoke = form.sensorType === 'smoke';
  const isAirQuality = form.sensorType === 'air_quality';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 flex items-center justify-center rounded-xl ${
              isSmoke ? 'bg-orange-50' : isAirQuality ? 'bg-emerald-50' : 'bg-sky-50'
            }`}>
              <i className={`${
                isSmoke ? 'ri-fire-line text-orange-600' : isAirQuality ? 'ri-haze-2-line text-emerald-600' : 'ri-temp-hot-line text-sky-600'
              } text-base`} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">{device ? '编辑传感器' : '添加传感器'}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isSmoke ? '烟感传感器' : isAirQuality ? '空气质量传感器' : '温湿度传感器'} · MQTT推送模式
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0 flex-shrink-0 border-b border-slate-100">
          {TAB_LIST.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-t-lg cursor-pointer whitespace-nowrap transition-colors border-b-2 ${
                tab === t.key
                  ? 'text-emerald-600 border-emerald-500 bg-emerald-50/40 font-medium'
                  : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <i className={t.icon} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* ── 基本信息 ── */}
          {tab === 'basic' && (
            <div className="space-y-4">
              {/* 传感器类型 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">传感器类型 <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['temp_humidity', 'ri-temp-hot-line', '温湿度传感器', '温度 / 湿度'],
                    ['air_quality', 'ri-haze-2-line', '空气质量传感器', 'PM2.5 / PM10 / CO₂'],
                    ['smoke', 'ri-fire-line', '烟感传感器', '烟雾检测 / 火灾预警'],
                  ] as const).map(([type, icon, label, desc]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleSensorTypeChange(type)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all text-left ${
                        form.sensorType === type
                          ? type === 'smoke'
                            ? 'border-orange-300 text-orange-600 bg-orange-50'
                            : type === 'air_quality'
                              ? 'border-emerald-300 text-emerald-600 bg-emerald-50'
                              : 'border-sky-300 text-sky-600 bg-sky-50'
                          : 'border-slate-200 text-slate-400 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <i className={`${icon} text-xl`} />
                      <div>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs opacity-70">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">设备名称 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    placeholder={isSmoke ? '如：操作间 烟感' : '如：主食库房 温湿度'}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">设备编号</label>
                  <input
                    type="text"
                    value={form.deviceNo ?? ''}
                    onChange={(e) => updateForm('deviceNo', e.target.value)}
                    placeholder="如：01、02"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">设备型号 <span className="text-red-500">*</span></label>
                  <select
                    value={form.deviceModel ?? ''}
                    onChange={(e) => updateForm('deviceModel', e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-emerald-400 cursor-pointer"
                  >
                    <option value="">请选择设备型号</option>
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">设备Sn码 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.sensorId}
                    onChange={(e) => updateForm('sensorId', e.target.value)}
                    placeholder="如：3000004171"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">所属区域 <span className="text-red-500">*</span></label>
                  <select
                    value={form.zone}
                    onChange={(e) => updateForm('zone', e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-emerald-400 cursor-pointer"
                  >
                    {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">食堂名称</label>
                  <input
                    type="text"
                    value={form.canteenName ?? ''}
                    onChange={(e) => updateForm('canteenName', e.target.value)}
                    placeholder="如：kqZ"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">位置</label>
                  <input
                    type="text"
                    value={form.position ?? ''}
                    onChange={(e) => updateForm('position', e.target.value)}
                    placeholder="如：01"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">关联通信网关</label>
                  <input
                    type="text"
                    value={form.relatedGateway ?? ''}
                    onChange={(e) => updateForm('relatedGateway', e.target.value)}
                    placeholder={gw?.gatewaySn ? `如：${gw.gatewaySn}` : '如：01'}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">安装日期</label>
                  <input
                    type="date"
                    value={form.installDate ?? ''}
                    onChange={(e) => updateForm('installDate', e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">维保电话</label>
                  <input
                    type="tel"
                    value={form.maintenancePhone ?? ''}
                    onChange={(e) => updateForm('maintenancePhone', e.target.value)}
                    placeholder="请输入手机号"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">维护周期</label>
                  <select
                    value={form.maintenancePeriod ?? '6个月'}
                    onChange={(e) => updateForm('maintenancePeriod', e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-emerald-400 cursor-pointer"
                  >
                    {MAINTENANCE_PERIODS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2">
                    <input
                      id="sensor-enabled"
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => updateForm('enabled', e.target.checked)}
                      className="cursor-pointer accent-emerald-500 w-4 h-4"
                    />
                    <label htmlFor="sensor-enabled" className="text-sm text-slate-600 cursor-pointer">
                      配置完成后启用
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MQTT配置 ── */}
          {tab === 'mqtt' && (
            <div className="space-y-4">
              {isTempHumidity && (
                <div className="flex items-start gap-2 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2.5 text-xs text-sky-700">
                  <i className="ri-information-line flex-shrink-0 mt-0.5" />
                  <p>温湿度传感器：网关通过 MQTT 推送 <strong>temperature</strong>（温度，℃）和 <strong>humidity</strong>（湿度，%）两个字段。checkItem 名称为厂商规范，不可修改。</p>
                </div>
              )}
              {isSmoke && (
                <div className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5 text-xs text-orange-700">
                  <i className="ri-fire-line flex-shrink-0 mt-0.5" />
                  <p>烟感传感器：网关通过 MQTT 推送 <strong>alarm</strong>（1=告警/2=正常）字段，确保火灾预警及时响应。checkItem 名称为厂商规范，不可修改。</p>
                </div>
              )}
              {isAirQuality && (
                <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 text-xs text-emerald-700">
                  <i className="ri-haze-2-line flex-shrink-0 mt-0.5" />
                  <p>空气质量传感器：网关通过 MQTT 推送 <strong>TVOC</strong>、<strong>CO</strong>、<strong>CH4</strong>、<strong>SOOT</strong> 四个字段。checkItem 名称为厂商规范，不可修改。</p>
                </div>
              )}

              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                  <i className="ri-signal-tower-line" />MQTT 推送配置
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">网关 MQTT Topic（自动生成，无需修改）</label>
                  <div className="bg-white border border-emerald-200 rounded-lg px-3 py-2">
                    <span className="text-sm font-mono text-emerald-700">
                      back-device-iot-sensor/{'{'}merchantId{'}'}/{'{'}gatewaySn{'}'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    所有传感器数据由网关统一推送到此 Topic，系统按 <strong>deviceSn</strong> 自动识别传感器。
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">checkItem 字段映射（只读 · 厂商规范）</label>
                  <div className="bg-white border border-slate-100 rounded-lg px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      {form.fieldMappings.map((m) => (
                        <span key={m.targetField} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-mono text-slate-600">
                          {m.label} ← <span className="text-emerald-600">{m.sourceKey}</span>
                          <span className="text-slate-400 ml-1">({m.unit})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    网关推送的 JSON payload 中 sensorDataList 内 checkItem 字段名
                  </p>
                </div>

                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                  <i className="ri-lightbulb-line flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-0.5">如何验证 MQTT 推送是否正常？</p>
                    <p>保存配置并同步到网关后，在传感器管理页面点击「MQTT 监控」即可实时看到网关推送的数据。</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">
                    数据刷新间隔（仅页面显示刷新）：<strong>{form.pollInterval}秒</strong>
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={300}
                    step={5}
                    value={form.pollInterval}
                    onChange={(e) => updateForm('pollInterval', Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>5秒</span>
                    <span className="text-emerald-500 font-medium">建议 30~60秒</span>
                    <span>300秒</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 设备参数 ── */}
          {tab === 'params' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">设备IP</label>
                  <input
                    type="text"
                    value={form.deviceIp ?? ''}
                    onChange={(e) => updateForm('deviceIp', e.target.value)}
                    placeholder="请输入设备IP"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">通讯地址</label>
                  <input
                    type="text"
                    value={form.commAddress ?? ''}
                    onChange={(e) => updateForm('commAddress', e.target.value)}
                    placeholder="如：1"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {isTempHumidity && (
                <>
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                      <i className="ri-temp-hot-line text-sky-500" />
                      温度阈值设定 <span className="text-red-500">*</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">温度低阈值</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={form.tempLowThreshold ?? ''}
                            onChange={(e) => updateForm('tempLowThreshold', e.target.value === '' ? undefined : Number(e.target.value))}
                            placeholder="24"
                            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                          />
                          <span className="text-xs text-slate-400">℃</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">温度高阈值</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={form.tempHighThreshold ?? ''}
                            onChange={(e) => updateForm('tempHighThreshold', e.target.value === '' ? undefined : Number(e.target.value))}
                            placeholder="36"
                            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                          />
                          <span className="text-xs text-slate-400">℃</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                      <i className="ri-drop-line text-sky-500" />
                      湿度阈值设定 <span className="text-red-500">*</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">湿度低阈值</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={form.humidityLowThreshold ?? ''}
                            onChange={(e) => updateForm('humidityLowThreshold', e.target.value === '' ? undefined : Number(e.target.value))}
                            placeholder="24"
                            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                          />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">湿度高阈值</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={form.humidityHighThreshold ?? ''}
                            onChange={(e) => updateForm('humidityHighThreshold', e.target.value === '' ? undefined : Number(e.target.value))}
                            placeholder="56"
                            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                          />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {isSmoke && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <i className="ri-fire-line text-orange-500" />
                    烟感参数
                  </p>
                  <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5 text-xs text-orange-700">
                    <p>烟感传感器阈值由网关固件统一管理，此处仅做记录。告警状态通过 MQTT <strong>alarm</strong> 字段推送（1=告警，2=正常）。</p>
                  </div>
                </div>
              )}

              {isAirQuality && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <i className="ri-haze-2-line text-emerald-500" />
                    空气质量参数
                  </p>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 text-xs text-emerald-700">
                    <p>空气质量传感器阈值由网关固件统一管理，此处仅做记录。数据通过 MQTT <strong>TVOC / CO / CH4 / SOOT</strong> 字段推送。</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-sm bg-emerald-500 text-white rounded-lg px-4 py-2 hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}