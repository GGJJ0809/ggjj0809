import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { todayBeijing } from '@/lib/dateUtils';
import { getLocalServerPort } from '@/lib/localServer';

export interface PickupDetail {
  id: number;
  station_id: number | null;
  station_code: string;
  dish_name: string;
  category: string;
  meal_type: string;
  pickup_time: string;
  weight_before: number;
  weight_after: number;
  pickup_weight: number;
  pickup_portions: number;
  person_id: string | null;
  notes: string | null;
  created_at: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  source: string | null;
}

export interface PickupStats {
  total_pickups: number;
  total_weight: number;
  unique_dishes: number;
  unique_stations: number;
}

export const MEAL_TYPES = ['全部', '早餐', '午餐', '晚餐'];

// ★★★ 设备SN → 大队 映射表
const TEAM_SN_MAP: Record<string, string> = {
  '1000001751': '一大队', '1000001744': '一大队', '1000001746': '一大队', '1000001750': '一大队',
  '1000001665': '一大队', '1000001765': '一大队', '1000001710': '一大队', '1000001712': '一大队',
  '1000001747': '二大队', '1000001748': '二大队', '1000001664': '二大队', '1000003353': '二大队',
  '1000001749': '二大队', '1000001774': '二大队', '1000001743': '二大队', '1000001796': '二大队',
  '3000004123': '三大队', '3000004262': '三大队', '3000004122': '三大队', '3000004152': '三大队',
  '3000004121': '三大队', '3000004157': '三大队', '3000004172': '三大队', '3000004159': '三大队',
  '3000004147': '三大队', '3000004186': '三大队',
  '3000004171': '四大队', '3000004129': '四大队', '3000004146': '四大队', '3000004191': '四大队',
  '3000004155': '四大队', '3000004232': '四大队', '3000004144': '四大队', '3000004181': '四大队',
  '3000004161': '四大队', '3000004160': '四大队',
};

// ★★★ 已知全部SN集合（用于全量匹配）
const ALL_TEAM_SNS = new Set(Object.keys(TEAM_SN_MAP));

function classifyTeam(sn: string): string {
  return TEAM_SN_MAP[sn] || '其他';
}

export interface StationSnEntry {
  station_code: string;
  sn: string;
}

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

/** 将后端原始数据映射为前端类型 */
function mapLocalLog(item: any, selectedDate: string): PickupDetail {
  return {
    id: item.id,
    station_id: item.station_id || null,
    station_code: item.station_code || '',
    dish_name: item.dish_name || '',
    category: item.category || '',
    meal_type: item.meal_type || '午餐',
    pickup_time: item.pickup_time || `${selectedDate}T00:00:00+08:00`,
    weight_before: Number(item.weight_before) || 0,
    weight_after: Number(item.weight_after) || 0,
    pickup_weight: Number(item.pickup_weight) || 0,
    pickup_portions: Number(item.pickup_portions) || 1,
    person_id: item.person_id || null,
    notes: item.notes || null,
    created_at: item.pickup_time || '',
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    source: item.source || 'scale',
  };
}

