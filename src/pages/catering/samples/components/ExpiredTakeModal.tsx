import { useState, useEffect, useCallback } from 'react';
import { getLocalServerBase, ensureLocalServerPortInit } from '@/lib/localServer';

function getServer() { return getLocalServerBase(); }

interface ExpiredDoor {
  num: string;
  meal: string;
  date: string;
  dishes: string[];
  sampledAt: string;
  expireAt: string;
  hoursOverdue: number;
}

interface ExpiredTakeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExpiredTakeModal({ onClose, onSuccess }: ExpiredTakeModalProps) {
  const [expiredDoors, setExpiredDoors] = useState<ExpiredDoor[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDoor, setConfirmDoor] = useState<ExpiredDoor | null>(null);
  const [taking, setTaking] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => { ensureLocalServerPortInit(); }, []);

  const fetchExpiredDoors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getServer()}/api/keep/expired-doors`);
      if (!res || !res.ok) throw new Error('获取到期柜槽失败');
      const json = await res.json();
      if (json.code === 0 && Array.isArray(json.data)) {
        setExpiredDoors(json.data);
      } else {
        setExpiredDoors([]);
      }
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '连接失败');
      setExpiredDoors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpiredDoors();
  }, [fetchExpiredDoors]);

  const handleTakeSample = async (door: ExpiredDoor) => {
    setTaking(true);
    try {
      const res = await fetch(`${getServer()}/api/keep/take-sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num: door.num }),
      });
      if (!res || !res.ok) throw new Error('取样操作失败');
      const json = await res.json();
      if (json.code === 0) {
        showToast('success', `${door.num}号柜门已开启，记录已清除`);
        setConfirmDoor(null);
        await fetchExpiredDoors();
        // 通知父组件刷新
        onSuccess();
      } else {
        throw new Error(json.msg || '取样失败');
      }
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '操作失败');
    } finally {
      setTaking(false);
    }
  };

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-orange-100">
                <i className="ri-time-line text-orange-500 text-sm" />
              </span>
              到期取样
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">到期柜槽需及时取出样品并清理记录</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <i className="ri-loader-4-line animate-spin text-2xl text-slate-300 mr-3" />
              <span className="text-sm text-slate-400">加载中...</span>
            </div>
          ) : expiredDoors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-emerald-50 mb-3">
                <i className="ri-check-double-line text-emerald-500 text-2xl" />
              </div>
              <p className="text-sm font-medium text-slate-700">暂无到期柜槽</p>
              <p className="text-xs text-slate-400 mt-1">所有样品均在保存期内</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 border border-orange-100 flex items-center gap-1.5">
                <i className="ri-error-warning-line" />
                共 {expiredDoors.length} 个柜槽已到期，请及时取出样品
              </p>
              {expiredDoors.map((door) => (
                <div
                  key={door.num}
                  className="bg-red-50 rounded-xl border border-red-100 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* 柜门号 + 餐次 */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-md">
                          {door.num}号柜
                        </span>
                        <span className="text-xs text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                          {door.date} {door.meal}
                        </span>
                        <span className="text-xs text-red-500 font-medium">
                          已超期 {door.hoursOverdue}h
                        </span>
                      </div>
                      {/* 菜品列表 */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {door.dishes.map((dish, i) => (
                          <span key={i} className="text-xs bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                            {dish}
                          </span>
                        ))}
                      </div>
                      {/* 时间信息 */}
                      <div className="grid grid-cols-2 gap-x-4 text-[11px] text-slate-500">
                        <span>留样时间: {fmtDate(door.sampledAt)}</span>
                        <span className="text-red-400">到期时间: {fmtDate(door.expireAt)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDoor(door)}
                      className="flex-shrink-0 text-xs bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600 cursor-pointer whitespace-nowrap transition-colors"
                    >
                      <i className="ri-door-open-line mr-1" />
                      取样
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="w-full text-sm border border-slate-200 bg-white rounded-lg py-2.5 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap transition-colors"
          >
            关闭
          </button>
        </div>
      </div>

      {/* 确认弹窗 */}
      {confirmDoor && (
        <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-orange-50 flex-shrink-0">
                <i className="ri-door-open-line text-orange-500 text-xl" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-slate-800">确认取样</h4>
                <p className="text-xs text-slate-500 mt-0.5">{confirmDoor.num}号柜 · {confirmDoor.meal}</p>
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-100 mb-5">
              <p className="text-sm text-amber-800">
                确认后将：
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                <li className="flex items-center gap-1">
                  <i className="ri-checkbox-circle-line text-amber-500" />
                  打开 {confirmDoor.num}号柜门
                </li>
                <li className="flex items-center gap-1">
                  <i className="ri-checkbox-circle-line text-amber-500" />
                  清除该柜槽的留样记录（标记为已处置）
                </li>
                <li className="flex items-center gap-1">
                  <i className="ri-checkbox-circle-line text-amber-500" />
                  主界面格子恢复为空闲状态
                </li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDoor(null)}
                disabled={taking}
                className="flex-1 text-sm border border-slate-200 rounded-lg py-2.5 text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleTakeSample(confirmDoor)}
                disabled={taking}
                className="flex-1 text-sm bg-orange-500 text-white rounded-lg py-2.5 hover:bg-orange-600 cursor-pointer whitespace-nowrap disabled:opacity-60 transition-colors"
              >
                {taking ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <i className="ri-loader-4-line animate-spin" />处理中...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <i className="ri-check-line" />确定取样
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-3 rounded-xl text-sm shadow-lg border
            ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'}`}
        >
          <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}