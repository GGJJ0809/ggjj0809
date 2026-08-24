import { useState, useCallback, useRef } from 'react';
import { todayBeijing } from '@/lib/dateUtils';

export type SensorProtocol = 'mqtt_push';
export type SensorType = 'temp_humidity' | 'smoke' | 'air_quality';

export interface SensorGatewayConfig {
  host: string;
  port: number;
  gatewaySn?: string;
  gatewayKey?: string;
  merchantId?: string;
}

export interface FieldMapping {
  sourceKey: string;
  targetField: 'pm25' | 'pm10' | 'temp' | 'humidity' | 'co2' | 'smoke';
  label: string;
  unit: string;
}

export interface SensorHttpDevice {
  id: string;
  name: string;
  zone: string;
  sensorType: SensorType;
  sensorId: string;
  protocol: SensorProtocol;
  apiUrl: string;
  pollInterval: number;
  headers: { key: string; value: string }[];
  dataPath: string;
  fieldMappings: FieldMapping[];
  enabled: boolean;
  lastFetchAt?: string;
  lastStatus?: 'ok' | 'error' | 'idle';
  lastError?: string;
  mqttTopic?: string;
  // ── 新增：设备详细档案 ──
  deviceNo?: string;
  deviceModel?: string;
  canteenName?: string;
  position?: string;
  maintenancePeriod?: string;
  relatedGateway?: string;
  installDate?: string;
  maintenancePhone?: string;
  deviceIp?: string;
  commAddress?: string;
  tempLowThreshold?: number;
  tempHighThreshold?: number;
  humidityLowThreshold?: number;
  humidityHighThreshold?: number;
}

const STORAGE_KEY = 'sensor_http_config_v2';
const SENSOR_GATEWAY_KEY = 'sensor_gateway_config';

// ── MQTT Push 协议的字段映射 ──
// 厂商规范 checkItem 名称：temperature, humidity, TVOC, CO, CH4, SOOT, alarm
const MQTT_TH_MAPPINGS: FieldMapping[] = [
  { sourceKey: 'temperature', targetField: 'temp', label: '温度', unit: '℃' },
  { sourceKey: 'humidity', targetField: 'humidity', label: '湿度', unit: '%' },
];

const MQTT_SMOKE_MAPPINGS: FieldMapping[] = [
  { sourceKey: 'alarm', targetField: 'smoke', label: '告警状态', unit: '1=告警/2=正常' },
  { sourceKey: 'temperature', targetField: 'temp', label: '温度', unit: '℃' },
];

const MQTT_AQ_MAPPINGS: FieldMapping[] = [
  { sourceKey: 'TVOC', targetField: 'pm25', label: 'TVOC', unit: 'ppb' },
  { sourceKey: 'CO', targetField: 'pm10', label: '一氧化碳', unit: 'ppm' },
  { sourceKey: 'CH4', targetField: 'co2', label: '甲烷', unit: '%LEL' },
  { sourceKey: 'SOOT', targetField: 'temp', label: '油烟浓度', unit: 'mg/m³' },
  { sourceKey: 'temperature', targetField: 'humidity', label: '温度', unit: '℃' },
];

export const MQTT_MAPPINGS_BY_TYPE: Record<SensorType, FieldMapping[]> = {
  temp_humidity: MQTT_TH_MAPPINGS,
  smoke: MQTT_SMOKE_MAPPINGS,
  air_quality: MQTT_AQ_MAPPINGS,
};

// ── 传感器网关配置（全局共享，localStorage 持久化）──
export function loadSensorGateway(): SensorGatewayConfig | null {
  try {
    const raw = localStorage.getItem(SENSOR_GATEWAY_KEY);
    if (raw) return JSON.parse(raw) as SensorGatewayConfig;
  } catch { /* ignore */ }
  return { host: '192.168.2.33', port: 8081 };
}

export function saveSensorGateway(config: SensorGatewayConfig) {
  localStorage.setItem(SENSOR_GATEWAY_KEY, JSON.stringify(config));
}