export function usePickupDetails() {
  const [records, setRecords] = useState<PickupDetail[]>([]);
  const [stats, setStats] = useState<PickupStats>({ total_pickups: 0, total_weight: 0, unique_dishes: 0, unique_stations: 0 });
  const [categories, setCategories] = useState<string[]>(['全部']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(todayBeijing());
  const [selectedMeal, setSelectedMeal] = useState('全部');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 20;

  /** 从本地 SQLite API 读取取餐记录 */
  const fetchLocalLogs = useCallback(async (): Promise<PickupDetail[]> => {
    const port = getLocalServerPort() || 8081;
    const res = await fetch(`http://localhost:${port}/api/public/tray-pickup-logs`);
    if (!res.ok) throw new Error('本地 API 读取失败');
    const json = await res.json();
    if (json.code !== 0 || !Array.isArray(json.data)) throw new Error('本地 API 数据格式错误');
    return json.data.map((item: any) => mapLocalLog(item, selectedDate));
  }, [selectedDate]);

  /** 前端过滤本地数据 */
  const filterLocalLogs = useCallback((logs: PickupDetail[]) => {
    const startDate = new Date(`${selectedDate}T00:00:00+08:00`);
    const endDate = new Date(`${selectedDate}T23:59:59+08:00`);

    let filtered = logs.filter((l) => {
      const t = new Date(l.pickup_time || '');
      return !isNaN(t.getTime()) && t >= startDate && t <= endDate;
    });
    if (selectedMeal !== '全部') {
      filtered = filtered.filter((l) => l.meal_type === selectedMeal);
    }
    if (selectedCategory !== '全部') {
      filtered = filtered.filter((l) => l.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((l) =>
        (l.dish_name || '').toLowerCase().includes(q) ||
        (l.station_code || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [selectedDate, selectedMeal, selectedCategory, searchQuery]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ── Electron 环境下直接走本地 API，不使用 localDb 链式查询 ──
      if (isElectron()) {
        const localLogs = await fetchLocalLogs();
        const filtered = filterLocalLogs(localLogs);

        // 分页
        const startIdx = currentPage * pageSize;
        const paginated = filtered.slice(startIdx, startIdx + pageSize);
        setRecords(paginated);

        // Stats
        const totalPickups = filtered.length;
        const totalWeight = filtered.reduce((sum, l) => sum + (Number(l.pickup_weight) || 0), 0);
        const dishSet = new Set(filtered.map((l) => l.dish_name));
        const stationSet = new Set(filtered.map((l) => l.station_code));
        setStats({
          total_pickups: totalPickups,
          total_weight: totalWeight,
          unique_dishes: dishSet.size,
          unique_stations: stationSet.size,
        });

        // Categories
        const catSet = new Set<string>();
        filtered.forEach((l) => { if (l.category) catSet.add(l.category); });
        setCategories(['全部', ...Array.from(catSet).sort()]);

        // 分页越界回退
        if (paginated.length === 0 && currentPage > 0 && filtered.length > 0) {
          setCurrentPage(0);
        }

        setLoading(false);
        return;
      }

      // ── 浏览器环境下走 Supabase ──
      const startDate = `${selectedDate}T00:00:00+08:00`;
      const endDate = `${selectedDate}T23:59:59+08:00`;

      let query = supabase
        .from('tray_pickup_logs')
        .select('*', { count: 'exact' })
        .gte('pickup_time', startDate)
        .lte('pickup_time', endDate)
        .order('pickup_time', { ascending: false });

      if (selectedMeal !== '全部') {
        query = query.eq('meal_type', selectedMeal);
      }

      if (selectedCategory !== '全部') {
        query = query.eq('category', selectedCategory);
      }

      if (searchQuery.trim()) {
        query = query.or(`dish_name.ilike.%${searchQuery.trim()}%,station_code.ilike.%${searchQuery.trim()}%`);
      }

      // Apply pagination
      query = query.range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

      const { data, count, error: fetchErr } = await query;

      if (fetchErr) throw new Error(fetchErr.message);

      const logs = (data || []) as PickupDetail[];
      setRecords(logs);

      // Compute stats (across all records, not just current page)
      const { data: allData } = await supabase
        .from('tray_pickup_logs')
        .select('id, pickup_weight, dish_name, station_code')
        .gte('pickup_time', startDate)
        .lte('pickup_time', endDate);

      const allLogsForStats = (allData || []) as PickupDetail[];
      const totalPickups = allLogsForStats.length;
      const totalWeight = allLogsForStats.reduce((sum, l) => sum + (Number(l.pickup_weight) || 0), 0);
      const dishSet = new Set(allLogsForStats.map((l) => l.dish_name));
      const stationSet = new Set(allLogsForStats.map((l) => l.station_code));

      setStats({
        total_pickups: totalPickups,
        total_weight: totalWeight,
        unique_dishes: dishSet.size,
        unique_stations: stationSet.size,
      });

      // Collect categories from all data
      const { data: catData } = await supabase
        .from('tray_pickup_logs')
        .select('category')
        .gte('pickup_time', startDate)
        .lte('pickup_time', endDate);

      const catSet = new Set<string>();
      (catData || []).forEach((r) => {
        if (r.category) catSet.add(r.category);
      });

      setCategories(['全部', ...Array.from(catSet).sort()]);

      // Reset to page 0 if filters changed and we're beyond available pages
      if (count !== null && currentPage * pageSize >= count && currentPage > 0) {
        setCurrentPage(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedMeal, selectedCategory, searchQuery, currentPage, fetchLocalLogs, filterLocalLogs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    setCurrentPage(0);
  }, []);

  const handleMealChange = useCallback((m: string) => {
    setSelectedMeal(m);
    setCurrentPage(0);
  }, []);

  const handleCategoryChange = useCallback((c: string) => {
    setSelectedCategory(c);
    setCurrentPage(0);
  }, []);

  const handleDateChange = useCallback((d: string) => {
    setSelectedDate(d);
    setCurrentPage(0);
  }, []);

  /** 导出数据：todayOnly=true 仅导出当天全部餐段，false 导出全部历史 */
  const exportData = useCallback(async (todayOnly: boolean): Promise<PickupDetail[]> => {
    if (isElectron()) {
      const localLogs = await fetchLocalLogs();
      if (todayOnly) {
        // ★ 只按日期过滤，不叠加当前页面上的餐段/菜系/搜索筛选
        const startDate = new Date(`${selectedDate}T00:00:00+08:00`);
        const endDate = new Date(`${selectedDate}T23:59:59+08:00`);
        return localLogs.filter((l) => {
          const t = new Date(l.pickup_time || '');
          return !isNaN(t.getTime()) && t >= startDate && t <= endDate;
        });
      }
      return localLogs;
    }

    // Supabase（默认最多1000条，加 limit 确保大数据量不丢）
    let query = supabase.from('tray_pickup_logs').select('*').limit(50000);

    if (todayOnly) {
      const startDate = `${selectedDate}T00:00:00+08:00`;
      const endDate = `${selectedDate}T23:59:59+08:00`;
      query = query.gte('pickup_time', startDate).lte('pickup_time', endDate);
      // ★ 不叠加 selectedMeal / selectedCategory / searchQuery
    }

    query = query.order('pickup_time', { ascending: false });

    const { data, error: exportErr } = await query;
    if (exportErr) throw new Error(exportErr.message);
    return (data || []) as PickupDetail[];
  }, [selectedDate, fetchLocalLogs]);

  /** 构建 station_code → SN 映射（从 tray_display_devices + tray_stations 联合查询） */
  const fetchSnMapping = useCallback(async (): Promise<Record<string, StationSnEntry>> => {
    const mapping: Record<string, StationSnEntry> = {};

    try {
      // 1. 从 tray_display_devices 获取 sn→station_id，再联 tray_stations 获取 station_code
      const { data: devData } = await supabase
        .from('tray_display_devices')
        .select('sn, station_id')
        .not('sn', 'is', null)
        .neq('sn', '');

      if (devData && devData.length > 0) {
        const stationIds = [...new Set(devData.map((d: any) => d.station_id).filter(Boolean))];
        if (stationIds.length > 0) {
          const { data: stData } = await supabase
            .from('tray_stations')
            .select('id, station_code')
            .in('id', stationIds);

          if (stData) {
            const idToCode: Record<number, string> = {};
            stData.forEach((s: any) => { idToCode[s.id] = s.station_code; });

            devData.forEach((d: any) => {
              const code = idToCode[d.station_id];
              if (code && !mapping[code]) {
                mapping[code] = { station_code: code, sn: d.sn };
              }
            });
          }
        }
      }

      // 2. 补充：tray_stations 自身有 hw_sn 的
      const { data: hwSnData } = await supabase
        .from('tray_stations')
        .select('station_code, hw_sn')
        .not('hw_sn', 'is', null)
        .neq('hw_sn', '');

      if (hwSnData) {
        hwSnData.forEach((s: any) => {
          if (s.station_code && !mapping[s.station_code]) {
            mapping[s.station_code] = { station_code: s.station_code, sn: s.hw_sn };
          }
        });
      }
    } catch (e) {
      console.warn('[fetchSnMapping] 获取SN映射失败:', e);
    }

    return mapping;
  }, []);

  /** 导出取餐报告（含大队分类 + 餐盘餐段统计） */
  const exportReport = useCallback(async (todayOnly: boolean): Promise<{
    logs: PickupDetail[];
    stationSnMap: Record<string, StationSnEntry>;
  }> => {
    let logs: PickupDetail[];

    if (isElectron()) {
      const localLogs = await fetchLocalLogs();
      if (todayOnly) {
        // ★ 只按日期过滤，不叠加当前页面上的餐段/菜系/搜索筛选
        const startDate = new Date(`${selectedDate}T00:00:00+08:00`);
        const endDate = new Date(`${selectedDate}T23:59:59+08:00`);
        logs = localLogs.filter((l) => {
          const t = new Date(l.pickup_time || '');
          return !isNaN(t.getTime()) && t >= startDate && t <= endDate;
        });
      } else {
        logs = localLogs;
      }
    } else {
      let query = supabase.from('tray_pickup_logs').select('*').limit(50000);

      if (todayOnly) {
        const startDate = `${selectedDate}T00:00:00+08:00`;
        const endDate = `${selectedDate}T23:59:59+08:00`;
        query = query.gte('pickup_time', startDate).lte('pickup_time', endDate);
        // ★ 不叠加 selectedMeal / selectedCategory / searchQuery
      }

      query = query.order('pickup_time', { ascending: true });

      const { data, error: exportErr } = await query;
      if (exportErr) throw new Error(exportErr.message);
      logs = (data || []) as PickupDetail[];
    }

    const stationSnMap = await fetchSnMapping();
    return { logs, stationSnMap };
  }, [selectedDate, fetchLocalLogs, fetchSnMapping]);

  return {
    records,
    stats,
    categories,
    loading,
    error,
    selectedDate,
    selectedMeal,
    selectedCategory,
    searchQuery,
    currentPage,
    pageSize,
    setSelectedDate: handleDateChange,
    setSelectedMeal: handleMealChange,
    setSelectedCategory: handleCategoryChange,
    setSearchQuery: handleSearch,
    setCurrentPage,
    refetch: fetchData,
    exportData,
    exportReport,
    classifyTeam,
    ALL_TEAM_SNS,
  };
}