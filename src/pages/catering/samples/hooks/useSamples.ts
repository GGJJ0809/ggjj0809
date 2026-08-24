import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { syncInsert, syncUpdate } from '@/lib/dbSync';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

// ─── 留样记录（Supabase CRUD）─────────────────────────────────────────────
export interface SampleRecord {
  id: number;
  record_no: string;
  sampled_at: string;
  meal: string;
  dish: string;
  weight: number;
  cabinet_id: string;
  slot: string;
  expire_at: string | null;
  status: 'stored' | 'expired' | 'disposed';
  operator: string;
  notes: string;
  photo_url: string | null;
  created_at: string;
}

export interface CreateSampleInput {
  meal: string;
  dish: string;
  weight?: number;
  cabinet_id?: string;
  slot?: string;
  expire_hours?: number;
  operator?: string;
  notes?: string;
}

function genRecordNo(): string {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `SP${d}${String(Date.now()).slice(-4)}`;
}

export function useSamples(dateFilter?: string) {
  const [records, setRecords] = useState<SampleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('sample_records')
        .select('*')
        .order('sampled_at', { ascending: false });

      if (dateFilter) {
        query = query
          .gte('sampled_at', `${dateFilter}T00:00:00+08:00`)
          .lte('sampled_at', `${dateFilter}T23:59:59+08:00`);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setRecords((data ?? []) as SampleRecord[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载留样记录失败';
      setError(msg);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const checkExpired = useCallback(async () => {
    try {
      const now = new Date();
      const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}+08:00`;
      await supabase
        .from('sample_records')
        .update({ status: 'expired', updated_at: nowStr })
        .eq('status', 'stored')
        .lt('expire_at', nowStr);
    } catch {
      // 过期检查失败不影响主流程
    }
    fetch();
  }, [fetch]);

  useEffect(() => {
    checkExpired();
  }, [checkExpired]);

  const addRecord = useCallback(async (input: CreateSampleInput) => {
    const hours = input.expire_hours ?? 48;
    const sampledAt = new Date();
    const expireAt = new Date(sampledAt.getTime() + hours * 3600 * 1000);

    const row = {
      record_no: genRecordNo(),
      meal: input.meal,
      dish: input.dish,
      weight: input.weight ?? 0,
      cabinet_id: input.cabinet_id ?? 'CB-01',
      slot: input.slot ?? '',
      expire_at: expireAt.toISOString(),
      status: 'stored',
      operator: input.operator ?? '',
      notes: input.notes ?? '',
    };

    const { data, error: insertError } = await supabase
      .from('sample_records')
      .insert(row)
      .select()
      .single();

    if (insertError) throw insertError;
    const inserted = data as SampleRecord;

    if (!isElectron()) {
      try {
        await syncInsert('sample_records', row, inserted.id);
      } catch { /* 本地同步失败不影响主流程 */ }
    }

    setRecords((prev) => [inserted, ...prev]);
    return inserted;
  }, []);

  const updateStatus = useCallback(async (id: number, status: SampleRecord['status']) => {
    const updateData = { status, updated_at: new Date().toISOString() };
    const { error: updateError } = await supabase
      .from('sample_records')
      .update(updateData)
      .eq('id', id);
    if (updateError) throw updateError;

    if (!isElectron()) {
      try {
        await syncUpdate('sample_records', updateData, id);
      } catch { /* 本地同步失败不影响主流程 */ }
    }

    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
  }, []);

  return { records, loading, error, fetch, addRecord, updateStatus };
}

// ─── 设备状态查询 Hook ────────────────────────────────────────────────────
export interface KeepDeviceInfo {
  id: number;
  name: string;
  device_sn: string;
  device_ip: string | null;
  model: string;
  status: string;
  total_doors: number;
  last_heartbeat: string | null;
  created_at: string;
}

export function useKeepDevices() {
  const [devices, setDevices] = useState<KeepDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('keep_devices')
        .select('*')
        .order('id');
      if (fetchError) throw fetchError;
      setDevices((data ?? []) as KeepDeviceInfo[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载设备列表失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  // 自动刷新：每 15 秒拉一次设备状态
  useEffect(() => {
    const timer = setInterval(fetch, 15000);
    return () => clearInterval(timer);
  }, [fetch]);

  return { devices, loading, error, fetch };
}

// ─── 柜门记录查询 Hook ────────────────────────────────────────────────────
export interface DoorRecord {
  id: number;
  device_sn: string;
  door_num: string;
  event_type: string;
  reason: string | null;
  operator: string | null;
  dish_name: string | null;
  recorded_at: string;
}

export function useDoorRecords(limit = 50) {
  const [records, setRecords] = useState<DoorRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('keep_door_records')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(limit);
      setRecords((data ?? []) as DoorRecord[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { fetch(); }, [fetch]);

  return { records, loading, fetch };
}