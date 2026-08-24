// 设备型号 → 设备类型映射
// device_type 由 device_model 唯一决定，无需单独存储

export interface DeviceModelInfo {
  value: string;
  label: string;
  type: string;
  desc: string;
}

export const DEVICE_MODELS: DeviceModelInfo[] = [
  { value: 'ZHA-S500-WS', label: 'ZHA-S500-WS', type: 'temp_humidity', desc: '中安-温湿度（RS485，双地址）' },
  { value: 'ZHA-S500-YG', label: 'ZHA-S500-YG', type: 'smoke', desc: '中安-烟感（RS485）' },
  { value: 'ZHA-S500-KQ', label: 'ZHA-S500-KQ', type: 'air_quality', desc: '中安-空气质量（RS485）' },
  { value: 'CUSTOM-TH', label: 'CUSTOM-TH', type: 'temp_humidity', desc: '通用温湿度传感器' },
  { value: 'CUSTOM-SM', label: 'CUSTOM-SM', type: 'smoke', desc: '通用烟感传感器' },
  { value: 'CUSTOM-AQ', label: 'CUSTOM-AQ', type: 'air_quality', desc: '通空气质量传感器' },
];

export function getDeviceTypeByModel(model: string | null): string {
  if (!model) return 'temp_humidity';
  const found = DEVICE_MODELS.find((m) => m.value === model);
  return found?.type || 'temp_humidity';
}