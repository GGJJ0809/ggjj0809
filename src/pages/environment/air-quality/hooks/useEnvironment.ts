import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { syncInsert } from '@/lib/dbSync';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

export interface EnvironmentReading {
  id: number;
  zone: string;
  sensor_id: string;
  pm25: number | null;
  pm10: number | null;
  temp: number | null;
  humidity: number | null;
  co2: number | null;
  recorded_at: string;
  source: string;
}

export interface ZoneSummary {
  zone: string;
  pm25: number;
  pm10: number;
  temp: number;
  humidity: number;
  co2: number;
  status: 'good' | 'normal' | 'warning' | 'danger';
  lastUpdate: string;
}

const thresholds = { pm25: 50, pm10: 75, temp: 30, humidity: 85, co2: 1000 };

function calcStatus(r: Partial<ZoneSummary>): ZoneSummary['status'] {
  if ((r.pm25 ?? 0) > thresholds.pm25 * 1.5 || (r.pm10 ?? 0) > thresholds.pm10 * 1.5 || (r.co2 ?? 0) > thresholds.co2 * 1.3) return 'danger';
  if ((r.pm25 ?? 0) > thresholds.pm25 || (r.pm10 ?? 0) > thresholds.pm10 || (r.temp ?? 0) > thresholds.temp || (r.humidity ?? 0) > thresholds.humidity || (r.co2 ?? 0) > thresholds.co2) return 'warning';
  if ((r.pm25 ?? 0) > thresholds.pm25 * 0.6 || (r.pm10 ?? 0) > thresholds.pm10 * 0.6) return 'normal';
  return 'good';
}

function safeDateStr(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

function safeDateTime(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function safeDateFull(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN').replace(/\//g, '-');
}

const ZONE_NAME_MAP_KEY = 'env_zone_name_map';

function loadZoneNameMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ZONE_NAME_MAP_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function saveZoneNameMap(map: Record<string, string>) {
  try {
    localStorage.setItem(ZONE_NAME_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function useEnvironment() {
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [history, setHistory] = useState<EnvironmentReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoneNameMap, setZoneNameMap] = useState<Record<string, string>>(loadZoneNameMap);
  const fetchVersionRef = useRef(0);

  const getZoneDisplayName = useCallback((zone: string) => {
    return zoneNameMap[zone]?.trim() || zone;
  }, [zoneNameMap]);

  const updateZoneNameMap = useCallback((map: Record<string, string>) => {
    setZoneNameMap(map);
    saveZoneNameMap(map);
  }, []);

  const fetchLatest = useCallback(async () => {
    const version = ++fetchVersionRef.current;
    try {
      const { data } = await supabase
        .from('environment_readings')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(500);

      // 丢弃过期的请求结果，防止竞态覆盖
      if (version !== fetchVersionRef.current) return;

      if (!data) {
        setZones([]);
        return;
      }

      const zoneReadings = new Map<string, EnvironmentReading[]>();
      (data as EnvironmentReading[]).forEach((r) => {
        if (!zoneReadings.has(r.zone)) zoneReadings.set(r.zone, []);
        zoneReadings.get(r.zone)!.push(r);
      });

      const summaries: ZoneSummary[] = Array.from(zoneReadings.entries()).map(([zone, readings]) => {
        const merged: Partial<ZoneSummary> = { zone, lastUpdate: safeDateStr(readings[0]?.recorded_at) };
        for (const field of ['pm25', 'pm10', 'temp', 'humidity', 'co2'] as const) {
          for (const r of readings) {
            const val = r[field];
            if (val !== null && val !== undefined) {
              merged[field] = val;
              break;
            }
          }
        }
        const s: ZoneSummary = {
          zone: merged.zone!,
          pm25: merged.pm25 ?? 0,
          pm10: merged.pm10 ?? 0,
          temp: merged.temp ?? 0,
          humidity: merged.humidity ?? 0,
          co2: merged.co2 ?? 0,
          status: 'good',
          lastUpdate: merged.lastUpdate || '',
        };
        s.status = calcStatus(s);
        return s;
      });

      const zoneOrder = [
        '面点加工间', '冷菜加工间', '操作间', '蔬菜加工间', '肉类加工间',
        '主食库房', '管理办公室', '后厨区', '就餐大厅', '备餐间', '冷库区', '验收区',
      ];
      summaries.sort((a, b) => {
        const aName = getZoneDisplayName(a.zone);
        const bName = getZoneDisplayName(b.zone);
        const ai = zoneOrder.indexOf(aName);
        const bi = zoneOrder.indexOf(bName);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      setZones(summaries);
      setError(null);
    } catch (e) {
      console.error('[useEnvironment] fetchLatest error:', e);
      // 丢弃过期请求的错误，避免覆盖正确数据
      if (version === fetchVersionRef.current) {
        setError('数据加载失败');
        setZones([]);
      }
    }
  }, [getZoneDisplayName]);

  const fetchHistory = useCallback(async (zone: string) => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

      const { data } = await supabase
        .from('environment_readings')
        .select('*')
        .eq('zone', zone)
        .gte('recorded_at', startOfDay)
        .order('recorded_at', { ascending: true })
        .limit(100);

      setHistory((data ?? []) as EnvironmentReading[]);
    } catch (e) {
      console.error('[useEnvironment] fetchHistory error:', e);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLatest().finally(() => setLoading(false));
    const timer = setInterval(() => {
      fetchLatest().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchLatest]);

  const insertReading = useCallback(async (reading: Omit<EnvironmentReading, 'id' | 'created_at'>) => {
    try {
      const { data: inserted, error } = await supabase.from('environment_readings').insert(reading).select('id').single();
      if (error) throw error;
      if (!isElectron()) {
        await syncInsert('environment_readings', reading as Record<string, unknown>, inserted?.id);
      }
      await fetchLatest();
    } catch (e) {
      console.error('[useEnvironment] insertReading error:', e);
      throw e;
    }
  }, [fetchLatest]);

  return { zones, history, loading, error, fetchLatest, fetchHistory, insertReading, thresholds, zoneNameMap, updateZoneNameMap, getZoneDisplayName };
}