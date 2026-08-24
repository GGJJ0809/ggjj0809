import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { syncInsert, syncUpdate, syncDelete } from '@/lib/dbSync';
import { useTrayDisplayDevices } from './useTrayDisplayDevices';
import { todayBeijing, dateToBeijing } from '@/lib/dateUtils';
import { getLocalServerPort } from '@/lib/localServer';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

export interface TrayStation {
  id: number;
  name: string;
  category: string;
  dish_name: string;
  dish_img: string;
  station_code: string;
  location: string;
  is_active: boolean;
  tare_weight: number;
  capacity_max: number;
  sort_order: number;
  product_item_id: number | null;
  hw_enabled: boolean;
  hw_ip: string;
  hw_port: number;
  hw_sn: string;
  hw_last_seen: string | null;
  hw_last_weight: number;
}

export interface DishOption {
  id: number;
  name: string;
  category: string;
  img: string;
}

export interface PickupLog {
  id: number;
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
}

export interface StationSummary extends TrayStation {
  today_pickups: number;
  today_weight: number;
  recent_pickup_time: string | null;
}

export interface CategorySummary {
  category: string;
  stations: number;
  total_pickups: number;
  total_weight: number;
}

export interface ProductCategory {
  id: number;
  name: string;
}

const MEAL_TYPES = ['早餐', '午餐', '晚餐'];

