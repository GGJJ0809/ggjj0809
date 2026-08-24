import { useState, useCallback } from 'react';
import type { ScaleConfig } from '@/services/scaleApi';

export interface FullScaleConfig extends ScaleConfig {
  warehouseId?: string;
  canteenId?: string;
  fetchUserId?: string;
}

const STORAGE_KEY = 'scale_config_v2';

function loadConfig(): FullScaleConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FullScaleConfig;
    // migrate old key
    const old = localStorage.getItem('scale_config');
    if (old) return { ...(JSON.parse(old) as ScaleConfig), warehouseId: '', canteenId: '' };
  } catch {
    // ignore
  }
  return { baseUrl: '', merchantId: '', xToken: '', machineSn: '', accessToken: '', warehouseId: '', canteenId: '', fetchUserId: '' };
}

function saveConfig(config: FullScaleConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useScaleConfig() {
  const [config, setConfigState] = useState<FullScaleConfig>(loadConfig);

  const updateConfig = useCallback((next: FullScaleConfig) => {
    saveConfig(next);
    setConfigState(next);
  }, []);

  const isConfigured = Boolean(config.baseUrl && config.merchantId && config.xToken);
  const isReadyToSubmit = isConfigured && Boolean(config.warehouseId);

  return { config, updateConfig, isConfigured, isReadyToSubmit };
}