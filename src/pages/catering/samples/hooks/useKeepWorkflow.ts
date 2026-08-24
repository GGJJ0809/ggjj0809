import { useState, useCallback, useRef, useEffect } from 'react';
import { getLocalServerBase, ensureLocalServerPortInit } from '@/lib/localServer';

function getServer() { return getLocalServerBase(); }
const DEVICE_ID = '1';

export interface PendingSample {
  id: string;
  cookName: string;
  weight: number;
  pic: string;
  mealTimes: number;
  slot: string; // 柜门槽位，必填（1-12）
}

interface MenuDish {
  cookName: string;
  mealTimes: number;
  category: string;
}

export function useKeepWorkflow(onSuccess?: () => void) {
  const [menuDishes, setMenuDishes] = useState<MenuDish[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [pendingSamples, setPendingSamples] = useState<PendingSample[]>([]);
  const [uploading, setUploading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const tokenRef = useRef<string>('');

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // 登录获取 token（multipart/form-data，官方文档：/user/login）
  useEffect(() => { ensureLocalServerPortInit(); }, []);

  const ensureToken = useCallback(async (): Promise<string> => {
    if (tokenRef.current) return tokenRef.current;
    try {
      const formData = new FormData();
      formData.append('loginName', 'admin');
      formData.append('password', 'admin123');

      const res = await fetch(`${getServer()}/user/login`, {
        method: 'POST',
        body: formData,
      });
      if (!res) throw new Error('fetch 返回了 undefined（登录请求失败）');
      const data = await res.json();
      if (data.code === 1 && data.result?.token) {
        tokenRef.current = data.result.token;
        return data.result.token;
      }
      throw new Error(data.msg || data.message || '登录失败');
    } catch (e: unknown) {
      throw new Error(e instanceof Error ? e.message : '无法连接留样柜服务');
    }
  }, []);

  // 获取今日菜单
  const fetchMenuDishes = useCallback(async () => {
    setMenuLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getServer()}/api/public/display-config?key=display_config`);
      if (!res) throw new Error('fetch 返回了 undefined（获取菜单失败）');
      if (!res.ok) throw new Error('获取菜单失败');
      const json = await res.json();
      const configData = json?.data?.config_data;
      if (!configData?.menu) throw new Error('菜单数据为空');

      const menu = configData.menu;
      const allDishes: MenuDish[] = [
        ...(menu.breakfast || []).map((d: any) => ({ cookName: d.name, mealTimes: 0, category: d.category || '' })),
        ...(menu.lunch || []).map((d: any) => ({ cookName: d.name, mealTimes: 1, category: d.category || '' })),
        ...(menu.dinner || []).map((d: any) => ({ cookName: d.name, mealTimes: 2, category: d.category || '' })),
      ];
      const seen = new Set<string>();
      const unique = allDishes.filter((d) => {
        if (seen.has(d.cookName)) return false;
        seen.add(d.cookName);
        return true;
      });
      setMenuDishes(unique);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '获取菜单失败');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  // 开始留样（POST /cook/keep_b，multipart/form-data，Token 在 Header，直接传 base64 图片）
  const startKeep = useCallback(async (file: File, sampleId: string, weight: number, cookName: string): Promise<void> => {
    setUploading(true);
    try {
      const token = await ensureToken();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
      });

      const formData = new FormData();
      formData.append('id', sampleId);
      formData.append('cookName', cookName);   // ← 关键：把菜名传给设备服务端
      formData.append('deviceId', DEVICE_ID);
      formData.append('pic', base64);
      formData.append('weight', String(weight));

      const res = await fetch(`${getServer()}/cook/keep_b`, {
        method: 'POST',
        headers: { 'Token': token },
        body: formData,
      });
      if (!res) throw new Error('fetch 返回了 undefined（开始留样失败）');
      const data = await res.json();
      if (data.code !== 1) {
        throw new Error(data.msg || data.message || '开始留样失败');
      }
    } catch (e: unknown) {
      throw new Error(e instanceof Error ? e.message : '开始留样失败');
    } finally {
      setUploading(false);
    }
  }, [ensureToken]);

  // 添加一条留样到暂存列表
  const addPendingSample = useCallback((sample: PendingSample) => {
    setPendingSamples((prev) => [...prev, sample]);
    showToast('success', `「${sample.cookName}」已加入留样列表`);
  }, [showToast]);

  // 移除暂存列表中的一条
  const removePendingSample = useCallback((index: number) => {
    setPendingSamples((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);

  // 清空暂存列表
  const clearPendingSamples = useCallback(() => {
    setPendingSamples([]);
  }, []);

  // 完成留样（POST /cook/finish_keep，multipart/form-data，Token 在 Header）
  const finishKeep = useCallback(async (selectedMealTimes: number, gmtCookDate: string) => {
    if (pendingSamples.length === 0) {
      showToast('error', '暂存列表为空，请先添加留样菜品');
      return;
    }
    // 检查是否所有留样都已选择槽位
    const missingSlot = pendingSamples.find((s) => !s.slot);
    if (missingSlot) {
      showToast('error', `「${missingSlot.cookName}」未选择留样柜门，请重新添加`);
      return;
    }
    setFinishing(true);
    setError(null);
    try {
      const token = await ensureToken();

      const gmtCookTimestamp = new Date(gmtCookDate + 'T00:00:00+08:00').getTime();
      const weekTimes = new Date(gmtCookDate + 'T00:00:00+08:00').getDay();

      const list = pendingSamples.map((s) => ({
        id: s.id,
        deviceId: DEVICE_ID,
        cookName: s.cookName,
        cookCode: s.id,
        num: s.slot, // ← 柜门号必传
        operator: '',
        creatOperator: '',
        takeOperator: '',
        pic: '',
        weight: s.weight,
        state: 1,
        mealTimes: selectedMealTimes,
        weekTimes,
        gmtCook: String(gmtCookTimestamp),
        gmtKeep: '',
        gmtTake: '',
        gmtModify: '',
        gmtCreate: '',
      }));

      const formData = new FormData();
      formData.append('mealTimes', String(selectedMealTimes));
      formData.append('gmtCook', String(gmtCookTimestamp));
      formData.append('deviceId', DEVICE_ID);
      formData.append('list', JSON.stringify(list));
      formData.append('state', '1');

      const res = await fetch(`${getServer()}/cook/finish_keep`, {
        method: 'POST',
        headers: { 'Token': token },
        body: formData,
      });
      if (!res) throw new Error('fetch 返回了 undefined（完成留样失败）');
      const data = await res.json();
      if (data.code === 1) {
        setPendingSamples([]);
        showToast('success', `留样完成！共处理 ${list.length} 道菜品`);
        if (onSuccess) onSuccess();
      } else {
        throw new Error(data.msg || data.message || '完成留样失败');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '完成留样失败';
      setError(msg);
      showToast('error', msg);
    } finally {
      setFinishing(false);
    }
  }, [pendingSamples, ensureToken, showToast, onSuccess]);

  // 初始化时加载菜单
  useEffect(() => {
    fetchMenuDishes();
  }, [fetchMenuDishes]);

  // 检查某道菜是否已在暂存列表
  const isDishPending = useCallback(
    (cookName: string) => pendingSamples.some((s) => s.cookName === cookName),
    [pendingSamples],
  );

  return {
    menuDishes,
    menuLoading,
    pendingSamples,
    uploading,
    finishing,
    error,
    toast,
    startKeep,
    addPendingSample,
    removePendingSample,
    clearPendingSamples,
    finishKeep,
    fetchMenuDishes,
    isDishPending,
    clearError,
    showToast,
  };
}