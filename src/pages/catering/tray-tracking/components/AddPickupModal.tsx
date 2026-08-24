import { useState } from 'react';
import { TrayStation } from '../hooks/useTrayTracking';

interface AddPickupModalProps {
  station: TrayStation | null;
  onClose: () => void;
  onSubmit: (data: {
    station: TrayStation;
    weight_before: number;
    weight_after: number;
    person_id?: string;
    notes?: string;
  }) => Promise<{ error: unknown }>;
}

export default function AddPickupModal({ station, onClose, onSubmit }: AddPickupModalProps) {
  const [weightBefore, setWeightBefore] = useState('');
  const [weightAfter, setWeightAfter] = useState('');
  const [personId, setPersonId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!station) return null;

  const pickupWeight = weightBefore && weightAfter
    ? Math.max(0, parseFloat(weightBefore) - parseFloat(weightAfter))
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!weightBefore || !weightAfter) {
      setError('请填写取餐前后重量');
      return;
    }
    setSubmitting(true);
    const { error: err } = await onSubmit({
      station,
      weight_before: parseFloat(weightBefore),
      weight_after: parseFloat(weightAfter),
      person_id: personId || undefined,
      notes: notes || undefined,
    });
    setSubmitting(false);
    if (err) {
      setError('提交失败，请重试');
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-slate-800">录入取餐记录</h3>
            <p className="text-xs text-slate-400 mt-0.5">{station.station_code} · {station.dish_name}</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">取餐前重量（克）</label>
              <input
                type="number"
                step="0.1"
                value={weightBefore}
                onChange={(e) => setWeightBefore(e.target.value)}
                placeholder="如：5200"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">取餐后重量（克）</label>
              <input
                type="number"
                step="0.1"
                value={weightAfter}
                onChange={(e) => setWeightAfter(e.target.value)}
                placeholder="如：4800"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {pickupWeight !== null && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-emerald-600">本次取餐重量</span>
              <span className="text-sm font-bold text-emerald-700">
                {pickupWeight >= 1000
                  ? `${(pickupWeight / 1000).toFixed(2)} kg`
                  : `${pickupWeight.toFixed(0)} g`}
              </span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">取餐人员ID（选填）</label>
            <input
              type="text"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              placeholder="刷卡/扫码后自动填入"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">备注（选填）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="如：补菜、换新托盘..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 text-sm py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-slate-900 text-white text-sm py-2.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {submitting ? '提交中...' : '确认录入'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}