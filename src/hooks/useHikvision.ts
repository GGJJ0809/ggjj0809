import { useState, useCallback, useEffect } from 'react';

export interface HikvisionDevice {
  id: string;
  name: string;
  ip: string;
  enabled: boolean;
}

export interface HikvisionChannel {
  deviceId: string;
  channelNo: number;
  name: string;
  location: string;
  rtspUrl: string;
  enabled: boolean;
}

interface StoredConfig {
  devices: HikvisionDevice[];
  channels: HikvisionChannel[];
}

const STORAGE_KEY = 'hikvision_config';
const DB_CONFIG_KEY = 'hikvision_config';

const emptyConfig: StoredConfig = { devices: [], channels: [] };

// ─── 数据加载：优先 SQLite（Electron），兜底 localStorage ──────────────────
async function loadConfig(): Promise<StoredConfig> {
  const electronApi = (window as any).electronAPI;

  if (electronApi?.dbQuery) {
    try {
      const result = await electronApi.dbQuery(
        'SELECT config_data FROM camera_configs WHERE config_key = ? ORDER BY id DESC LIMIT 1',
        [DB_CONFIG_KEY],
      );
      if (result?.data && result.data.length > 0) {
        const parsed = JSON.parse(result.data[0].config_data);
        return validateConfig(parsed);
      }
    } catch (e) {
      console.error('[Camera Config] 数据库加载失败，尝试 localStorage:', e);
    }
  }

  // 兜底：localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return validateConfig(parsed);
    }
  } catch {
    // ignore
  }

  return { ...emptyConfig, devices: [], channels: [] };
}

function validateConfig(raw: any): StoredConfig {
  const devices: HikvisionDevice[] = Array.isArray(raw.devices)
    ? raw.devices.filter(
        (d: any) => typeof d.id === 'string' && typeof d.name === 'string' && typeof d.ip === 'string',
      )
    : [];
  const channels: HikvisionChannel[] = Array.isArray(raw.channels)
    ? raw.channels.filter(
        (ch: any) =>
          typeof ch.deviceId === 'string' &&
          typeof ch.channelNo === 'number' &&
          typeof ch.name === 'string' &&
          typeof ch.rtspUrl === 'string' && ch.rtspUrl.startsWith('rtsp://'),
      )
    : [];
  return { devices, channels };
}

// ─── 数据保存：优先 SQLite，兜底 localStorage ─────────────────────────────
async function persistConfig(data: StoredConfig) {
  const electronApi = (window as any).electronAPI;

  if (electronApi?.dbRun) {
    try {
      // 先删旧记录再插入（保持 config_key 唯一且只有最新一条）
      await electronApi.dbRun('DELETE FROM camera_configs WHERE config_key = ?', [DB_CONFIG_KEY]);
      await electronApi.dbRun(
        'INSERT INTO camera_configs (config_key, config_data) VALUES (?, ?)',
        [DB_CONFIG_KEY, JSON.stringify(data)],
      );
      // 同步写 localStorage 便于浏览器开发时查看
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return;
    } catch (e) {
      console.error('[Camera Config] 数据库保存失败，降级到 localStorage:', e);
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ─── Hook ──────────────────────────────────────────────────────────────────
export function useHikvision() {
  const [devices, setDevices] = useState<HikvisionDevice[]>([]);
  const [channels, setChannels] = useState<HikvisionChannel[]>([]);
  const [loading, setLoading] = useState(true);

  // 异步加载配置
  useEffect(() => {
    let cancelled = false;
    loadConfig().then((config) => {
      if (cancelled) return;
      setDevices(config.devices);
      setChannels(config.channels);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // 同步持久化
  const save = useCallback(async (newDevices: HikvisionDevice[], newChannels: HikvisionChannel[]) => {
    setDevices(newDevices);
    setChannels(newChannels);
    await persistConfig({ devices: newDevices, channels: newChannels });
  }, []);

  const addDevice = useCallback(
    async (device: Omit<HikvisionDevice, 'id'>) => {
      const newDevice: HikvisionDevice = { ...device, id: `dev_${Date.now()}` };
      const newDevices = [...devices, newDevice];
      await save(newDevices, channels);
      return newDevice;
    },
    [devices, channels, save],
  );

  const updateDevice = useCallback(
    async (id: string, updates: Partial<HikvisionDevice>) => {
      const newDevices = devices.map((d) => (d.id === id ? { ...d, ...updates } : d));
      await save(newDevices, channels);
    },
    [devices, channels, save],
  );

  const removeDevice = useCallback(
    async (id: string) => {
      const newDevices = devices.filter((d) => d.id !== id);
      const newChannels = channels.filter((c) => c.deviceId !== id);
      await save(newDevices, newChannels);
    },
    [devices, channels, save],
  );

  const addChannel = useCallback(
    async (channel: HikvisionChannel) => {
      const newChannels = [...channels, channel];
      await save(devices, newChannels);
    },
    [devices, channels, save],
  );

  const updateChannel = useCallback(
    async (deviceId: string, channelNo: number, updates: Partial<HikvisionChannel>) => {
      const newChannels = channels.map((c) =>
        c.deviceId === deviceId && c.channelNo === channelNo ? { ...c, ...updates } : c,
      );
      await save(devices, newChannels);
    },
    [devices, channels, save],
  );

  const removeChannel = useCallback(
    async (deviceId: string, channelNo: number) => {
      const newChannels = channels.filter((c) => !(c.deviceId === deviceId && c.channelNo === channelNo));
      await save(devices, newChannels);
    },
    [devices, channels, save],
  );

  const saveAll = useCallback(
    async (newDevices: HikvisionDevice[], newChannels: HikvisionChannel[]) => {
      await save(newDevices, newChannels);
    },
    [save],
  );

  const getDeviceChannels = useCallback(
    (deviceId: string) => {
      return channels.filter((c) => c.deviceId === deviceId && c.enabled);
    },
    [channels],
  );

  const isConfigured =
    channels.length > 0 && channels.some((c) => c.enabled && c.rtspUrl && c.rtspUrl.startsWith('rtsp://'));

  return {
    devices,
    channels,
    isConfigured,
    loading,
    addDevice,
    updateDevice,
    removeDevice,
    addChannel,
    updateChannel,
    removeChannel,
    saveAll,
    getDeviceChannels,
  };
}