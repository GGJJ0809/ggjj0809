import { useState, useCallback, useEffect } from 'react';
import { getLocalServerBase, ensureLocalServerPortInit } from '@/lib/localServer';

function getServer() { return getLocalServerBase(); }

export interface DishDetail {
  id: string;
  dish: string;
  weight: number;
  meal: string;
  operator: string;
  sampled_at: string;
  expire_at: string;
  photo_url: string;
}

export interface DoorInfo {
  num: number;
  state: 0 | 1 | 2;
  date: string;
  meal: string;
  mealTimes: 0 | 1 | 2;
  cookName: string;
  dishCount: number;
  dishes: DishDetail[];
  hoursKept: number;
  hoursExpired: number;
  isExpired: boolean;
  photoUrl: string;
  operator: string;
  amount: number;
  alreadyAmount: number;
  weight: number;
}

export interface MealSummaryItem {
  total: number;
  kept: number;
  mealTimes: 0 | 1 | 2;
}

export interface MenuCounts {
  breakfast: number;
  lunch: number;
  dinner: number;
}

export interface TempPoint {
  temperature: number | null;
  recordedAt: string;
}

export interface LatestTemp {
  temperature: number | null;
  humidity: number | null;
  recordedAt: string;
}

export interface DeviceInfo {
  deviceSn: string;
  model: string;
  status: string;
  lastHeartbeat: string | null;
  cabinetCount: number;
  usedCount: number;
  emptyCount: number;
}

export interface KeepDashboardData {
  device: DeviceInfo;
  doors: DoorInfo[];
  mealSummary: Record<string, MealSummaryItem>;
  menuCounts: MenuCounts;
  latestTemp: LatestTemp | null;
  tempHistory: TempPoint[];
}

export function useKeepDashboard() {
  const [data, setData] = useState<KeepDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { ensureLocalServerPortInit(); }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getServer()}/api/keep/dashboard`);
      if (!res || !res.ok) {
        if (!res) throw new Error('fetch 返回了 undefined（可能是 fetchGuard 或网络问题）');
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!json || json.code !== 0 || !json.data) throw new Error((json && json.msg) || '获取数据失败');
      setData(json.data as KeepDashboardData);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '连接本地服务失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const timer = setInterval(fetchDashboard, 30000);
    return () => clearInterval(timer);
  }, [fetchDashboard]);

  return { data, loading, error, refresh: fetchDashboard };
}