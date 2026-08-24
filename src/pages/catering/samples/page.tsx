import { useState, useMemo, useRef } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { useSamples, useKeepDevices } from './hooks/useSamples';
import { useKeepWorkflow } from './hooks/useKeepWorkflow';
import { useKeepUsers } from './hooks/useKeepUsers';
import ExpiredTakeModal from './components/ExpiredTakeModal';
import KeepStaffModal from './components/KeepStaffModal';
import { todayBeijing } from '@/lib/dateUtils';

function resolvePhotoUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/keep-uploads/')) return `http://localhost:8081${url}`;
  return url;
}

const statusConfig = {
  stored: { label: '留存中', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-400' },
  expired: { label: '已过期', bg: 'bg-red-50', text: 'text-red-500', dot: 'bg-red-400' },
  disposed: { label: '已处置', bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-300' },
};

const CABINET_MODEL = 'MS-LYG-40OEZJ';
const ALL_SLOTS = [
  { id: '01', row: 1, col: 1 }, { id: '02', row: 1, col: 2 }, { id: '03', row: 1, col: 3 }, { id: '04', row: 1, col: 4 },
  { id: '05', row: 2, col: 1 }, { id: '06', row: 2, col: 2 }, { id: '07', row: 2, col: 3 }, { id: '08', row: 2, col: 4 },
  { id: '09', row: 3, col: 1 }, { id: '10', row: 3, col: 2 }, { id: '11', row: 3, col: 3 }, { id: '12', row: 3, col: 4 },
];

const CABINET_SPECS = [
  { label: '产品型号', value: 'MS-LYG-40OEZJ' },
  { label: '额定电压', value: '220V' },
  { label: '额定功率', value: '0.5KW' },
  { label: '外形尺寸', value: '900×700×1970mm' },
  { label: '刷脸识别距离', value: '0.5~2m' },
  { label: '独立留样箱体', value: '12个' },
];

interface AddForm {
  meal: string; dish: string; weight: string;
  cabinet_id: string; slot: string; operator: string;
  expire_hours: string; notes: string;
}

const defaultForm = (): AddForm => ({
  meal: '午餐', dish: '', weight: '125', cabinet_id: 'MS-LYG-40OEZJ',
  slot: '', operator: '', expire_hours: '48', notes: '',
});

const mealOptions = ['早餐', '午餐', '晚餐'];

// 按槽位分组菜品，用于格子展示
interface SlotGroup {
  slotId: string;
  dishes: Array<{ id: number; dish: string; meal: string; status: string; sampled_at: string; expire_at: string | null; weight: number; photo_url: string | null; operator: string }>;
  hasExpired: boolean;
  hasStored: boolean;
  // 派生显示信息
  primaryDate: string;
  primaryMeal: string;
  hoursKept: number;
  expireHours: number;
  isOverExpire: boolean;
}

export default function SamplesPage() {
  const [mealFilter, setMealFilter] = useState('全部');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(defaultForm());
  const [addLoading, setAddLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [detailRecord, setDetailRecord] = useState<null | ReturnType<typeof useSamples>['records'][number]>(null);
  // 点击格子，显示该槽位所有菜品的弹窗
  const [slotDetail, setSlotDetail] = useState<SlotGroup | null>(null);
  // 到期取样弹窗
  const [showExpiredTake, setShowExpiredTake] = useState(false);

  // ─── 批量拍照留样 ───
  const [showBatch, setShowBatch] = useState(false);
  const [batchDish, setBatchDish] = useState('');
  const [batchWeight, setBatchWeight] = useState('125');
  const [batchMealTimes, setBatchMealTimes] = useState(1);
  const [batchPhotoFile, setBatchPhotoFile] = useState<File | null>(null);
  const [batchPhotoPreview, setBatchPhotoPreview] = useState<string>('');
  const [batchSlot, setBatchSlot] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { records, loading, error, addRecord, updateStatus, fetch } = useSamples();
  const { devices: keepDevices, loading: devicesLoading } = useKeepDevices();

  const {
    menuDishes,
    menuLoading,
    pendingSamples,
    uploading,
    finishing,
    error: batchError,
    toast: batchToast,
    addPendingSample,
    removePendingSample,
    clearPendingSamples,
    finishKeep,
    fetchMenuDishes,
    clearError,
    showToast: batchShowToast,
    startKeep,
  } = useKeepWorkflow(fetch);

  // ─── 人员管理 ───
  const { users: keepUsers, loading: keepUsersLoading, error: keepUsersError, fetchUsers, createUser, updateUser, deleteUser, uploadImage, checkLoginNameExists } = useKeepUsers();
  const [showStaffModal, setShowStaffModal] = useState(false);

  const primaryDevice = keepDevices?.[0];
  const deviceOnline = primaryDevice?.status === 'online';

  // ─── 插入测试数据 ───
  const [seedLoading, setSeedLoading] = useState(false);
  const handleSeedData = async () => {
    setSeedLoading(true);
    try {
      const res = await window.fetch('http://localhost:8081/api/keep/seed', { method: 'POST' });
      const data = await res.json();
      if (data.code === 0) {
        showToast('success', data.data?.inserted > 0 ? `已写入 ${data.data.inserted} 条测试留样记录（槽位1/2/3）` : '槽位1/2/3均已有留样数据，无需重复插入');
        fetch();
      } else {
        showToast('error', data.msg || '插入失败');
      }
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '无法连接本地服务');
    } finally {
      setSeedLoading(false);
    }
  };

  // ─── 清空旧数据 ───
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const handleCleanup = async () => {
    setCleanupLoading(true);
    try {
      const res = await fetch('http://localhost:8081/api/keep/cleanup', { method: 'POST' });
      if (!res) throw new Error('fetch 返回了 undefined（清空请求失败）');
      const data = await res.json();
      if (data.code === 0) {
        showToast('success', `已清空 ${data.data?.deleted ?? 0} 条旧数据，请重新留样验证`);
        fetch();
      } else {
        showToast('error', data.msg || '清空失败');
      }
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '无法连接本地服务');
    } finally {
      setCleanupLoading(false);
      setShowCleanupConfirm(false);
    }
  };

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const meals = ['全部', '早餐', '午餐', '晚餐'];
  const filtered = records.filter((r) => mealFilter === '全部' || r.meal === mealFilter);

  // 按槽位分组所有非 disposed 记录，每个槽可有多个菜品
  const slotGroupMap = useMemo(() => {
    const map: Record<string, SlotGroup> = {};
    records.forEach((r) => {
      if (r.status === 'disposed') return;
      const key = String(r.slot).padStart(2, '0');
      if (!key || key === '00') return;
      if (!map[key]) {
        map[key] = {
          slotId: key, dishes: [], hasExpired: false, hasStored: false,
          primaryDate: '', primaryMeal: '', hoursKept: 0, expireHours: 48, isOverExpire: false,
        };
      }
      map[key].dishes.push({
        id: r.id, dish: r.dish, meal: r.meal, status: r.status,
        sampled_at: r.sampled_at, expire_at: r.expire_at,
        weight: r.weight, photo_url: r.photo_url, operator: r.operator,
      });
      if (r.status === 'expired') map[key].hasExpired = true;
      if (r.status === 'stored') map[key].hasStored = true;
    });
    // 计算每个槽位的派生显示信息
    const nowTs = Date.now();
    Object.values(map).forEach((group) => {
      if (group.dishes.length === 0) return;
      const sorted = [...group.dishes].sort(
        (a, b) => new Date(a.sampled_at).getTime() - new Date(b.sampled_at).getTime(),
      );
      const earliest = sorted[0];
      const latestExpire = sorted.reduce((mx, d) => {
        const t = d.expire_at ? new Date(d.expire_at).getTime() : 0;
        return t > mx ? t : mx;
      }, 0);
      const sampledTs = new Date(earliest.sampled_at).getTime();
      const hoursKept = Math.floor((nowTs - sampledTs) / 3600000);
      const expireMs = latestExpire > 0 ? latestExpire - sampledTs : 48 * 3600000;
      const expireHours = Math.max(1, Math.round(expireMs / 3600000));
      const isOverExpire = latestExpire > 0 && nowTs > latestExpire;
      const d = new Date(earliest.sampled_at);
      group.primaryDate = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      group.primaryMeal = earliest.meal;
      group.hoursKept = Math.max(0, hoursKept);
      group.expireHours = expireHours;
      group.isOverExpire = isOverExpire;
    });
    return map;
  }, [records]);

  // 以前的 slotMap（单条，用于新增弹窗的"可用槽位"判断）
  const slotMap = useMemo(() => {
    const map: Record<string, typeof records[number] | undefined> = {};
    records.forEach((r) => {
      if (r.status !== 'disposed') {
        map[r.slot] = r;
      }
    });
    return map;
  }, [records]);

  const storedCount = records.filter((r) => r.status === 'stored').length;
  const expiredCount = records.filter((r) => r.status === 'expired').length;
  const todayCount = records.filter((r) => {
    const d = new Date(r.sampled_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const usedSlotsCount = Object.keys(slotGroupMap).length;
  const emptySlots = 12 - usedSlotsCount;

  const handleAddSubmit = async () => {
    if (!addForm.dish.trim()) { showToast('error', '请输入菜品名称'); return; }
    if (!addForm.slot.trim()) { showToast('error', '请选择槽位'); return; }
    setAddLoading(true);
    try {
      await addRecord({
        meal: addForm.meal,
        dish: addForm.dish.trim(),
        weight: parseFloat(addForm.weight) || 0,
        cabinet_id: addForm.cabinet_id,
        slot: addForm.slot.trim(),
        expire_hours: parseInt(addForm.expire_hours) || 48,
        operator: addForm.operator.trim(),
        notes: addForm.notes.trim(),
      });
      setAddForm(defaultForm());
      setShowAdd(false);
      showToast('success', `「${addForm.dish}」已录入 ${addForm.slot}号留样柜`);
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '保存失败');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDispose = async (id: number, dish: string) => {
    try {
      await updateStatus(id, 'disposed');
      showToast('success', `「${dish}」已标记为处置`);
      setDetailRecord(null);
      setSlotDetail(null);
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '操作失败');
    }
  };

  // ─── 批量留样：选择图片 ───
  const handleBatchFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBatchPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setBatchPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ─── 批量留样：上传图片并加入暂存列表 ───
  const handleBatchAddSample = async () => {
    if (!batchDish) { batchShowToast('error', '请选择菜品'); return; }
    if (!batchSlot) { batchShowToast('error', '请选择留样柜门（1-12号，必选）'); return; }
    if (!batchPhotoFile) { batchShowToast('error', '请上传留样照片'); return; }
    // 检查同一柜门是否已有同名菜品
    const dup = pendingSamples.find((s) => s.slot === batchSlot && s.cookName === batchDish);
    if (dup) { batchShowToast('error', `${batchSlot}号柜已添加「${batchDish}」，请勿重复`); return; }

    try {
      const sampleId = String(Date.now());
      const weight = parseFloat(batchWeight) || 0;
      await startKeep(batchPhotoFile, sampleId, weight, batchDish);
      const selectedDish = menuDishes.find((d) => d.cookName === batchDish);
      addPendingSample({
        id: sampleId,
        cookName: batchDish,
        weight,
        pic: '',
        mealTimes: selectedDish?.mealTimes ?? batchMealTimes,
        slot: batchSlot,
      });
      // 重置菜品和照片，保留已选柜门（方便继续往同一柜门添加多道菜）
      setBatchPhotoFile(null);
      setBatchPhotoPreview('');
      setBatchDish('');
      setBatchWeight('125');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: unknown) {
      batchShowToast('error', e instanceof Error ? e.message : '操作失败');
    }
  };

  // ─── 批量留样：完成留样 ───
  const handleBatchFinish = async () => {
    if (pendingSamples.length === 0) {
      batchShowToast('error', '暂存列表为空，请先添加留样菜品');
      return;
    }
    const today = todayBeijing();
    await finishKeep(batchMealTimes, today);
  };

  // 统计暂存列表中每个柜门的菜品数
  const pendingSlotSummary = useMemo(() => {
    const summary: Record<string, string[]> = {};
    pendingSamples.forEach((s) => {
      if (!summary[s.slot]) summary[s.slot] = [];
      summary[s.slot].push(s.cookName);
    });
    return summary;
  }, [pendingSamples]);

  return (
    <AppLayout title="智能留样管理" breadcrumb={['餐饮管理', '智能留样管理']}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
          <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
          {toast.msg}
        </div>
      )}

      {/* 设备状态栏 */}
      <div className="mb-4 rounded-xl border px-4 py-3 flex items-center justify-between flex-wrap gap-3 bg-slate-50 border-slate-200">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${deviceOnline ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <i className="text-white text-lg ri-hard-drive-3-line" />
          </div>
          <div>
            {devicesLoading ? (
              <p className="text-sm text-slate-400">加载设备状态...</p>
            ) : deviceOnline ? (
              <>
                <p className="text-sm font-semibold text-slate-800">
                  留样柜已上线 <span className="text-emerald-600 font-mono text-xs">{primaryDevice.device_sn || primaryDevice.name}</span>
                </p>
                <p className="text-xs text-slate-500">
                  最后心跳: {primaryDevice.last_heartbeat ? new Date(primaryDevice.last_heartbeat).toLocaleString('zh-CN') : '—'}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700">等待设备上报</p>
                <p className="text-xs text-slate-400">留样柜通过 POST 上报留样数据、开门记录和柜门状态</p>
              </>
            )}
          </div>
        </div>
        <button type="button" onClick={fetch}
          className="flex items-center gap-1 text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-white cursor-pointer whitespace-nowrap">
          <i className="ri-refresh-line" />刷新数据
        </button>
        <button type="button" onClick={handleSeedData}
          disabled={seedLoading}
          className="flex items-center gap-1 text-xs border border-amber-200 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-50 cursor-pointer whitespace-nowrap disabled:opacity-60">
          <i className="ri-database-2-line" />{seedLoading ? '写入中...' : '插入测试数据'}
        </button>
        <button type="button" onClick={() => setShowCleanupConfirm(true)}
          className="flex items-center gap-1 text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap">
          <i className="ri-delete-bin-line" />清空旧数据
        </button>
        <button type="button" onClick={() => setShowExpiredTake(true)}
          className="flex items-center gap-1 text-xs border border-orange-200 text-orange-600 px-3 py-1.5 rounded-lg hover:bg-orange-50 cursor-pointer whitespace-nowrap">
          <i className="ri-time-line" />到期取样
          {expiredCount > 0 && (
            <span className="ml-0.5 bg-orange-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
              {expiredCount > 9 ? '9+' : expiredCount}
            </span>
          )}
        </button>
        <button type="button" onClick={() => setShowStaffModal(true)}
          className="flex items-center gap-1 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">
          <i className="ri-team-line" />人员管理
          {keepUsers.length > 0 && (
            <span className="ml-0.5 bg-slate-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
              {keepUsers.length > 9 ? '9+' : keepUsers.length}
            </span>
          )}
        </button>
      </div>

      {/* 过期提醒 */}
      {expiredCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <i className="ri-error-warning-fill text-red-500 text-lg" />
          <div>
            <p className="text-sm font-semibold text-red-700">留样过期提醒</p>
            <p className="text-xs text-red-600 mt-0.5">有 {expiredCount} 份留样已超过保存期限，请及时处置</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ═══ 左侧：柜门可视化 ═══ */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">留样柜状态</h3>
                <p className="text-xs text-slate-400 mt-0.5">{CABINET_MODEL} · 每格可存多道菜品</p>
              </div>
              <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${deviceOnline ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 bg-slate-50'}`}>
                <span className={`w-1.5 h-1.5 ${deviceOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'} rounded-full`} />
                {deviceOnline ? '设备在线' : '等待上线'}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {ALL_SLOTS.map((slot) => {
                const group = slotGroupMap[slot.id];
                const hasGroup = !!group;
                const isOverExpire = hasGroup && group.isOverExpire;
                const dishCount = group?.dishes.length ?? 0;

                let borderClass = 'border-dashed border-slate-200';
                let bgClass = 'bg-slate-50';
                let numColor = 'text-slate-400';
                let cursorClass = 'cursor-default';

                if (isOverExpire) {
                  borderClass = 'border-red-300';
                  bgClass = 'bg-red-50';
                  numColor = 'text-red-500';
                  cursorClass = 'cursor-pointer hover:border-red-400';
                } else if (hasGroup) {
                  borderClass = 'border-emerald-200';
                  bgClass = 'bg-emerald-50';
                  numColor = 'text-emerald-600';
                  cursorClass = 'cursor-pointer hover:border-emerald-300';
                }

                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => { if (group) setSlotDetail(group); }}
                    className={`flex flex-col items-start justify-start p-2 rounded-lg transition-all border-2 w-full ${borderClass} ${bgClass} ${cursorClass}`}
                    style={{ minHeight: 88 }}
                  >
                    <p className={`text-xs font-bold leading-none mb-1 ${numColor}`}>{slot.id}</p>
                    {hasGroup ? (
                      <>
                        <p className="text-[9px] text-slate-600 leading-tight truncate w-full font-medium">
                          {group.primaryDate}&nbsp;{group.primaryMeal}
                        </p>
                        <div className="flex items-center gap-0.5 mt-0.5">
                          <span className="text-[8px] text-slate-400">时长:</span>
                          <span className={`text-[9px] font-semibold ${isOverExpire ? 'text-red-500' : 'text-slate-600'}`}>
                            {group.hoursKept}/{group.expireHours}h
                          </span>
                          {isOverExpire && <span className="text-[8px] text-red-500">!</span>}
                        </div>
                        <div className="flex items-center gap-0.5 mt-0.5">
                          <span className="text-[8px] text-slate-400">容量:</span>
                          <span className="text-[9px] font-semibold text-slate-600">{dishCount}道</span>
                        </div>
                        {isOverExpire && (
                          <span className="mt-1 text-[8px] bg-red-100 text-red-600 px-1 py-0.5 rounded-sm leading-none">已过期</span>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <p className="text-[9px] text-slate-300">时长: 空闲</p>
                        <p className="text-[9px] text-slate-300">容量: 空闲</p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-emerald-200 bg-emerald-50" />有留样（点击查看）</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-red-300 bg-red-50" />已过期</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-dashed border-slate-200 bg-slate-50" />空闲</div>
            </div>
          </div>

          {/* 设备参数 */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">设备参数</h3>
            <div className="grid grid-cols-2 gap-3">
              {CABINET_SPECS.map((spec) => (
                <div key={spec.label} className="bg-slate-50 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-slate-400">{spec.label}</p>
                  <p className="text-sm font-medium text-slate-700 mt-0.5">{spec.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 统计 */}
          <div className="bg-white rounded-xl border border-slate-100 p-4 grid grid-cols-2 gap-3">
            {[
              { label: '今日留样', value: todayCount, color: 'text-emerald-600' },
              { label: '留存中', value: storedCount, color: 'text-teal-600' },
              { label: '已过期', value: expiredCount, color: 'text-red-500' },
              { label: '空余格子', value: emptySlots, color: 'text-slate-600' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-lg p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ 右侧：留样记录表 ═══ */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">留样记录</h3>
              <p className="text-xs text-slate-400 mt-0.5">每个格子可存放多道菜品，支持设备自动上报和手动录入</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {meals.map((m) => (
                <button key={m} type="button" onClick={() => setMealFilter(m)}
                  className={`text-xs px-2.5 py-1 rounded-full cursor-pointer whitespace-nowrap transition-colors ${mealFilter === m ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {m}
                </button>
              ))}
              <button type="button" onClick={() => setShowBatch(true)}
                className="flex items-center gap-1 text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 cursor-pointer whitespace-nowrap">
                <i className="ri-camera-line" />拍照留样
              </button>
              <button type="button" onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                <i className="ri-add-line" />新增留样
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <i className="ri-loader-4-line animate-spin text-2xl mr-3" />
                <span className="text-sm">加载留样记录...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16">
                <i className="ri-error-warning-fill text-red-400 text-3xl mb-3" />
                <p className="text-sm text-red-500 mb-1">加载数据失败</p>
                <p className="text-xs text-slate-400 mb-4 max-w-xs text-center">{error}</p>
                <button type="button" onClick={fetch}
                  className="flex items-center gap-1.5 text-xs bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap">
                  <i className="ri-refresh-line" />重新加载
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    {['留样编号', '餐次', '菜品名称', '重量(g)', '留样柜', '槽位', '留样时间', '保存截止', '状态', '操作'].map((h) => (
                      <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const cfg = statusConfig[r.status];
                    const expireDate = r.expire_at ? new Date(r.expire_at) : null;
                    const isNearExpiry = expireDate && r.status === 'stored'
                      && (expireDate.getTime() - Date.now()) < 6 * 3600 * 1000;
                    return (
                      <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${r.status === 'expired' ? 'bg-red-50/20' : ''}`}>
                        <td className="px-4 py-3 text-xs font-mono text-slate-400">{r.record_no}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{r.meal}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{r.dish}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{r.weight}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-400">{r.cabinet_id}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{r.slot}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                          {new Date(r.sampled_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className={`px-4 py-3 text-xs whitespace-nowrap ${isNearExpiry ? 'text-amber-500 font-semibold' : 'text-slate-400'}`}>
                          {expireDate ? expireDate.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                          {isNearExpiry && <span className="ml-1">!</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${cfg.bg} ${cfg.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setDetailRecord(r)}
                            className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-2 py-0.5 rounded cursor-pointer whitespace-nowrap hover:bg-slate-50">
                            详情
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-sm text-slate-400">暂无留样记录</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ═══ 柜门多菜品详情 Modal ═══ */}
      {slotDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <h3 className="text-base font-semibold text-slate-800">{slotDetail.slotId}号留样柜</h3>
                <p className="text-xs text-slate-400 mt-0.5">共 {slotDetail.dishes.length} 道菜品留样</p>
              </div>
              <button type="button" onClick={() => setSlotDetail(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
                <i className="ri-close-line text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {slotDetail.dishes.map((d, idx) => {
                const cfg = statusConfig[d.status as keyof typeof statusConfig] || statusConfig.stored;
                return (
                  <div key={d.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-slate-400 w-4 flex-shrink-0">#{idx + 1}</span>
                          <p className="text-sm font-semibold text-slate-800 truncate">{d.dish}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 ml-6">
                          <p className="text-xs text-slate-500">餐次: {d.meal}</p>
                          <p className="text-xs text-slate-500">重量: {d.weight}g</p>
                          <p className="text-xs text-slate-500">操作人: {d.operator || '—'}</p>
                          <p className="text-xs text-slate-500 truncate">留样: {new Date(d.sampled_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                          {d.expire_at && (
                            <p className="text-xs text-slate-500 col-span-2 truncate">截止: {new Date(d.expire_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                          )}
                        </div>
                      </div>
                      {d.photo_url && (
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200">
                          <img src={resolvePhotoUrl(d.photo_url)} alt={d.dish}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      )}
                    </div>
                    {d.status !== 'disposed' && (
                      <button type="button" onClick={() => handleDispose(d.id, d.dish)}
                        className="mt-2 text-xs text-slate-500 hover:text-red-500 border border-slate-200 px-2 py-0.5 rounded cursor-pointer whitespace-nowrap transition-colors">
                        标记处置
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex-shrink-0">
              <button type="button" onClick={() => setSlotDetail(null)}
                className="w-full text-sm border border-slate-200 rounded-lg py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 批量拍照留样 Modal ═══ */}
      {showBatch && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-semibold text-slate-800">批量拍照留样</h3>
                <p className="text-xs text-slate-400 mt-0.5">选择柜门 → 选择菜品 → 上传照片 → 加入列表 → 完成留样</p>
              </div>
              <button type="button" onClick={() => setShowBatch(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
                <i className="ri-close-line text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* ─── 步骤1：选择柜门 + 菜品 + 上传照片 ─── */}
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">1</span>
                  添加留样菜品
                </h4>

                {/* 柜门选择 - 最重要的控件，放最前面 */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-amber-700 mb-1">
                    选择留样柜门 <span className="text-red-500">*必选</span>
                  </label>
                  <div className="grid grid-cols-6 gap-1.5">
                    {ALL_SLOTS.map((s) => {
                      const pendingInSlot = (pendingSlotSummary[s.id] || []).length;
                      const existingInSlot = slotGroupMap[s.id]?.dishes.length ?? 0;
                      const isSelected = batchSlot === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setBatchSlot(s.id)}
                          className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-lg border-2 text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500 text-white'
                              : pendingInSlot > 0
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : existingInSlot > 0
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <span className="font-bold">{s.id}</span>
                          {pendingInSlot > 0 && (
                            <span className={`text-[9px] ${isSelected ? 'text-white' : 'text-amber-600'}`}>+{pendingInSlot}</span>
                          )}
                          {existingInSlot > 0 && pendingInSlot === 0 && (
                            <span className={`text-[9px] ${isSelected ? 'text-white' : 'text-emerald-600'}`}>{existingInSlot}菜</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {!batchSlot && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                      <i className="ri-information-line" />请先选择要留样的柜门编号，同一个柜门可以放多道菜
                    </p>
                  )}
                  {batchSlot && (
                    <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                      <i className="ri-checkbox-circle-line" />已选 {batchSlot}号柜
                      {pendingSlotSummary[batchSlot]?.length > 0 && `，已有 ${pendingSlotSummary[batchSlot].length} 道待提交`}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">选择菜品 <span className="text-red-400">*</span></label>
                    {menuLoading ? (
                      <p className="text-xs text-slate-400 py-2">加载菜单中...</p>
                    ) : (
                      <select value={batchDish} onChange={(e) => setBatchDish(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-amber-400">
                        <option value="">-- 选择今日菜品 --</option>
                        {menuDishes.map((d) => (
                          <option key={d.cookName} value={d.cookName}>{d.cookName} ({mealOptions[d.mealTimes] || '午餐'})</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">重量 (g)</label>
                    <input type="number" value={batchWeight} onChange={(e) => setBatchWeight(e.target.value)}
                      placeholder="125" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">餐次</label>
                    <select value={batchMealTimes} onChange={(e) => setBatchMealTimes(Number(e.target.value))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-amber-400">
                      <option value={0}>早餐</option>
                      <option value={1}>午餐</option>
                      <option value={2}>晚餐</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">留样照片 <span className="text-red-400">*</span></label>
                    <div className="flex items-center gap-2">
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleBatchFileChange} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 text-xs border border-dashed border-slate-300 px-3 py-2 rounded-lg hover:border-amber-400 cursor-pointer whitespace-nowrap flex-1 justify-center">
                        <i className="ri-image-add-line" />{batchPhotoFile ? '更换照片' : '选择照片'}
                      </button>
                      {batchPhotoPreview && (
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                          <img src={batchPhotoPreview} alt="预览" className="w-full h-full object-cover" />
                          <button type="button"
                            onClick={() => { setBatchPhotoFile(null); setBatchPhotoPreview(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                            className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-red-500 text-white rounded-full text-[9px] cursor-pointer">
                            <i className="ri-close-line" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button type="button" onClick={handleBatchAddSample}
                  disabled={uploading || !batchDish || !batchPhotoFile || !batchSlot}
                  className="w-full text-sm bg-amber-500 text-white rounded-lg py-2 hover:bg-amber-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                  {uploading ? (
                    <span className="flex items-center justify-center gap-1.5"><i className="ri-loader-4-line animate-spin" />上传中...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <i className="ri-add-circle-line" />
                      加入{batchSlot ? `（${batchSlot}号柜）` : ''}暂存列表
                    </span>
                  )}
                </button>
              </div>

              {/* ─── 步骤2：暂存列表（按柜门分组） ─── */}
              <div className="bg-white rounded-xl border border-slate-100 p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-600 text-white text-xs flex items-center justify-center">2</span>
                  暂存列表
                  {pendingSamples.length > 0 && (
                    <span className="text-xs text-slate-400 font-normal ml-2">({pendingSamples.length} 道菜品)</span>
                  )}
                </h4>

                {pendingSamples.length === 0 ? (
                  <div className="py-6 text-center">
                    <i className="ri-inbox-line text-3xl text-slate-200 mb-2 block" />
                    <p className="text-xs text-slate-400">暂存列表为空，请先选择柜门并添加菜品照片</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(pendingSlotSummary).sort().map(([slot, dishes]) => (
                      <div key={slot} className="border border-slate-100 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                          <span className="text-xs font-bold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">{slot}号柜</span>
                          <span className="text-xs text-slate-500">{dishes.length} 道菜品</span>
                        </div>
                        {pendingSamples.filter((s) => s.slot === slot).map((sample, idx) => (
                          <div key={`${sample.cookName}-${idx}`} className="flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-0">
                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center">
                              {sample.pic
                                ? <img src={sample.pic} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                : <i className="ri-image-line text-slate-400 text-xs" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">{sample.cookName}</p>
                              <p className="text-xs text-slate-400">{sample.weight}g · {mealOptions[sample.mealTimes]}</p>
                            </div>
                            <button type="button"
                              onClick={() => removePendingSample(pendingSamples.findIndex((s) => s.id === sample.id))}
                              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 cursor-pointer flex-shrink-0">
                              <i className="ri-close-line text-xs" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {pendingSamples.length > 0 && (
                  <button type="button" onClick={clearPendingSamples}
                    className="mt-2 text-xs text-slate-400 hover:text-red-500 cursor-pointer transition-colors">
                    清空全部
                  </button>
                )}
              </div>

              {batchError && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 flex items-start gap-2">
                  <i className="ri-error-warning-fill text-red-500 mt-0.5" />
                  <div>
                    <p className="text-xs text-red-600">{batchError}</p>
                    <button type="button" onClick={clearError} className="text-xs text-red-500 underline mt-0.5 cursor-pointer">忽略</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={() => setShowBatch(false)}
                className="text-sm border border-slate-200 rounded-lg px-4 py-2 text-slate-600 hover:bg-white cursor-pointer whitespace-nowrap">
                关闭
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={fetchMenuDishes}
                  className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer flex items-center gap-1">
                  <i className="ri-refresh-line" />刷新菜单
                </button>
                <button type="button" onClick={handleBatchFinish}
                  disabled={finishing || pendingSamples.length === 0}
                  className="text-sm bg-emerald-500 text-white rounded-lg px-5 py-2 hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                  {finishing
                    ? <span className="flex items-center gap-1.5"><i className="ri-loader-4-line animate-spin" />提交中...</span>
                    : <span className="flex items-center gap-1.5"><i className="ri-check-double-line" />完成留样 ({pendingSamples.length} 道)</span>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Toast */}
      {batchToast && !toast && (
        <div className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${batchToast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
          <i className={batchToast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
          {batchToast.msg}
        </div>
      )}

      {/* 新增留样 Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-slate-800">新增留样记录</h3>
              <button type="button" onClick={() => setShowAdd(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
                <i className="ri-close-line text-slate-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">餐次 <span className="text-red-400">*</span></label>
                  <select value={addForm.meal} onChange={(e) => setAddForm((p) => ({ ...p, meal: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400">
                    {['早餐', '午餐', '晚餐'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">重量(g)</label>
                  <input type="number" value={addForm.weight} onChange={(e) => setAddForm((p) => ({ ...p, weight: e.target.value }))}
                    placeholder="125" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">菜品名称 <span className="text-red-400">*</span></label>
                <input type="text" value={addForm.dish} onChange={(e) => setAddForm((p) => ({ ...p, dish: e.target.value }))}
                  placeholder="请输入菜品名称" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">留样柜</label>
                  <select value={addForm.cabinet_id} onChange={(e) => setAddForm((p) => ({ ...p, cabinet_id: e.target.value, slot: '' }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400">
                    <option value="MS-LYG-40OEZJ">MS-LYG-40OEZJ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">槽位（柜门号）<span className="text-red-400">*</span></label>
                  <select value={addForm.slot} onChange={(e) => setAddForm((p) => ({ ...p, slot: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400">
                    <option value="">-- 选择柜门 --</option>
                    {ALL_SLOTS.map((s) => {
                      const existCount = slotGroupMap[s.id]?.dishes.length ?? 0;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.id}号柜{existCount > 0 ? `（已有${existCount}道菜）` : '（空闲）'}
                        </option>
                      );
                    })}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-0.5">每个柜门可存放多道菜品</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">保存时长</label>
                  <select value={addForm.expire_hours} onChange={(e) => setAddForm((p) => ({ ...p, expire_hours: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400">
                    <option value="24">24小时</option>
                    <option value="48">48小时</option>
                    <option value="72">72小时</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">操作人</label>
                  <input type="text" value={addForm.operator} onChange={(e) => setAddForm((p) => ({ ...p, operator: e.target.value }))}
                    placeholder="留样员姓名" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">备注</label>
                <input type="text" value={addForm.notes} onChange={(e) => setAddForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="可选" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 text-sm border border-slate-200 rounded-lg py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">取消</button>
              <button type="button" onClick={handleAddSubmit} disabled={addLoading}
                className="flex-1 text-sm bg-emerald-500 text-white rounded-lg py-2 hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-60">
                {addLoading ? '保存中...' : '提交留样'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 单条记录详情 Modal */}
      {detailRecord && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">留样详情</h3>
              <button type="button" onClick={() => setDetailRecord(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
                <i className="ri-close-line text-slate-500" />
              </button>
            </div>
            <div className="space-y-2">
              {[
                { label: '编号', value: detailRecord.record_no },
                { label: '菜品', value: detailRecord.dish },
                { label: '餐次', value: detailRecord.meal },
                { label: '重量', value: `${detailRecord.weight}g` },
                { label: '留样柜', value: `${detailRecord.cabinet_id}` },
                { label: '槽位', value: `${detailRecord.slot}号柜` },
                { label: '操作人', value: detailRecord.operator || '—' },
                { label: '留样时间', value: new Date(detailRecord.sampled_at).toLocaleString('zh-CN') },
                { label: '保存截止', value: detailRecord.expire_at ? new Date(detailRecord.expire_at).toLocaleString('zh-CN') : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-xs text-slate-400 w-20">{label}</span>
                  <span className="text-sm text-slate-700 text-right">{value}</span>
                </div>
              ))}
              <div className="flex justify-between py-1.5">
                <span className="text-xs text-slate-400 w-20">状态</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[detailRecord.status].bg} ${statusConfig[detailRecord.status].text}`}>
                  {statusConfig[detailRecord.status].label}
                </span>
              </div>
              {detailRecord.photo_url && (
                <div className="pt-2">
                  <p className="text-xs text-slate-400 mb-1.5">留样照片</p>
                  <img src={resolvePhotoUrl(detailRecord.photo_url)} alt="留样照片"
                    className="w-full rounded-lg object-cover max-h-48"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setDetailRecord(null)} className="flex-1 text-sm border border-slate-200 rounded-lg py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">关闭</button>
              {detailRecord.status !== 'disposed' && (
                <button type="button" onClick={() => handleDispose(detailRecord.id, detailRecord.dish)}
                  className="flex-1 text-sm bg-slate-700 text-white rounded-lg py-2 hover:bg-slate-600 cursor-pointer whitespace-nowrap">
                  标记处置
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 清空旧数据确认 Modal */}
      {showCleanupConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50">
                <i className="ri-error-warning-fill text-red-500 text-lg" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">确认清空数据</h3>
                <p className="text-xs text-slate-500 mt-0.5">此操作不可撤销，将删除本地所有留样记录</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5 bg-amber-50 rounded-lg p-3 border border-amber-100">
              清空后请重新通过设备或本页面进行留样操作，验证早餐→1号柜、午餐→2号柜、晚餐→3号柜的逻辑。
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCleanupConfirm(false)}
                className="flex-1 text-sm border border-slate-200 rounded-lg py-2 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                取消
              </button>
              <button type="button" onClick={handleCleanup} disabled={cleanupLoading}
                className="flex-1 text-sm bg-red-500 text-white rounded-lg py-2 hover:bg-red-600 cursor-pointer whitespace-nowrap disabled:opacity-60">
                {cleanupLoading ? '清空中...' : '确认清空'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 到期取样弹窗 */}
      {showExpiredTake && (
        <ExpiredTakeModal
          onClose={() => setShowExpiredTake(false)}
          onSuccess={() => { fetch(); setShowExpiredTake(false); }}
        />
      )}

      {/* 人员管理弹窗 */}
      {showStaffModal && (
        <KeepStaffModal
          users={keepUsers}
          loading={keepUsersLoading}
          error={keepUsersError}
          onSearch={(keyword) => fetchUsers(keyword)}
          onCreate={createUser}
          onUpdate={updateUser}
          onDelete={deleteUser}
          onUploadImage={uploadImage}
          onCheckLoginName={checkLoginNameExists}
          onClose={() => setShowStaffModal(false)}
        />
      )}
    </AppLayout>
  );
}