/** 同步传感器配置到后端，供网关 SN 查询 */
export async function syncSensorsToGateway(gatewaySn: string, gatewayKey: string, devices: SensorHttpDevice[]): Promise<{ ok: boolean; count: number; msg: string }> {
  try {
    const { getLocalServerUrl } = await import('@/lib/localServer');
    const resp = await fetch(getLocalServerUrl('/api/sensor/sync-bindings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatewaySn, gatewayKey, devices }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ msg: `HTTP ${resp.status}` }));
      return { ok: false, count: 0, msg: body.msg || `HTTP ${resp.status}` };
    }
    const json = await resp.json();
    return { ok: true, count: json.data?.synced || 0, msg: 'ok' };
  } catch (e) {
    return { ok: false, count: 0, msg: e instanceof Error ? e.message : '未知错误' };
  }
}

export const ZONES = [
  '面点加工间',
  '冷菜加工间',
  '操作间',
  '蔬菜加工间',
  '肉类加工间',
  '主食库房',
  '管理办公室',
  '其他',
];

// ── 预置传感器列表 ──
// 数据由网关统一推送到 MQTT Topic: back-device-iot-sensor/{merchantId}/{gatewaySn}
// 系统按 deviceSn 自动识别传感器
export const PRESET_DEVICES: Array<Omit<SensorHttpDevice, 'id'>> = [
  // ── 温湿度传感器 ──
  {
    name: '面点加工间 温湿度', zone: '面点加工间', sensorType: 'temp_humidity',
    sensorId: 'TH_MIANDIAN_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 30, headers: [], dataPath: '',
    fieldMappings: MQTT_TH_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  {
    name: '冷菜加工间 温湿度', zone: '冷菜加工间', sensorType: 'temp_humidity',
    sensorId: 'TH_LENGCAI_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 30, headers: [], dataPath: '',
    fieldMappings: MQTT_TH_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  {
    name: '操作间 温湿度', zone: '操作间', sensorType: 'temp_humidity',
    sensorId: 'TH_CAOZUO_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 30, headers: [], dataPath: '',
    fieldMappings: MQTT_TH_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  {
    name: '蔬菜加工间 温湿度', zone: '蔬菜加工间', sensorType: 'temp_humidity',
    sensorId: 'TH_SHUCAI_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 30, headers: [], dataPath: '',
    fieldMappings: MQTT_TH_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  {
    name: '肉类加工间 温湿度', zone: '肉类加工间', sensorType: 'temp_humidity',
    sensorId: 'TH_ROULEI_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 30, headers: [], dataPath: '',
    fieldMappings: MQTT_TH_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  {
    name: '主食库房 温湿度', zone: '主食库房', sensorType: 'temp_humidity',
    sensorId: 'TH_ZHUSHI_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 30, headers: [], dataPath: '',
    fieldMappings: MQTT_TH_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  {
    name: '管理办公室 温湿度', zone: '管理办公室', sensorType: 'temp_humidity',
    sensorId: 'TH_OFFICE_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 30, headers: [], dataPath: '',
    fieldMappings: MQTT_TH_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  // ── 烟感传感器 ──
  {
    name: '操作间 烟感', zone: '操作间', sensorType: 'smoke',
    sensorId: 'SMOKE_CAOZUO_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 10, headers: [], dataPath: '',
    fieldMappings: MQTT_SMOKE_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  {
    name: '主食库房 烟感', zone: '主食库房', sensorType: 'smoke',
    sensorId: 'SMOKE_ZHUSHI_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 10, headers: [], dataPath: '',
    fieldMappings: MQTT_SMOKE_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  {
    name: '管理办公室 烟感', zone: '管理办公室', sensorType: 'smoke',
    sensorId: 'SMOKE_OFFICE_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 10, headers: [], dataPath: '',
    fieldMappings: MQTT_SMOKE_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
  // ── 空气质量传感器 ──
  {
    name: '操作间 空气质量', zone: '操作间', sensorType: 'air_quality',
    sensorId: 'AQ_CAOZUO_01', protocol: 'mqtt_push', apiUrl: '',
    pollInterval: 30, headers: [], dataPath: '',
    fieldMappings: MQTT_AQ_MAPPINGS.map((m) => ({ ...m })),
    enabled: false, lastStatus: 'idle',
  },
];

function loadDevices(): SensorHttpDevice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SensorHttpDevice[];
      return parsed.map((d) => ({
        ...d,
        sensorType: d.sensorType ?? 'temp_humidity',
        protocol: d.protocol ?? 'mqtt_push',
      }));
    }
  } catch { /* ignore */ }
  return [];
}

function saveDevices(devices: SensorHttpDevice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

/** 按路径从对象中取值 */
export function getNestedValue(obj: unknown, path: string): number | null {
  if (!path.trim()) return null;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  const n = parseFloat(String(cur));
  return Number.isNaN(n) ? null : n;
}

/** 从原始响应中提取传感器数值 */
export function extractSensorValues(
  raw: unknown,
  dataPath: string,
  mappings: FieldMapping[],
): Partial<Record<'pm25' | 'pm10' | 'temp' | 'humidity' | 'co2' | 'smoke', number | null>> {
  let data: unknown = raw;
  if (dataPath.trim()) {
    data = getNestedValue(raw, dataPath) as unknown ?? raw;
  }
  const result: Partial<Record<'pm25' | 'pm10' | 'temp' | 'humidity' | 'co2' | 'smoke', number | null>> = {};
  for (const m of mappings) {
    if (!m.sourceKey.trim()) continue;
    result[m.targetField] = getNestedValue(data, m.sourceKey);
  }
  return result;
}

export function createEmptyDevice(sensorType: SensorType = 'temp_humidity'): Omit<SensorHttpDevice, 'id'> {
  const sensorId = `SNS_${Date.now()}`;
  return {
    name: '',
    zone: ZONES[0],
    sensorType,
    sensorId,
    protocol: 'mqtt_push',
    apiUrl: '',
    pollInterval: sensorType === 'smoke' ? 10 : 30,
    headers: [],
    dataPath: '',
    fieldMappings: MQTT_MAPPINGS_BY_TYPE[sensorType].map((m) => ({ ...m })),
    enabled: false,
    lastStatus: 'idle',
    // 新增字段默认值
    deviceNo: '',
    deviceModel: '',
    canteenName: '',
    position: '',
    maintenancePeriod: '6个月',
    relatedGateway: '',
    installDate: todayBeijing(),
    maintenancePhone: '',
    deviceIp: '',
    commAddress: '',
    tempLowThreshold: sensorType === 'temp_humidity' ? 24 : undefined,
    tempHighThreshold: sensorType === 'temp_humidity' ? 36 : undefined,
    humidityLowThreshold: sensorType === 'temp_humidity' ? 24 : undefined,
    humidityHighThreshold: sensorType === 'temp_humidity' ? 56 : undefined,
  };
}

export function useSensorHttpConfig() {
  const [devices, setDevices] = useState<SensorHttpDevice[]>(loadDevices);
  const pollingTimers = useRef<Record<string, ReturnType<typeof setInterval>>>();

  const save = useCallback((next: SensorHttpDevice[]) => {
    setDevices(next);
    saveDevices(next);
  }, []);

  const addDevice = useCallback((dev: Omit<SensorHttpDevice, 'id'>) => {
    const newDev: SensorHttpDevice = { ...dev, id: `shttp_${Date.now()}` };
    save([...devices, newDev]);
    return newDev;
  }, [devices, save]);

  const updateDevice = useCallback((id: string, updates: Partial<SensorHttpDevice>) => {
    save(devices.map((d) => d.id === id ? { ...d, ...updates } : d));
  }, [devices, save]);

  const removeDevice = useCallback((id: string) => {
    if (pollingTimers.current[id]) {
      clearInterval(pollingTimers.current[id]);
      delete pollingTimers.current[id];
    }
    save(devices.filter((d) => d.id !== id));
  }, [devices, save]);

  const saveAll = useCallback((next: SensorHttpDevice[]) => {
    save(next);
  }, [save]);

  /** 批量预置所有传感器（跳过已存在的同名） */
  const loadPresets = useCallback(() => {
    const existingNames = new Set(devices.map((d) => d.name));
    const toAdd = PRESET_DEVICES.filter((p) => !existingNames.has(p.name));
    if (toAdd.length === 0) return 0;
    const newDevices = [
      ...devices,
      ...toAdd.map((d, i) => ({ ...d, id: `shttp_preset_${Date.now()}_${i}` })),
    ];
    save(newDevices);
    return toAdd.length;
  }, [devices, save]);

  const configuredCount = devices.filter((d) => d.enabled && d.apiUrl).length;

  return { devices, addDevice, updateDevice, removeDevice, saveAll, loadPresets, configuredCount };
}