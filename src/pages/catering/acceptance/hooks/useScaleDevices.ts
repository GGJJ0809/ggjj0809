import { nowBeijing } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';

export interface ScaleDevice {
  id: number;
  device_no: string;
  device_name: string;
  device_sn: string;
  device_ip: string | null;
  device_key: string;
  gateway: string | null;
  install_address: string | null;
  device_mac: string | null;
  zone: string;
  canteen: string;
  stall: string | null;
  password: string | null;
  max_capacity: number | null;
  precision_value: number | null;
  unit: string | null;
  division_value: number | null;
  comm_protocol: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScaleDeviceInput {
  device_no: string;
  device_name: string;
  device_sn: string;
  device_ip?: string;
  device_key: string;
  gateway?: string;
  install_address?: string;
  device_mac?: string;
  zone: string;
  canteen: string;
  stall?: string;
  password?: string;
  max_capacity?: number;
  precision_value?: number;
  unit?: string;
  division_value?: number;
  comm_protocol?: string;
  status?: string;
  notes?: string;
}

export function useScaleDevices() {
  const [devices, setDevices] = useState<ScaleDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('scale_devices')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setDevices((data ?? []) as ScaleDevice[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const addDevice = useCallback(async (input: CreateScaleDeviceInput) => {
    const row = {
      device_no: input.device_no,
      device_name: input.device_name,
      device_sn: input.device_sn,
      device_ip: input.device_ip ?? null,
      device_key: input.device_key,
      gateway: input.gateway ?? null,
      install_address: input.install_address ?? null,
      device_mac: input.device_mac ?? null,
      zone: input.zone,
      canteen: input.canteen,
      stall: input.stall ?? null,
      password: input.password ?? null,
      max_capacity: input.max_capacity ?? null,
      precision_value: input.precision_value ?? null,
      unit: input.unit ?? 'kg',
      division_value: input.division_value ?? null,
      comm_protocol: input.comm_protocol ?? null,
      status: input.status ?? 'active',
      notes: input.notes ?? null,
    };

    const { data, error: err } = await supabase
      .from('scale_devices')
      .insert(row)
      .select()
      .single();

    if (err) throw new Error(err.message);
    const inserted = data as ScaleDevice;
    setDevices((prev) => [inserted, ...prev]);
    return inserted;
  }, []);

  const updateDevice = useCallback(async (id: number, input: Partial<CreateScaleDeviceInput>) => {
    const row: Record<string, unknown> = {};
    if (input.device_no !== undefined) row.device_no = input.device_no;
    if (input.device_name !== undefined) row.device_name = input.device_name;
    if (input.device_sn !== undefined) row.device_sn = input.device_sn;
    if (input.device_ip !== undefined) row.device_ip = input.device_ip ?? null;
    if (input.device_key !== undefined) row.device_key = input.device_key;
    if (input.gateway !== undefined) row.gateway = input.gateway ?? null;
    if (input.install_address !== undefined) row.install_address = input.install_address ?? null;
    if (input.device_mac !== undefined) row.device_mac = input.device_mac ?? null;
    if (input.zone !== undefined) row.zone = input.zone;
    if (input.canteen !== undefined) row.canteen = input.canteen;
    if (input.stall !== undefined) row.stall = input.stall ?? null;
    if (input.password !== undefined) row.password = input.password ?? null;
    if (input.max_capacity !== undefined) row.max_capacity = input.max_capacity ?? null;
    if (input.precision_value !== undefined) row.precision_value = input.precision_value ?? null;
    if (input.unit !== undefined) row.unit = input.unit;
    if (input.division_value !== undefined) row.division_value = input.division_value ?? null;
    if (input.comm_protocol !== undefined) row.comm_protocol = input.comm_protocol ?? null;
    if (input.status !== undefined) row.status = input.status;
    if (input.notes !== undefined) row.notes = input.notes ?? null;
    row.updated_at = nowBeijing();

    const { data, error: err } = await supabase
      .from('scale_devices')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (err) throw new Error(err.message);
    const updated = data as ScaleDevice;
    setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)));
    return updated;
  }, []);

  const deleteDevice = useCallback(async (id: number) => {
    const { error: err } = await supabase.from('scale_devices').delete().eq('id', id);
    if (err) throw new Error(err.message);
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return {
    devices,
    loading,
    error,
    fetchDevices,
    addDevice,
    updateDevice,
    deleteDevice,
  };
}