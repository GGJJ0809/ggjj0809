import { nowBeijing } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';
import { syncInsert, syncUpdate, syncBatchInsert } from '@/lib/dbSync';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

export interface AcceptanceRecord {
  id: number;
  record_no: string;
  accepted_at: string;
  ingredient: string;
  supplier: string;
  expected: number;
  actual: number;
  deviation: number;
  unit: string;
  inspector: string;
  certificates: string[];
  status: 'pass' | 'warning' | 'fail';
  inbound_at: string | null;
  inbound_status: 'pending' | 'submitted' | 'failed';
  inbound_remark: string;
  created_at: string;
  inbound_material_id?: number | null;
  supplier_id?: number | null;
}

export interface CreateAcceptanceInput {
  ingredient: string;
  supplier?: string;
  expected?: number;
  actual?: number;
  unit?: string;
  inspector?: string;
  certificates?: string[];
  inbound_material_id?: number | null;
  supplier_id?: number | null;
}

function calcStatus(deviation: number): 'pass' | 'warning' | 'fail' {
  const abs = Math.abs(deviation);
  if (abs > 8) return 'fail';
  if (abs > 3) return 'warning';
  return 'pass';
}

function calcDeviation(expected: number, actual: number): number {
  if (expected === 0) return 0;
  return parseFloat((((actual - expected) / expected) * 100).toFixed(1));
}

function genRecordNo(): string {
  return `ACC${Date.now()}`;
}

export function useAcceptance(dateFilter?: string) {
  const [records, setRecords] = useState<AcceptanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('acceptance_records')
        .select('*')
        .order('accepted_at', { ascending: false });

      if (dateFilter) {
        const start = `${dateFilter}T00:00:00+08:00`;
        const end = `${dateFilter}T23:59:59+08:00`;
        query = query.gte('accepted_at', start).lte('accepted_at', end);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setRecords((data ?? []) as AcceptanceRecord[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const addRecord = useCallback(async (input: CreateAcceptanceInput) => {
    const expected = input.expected ?? 0;
    const actual = input.actual ?? 0;
    const deviation = calcDeviation(expected, actual);
    const status = calcStatus(deviation);
    const record_no = genRecordNo();
    const accepted_at = nowBeijing();

    const row = {
      record_no,
      ingredient: input.ingredient,
      supplier: input.supplier ?? '',
      expected,
      actual,
      deviation,
      unit: input.unit ?? 'kg',
      inspector: input.inspector ?? '',
      certificates: input.certificates ?? [],
      status,
      inbound_status: 'pending',
      accepted_at,
      inbound_material_id: input.inbound_material_id ?? null,
      supplier_id: input.supplier_id ?? null,
    };

    const { data, error: err } = await supabase
      .from('acceptance_records')
      .insert(row)
      .select()
      .single();

    if (err) throw err;
    const inserted = data as AcceptanceRecord;

    // 仅在非 Electron 环境才同步到本地
    if (!isElectron()) {
      await syncInsert('acceptance_records', row, inserted.id);
    }

    setRecords((prev) => [inserted, ...prev]);
    return inserted;
  }, []);

  const addRecordsBatch = useCallback(async (inputs: Omit<AcceptanceRecord, 'id' | 'created_at' | 'inbound_at' | 'inbound_remark' | 'inbound_status'>[]) => {
    const rows = inputs.map((r) => ({
      record_no: r.record_no ?? genRecordNo(),
      accepted_at: r.accepted_at,
      ingredient: r.ingredient,
      supplier: r.supplier ?? '',
      expected: r.expected,
      actual: r.actual,
      deviation: r.deviation,
      unit: r.unit ?? 'kg',
      inspector: r.inspector ?? '',
      certificates: r.certificates ?? [],
      status: r.status,
      inbound_status: 'pending',
      inbound_material_id: r.inbound_material_id ?? null,
      supplier_id: r.supplier_id ?? null,
    }));

    const { data, error: err } = await supabase
      .from('acceptance_records')
      .insert(rows)
      .select();

    if (err) throw err;
    const inserted = (data ?? []) as AcceptanceRecord[];

    // 仅在非 Electron 环境才同步到本地
    if (!isElectron()) {
      await syncBatchInsert(
        'acceptance_records',
        rows,
        inserted.map((i) => i.id),
      );
    }

    setRecords((prev) => [...inserted, ...prev]);
    return inserted;
  }, []);

  const submitInbound = useCallback(async (ids: number[]) => {
    const now = nowBeijing();
    const updateData = { inbound_status: 'submitted', inbound_at: now, updated_at: now };

    const { error: err } = await supabase
      .from('acceptance_records')
      .update(updateData)
      .in('id', ids);

    if (err) throw err;

    // 仅在非 Electron 环境才同步到本地
    if (!isElectron()) {
      for (const id of ids) {
        await syncUpdate('acceptance_records', updateData, id);
      }
    }

    setRecords((prev) =>
      prev.map((r) =>
        ids.includes(r.id)
          ? { ...r, inbound_status: 'submitted', inbound_at: now }
          : r
      )
    );
  }, []);

  return {
    records,
    loading,
    error,
    fetchRecords,
    addRecord,
    addRecordsBatch,
    submitInbound,
  };
}