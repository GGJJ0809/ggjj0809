import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { localDb } from '@/lib/localDb';
import { syncInsert, syncDelete } from '@/lib/dbSync';
import { getLocalServerPort, getLocalServerBase } from '@/lib/localServer';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

function getDb() {
  return isElectron() ? localDb : supabase;
}

interface TrayDisplayDevice {
  id: number;
  name: string;
  sn: string;
  hw_key: string;
  location: string | null;
  station_id: number | null;
  status: string | null;
  last_seen: string | null;
  last_pull_at: string | null;
  token: string | null;
  notes: string | null;
  device_type: string | null;
  created_at: string;
  updated_at: string;
  max_price_temp_dish: number | null;
  interval_price_temp_dish: number | null;
  min_price_temp_dish: number | null;
  bind_plate_before_take: number | null;
  ui_template: number | null;
  weigh_alarm_model: number | null;
  min_settlement_weight: number | null;
  stable_difference: number | null;
  alarm_below_grams: number | null;
  max_weight_dish: number | null;
  bind_mode: string | null;
  bind_value: string | null;
  station_name?: string;
  dish_name?: string;
  product_item_id?: number | null;
}

interface TrayStation {
  id: number;
  name: string;
  location: string;
  station_code: string;
  category: string;
  is_active: boolean;
  created_at: string;
  product_item_id: number | null;
  dish_name: string | null;
}

interface DishOption {
  id: number;
  name: string;
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function useTrayDisplayDevices() {
  const [devices, setDevices] = useState<TrayDisplayDevice[]>([]);
  const [stations, setStations] = useState<TrayStation[]>([]);
  const [dishes, setDishes] = useState<DishOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDb();
      const [devicesRes, stationsRes, dishesRes] = await Promise.all([
        db
          .from('tray_display_devices')
          .select('*, tray_stations!left(name, product_item_id, dish_name, station_code)')
          .order('created_at', { ascending: false }),
        db.from('tray_stations').select('id, name, location, station_code, category, is_active, product_item_id, dish_name, created_at').order('created_at', { ascending: false }),
        db.from('product_items').select('id, name').eq('status', 'active').order('id'),
      ]);
      if (devicesRes.error) throw devicesRes.error;
      if (stationsRes.error) throw stationsRes.error;

      // 过滤掉传感器网关（device_type = 'gateway'），只显示真正的电子屏设备
      const DISPLAY_DEVICE_TYPES = ['display_scale', 'display', 'scale', 'xiaoniu', 'leniu'];
      const mappedDevices = (devicesRes.data || [])
        .filter((d: any) => !d.device_type || DISPLAY_DEVICE_TYPES.includes(d.device_type))
        .map((d: any) => ({
          ...d,
          station_name: d.tray_stations?.name || '',
          dish_name: d.tray_stations?.dish_name || '',
          product_item_id: d.tray_stations?.product_item_id || null,
        }));

      console.log('[useTrayDisplayDevices][fetchData] ====== 刷新设备列表 ======');
      console.log('[useTrayDisplayDevices][fetchData] 总数: ' + mappedDevices.length);
      mappedDevices.forEach((d: any) => {
        console.log('[useTrayDisplayDevices][fetchData]   id=' + d.id + ', sn=' + d.sn + ', ui_template=' + d.ui_template + ' (type=' + typeof d.ui_template + ')');
      });

      setDevices(mappedDevices);
      setStations(stationsRes.data || []);
      setDishes(dishesRes.data || []);
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.message || '加载失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedFetchData = useMemo(
    () => debounce(fetchData, 500),
    [fetchData]
  );

  useEffect(() => {
    fetchData().catch(() => {});
  }, [fetchData]);

  const stats = useMemo(() => ({
    total: devices.length,
    online: devices.filter((d) => d.status === 'online').length,
    offline: devices.filter((d) => d.status === 'offline').length,
    error: devices.filter((d) => d.status === 'error').length,
  }), [devices]);

