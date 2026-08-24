import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { nowBeijing } from '@/lib/dateUtils';

export interface ScaleOperator {
  id: number;
  device_sn: string;
  work_no: string;
  login_name: string;
  name: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  drp_user_id: number | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOperatorInput {
  work_no: string;
  login_name: string;
  name: string;
  password: string;
  phone?: string;
  role: string;
  device_sn: string;
}

export interface EditOperatorInput {
  device_sn?: string;
  is_active?: boolean;
}

// 同步操作员数据到本地服务器 SQLite（供电子秤登录验证）
async function syncToLocalServer(operators: ScaleOperator[]) {
  try {
    const origin = window.location.origin;
    await fetch(`${origin}/api/scale-operators/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operators }),
    });
  } catch {
    // 本地服务器可能未启动，静默失败
  }
}

export function useScaleOperators() {
  const [operators, setOperators] = useState<ScaleOperator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOperators = useCallback(async (deviceSn?: string) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('scale_operators').select('*').order('created_at', { ascending: false });
      if (deviceSn) {
        query = query.eq('device_sn', deviceSn);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      const list = (data ?? []) as ScaleOperator[];
      setOperators(list);
      // 同步到本地 SQLite 供电子秤登录
      syncToLocalServer(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  const createOperator = useCallback(async (input: CreateOperatorInput) => {
    const { data, error: err } = await supabase
      .from('scale_operators')
      .insert({
        work_no: input.work_no.trim(),
        login_name: input.login_name.trim(),
        name: input.name.trim(),
        password_hash: input.password.trim(),
        role: input.role,
        is_active: true,
        device_sn: input.device_sn,
        phone: input.phone?.trim() || null,
      })
      .select()
      .single();

    if (err) throw new Error(err.message);
    const created = data as ScaleOperator;
    setOperators((prev) => {
      const updated = [created, ...prev];
      syncToLocalServer(updated);
      return updated;
    });
    return created;
  }, []);

  const updateOperator = useCallback(async (id: number, input: EditOperatorInput) => {
    const row: Record<string, unknown> = { updated_at: nowBeijing() };
    if (input.device_sn !== undefined) row.device_sn = input.device_sn;
    if (input.is_active !== undefined) row.is_active = input.is_active;

    const { data, error: err } = await supabase
      .from('scale_operators')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (err) throw new Error(err.message);
    if (!data) throw new Error('更新成功但未能读取记录，请刷新页面重试');
    const updated = data as ScaleOperator;
    setOperators((prev) => {
      const list = prev.map((o) => (o.id === id ? updated : o));
      syncToLocalServer(list);
      return list;
    });
    return updated;
  }, []);

  const deleteOperator = useCallback(async (id: number) => {
    const { error: err } = await supabase.from('scale_operators').delete().eq('id', id);
    if (err) throw new Error(err.message);
    setOperators((prev) => {
      const list = prev.filter((o) => o.id !== id);
      syncToLocalServer(list);
      return list;
    });
  }, []);

  return {
    operators,
    loading,
    error,
    fetchOperators,
    createOperator,
    updateOperator,
    deleteOperator,
  };
}