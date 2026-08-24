import { useState, useCallback, useRef, useEffect } from 'react';
import { useTrayDisplayDevices } from '../hooks/useTrayDisplayDevices';
import { useDishes } from '@/pages/catering/dishes/hooks/useDishes';
import BindDishesConfig from './BindDishesConfig';
import TodayDishesModal from './TodayDishesModal';
import { supabase } from '@/lib/supabase';
import { localDb } from '@/lib/localDb';
import { nowBeijing } from '@/lib/dateUtils';

function checkIsElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

function getDb() {
  return checkIsElectron() ? localDb : supabase;
}

function todayStr() {
  const now = nowBeijing();
  return now.slice(0, 10);
}

interface Props {
  devices: any[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (data: any) => Promise<{ error: any }>;
  onUpdate: (id: number, data: any) => Promise<{ error: any }>;
  onDelete: (id: number) => Promise<{ error: any }>;
  stationOptions?: any[];
  getRegisterUrl?: (sn: string, key: string) => string;
  getDishesUrl?: (token: string) => string;
  getWeightReportUrl?: (sn: string, key: string) => string;
  getWeightQueryUrl?: (sn: string, key: string) => string;
  getWebSocketUrl?: (sn: string, key: string) => string;
  localPort?: number;
  lanIp?: string;
  manualRegister?: (sn: string, key: string) => Promise<{ data?: any; error?: any }>;
}

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  online: { label: '在线', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-400' },
  offline: { label: '离线', bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-300' },
  warning: { label: '异常', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400' },
};

const deviceTypeConfig: Record<string, { label: string; icon: string }> = {
  display_scale: { label: '取餐牌+称重', icon: 'ri-restaurant-2-line' },
  display: { label: '电子取餐牌', icon: 'ri-tv-2-line' },
  scale: { label: '电子称重', icon: 'ri-weight-line' },
  xiaoniu: { label: '小牛自助餐设备', icon: 'ri-smartphone-line' },
  leniu: { label: '乐牛菜牌', icon: 'ri-tv-2-line' },
};

function getBindLabel(device: any, dishes: any[], categories: any[]) {
  const mode = device.bind_mode || 'station';
  const value = device.bind_value || '';
  if (mode === 'station') {
    return device.station_name ? `跟随托盘: ${device.station_name}` : '跟随托盘绑定';
  }
  if (mode === 'single') {
    const dish = dishes.find((d) => String(d.id) === value);
    return dish ? `菜品: ${dish.name}` : '未指定菜品';
  }
  // fallback for old data
  if (mode === 'all') return '全部菜品 (旧)';
  if (mode === 'category') return '按分类 (旧)';
  if (mode === 'dishes') return '多菜品 (旧)';
  return '跟随托盘绑定';
}

export default function TrayDisplayDevices({
  devices,
  loading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  stationOptions: stationOptionsProp,
  getRegisterUrl,
  getDishesUrl,
  getWeightReportUrl,
  getWeightQueryUrl,
  getWebSocketUrl,
  localPort,
  lanIp,
  manualRegister,
}: Props) {
  const { stationOptions: stationOptionsFromHook } = useTrayDisplayDevices();
  const stationOptions = stationOptionsProp ?? stationOptionsFromHook;
  const { dishes: productDishes, categories: dishCategories, loading: dishesLoading, addDish: addProductDish, updateDish: updateProductDish, deleteDish: deleteProductDish } = useDishes();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any>(null);
  const [expandedDeviceId, setExpandedDeviceId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    sn: '',
    hw_key: '',
    station_id: '',
    location: '',
    notes: '',
    device_type: 'display_scale',
    bind_plate_before_take: '1',
    ui_template: '1',
    weigh_alarm_model: '1',
    min_settlement_weight: '10',
    stable_difference: '2',
    alarm_below_grams: '-1000',
    max_weight_dish: '5000',
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [registeringId, setRegisteringId] = useState<number | null>(null);
  const [deviceToasts, setDeviceToasts] = useState<{ id: number; type: 'success' | 'error'; msg: string }[]>([]);
  // Push to display (电子屏)
  const [syncDate, setSyncDate] = useState(todayStr());
  const [syncing, setSyncing] = useState(false);

  // 今日菜品管理弹窗
  const [todayDishesDevice, setTodayDishesDevice] = useState<any>(null);

  // 乐牛菜牌菜谱管理状态（保留旧的，用于菜品绑定配置）
  const [dishesModalDevice, setDishesModalDevice] = useState<any>(null);
  const [dishFormData, setDishFormData] = useState({ id: '', dishName: '', unit: '份', imageUrl: '', calories: '', protein: '', fat: '', carbohydrate: '', fiber: '' });
  const [dishEditingId, setDishEditingId] = useState<string | null>(null);
  const [showDishForm, setShowDishForm] = useState(false);
  const [dishFormError, setDishFormError] = useState('');
  const [dishSubmitting, setDishSubmitting] = useState(false);
  const [showDishDeleteId, setShowDishDeleteId] = useState<string | null>(null);
  const [dishToasts, setDishToasts] = useState<{ id: number; type: 'success' | 'error'; msg: string }[]>([]);

  const addDishToast = useCallback((type: 'success' | 'error', msg: string) => {
    const id = Date.now();
    setDishToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setDishToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const addDeviceToast = useCallback((type: 'success' | 'error', msg: string) => {
    const id = Date.now();
    setDeviceToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setDeviceToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const openDishesModal = useCallback((device: any) => {
    setDishesModalDevice(device);
  }, []);

  const closeDishesModal = useCallback(() => {
    setDishesModalDevice(null);
    setShowDishForm(false);
    setDishEditingId(null);
    setDishFormData({ id: '', dishName: '', unit: '份', imageUrl: '', calories: '', protein: '', fat: '', carbohydrate: '', fiber: '' });
    setDishFormError('');
  }, []);

  const openDishAdd = useCallback(() => {
    setDishFormData({ id: '', dishName: '', unit: '份', imageUrl: '', calories: '', protein: '', fat: '', carbohydrate: '', fiber: '' });
    setDishEditingId(null);
    setDishFormError('');
    setShowDishForm(true);
  }, []);

  const openDishEdit = useCallback((dish: any) => {
    setDishFormData({
      id: String(dish.id),
      dishName: dish.name || '',
      unit: '份',
      imageUrl: dish.img || '',
      calories: String(dish.calories ?? ''),
      protein: String(dish.protein ?? ''),
      fat: String(dish.fat ?? ''),
      carbohydrate: String(dish.carbs ?? ''),
      fiber: String(dish.fiber ?? ''),
    });
    setDishEditingId(String(dish.id));
    setDishFormError('');
    setShowDishForm(true);
  }, []);

  const handleDishSubmit = useCallback(async () => {
    if (!dishFormData.dishName.trim()) {
      setDishFormError('请输入菜品名称');
      return;
    }
    setDishSubmitting(true);
    setDishFormError('');
    try {
      const payload = {
        name: dishFormData.dishName.trim(),
        category_id: dishCategories[0]?.id || 1,
        status: 'active',
        price: 0,
        calories: Number(dishFormData.calories) || 0,
        protein: Number(dishFormData.protein) || 0,
        fat: Number(dishFormData.fat) || 0,
        carbs: Number(dishFormData.carbohydrate) || 0,
        fiber: Number(dishFormData.fiber) || 0,
        method: '',
        nutrition: '',
        contraindications: '',
        imgBase64: dishFormData.imageUrl.trim() || undefined,
      };
      if (dishEditingId) {
        const result = await updateProductDish(Number(dishEditingId), payload);
        if (!result.success) {
          throw new Error(result.error || '更新失败');
        }
        addDishToast('success', `「${payload.name}」已更新`);
      } else {
        const result = await addProductDish(payload);
        if (!result.success) {
          throw new Error(result.error || '添加失败');
        }
        addDishToast('success', `「${payload.name}」已添加`);
      }
      setShowDishForm(false);
      setDishFormData({ id: '', dishName: '', unit: '份', imageUrl: '', calories: '', protein: '', fat: '', carbohydrate: '', fiber: '' });
      setDishEditingId(null);
    } catch (err: any) {
      setDishFormError(err.message || '保存失败');
    } finally {
      setDishSubmitting(false);
    }
  }, [dishFormData, dishEditingId, dishCategories, addProductDish, updateProductDish, addDishToast]);

  const handleDishDelete = useCallback(async (id: string) => {
    try {
      const result = await deleteProductDish(Number(id));
      if (!result.success) {
        throw new Error(result.error || '删除失败');
      }
      setShowDishDeleteId(null);
      addDishToast('success', '已删除');
    } catch (err: any) {
      addDishToast('error', err.message || '删除失败');
    }
  }, [deleteProductDish, addDishToast]);

  const handleManualRegister = useCallback(async (device: any) => {
    if (!manualRegister) return;
    setRegisteringId(device.id);
    try {
      const { data, error } = await manualRegister(device.sn, device.hw_key);
      if (error) {
        addDeviceToast('error', `「${device.name}」注册失败：${error.message || '未知错误'}`);
      } else {
        addDeviceToast('success', `「${device.name}」注册成功！Token: ${data?.token?.slice(0, 8)}...`);
        onRefresh();
      }
    } catch (err: any) {
      addDeviceToast('error', `「${device.name}」注册失败：${err.message || '未知错误'}`);
    } finally {
      setRegisteringId(null);
    }
  }, [manualRegister, addDeviceToast, onRefresh]);

  // 推送今日菜品到电子屏
  // 数据来源：dish_nutrition 表中对应日期的数据（由「周菜单配置」页面规划写入）
  // 设备通过 bind-info-config / all/dishes-list/page 自动拉到当日菜品
  const handleSyncToDisplay = useCallback(async () => {
    setSyncing(true);
    try {
      const db = getDb();

      // Step 1: 查 dish_nutrition 中 syncDate 有没有数据
      const { data: dayData, error: queryErr } = await db
        .from('dish_nutrition')
        .select('id, meal_type')
        .eq('menu_date', syncDate);

      if (queryErr) {
        addDeviceToast('error', `查询失败：${queryErr.message}`);
        return;
      }

      if (!dayData || dayData.length === 0) {
        addDeviceToast('error', `${syncDate} 没有菜品数据。请先在「周菜单配置」中规划今日菜单，再推送。`);
        return;
      }

      // Step 2: 统计各餐段菜品数
      const mealCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
      dayData.forEach((r: any) => {
        const mt = typeof r.meal_type === 'number' ? r.meal_type : 0;
        mealCounts[mt] = (mealCounts[mt] || 0) + 1;
      });

      const total = dayData.length;
      const mealNames = ['早餐', '午餐', '晚餐'];
      const parts = [0, 1, 2]
        .filter((mt) => mealCounts[mt] > 0)
        .map((mt) => `${mealNames[mt]}${mealCounts[mt]}道`);
      const detail = parts.join(' · ');

      addDeviceToast('success', `${syncDate} 共 ${total} 道菜品（${detail}），设备自动拉取即可显示今日菜单`);
    } catch (e: any) {
      addDeviceToast('error', `同步失败：${e.message || '未知错误'}`);
    } finally {
      setSyncing(false);
    }
  }, [syncDate, addDeviceToast]);

  const dishFormRef = useRef<HTMLDivElement>(null);

  // 表单显示时自动滚动到底部
  useEffect(() => {
    if (showDishForm && dishFormRef.current) {
      setTimeout(() => {
        dishFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  }, [showDishForm]);

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      sn: '',
      hw_key: '',
      station_id: '',
      location: '',
      notes: '',
      device_type: 'display_scale',
      bind_plate_before_take: '1',
      ui_template: '1',
      weigh_alarm_model: '1',
      min_settlement_weight: '10',
      stable_difference: '2',
      alarm_below_grams: '-1000',
      max_weight_dish: '5000',
    });
    setFormError('');
    setEditingDevice(null);
    setShowConfig(false);
  }, []);

  const openAdd = useCallback(() => {
    resetForm();
    setShowAddModal(true);
  }, [resetForm]);

  const openEdit = useCallback((device: any) => {
    console.log('[TrayDisplayDevices][openEdit] ====== 打开编辑弹窗 ======');
    console.log('[TrayDisplayDevices][openEdit] device.id=' + device.id + ', device.sn=' + device.sn);
    console.log('[TrayDisplayDevices][openEdit] device.ui_template =', device.ui_template, '(type: ' + typeof device.ui_template + ')');
    console.log('[TrayDisplayDevices][openEdit] 完整 device:', JSON.stringify({ id: device.id, sn: device.sn, ui_template: device.ui_template, bind_plate_before_take: device.bind_plate_before_take, weigh_alarm_model: device.weigh_alarm_model }));
    setEditingDevice(device);
    setFormData({
      name: device.name || '',
      sn: device.sn || '',
      hw_key: device.hw_key || '',
      station_id: device.station_id ? String(device.station_id) : '',
      location: device.location || '',
      notes: device.notes || '',
      device_type: device.device_type || 'display_scale',
      bind_plate_before_take: String(device.bind_plate_before_take ?? 1),
      ui_template: String(device.ui_template ?? 1),
      weigh_alarm_model: String(device.weigh_alarm_model ?? 1),
      min_settlement_weight: String(device.min_settlement_weight ?? 10),
      stable_difference: String(device.stable_difference ?? 2),
      alarm_below_grams: String(device.alarm_below_grams ?? -1000),
      max_weight_dish: String(device.max_weight_dish ?? 5000),
    });
    setFormError('');
    setShowAddModal(true);
  }, []);

  const validateForm = useCallback(() => {
    if (!formData.name.trim()) return '请输入设备名称';
    if (!formData.sn.trim()) return '请输入设备编号 / SN';
    if (!formData.hw_key.trim()) return '请输入验证码 (Key)';
    return '';
  }, [formData.name, formData.sn, formData.hw_key]);

  const handleSubmit = useCallback(async () => {
    const error = validateForm();
    if (error) {
      setFormError(error);
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const hasStation = !!formData.station_id;
      const payload = {
        name: formData.name.trim(),
        sn: formData.sn.trim(),
        hw_key: formData.hw_key.trim(),
        station_id: formData.station_id ? Number(formData.station_id) : null,
        location: formData.location.trim(),
        notes: formData.notes.trim(),
        device_type: formData.device_type,
        bind_plate_before_take: Number(formData.bind_plate_before_take) || 1,
        ui_template: Number(formData.ui_template) || 1,
        weigh_alarm_model: Number(formData.weigh_alarm_model) || 1,
        min_settlement_weight: Number(formData.min_settlement_weight) || 10,
        stable_difference: Number(formData.stable_difference) || 2,
        alarm_below_grams: Number(formData.alarm_below_grams) || -1000,
        max_weight_dish: Number(formData.max_weight_dish) || 5000,
        // 选了取餐站就默认绑定模式为 station，设备跟随托盘显示菜品
        bind_mode: hasStation ? 'station' : 'all',
        bind_value: '',
      };

      console.log('[TrayDisplayDevices][handleSubmit] ====== 提交设备配置 ======');
      console.log('[TrayDisplayDevices][handleSubmit] isEdit=' + !!editingDevice + ', deviceId=' + (editingDevice?.id || 'new'));
      console.log('[TrayDisplayDevices][handleSubmit] formData.ui_template = "' + formData.ui_template + '"');
      console.log('[TrayDisplayDevices][handleSubmit] payload.ui_template = ' + payload.ui_template);
      console.log('[TrayDisplayDevices][handleSubmit] 完整 payload:', JSON.stringify(payload, null, 2));
      if (editingDevice) {
        console.log('[TrayDisplayDevices][handleSubmit] 编辑前设备数据 ui_template = ' + editingDevice.ui_template);
        const { error: err } = await onUpdate(editingDevice.id, payload);
        console.log('[TrayDisplayDevices][handleSubmit] onUpdate 结果: err=', err);
        if (err) {
          setFormError(err.message || '保存失败');
          setSubmitting(false);
          return;
        }
      } else {
        const { error: err } = await onCreate(payload);
        console.log('[TrayDisplayDevices][handleSubmit] onCreate 结果: err=', err);
        if (err) {
          setFormError(err.message || '添加失败');
          setSubmitting(false);
          return;
        }
      }

      console.log('[TrayDisplayDevices][handleSubmit] 保存成功，准备刷新列表...');
      setSubmitting(false);
      setShowAddModal(false);
      resetForm();
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || '保存失败，请重试');
      setSubmitting(false);
    }
  }, [formData, editingDevice, onCreate, onUpdate, onRefresh, validateForm, resetForm]);

  const handleDelete = useCallback(async (device: any) => {
    if (!confirm(`确定删除电子屏「${device.name}」？此操作不可恢复。`)) return;
    try {
      const { error } = await onDelete(device.id);
      if (error) {
        console.error('删除失败:', error);
        return;
      }
      onRefresh();
    } catch (err: any) {
      console.error('删除异常:', err);
    }
  }, [onDelete, onRefresh]);

  const handleBindSave = useCallback(async (bindMode: string, bindValue: string) => {
    if (!dishesModalDevice) return;
    const { error } = await onUpdate(dishesModalDevice.id, {
      bind_mode: bindMode,
      bind_value: bindValue,
    });
    if (error) throw new Error(error.message || '保存绑定设置失败');
  }, [dishesModalDevice, onUpdate]);

  const handleCopy = useCallback(async (text: string, deviceId: number, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(deviceId);
      setCopiedField(field);
      setTimeout(() => {
        setCopiedId(null);
        setCopiedField(null);
      }, 2000);
    } catch {
      // fallback
    }
  }, []);

  const onlineCount = devices.filter((d) => d.status === 'online').length;
  const offlineCount = devices.filter((d) => d.status === 'offline').length;
  const warningCount = devices.filter((d) => d.status === 'warning').length;
  const displayScaleCount = devices.filter((d) => d.device_type === 'display_scale').length;
  const displayCount = devices.filter((d) => d.device_type === 'display').length;
  const scaleCount = devices.filter((d) => d.device_type === 'scale').length;
  const xiaoniuCount = devices.filter((d) => d.device_type === 'xiaoniu').length;
  const leniuCount = devices.filter((d) => d.device_type === 'leniu').length;

  const formatTime = useCallback((iso: string | null) => {
    if (!iso) return '从未';
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  // 映射 productDishes 为弹窗需要的格式
  const mappedDishes = productDishes.map((d) => ({
    id: String(d.id),
    dishName: d.name,
    unit: '份',
    imageUrl: d.img || '',
    calories: d.calories,
    protein: d.protein,
    fat: d.fat,
    carbohydrate: d.carbs,
    fiber: d.fiber,
  }));

  return (
    <div>
      {/* Device Toasts */}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {deviceToasts.map((t) => (
          <div key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm pointer-events-auto transition-all ${
              t.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-50 border border-red-100 text-red-600'
            }`}>
            <i className={t.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {t.msg}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4 mb-4">
        {[
          {
            label: '设备总数',
            value: devices.length,
            icon: 'ri-tv-2-line',
            color: 'text-slate-700',
            bg: 'bg-slate-100',
          },
          {
            label: '在线设备',
            value: onlineCount,
            icon: 'ri-wifi-line',
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            label: '离线设备',
            value: offlineCount,
            icon: 'ri-wifi-off-line',
            color: 'text-slate-500',
            bg: 'bg-slate-50',
          },
          {
            label: '取餐牌+称重',
            value: displayScaleCount,
            icon: 'ri-restaurant-2-line',
            color: 'text-teal-600',
            bg: 'bg-teal-50',
          },
          {
            label: '小牛自助餐',
            value: xiaoniuCount,
            icon: 'ri-smartphone-line',
            color: 'text-orange-600',
            bg: 'bg-orange-50',
          },
          {
            label: '电子取餐牌',
            value: displayCount,
            icon: 'ri-tv-2-line',
            color: 'text-sky-600',
            bg: 'bg-sky-50',
          },
          {
            label: '电子称重',
            value: scaleCount,
            icon: 'ri-weight-line',
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: '乐牛菜牌',
            value: leniuCount,
            icon: 'ri-tv-2-line',
            color: 'text-violet-600',
            bg: 'bg-violet-50',
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3"
          >
            <div
              className={`w-10 h-10 flex items-center justify-center rounded-lg ${s.bg}`}
            >
              <i className={`${s.icon} ${s.color} text-xl`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">电子屏设备列表</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            管理智能取餐盘配套设备（电子取餐牌 / 电子称重 / 一体设备）
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync to Display */}
          <input
            type="date"
            value={syncDate}
            onChange={(e) => setSyncDate(e.target.value)}
            className="text-xs border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-400 cursor-pointer w-[120px]"
          />
          <button
            type="button"
            onClick={handleSyncToDisplay}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs border border-amber-200 text-amber-600 px-3 py-2 rounded-lg hover:bg-amber-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
            title="确认今日菜品数据已就绪（数据来自「周菜单配置」），设备自动拉取显示"
          >
            {syncing ? (
              <><i className="ri-loader-4-line animate-spin" />推送中...</>
            ) : (
              <><i className="ri-upload-cloud-line" />推送电子屏</>
            )}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 bg-white px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line" />
            刷新
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1.5 text-xs bg-slate-900 text-white px-3 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />
            新增设备
          </button>
        </div>
      </div>

      {/* Device list */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <i className="ri-tv-2-line text-3xl mb-3 block" />
            <p className="text-sm">暂无电子屏设备</p>
            <p className="text-xs mt-1">点击右上角「新增设备」开始添加</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {devices.map((device) => {
              const cfg =
                statusConfig[device.status as keyof typeof statusConfig] ||
                statusConfig.offline;
              const typeCfg =
                deviceTypeConfig[device.device_type as keyof typeof deviceTypeConfig] ||
                deviceTypeConfig.display_scale;
              const isExpanded = expandedDeviceId === device.id;
              const registerUrl = getRegisterUrl ? getRegisterUrl(device.sn, device.hw_key) : '';
              const dishesUrl = getDishesUrl && device.token ? getDishesUrl(device.token) : '';
              const weightReportUrl = getWeightReportUrl ? getWeightReportUrl(device.sn, device.hw_key) : '';
              const weightQueryUrl = getWeightQueryUrl ? getWeightQueryUrl(device.sn, device.hw_key) : '';
              const hasWeightApi = device.device_type !== 'display';
              return (
                <div key={device.id}>
                  <div className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                    {/* Icon */}
                    <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                      <i className={`${typeCfg.icon} text-slate-500 text-lg`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {device.name}
                        </p>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          {typeCfg.label}
                        </span>
                        <span
                          className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="font-mono">SN: {device.sn}</span>
                        <span>·</span>
                        <span>位置: {device.location || '—'}</span>
                        {device.station_name && (
                          <>
                            <span>·</span>
                            <span>绑定取餐站: {device.station_name}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span>最近上线: {formatTime(device.last_seen)}</span>
                        <span>·</span>
                        <span>最近拉取: {formatTime(device.last_pull_at)}</span>
                        <span>·</span>
                        <span className="text-slate-500">
                          <i className="ri-link mr-0.5" />
                          {getBindLabel(device, productDishes, dishCategories)}
                        </span>
                        {device.notes && (
                          <span className="text-slate-300">备注: {device.notes}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!device.token && manualRegister && (
                        <button
                          type="button"
                          onClick={() => handleManualRegister(device)}
                          disabled={registeringId === device.id}
                          className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 cursor-pointer whitespace-nowrap disabled:opacity-50"
                        >
                          {registeringId === device.id ? (
                            <>
                              <i className="ri-loader-4-line animate-spin mr-1" />
                              注册中...
                            </>
                          ) : (
                            <>
                              <i className="ri-shield-keyhole-line mr-1" />
                              手动注册
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setTodayDishesDevice(device)}
                        className="text-xs bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-restaurant-line mr-1" />
                        今日菜品
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedDeviceId(isExpanded ? null : device.id)}
                        className="text-xs text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                      >
                        <i className={`ri-${isExpanded ? 'arrow-up-s-line' : 'arrow-down-s-line'} mr-1`} />
                        {isExpanded ? '收起' : '详情'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(device)}
                        className="text-xs text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-pencil-line mr-1" />
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(device)}
                        className="text-xs text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-delete-bin-line mr-1" />
                        删除
                      </button>
                    </div>
                  </div>

                  {/* Expanded: API endpoints */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 space-y-3">
                      {/* Register URL */}
                      {registerUrl && (
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="ri-shield-keyhole-line text-slate-500 text-sm" />
                            <span className="text-xs font-medium text-slate-600">设备注册地址</span>
                            <span className="text-xs text-slate-400">（POST 注册，获取 token）</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs font-mono text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-200 break-all">
                              {registerUrl}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(registerUrl, device.id, 'register')}
                              className="flex-shrink-0 text-xs bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                            >
                              {copiedId === device.id && copiedField === 'register' ? (
                                <>
                                  <i className="ri-check-line mr-1" />
                                  已复制
                                </>
                              ) : (
                                <>
                                  <i className="ri-file-copy-line mr-1" />
                                  复制
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* WebSocket URL */}
                      {(() => {
                        const wsUrl = getWebSocketUrl ? getWebSocketUrl(device.sn, device.hw_key) : '';
                        const hasDisplay = device.device_type === 'display' || device.device_type === 'display_scale';
                        return wsUrl && hasDisplay ? (
                          <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                            <div className="flex items-center gap-2 mb-2">
                              <i className="ri-signal-wifi-line text-emerald-500 text-sm" />
                              <span className="text-xs font-medium text-emerald-700">WebSocket 实时推送地址</span>
                              <span className="text-xs text-emerald-500">（实时推送菜品变更）</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-xs font-mono text-emerald-700 bg-white rounded-lg px-3 py-2 border border-emerald-200 break-all">
                                {wsUrl}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopy(wsUrl, device.id, 'wsUrl')}
                                className="flex-shrink-0 text-xs bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 cursor-pointer whitespace-nowrap"
                              >
                                {copiedId === device.id && copiedField === 'wsUrl' ? (
                                  <>
                                    <i className="ri-check-line mr-1" />
                                    已复制
                                  </>
                                ) : (
                                  <>
                                    <i className="ri-file-copy-line mr-1" />
                                    复制
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
                              <i className="ri-information-line" />
                              <span>电子屏连接此地址后，菜品信息变更会自动推送到屏幕</span>
                            </div>
                          </div>
                        ) : null;
                      })()}

                      {/* Dishes URL */}
                      {dishesUrl && (
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="ri-restaurant-line text-slate-500 text-sm" />
                            <span className="text-xs font-medium text-slate-600">菜谱拉取地址</span>
                            <span className="text-xs text-slate-400">（GET 拉取，带 Bearer token）</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs font-mono text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-200 break-all">
                              {dishesUrl}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(dishesUrl, device.id, 'dishes')}
                              className="flex-shrink-0 text-xs bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                            >
                              {copiedId === device.id && copiedField === 'dishes' ? (
                                <>
                                  <i className="ri-check-line mr-1" />
                                  已复制
                                </>
                              ) : (
                                <>
                                  <i className="ri-file-copy-line mr-1" />
                                  复制
                                </>
                              )}
                            </button>
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                            <span>
                              <i className="ri-key-line mr-0.5" />
                              Token: {device.token ? `${device.token.slice(0, 8)}...` : '未注册'}
                            </span>
                            <span>
                              <i className="ri-time-line mr-0.5" />
                              最后拉取: {formatTime(device.last_pull_at)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* No token hint */}
                      {!device.token && registerUrl && (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          <div className="flex items-start gap-2">
                            <i className="ri-information-line text-amber-500 mt-0.5" />
                            <div className="text-xs text-amber-700">
                              <p className="font-medium">设备尚未注册</p>
                              <p className="mt-0.5">设备需要先调用「注册地址」获取 token，才能拉取菜谱数据。</p>
                              {manualRegister && (
                                <button
                                  type="button"
                                  onClick={() => handleManualRegister(device)}
                                  disabled={registeringId === device.id}
                                  className="mt-2 inline-flex items-center gap-1 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 cursor-pointer whitespace-nowrap disabled:opacity-50"
                                >
                                  {registeringId === device.id ? (
                                    <>
                                      <i className="ri-loader-4-line animate-spin mr-1" />
                                      注册中...
                                    </>
                                  ) : (
                                    <>
                                      <i className="ri-shield-keyhole-line mr-1" />
                                      手动注册
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Weight Report URL */}
                      {hasWeightApi && weightReportUrl && (
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="ri-weight-line text-slate-500 text-sm" />
                            <span className="text-xs font-medium text-slate-600">称重上报地址</span>
                            <span className="text-xs text-slate-400">（POST 上报，自动记录取餐）</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs font-mono text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-200 break-all">
                              {weightReportUrl}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(weightReportUrl, device.id, 'weightReport')}
                              className="flex-shrink-0 text-xs bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                            >
                              {copiedId === device.id && copiedField === 'weightReport' ? (
                                <>
                                  <i className="ri-check-line mr-1" />
                                  已复制
                                </>
                              ) : (
                                <>
                                  <i className="ri-file-copy-line mr-1" />
                                  复制
                                </>
                              )}
                            </button>
                          </div>
                          <div className="mt-2 text-xs text-slate-400">
                            <p>请求体：{'{ "sn": "'}{device.sn}{'", "key": "'}{device.hw_key}{'", "weight": 当前重量(克) }'}</p>
                          </div>
                        </div>
                      )}

                      {/* Weight Query URL */}
                      {hasWeightApi && weightQueryUrl && (
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="ri-search-line text-slate-500 text-sm" />
                            <span className="text-xs font-medium text-slate-600">称重查询地址</span>
                            <span className="text-xs text-slate-400">（GET 查询当前重量）</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs font-mono text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-200 break-all">
                              {weightQueryUrl}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(weightQueryUrl, device.id, 'weightQuery')}
                              className="flex-shrink-0 text-xs bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                            >
                              {copiedId === device.id && copiedField === 'weightQuery' ? (
                                <>
                                  <i className="ri-check-line mr-1" />
                                  已复制
                                </>
                              ) : (
                                <>
                                  <i className="ri-file-copy-line mr-1" />
                                  复制
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 本地服务器 API 地址（所有设备都显示） */}
                      {localPort > 0 && (
                        <div className="space-y-3">
                          {/* 本机地址 */}
                          <div className="bg-sky-50 rounded-lg p-3 border border-sky-100">
                            <div className="flex items-center gap-2 mb-2">
                              <i className="ri-shield-keyhole-line text-sky-500 text-sm" />
                              <span className="text-xs font-medium text-sky-600">本机设备注册地址</span>
                              <span className="text-xs text-sky-400">（POST 注册，仅本机访问）</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-xs font-mono text-sky-700 bg-white rounded-lg px-3 py-2 border border-sky-200 break-all">
                                http://localhost:{localPort}/api/device/register?sn={device.sn}&key={device.hw_key}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopy(`http://localhost:${localPort}/api/device/register?sn=${encodeURIComponent(device.sn)}&key=${encodeURIComponent(device.hw_key)}`, device.id, 'localRegister')}
                                className="flex-shrink-0 text-xs bg-sky-600 text-white px-3 py-2 rounded-lg hover:bg-sky-700 cursor-pointer whitespace-nowrap"
                              >
                                {copiedId === device.id && copiedField === 'localRegister' ? (
                                  <>
                                    <i className="ri-check-line mr-1" />
                                    已复制
                                  </>
                                ) : (
                                  <>
                                    <i className="ri-file-copy-line mr-1" />
                                    复制
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* 局域网地址 */}
                          {lanIp && (
                            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                              <div className="flex items-center gap-2 mb-2">
                                <i className="ri-shield-keyhole-line text-emerald-500 text-sm" />
                                <span className="text-xs font-medium text-emerald-700">局域网设备注册地址</span>
                                <span className="text-xs text-emerald-500">（POST 注册，其他设备访问）</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 text-xs font-mono text-emerald-700 bg-white rounded-lg px-3 py-2 border border-emerald-200 break-all">
                                  http://{lanIp}:{localPort}/api/device/register?sn={device.sn}&key={device.hw_key}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(`http://${lanIp}:${localPort}/api/device/register?sn=${encodeURIComponent(device.sn)}&key=${encodeURIComponent(device.hw_key)}`, device.id, 'lanRegister')}
                                  className="flex-shrink-0 text-xs bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 cursor-pointer whitespace-nowrap"
                                >
                                  {copiedId === device.id && copiedField === 'lanRegister' ? (
                                    <>
                                      <i className="ri-check-line mr-1" />
                                      已复制
                                    </>
                                  ) : (
                                    <>
                                      <i className="ri-file-copy-line mr-1" />
                                      复制
                                    </>
                                  )}
                                </button>
                              </div>
                              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
                                <i className="ri-information-line" />
                                <span>如果设备在另一台机器上，请使用此地址注册</span>
                              </div>
                            </div>
                          )}

                          <div className="bg-sky-50 rounded-lg p-3 border border-sky-100">
                            <div className="flex items-center gap-2 mb-2">
                              <i className="ri-restaurant-line text-sky-500 text-sm" />
                              <span className="text-xs font-medium text-sky-600">本地菜谱拉取地址</span>
                              <span className="text-xs text-sky-400">（GET 拉取，带 Bearer token 或 ?token=xxx）</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-xs font-mono text-sky-700 bg-white rounded-lg px-3 py-2 border border-sky-200 break-all">
                                http://localhost:{localPort}/api/dishes
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopy(`http://localhost:${localPort}/api/dishes`, device.id, 'localDishes')}
                                className="flex-shrink-0 text-xs bg-sky-600 text-white px-3 py-2 rounded-lg hover:bg-sky-700 cursor-pointer whitespace-nowrap"
                              >
                                {copiedId === device.id && copiedField === 'localDishes' ? (
                                  <>
                                    <i className="ri-check-line mr-1" />
                                    已复制
                                  </>
                                ) : (
                                  <>
                                    <i className="ri-file-copy-line mr-1" />
                                    复制
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* 乐牛设备专属接口地址 */}
                          {device.device_type === 'leniu' && lanIp && (
                            <>
                              {/* 密钥交换地址（设备固件硬编码 8082 端口） */}
                              <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                                <div className="flex items-center gap-2 mb-2">
                                  <i className="ri-key-2-line text-amber-500 text-sm" />
                                  <span className="text-xs font-medium text-amber-700">密钥交换地址（乐牛固件硬编码）</span>
                                  <span className="text-xs text-amber-400">设备固件连 8082 端口</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <code className="flex-1 text-xs font-mono text-amber-700 bg-white rounded-lg px-3 py-2 border border-amber-200 break-all">
                                    http://{lanIp}:8082/yunshitang/exchange/key
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(`http://${lanIp}:8082/yunshitang/exchange/key`, device.id, 'leniuExchange')}
                                    className="flex-shrink-0 text-xs bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-600 cursor-pointer whitespace-nowrap"
                                  >
                                    {copiedId === device.id && copiedField === 'leniuExchange' ? '已复制' : '复制'}
                                  </button>
                                </div>
                                <div className="mt-2 text-xs text-amber-600">
                                  <i className="ri-error-warning-line mr-1" />
                                  <strong>8082 端口必须开放！</strong>设备固件硬编码此端口做密钥交换，与设备里配置的服务器端口无关。
                                  <br />
                                  <span className="text-amber-500">若连接失败：检查防火墙是否放行 8082，或用 netstat -ano | findstr :8082 查端口占用。</span>
                                </div>
                              </div>
                              {/* 乐牛注册 + 菜品地址 */}
                              <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
                                <div className="flex items-center gap-2 mb-2">
                                  <i className="ri-restaurant-line text-violet-500 text-sm" />
                                  <span className="text-xs font-medium text-violet-700">乐牛设备菜品接口地址</span>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <code className="flex-1 text-xs font-mono text-violet-700 bg-white rounded-lg px-3 py-2 border border-violet-200 break-all">
                                      http://{lanIp}:8082/yunshitang/api/v4/device/buffet/getbinde
                                    </code>
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(`http://${lanIp}:8082/yunshitang/api/v4/device/buffet/getbinde`, device.id, 'leniuDishes')}
                                      className="flex-shrink-0 text-xs bg-violet-600 text-white px-3 py-2 rounded-lg hover:bg-violet-700 cursor-pointer whitespace-nowrap"
                                    >
                                      {copiedId === device.id && copiedField === 'leniuDishes' ? '已复制' : '复制'}
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-2 text-xs text-violet-500">
                                  乐牛设备初始化时依次调用：exchange/key → 注册 → getbinde（拉取菜品）→ getsetting（拉取配置）
                                </div>
                              </div>
                            </>
                          )}
                          {/* 乐牛设备专属：今日菜品入口 */}
                          {device.device_type === 'leniu' && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setTodayDishesDevice(device)}
                                className="flex items-center gap-1.5 text-xs bg-sky-600 text-white px-3 py-2 rounded-lg hover:bg-sky-700 cursor-pointer whitespace-nowrap"
                              >
                                <i className="ri-restaurant-line mr-1" />
                                今日菜品
                              </button>
                              <span className="text-xs text-sky-500">
                                管理今日菜单（数据来自周菜谱），设备「切换菜品」显示今日列表
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Today Dishes Modal */}
      {todayDishesDevice && (
        <TodayDishesModal
          device={todayDishesDevice}
          onClose={() => setTodayDishesDevice(null)}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">
                {editingDevice ? '编辑电子屏设备' : '新增电子屏设备'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <i className="ri-close-line text-lg" />
              </button>
            </div>

            {/* Hint */}
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
              <div className="flex items-start gap-2">
                <i className="ri-information-line text-amber-500 mt-0.5" />
                <div className="text-xs text-amber-700">
                  <p className="font-medium">如何获取设备信息？</p>
                  <p className="mt-0.5">
                    在电子屏的「本机信息」或「关于设备」页面查看：设备序列号（SN）和验证码（Key）。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  设备名称 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="例如：打菜窗口屏"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    设备编号 (SN) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.sn}
                    onChange={(e) =>
                      setFormData({ ...formData, sn: e.target.value })
                    }
                    placeholder="本机信息 → SN"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    验证码 (Key) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.hw_key}
                    onChange={(e) =>
                      setFormData({ ...formData, hw_key: e.target.value })
                    }
                    placeholder="本机信息 → Key"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    设备类型
                  </label>
                  <select
                    value={formData.device_type}
                    onChange={(e) =>
                      setFormData({ ...formData, device_type: e.target.value })
                    }
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
                  >
                    <optgroup label="一体设备（屏幕+称重）">
                      <option value="display_scale">取餐牌+称重（通用一体设备）</option>
                      <option value="xiaoniu">小牛自助餐设备（屏幕+称重+托盘）</option>
                    </optgroup>
                    <optgroup label="独立设备">
                      <option value="display">电子取餐牌（仅显示菜品）</option>
                      <option value="scale">电子称重（仅称重上报）</option>
                    </optgroup>
                    <optgroup label="品牌专用">
                      <option value="leniu">乐牛菜牌（本地服务器直连）</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    绑定取餐站
                  </label>
                  <select
                    value={formData.station_id}
                    onChange={(e) =>
                      setFormData({ ...formData, station_id: e.target.value })
                    }
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
                  >
                    <option value="">不绑定</option>
                    {stationOptions.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.station_code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  安装位置
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  placeholder="例如：打菜窗口1号"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">备注</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="其他说明..."
                  rows={2}
                  maxLength={500}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 resize-none"
                />
                <p className="text-xs text-slate-400 mt-0.5 text-right">
                  {formData.notes.length}/500
                </p>
              </div>

              {/* Device Config Toggle */}
              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowConfig(!showConfig)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer whitespace-nowrap"
                >
                  <i className={`ri-${showConfig ? 'arrow-up-s-line' : 'arrow-down-s-line'}`} />
                  设备配置参数
                  <span className="text-xs text-slate-400">（称重、计价、报警等）</span>
                </button>

                {showConfig && (
                  <div className="mt-3 space-y-3">
                    {/* 使用模式 + UI模板 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">使用模式</label>
                        <select
                          value={formData.bind_plate_before_take}
                          onChange={(e) => setFormData({ ...formData, bind_plate_before_take: e.target.value })}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
                        >
                          <option value="1">1. 先绑盘后取餐</option>
                          <option value="2">2. 不绑盘取餐</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">UI 模板</label>
                        <select
                          value={formData.ui_template}
                          onChange={(e) => setFormData({ ...formData, ui_template: e.target.value })}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
                        >
                          <option value="1">1. 社餐计价模板</option>
                          <option value="2">2. 不计价营养计量模板</option>
                          <option value="3">3. 食堂计价营养计量模板</option>
                          <option value="4">4. 营养分析展示模板</option>
                        </select>
                      </div>
                    </div>

                    {/* 报警模式 */}
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">报警模式</label>
                      <select
                        value={formData.weigh_alarm_model}
                        onChange={(e) => setFormData({ ...formData, weigh_alarm_model: e.target.value })}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
                      >
                        <option value="1">1. 语音报警</option>
                        <option value="2">2. 语音+滴滴报警</option>
                        <option value="3">3. 屏蔽报警</option>
                        <option value="4">4. 滴滴报警</option>
                      </select>
                    </div>

                    {/* 重量参数 */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">计价起算重量 (g)</label>
                        <input
                          type="number"
                          value={formData.min_settlement_weight}
                          onChange={(e) => setFormData({ ...formData, min_settlement_weight: e.target.value })}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">计量精度 (g)</label>
                        <input
                          type="number"
                          value={formData.stable_difference}
                          onChange={(e) => setFormData({ ...formData, stable_difference: e.target.value })}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">最低重量报警 (g)</label>
                        <input
                          type="number"
                          value={formData.alarm_below_grams}
                          onChange={(e) => setFormData({ ...formData, alarm_below_grams: e.target.value })}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-500 mb-1">单次最大取重 (g)</label>
                      <input
                        type="number"
                        value={formData.max_weight_dish}
                        onChange={(e) => setFormData({ ...formData, max_weight_dish: e.target.value })}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {formError && (
                <div className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                  <i className="ri-error-warning-line" />
                  {formError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-1" />
                    保存中...
                  </>
                ) : editingDevice ? (
                  <>
                    <i className="ri-save-line mr-1" />
                    保存
                  </>
                ) : (
                  <>
                    <i className="ri-add-line mr-1" />
                    新增设备
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dishes Management Modal */}
      {dishesModalDevice && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Toasts */}
            <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
              {dishToasts.map((t) => (
                <div key={t.id}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm pointer-events-auto transition-all ${
                    t.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-50 border border-red-100 text-red-600'
                  }`}>
                  <i className={t.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
                  {t.msg}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-800">
                  「{dishesModalDevice.name}」菜谱管理
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  管理 product_items 统一菜品库（设备拉取此数据）
                </p>
              </div>
              <button
                type="button"
                onClick={closeDishesModal}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <i className="ri-close-line text-lg" />
              </button>
            </div>

            {/* Header bar */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">菜谱列表</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  共 {mappedDishes.length} 道菜品
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openDishAdd}
                  className="flex items-center gap-1.5 text-xs bg-slate-900 text-white px-3 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line" />
                  添加菜谱
                </button>
              </div>
            </div>

            {/* Dishes Table */}
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              {dishesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : mappedDishes.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <i className="ri-restaurant-line text-3xl mb-3 block" />
                  <p className="text-sm">暂无菜谱</p>
                  <p className="text-xs mt-1">点击右上角「添加菜谱」开始添加</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-50">
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">ID</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">菜品名称</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">热量(kcal)</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">蛋白质(g)</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">脂肪(g)</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">碳水(g)</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">膳食纤维(g)</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">单位</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">图片</th>
                        <th className="text-right text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {mappedDishes.map((dish) => (
                        <tr key={dish.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{dish.id}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{dish.dishName}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{dish.calories ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{dish.protein ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{dish.fat ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{dish.carbohydrate ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{dish.fiber ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{dish.unit}</td>
                          <td className="px-4 py-3">
                            {dish.imageUrl ? (
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100">
                                <img src={dish.imageUrl} alt={dish.dishName} className="w-full h-full object-cover object-top" />
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openDishEdit(dish)}
                                className="text-xs text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                              >
                                <i className="ri-pencil-line mr-1" />
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDishDeleteId(dish.id)}
                                className="text-xs text-red-500 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
                              >
                                <i className="ri-delete-bin-line mr-1" />
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Dish Add/Edit Form */}
            {showDishForm && (
              <div ref={dishFormRef} className="mt-4 bg-slate-50 rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-800">
                    {dishEditingId ? '编辑菜谱' : '添加菜谱'}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowDishForm(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <i className="ri-close-line text-lg" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">菜品 ID</label>
                    <input
                      type="text"
                      value={dishFormData.id}
                      onChange={(e) => setDishFormData({ ...dishFormData, id: e.target.value })}
                      placeholder="留空自动生成"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      菜品名称 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={dishFormData.dishName}
                      onChange={(e) => setDishFormData({ ...dishFormData, dishName: e.target.value })}
                      placeholder="例如：红烧肉"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">单位</label>
                    <input
                      type="text"
                      value={dishFormData.unit}
                      onChange={(e) => setDishFormData({ ...dishFormData, unit: e.target.value })}
                      placeholder="份"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">图片 URL</label>
                    <input
                      type="text"
                      value={dishFormData.imageUrl}
                      onChange={(e) => setDishFormData({ ...dishFormData, imageUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
                {/* Nutrition fields */}
                <div className="mt-3 grid grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">热量 (kcal)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={dishFormData.calories}
                      onChange={(e) => setDishFormData({ ...dishFormData, calories: e.target.value })}
                      placeholder="0"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">蛋白质 (g)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={dishFormData.protein}
                      onChange={(e) => setDishFormData({ ...dishFormData, protein: e.target.value })}
                      placeholder="0.0"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">脂肪 (g)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={dishFormData.fat}
                      onChange={(e) => setDishFormData({ ...dishFormData, fat: e.target.value })}
                      placeholder="0.0"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">碳水 (g)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={dishFormData.carbohydrate}
                      onChange={(e) => setDishFormData({ ...dishFormData, carbohydrate: e.target.value })}
                      placeholder="0.0"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">膳食纤维 (g)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={dishFormData.fiber}
                      onChange={(e) => setDishFormData({ ...dishFormData, fiber: e.target.value })}
                      placeholder="0.0"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
                {dishFormData.imageUrl && (
                  <div className="mt-2 w-16 h-16 rounded-lg overflow-hidden bg-slate-100">
                    <img src={dishFormData.imageUrl} alt="preview" className="w-full h-full object-cover object-top" />
                  </div>
                )}
                {dishFormError && (
                  <div className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-3">
                    <i className="ri-error-warning-line" />
                    {dishFormError}
                  </div>
                )}
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setShowDishForm(false)}
                    className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleDishSubmit}
                    disabled={dishSubmitting}
                    className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    {dishSubmitting ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-1" />
                        保存中...
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line mr-1" />
                        保存
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Delete Confirm */}
            {showDishDeleteId && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
                <div className="bg-white rounded-2xl p-6 w-80">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50">
                      <i className="ri-delete-bin-line text-red-500 text-lg" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">确认删除</p>
                      <p className="text-xs text-slate-500 mt-0.5">删除后设备将无法拉取此菜品</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDishDeleteId(null)}
                      className="flex-1 text-sm border border-slate-200 text-slate-600 rounded-lg py-2 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDishDelete(showDishDeleteId)}
                      className="flex-1 text-sm bg-red-500 text-white rounded-lg py-2 hover:bg-red-600 cursor-pointer whitespace-nowrap"
                    >
                      确认删除
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Bind Dishes Config */}
            {dishesModalDevice && (
              <div className="mt-6">
                <BindDishesConfig
                  deviceId={dishesModalDevice.id}
                  initialBindMode={dishesModalDevice.bind_mode || 'station'}
                  initialBindValue={dishesModalDevice.bind_value || ''}
                  dishes={productDishes.map((d) => ({ id: d.id, name: d.name, category_id: d.category_id }))}
                  categories={dishCategories.map((c) => ({ id: c.id, name: c.name }))}
                  onSave={handleBindSave}
                />
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}