  const addDevice = useCallback(async (data: Partial<TrayDisplayDevice>) => {
    try {
      const db = getDb();
      const { data: inserted, error: err } = await db.from('tray_display_devices').insert(data).select('id').single();
      if (err) return { error: err };
      if (inserted) {
        if (!isElectron()) {
          await syncInsert('tray_display_devices', data as Record<string, unknown>, inserted.id);
        }
      }
      const ok = await fetchData();
      if (!ok) return { error: new Error('设备已添加，但刷新列表失败') };
      return { error: null };
    } catch (e: any) {
      return { error: e };
    }
  }, [fetchData]);

  const updateDevice = useCallback(async (id: number, data: Partial<TrayDisplayDevice>) => {
    console.log('[useTrayDisplayDevices][updateDevice] ====== 更新设备 ======');
    console.log('[useTrayDisplayDevices][updateDevice] id=' + id);
    console.log('[useTrayDisplayDevices][updateDevice] data.ui_template =', data.ui_template, '(type: ' + typeof data.ui_template + ')');
    console.log('[useTrayDisplayDevices][updateDevice] 完整 data:', JSON.stringify(data));
    try {
      if (isElectron()) {
        // Electron 模式：直写本地 SQLite
        const db = getDb();
        const { data: updated, error: err } = await db.from('tray_display_devices').update(data).eq('id', id).select('id, ui_template');
        console.log('[useTrayDisplayDevices][updateDevice] Electron DB update 结果: err=', err, ', updatedRows=', updated);
        if (err) return { error: err };

        // MQTT 实时推送
        const api = (window as any).electronAPI;
        if (api?.mqttPushDeviceConfig) {
          const updatedDevice = devices.find((d) => d.id === id);
          if (updatedDevice?.sn) {
            api.mqttPushDeviceConfig(updatedDevice.sn).catch(() => {});
          }
        }
      } else {
        // 浏览器模式（局域网）：通过本地 HTTP API 直写 SQLite
        const base = getLocalServerBase();
        // ★ 诊断：打印实际请求地址，方便确认是否发到了正确的服务器
        console.log('[useTrayDisplayDevices][updateDevice] ★ 当前页面 hostname=' + window.location.hostname + ', 本地服务地址=' + base);
        const targetUrl = `${base}/api/device/update-config`;
        console.log('[useTrayDisplayDevices][updateDevice] 浏览器模式，调本地 API: ' + targetUrl);
        console.log('[useTrayDisplayDevices][updateDevice] 请求体: id=' + id + ', data=' + JSON.stringify(data));
        let resp: Response;
        try {
          resp = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, data }),
          });
        } catch (fetchErr: any) {
          console.error('[useTrayDisplayDevices][updateDevice] ★★★ fetch 失败! ★★★');
          console.error('[useTrayDisplayDevices][updateDevice] 目标URL: ' + targetUrl);
          console.error('[useTrayDisplayDevices][updateDevice] 错误信息: ' + (fetchErr.message || String(fetchErr)));
          console.error('[useTrayDisplayDevices][updateDevice] 请确认: 1) Electron 应用是否在运行? 2) 端口 8081 是否被占用? 3) 防火墙是否阻止了本地连接?');
          return { error: new Error('无法连接本地服务(' + targetUrl + '): ' + (fetchErr.message || '网络错误') + '。请确认 Electron 应用正在运行。') };
        }
        const result = await resp.json();
        console.log('[useTrayDisplayDevices][updateDevice] 本地 API 返回: HTTP ' + resp.status + ', body=' + JSON.stringify(result));
        if (result.code !== 10000) {
          return { error: new Error(result.msg || '更新失败') };
        }
      }

      const ok = await fetchData();
      if (!ok) return { error: new Error('设备已更新，但刷新列表失败') };
      return { error: null };
    } catch (e: any) {
      return { error: e };
    }
  }, [fetchData, devices]);

  const deleteDevice = useCallback(async (id: number) => {
    try {
      const db = getDb();
      const { error: err } = await db.from('tray_display_devices').delete().eq('id', id);
      if (err) return { error: err };
      if (!isElectron()) {
        await syncDelete('tray_display_devices', id);
      }
      const ok = await fetchData();
      if (!ok) return { error: new Error('设备已删除，但刷新列表失败') };
      return { error: null };
    } catch (e: any) {
      return { error: e };
    }
  }, [fetchData]);

  const getBaseUrl = useCallback(() => {
    // 局域网模式：返回本地服务器地址
    if (isElectron()) {
      return getLocalServerBase();
    }
    const url = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
    if (!url) return '';
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return '';
    }
  }, []);

  const getRegisterUrl = useCallback((sn: string, key: string) => {
    const base = getBaseUrl();
    if (!base) return '';
    if (isElectron()) {
      return `${base}/api/device/register?sn=${encodeURIComponent(sn)}&key=${encodeURIComponent(key)}`;
    }
    return `${base}/functions/v1/device-api/api/device/register?sn=${encodeURIComponent(sn)}&key=${encodeURIComponent(key)}`;
  }, [getBaseUrl]);

  const getDishesUrl = useCallback((token: string) => {
    const base = getBaseUrl();
    if (!base) return '';
    if (isElectron()) {
      return `${base}/api/dishes?token=${encodeURIComponent(token)}`;
    }
    return `${base}/functions/v1/device-api/api/dishes?token=${encodeURIComponent(token)}`;
  }, [getBaseUrl]);

  const getWeightReportUrl = useCallback((sn: string, key: string) => {
    const base = getBaseUrl();
    if (!base) return '';
    if (isElectron()) {
      return `${base}/api/weight/report`;
    }
    return `${base}/functions/v1/scale-weight-api/api/weight/report?sn=${encodeURIComponent(sn)}&key=${encodeURIComponent(key)}`;
  }, [getBaseUrl]);

  const getWeightQueryUrl = useCallback((sn: string, key: string) => {
    const base = getBaseUrl();
    if (!base) return '';
    if (isElectron()) {
      return `${base}/api/weight?sn=${encodeURIComponent(sn)}&key=${encodeURIComponent(key)}`;
    }
    return `${base}/functions/v1/scale-weight-api/api/weight?sn=${encodeURIComponent(sn)}&key=${encodeURIComponent(key)}`;
  }, [getBaseUrl]);

  const getWebSocketUrl = useCallback((sn: string, key: string) => {
    const base = getBaseUrl();
    if (!base) return '';
    return `${base.replace('http', 'ws')}/functions/v1/display-websocket?sn=${encodeURIComponent(sn)}&key=${encodeURIComponent(key)}`;
  }, [getBaseUrl]);

  const manualRegister = useCallback(async (sn: string, key: string) => {
    const base = getBaseUrl();
    if (!base) return { data: null, error: new Error('缺少服务器地址') };
    const url = isElectron()
      ? `${base}/api/device/register`
      : `${base}/functions/v1/device-api/api/device/register`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sn, key }),
      });
      const result = await response.json();
      if (result.code === 200) {
        await fetchData();
        return { data: result.data, error: null };
      }
      return { data: null, error: new Error(result.message || '注册失败') };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }, [getBaseUrl, fetchData]);

  return {
    devices,
    stations,
    stationOptions: stations,
    dishOptions: dishes,
    loading,
    error,
    stats,
    fetchDevices: fetchData,
    fetchStationOptions: fetchData,
    debouncedFetchDevices: debouncedFetchData,
    addDevice,
    createDevice: addDevice,
    updateDevice,
    deleteDevice,
    getRegisterUrl,
    getDishesUrl,
    getWeightReportUrl,
    getWeightQueryUrl,
    getWebSocketUrl,
    manualRegister,
  };
}

export default useTrayDisplayDevices;
export type { TrayDisplayDevice, TrayStation };