export function useTrayTracking() {
  const [stations, setStations] = useState<TrayStation[]>([]);
  const [logs, setLogs] = useState<PickupLog[]>([]);
  const [summaries, setSummaries] = useState<StationSummary[]>([]);
  const [categorySummaries, setCategorySummaries] = useState<CategorySummary[]>([]);
  const [categories, setCategories] = useState<string[]>(['全部']);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeal, setSelectedMeal] = useState('午餐');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [selectedDate, setSelectedDate] = useState('');
  const [allDishes, setAllDishes] = useState<DishOption[]>([]);
  const [addLogModalOpen, setAddLogModalOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<TrayStation | null>(null);

  const {
    devices: displayDevices,
    loading: displayLoading,
    fetchDevices,
    fetchStationOptions,
    createDevice,
    updateDevice,
    deleteDevice,
    getRegisterUrl,
    getDishesUrl,
    getWeightReportUrl,
    getWeightQueryUrl,
    getWebSocketUrl,
    manualRegister,
  } = useTrayDisplayDevices();

  const init = useCallback(async () => {
    try {
      // 默认始终显示今天
      setSelectedDate(todayBeijing());

      const { data: catData } = await supabase
        .from('product_categories')
        .select('id, name')
        .order('sort_order');

      // 如果本地没有分类数据，自动插入默认分类
      if (!catData || catData.length === 0) {
        const defaults = [
          { name: '荤菜', sort_order: 1 },
          { name: '素菜', sort_order: 2 },
          { name: '主食', sort_order: 3 },
          { name: '汤品', sort_order: 4 },
          { name: '凉菜', sort_order: 5 },
          { name: '家常菜', sort_order: 6 },
          { name: '热菜', sort_order: 7 },
          { name: '炖煲', sort_order: 8 },
          { name: '蒸菜', sort_order: 9 },
          { name: '油炸', sort_order: 10 },
          { name: '海鲜', sort_order: 11 },
          { name: '肉食', sort_order: 12 },
          { name: '小吃', sort_order: 13 },
        ];
        for (const cat of defaults) {
          await supabase.from('product_categories').insert(cat);
        }
        const { data: newData } = await supabase
          .from('product_categories')
          .select('id, name')
          .order('sort_order');
        setProductCategories(newData || []);
      } else {
        setProductCategories(catData);
      }
    } catch {
      setSelectedDate(todayBeijing());
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  const fetchData = useCallback(async () => {
    if (!selectedDate) {
      console.log('[useTrayTracking] fetchData skipped: selectedDate is empty');
      return;
    }
    setLoading(true);
    try {
      console.log('[useTrayTracking] fetchData start, selectedDate:', selectedDate, 'selectedMeal:', selectedMeal);
      const { data: dishData } = await supabase
        .from('product_items')
        .select('id, name, status, media, product_categories(id, name)')
        .eq('status', 'active')
        .order('id');
      console.log('[useTrayTracking] dishData count:', dishData?.length || 0);

      const { data: trayData } = await supabase
        .from('tray_stations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      console.log('[useTrayTracking] trayData count:', trayData?.length || 0);

      // 1. 先从 Supabase 查询取餐记录
      const { data: logData } = await supabase
        .from('tray_pickup_logs')
        .select('*')
        .gte('pickup_time', `${selectedDate}T00:00:00+08:00`)
        .lte('pickup_time', `${selectedDate}T23:59:59+08:00`)
        .eq('meal_type', selectedMeal)
        .order('pickup_time', { ascending: false });
      console.log('[useTrayTracking] logData count:', logData?.length || 0);

      let allLogs: PickupLog[] = logData || [];

      // 2. Electron 环境下，再从本地 SQLite API 读取作为补充
      if (isElectron() && allLogs.length === 0) {
        try {
          const port = getLocalServerPort() || 8081;
          const res = await fetch(`http://localhost:${port}/api/public/tray-pickup-logs`);
          if (res.ok) {
            const json = await res.json();
            if (json.code === 0 && Array.isArray(json.data)) {
              // 本地 API 返回的数据字段名跟 Supabase 一致
              const localLogs = json.data.map((item: any) => ({
                id: item.id,
                station_code: item.station_code || '',
                dish_name: item.dish_name || '',
                category: item.category || '',
                meal_type: item.meal_type || selectedMeal,
                pickup_time: item.pickup_time || `${selectedDate}T00:00:00+08:00`,
                weight_before: Number(item.weight_before) || 0,
                weight_after: Number(item.weight_after) || 0,
                pickup_weight: Number(item.pickup_weight) || 0,
                pickup_portions: Number(item.pickup_portions) || 1,
                person_id: item.person_id || null,
                notes: item.notes || null,
              })) as PickupLog[];
              // 过滤 meal_type（本地 API 没有按 meal_type 过滤的能力）
              const filteredLocal = localLogs.filter((l) => l.meal_type === selectedMeal);
              if (filteredLocal.length > 0) {
                console.log('[useTrayTracking] 从本地 SQLite 补充', filteredLocal.length, '条取餐记录');
                allLogs = filteredLocal;
              }
            }
          }
        } catch (localErr: any) {
          console.log('[useTrayTracking] 本地 API 读取失败:', localErr.message);
        }
      }

      const dishes = dishData || [];
      const trays: TrayStation[] = (trayData || []).map((t) => {
        const dish = dishes.find((d) => d.id === t.product_item_id);
        const media = dish?.media as Array<{ url: string }> | null;
        const catName = (dish?.product_categories as { name: string } | null)?.name || t.category;
        return {
          ...t,
          dish_name: dish?.name || t.dish_name,
          category: catName,
          dish_img: media?.[0]?.url || '',
        };
      });

      const existingProductIds = new Set(trays.map((t) => t.product_item_id));
      const trayStationsFromDishes: TrayStation[] = dishes
        .filter((d) => !existingProductIds.has(d.id))
        .map((d, idx) => {
          const cat = (d.product_categories as { name: string } | null)?.name || '其他';
          const media = d.media as Array<{ url: string }> | null;
          return {
            id: -(d.id),
            name: `${cat}盘`,
            category: cat,
            dish_name: d.name,
            dish_img: media?.[0]?.url || '',
            station_code: `AUTO-${d.id}`,
            location: '取餐区',
            is_active: true,
            tare_weight: 800,
            capacity_max: 60,
            sort_order: 100 + idx,
            product_item_id: d.id,
            hw_enabled: false,
            hw_ip: '',
            hw_port: 0,
            hw_sn: '',
            hw_last_seen: null,
            hw_last_weight: 0,
          };
        });

      const allStations = [...trays, ...trayStationsFromDishes];
      console.log('[useTrayTracking] allStations count:', allStations.length);
      setStations(allStations);

      setLogs(allLogs);

      const summaryMap: Record<string, { pickups: number; weight: number; recent: string | null }> = {};
      allLogs.forEach((log) => {
        if (!summaryMap[log.station_code]) {
          summaryMap[log.station_code] = { pickups: 0, weight: 0, recent: null };
        }
        summaryMap[log.station_code].pickups += 1;
        summaryMap[log.station_code].weight += Number(log.pickup_weight) || 0;
        if (!summaryMap[log.station_code].recent || log.pickup_time > summaryMap[log.station_code].recent!) {
          summaryMap[log.station_code].recent = log.pickup_time;
        }
      });

      const stationSummaries: StationSummary[] = allStations.map((s) => ({
        ...s,
        today_pickups: summaryMap[s.station_code]?.pickups || 0,
        today_weight: summaryMap[s.station_code]?.weight || 0,
        recent_pickup_time: summaryMap[s.station_code]?.recent || null,
      }));
      console.log('[useTrayTracking] stationSummaries count:', stationSummaries.length);
      setSummaries(stationSummaries);

      const catSet = new Set(allStations.map((s) => s.category).filter(Boolean));
      setCategories(['全部', ...Array.from(catSet)]);

      const catMap: Record<string, CategorySummary> = {};
      stationSummaries.forEach((s) => {
        if (!catMap[s.category]) {
          catMap[s.category] = { category: s.category, stations: 0, total_pickups: 0, total_weight: 0 };
        }
        catMap[s.category].stations += 1;
        catMap[s.category].total_pickups += s.today_pickups;
        catMap[s.category].total_weight += s.today_weight;
      });
      setCategorySummaries(Object.values(catMap));

      const mappedDishes = (dishes || []).map((d: any) => {
        const media = d.media as Array<{ url: string }> | null;
        const cat = (d.product_categories as { name: string } | null)?.name || '其他';
        return { id: d.id, name: d.name, category: cat, img: media?.[0]?.url || '' };
      });
      setAllDishes(mappedDishes);
    } catch (err: any) {
      console.error('[useTrayTracking] fetchData error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedMeal]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ★ MQTT 实时推送：设备重量上报时自动刷新数据
  useEffect(() => {
    if (!isElectron()) return;
    const api = (window as any).electronAPI;
    if (!api?.onTrayDataChanged) return;

    console.log('[useTrayTracking] 已注册 MQTT 实时推送监听器');
    const cleanup = api.onTrayDataChanged((data: any) => {
      console.log('[useTrayTracking] MQTT 推送触发刷新:', data?.type, data?.dish_name, data?.pickup_weight + 'g');
      fetchData();
    });
    return () => {
      cleanup?.();
      console.log('[useTrayTracking] MQTT 实时推送监听器已卸载');
    };
  }, [fetchData]);

  const createStation = useCallback(async (data: {
    name: string;
    station_code: string;
    category: string;
    location: string;
    dish_name: string;
    tare_weight: number;
    capacity_max: number;
    sort_order: number;
    is_active: boolean;
    hw_enabled: boolean;
    hw_ip: string;
    hw_port: number;
    hw_sn: string;
    product_item_id: number | null;
  }) => {
    const row = {
      name: data.name,
      station_code: data.station_code,
      category: data.category,
      location: data.location,
      dish_name: data.dish_name,
      tare_weight: data.tare_weight,
      capacity_max: data.capacity_max,
      sort_order: data.sort_order,
      is_active: data.is_active,
      hw_enabled: data.hw_enabled,
      hw_ip: data.hw_ip || null,
      hw_port: data.hw_port || null,
      hw_sn: data.hw_sn || null,
      product_item_id: data.product_item_id,
    };
    console.log('[useTrayTracking] createStation inserting:', row);
    const { data: result, error } = await supabase
      .from('tray_stations')
      .insert(row)
      .select('id')
      .single();
    console.log('[useTrayTracking] createStation result:', result, 'error:', error);
    if (!error && result) {
      if (!isElectron()) {
        await syncInsert('tray_stations', row, result.id);
      }
    }
    if (!error) {
      try {
        await fetchData();
        console.log('[useTrayTracking] createStation fetchData completed');
      } catch (fetchErr: any) {
        console.error('[useTrayTracking] createStation fetchData failed:', fetchErr.message);
      }
    }
    return { error, data: result };
  }, [fetchData]);

  const updateStation = useCallback(async (id: number, data: {
    name?: string;
    station_code?: string;
    category?: string;
    location?: string;
    dish_name?: string;
    tare_weight?: number;
    capacity_max?: number;
    sort_order?: number;
    is_active?: boolean;
    hw_enabled?: boolean;
    hw_ip?: string;
    hw_port?: number;
    hw_sn?: string;
    product_item_id?: number | null;
  }) => {
    console.log('[useTrayTracking] updateStation id:', id, 'data:', data);
    const { error } = await supabase
      .from('tray_stations')
      .update(data)
      .eq('id', id);
    console.log('[useTrayTracking] updateStation error:', error);
    if (!error) {
      if (!isElectron()) {
        await syncUpdate('tray_stations', data, id);
      }
      try {
        await fetchData();
        console.log('[useTrayTracking] updateStation fetchData completed');
      } catch (fetchErr: any) {
        console.error('[useTrayTracking] updateStation fetchData failed:', fetchErr.message);
      }
    }
    return { error };
  }, [fetchData]);

  const deleteStation = useCallback(async (id: number) => {
    console.log('[useTrayTracking] deleteStation id:', id);
    const { error } = await supabase
      .from('tray_stations')
      .delete()
      .eq('id', id);
    console.log('[useTrayTracking] deleteStation error:', error);
    if (!error) {
      if (!isElectron()) {
        await syncDelete('tray_stations', id);
      }
      try {
        await fetchData();
        console.log('[useTrayTracking] deleteStation fetchData completed');
      } catch (fetchErr: any) {
        console.error('[useTrayTracking] deleteStation fetchData failed:', fetchErr.message);
      }
    }
    return { error };
  }, [fetchData]);

  const addPickupLog = useCallback(async (data: {
    station: TrayStation;
    weight_before: number;
    weight_after: number;
    person_id?: string;
    notes?: string;
  }) => {
    const pickup_weight = Math.max(0, data.weight_before - data.weight_after);

    let stationCode = data.station.station_code;
    let stationId = data.station.id;
    let newStationId: number | null = null;
    if (data.station.id < 0 && data.station.product_item_id) {
      const newCode = `TRY-AUTO-${data.station.product_item_id}`;
      const { data: existing } = await supabase
        .from('tray_stations')
        .select('id, station_code')
        .eq('station_code', newCode)
        .maybeSingle();

      if (!existing) {
        const { data: newStation } = await supabase.from('tray_stations').insert({
          name: `${data.station.category}盘`,
          category: data.station.category,
          dish_name: data.station.dish_name,
          station_code: newCode,
          location: '取餐区',
          is_active: true,
          tare_weight: 800,
          capacity_max: 60,
          sort_order: 100,
          product_item_id: data.station.product_item_id,
        }).select('id').single();
        if (newStation) {
          newStationId = newStation.id;
          if (!isElectron()) {
            await syncInsert('tray_stations', {
              name: `${data.station.category}盘`,
              category: data.station.category,
              dish_name: data.station.dish_name,
              station_code: newCode,
              location: '取餐区',
              is_active: true,
              tare_weight: 800,
              capacity_max: 60,
              sort_order: 100,
              product_item_id: data.station.product_item_id,
            }, newStation.id);
          }
        }
      }
      stationCode = newCode;
      stationId = existing?.id ?? newStationId ?? null;
    }

    const row = {
      station_id: stationId > 0 ? stationId : null,
      station_code: stationCode,
      dish_name: data.station.dish_name || '未知菜品',
      category: data.station.category,
      meal_type: selectedMeal,
      weight_before: data.weight_before,
      weight_after: data.weight_after,
      pickup_weight,
      pickup_portions: 1,
      person_id: data.person_id || null,
      notes: data.notes || null,
    };

    const { data: inserted, error } = await supabase.from('tray_pickup_logs').insert(row).select('id').single();
    if (!error) {
      if (!isElectron()) {
        await syncInsert('tray_pickup_logs', row, inserted?.id);
      }
      await fetchData();
    }
    return { error };
  }, [selectedMeal, fetchData]);

  const bindStationToDish = useCallback(async (stationId: number, productItemId: number | null) => {
    const { error } = await supabase.from('tray_stations').update({ product_item_id: productItemId }).eq('id', stationId);
    if (!error) {
      if (!isElectron()) {
        await syncUpdate('tray_stations', { product_item_id: productItemId }, stationId);
      }
      await fetchData();
    }
    return { error };
  }, [fetchData]);

  const filteredSummaries = selectedCategory === '全部'
    ? summaries
    : summaries.filter((s) => s.category === selectedCategory);

  const filteredLogs = selectedCategory === '全部'
    ? logs
    : logs.filter((l) => l.category === selectedCategory);

  const stationMap: Record<string, { tare_weight: number }> = {};
  stations.forEach((s) => {
    stationMap[s.station_code] = { tare_weight: s.tare_weight || 0 };
  });

  return {
    stations,
    logs: filteredLogs,
    summaries: filteredSummaries,
    allSummaries: summaries,
    categorySummaries,
    categories,
    productCategories,
    loading,
    selectedMeal,
    setSelectedMeal,
    selectedCategory,
    setSelectedCategory,
    selectedDate,
    setSelectedDate,
    addLogModalOpen,
    setAddLogModalOpen,
    selectedStation,
    setSelectedStation,
    addPickupLog,
    refetch: fetchData,
    MEAL_TYPES,
    displayDevices,
    displayLoading,
    refreshDisplays: fetchDevices,
    createDisplayDevice: createDevice,
    updateDisplayDevice: updateDevice,
    deleteDisplayDevice: deleteDevice,
    getRegisterUrl,
    getDishesUrl,
    getWeightReportUrl,
    getWeightQueryUrl,
    getWebSocketUrl,
    manualRegister,
    stationMap,
    allDishes,
    bindStationToDish,
    createStation,
    updateStation,
    deleteStation,
  };
}