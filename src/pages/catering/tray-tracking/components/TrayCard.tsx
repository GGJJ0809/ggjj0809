import { useState } from 'react';
import { StationSummary } from '../hooks/useTrayTracking';
import { DishOption } from '../hooks/useTrayTracking';

export const CATEGORY_STYLES: Record<string, { bg: string; text: string; icon: string; dot: string }> = {
  荤菜: { bg: 'bg-red-50', text: 'text-red-600', icon: 'ri-knife-blood-line', dot: 'bg-red-400' },
  素菜: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'ri-plant-line', dot: 'bg-emerald-400' },
  家常菜: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'ri-restaurant-2-line', dot: 'bg-amber-400' },
  主食: { bg: 'bg-orange-50', text: 'text-orange-600', icon: 'ri-bowl-line', dot: 'bg-orange-400' },
  汤品: { bg: 'bg-sky-50', text: 'text-sky-600', icon: 'ri-drop-line', dot: 'bg-sky-400' },
  凉菜: { bg: 'bg-teal-50', text: 'text-teal-600', icon: 'ri-leaf-line', dot: 'bg-teal-400' },
  热菜: { bg: 'bg-rose-50', text: 'text-rose-600', icon: 'ri-fire-line', dot: 'bg-rose-400' },
  炖煲: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'ri-cup-line', dot: 'bg-amber-400' },
  蒸菜: { bg: 'bg-cyan-50', text: 'text-cyan-600', icon: 'ri-cloud-line', dot: 'bg-cyan-400' },
  油炸: { bg: 'bg-yellow-50', text: 'text-yellow-600', icon: 'ri-fire-line', dot: 'bg-yellow-400' },
  海鲜: { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'ri-ship-line', dot: 'bg-blue-400' },
  肉食: { bg: 'bg-red-50', text: 'text-red-600', icon: 'ri-restaurant-line', dot: 'bg-red-400' },
  小吃: { bg: 'bg-pink-50', text: 'text-pink-600', icon: 'ri-cake-line', dot: 'bg-pink-400' },
};

interface TrayCardProps {
  station: StationSummary;
  dishes: DishOption[];
  onBindDish: (stationId: number, productItemId: number | null) => Promise<void>;
  onEdit?: (station: StationSummary) => void;
  onDelete?: (station: StationSummary) => void;
  onAddPickup?: (station: StationSummary) => void;
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatWeight(g: number) {
  if (g >= 1000) return `${(g / 1000).toFixed(1)}kg`;
  return `${Math.round(g)}g`;
}

function isHwOnline(station: StationSummary) {
  if (!station.hw_enabled || !station.hw_last_seen) return false;
  const lastSeen = new Date(station.hw_last_seen);
  const now = new Date();
  return now.getTime() - lastSeen.getTime() < 5 * 60 * 1000;
}

export default function TrayCard({ station, dishes, onBindDish, onEdit, onDelete, onAddPickup }: TrayCardProps) {
  const style = CATEGORY_STYLES[station.category] || CATEGORY_STYLES['素菜'];
  const hwOnline = isHwOnline(station);
  const netWeight = (station.hw_last_weight || 0) - (station.tare_weight || 0);
  const hasHardware = station.hw_enabled;
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 hover:border-slate-200 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {station.dish_img ? (
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
              <img src={station.dish_img} alt={station.dish_name} className="w-full h-full object-cover object-top" />
            </div>
          ) : (
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg flex-shrink-0 ${style.bg}`}>
              <i className={`${style.icon} ${style.text} text-base`} />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-800 leading-tight">{station.dish_name || station.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{station.station_code} · {station.location}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
            {station.category}
          </span>
          {/* Edit/Delete buttons */}
          <div className="flex items-center ml-1">
            <button
              type="button"
              onClick={() => onAddPickup?.(station)}
              className="w-6 h-6 flex items-center justify-center text-emerald-500 hover:text-emerald-600 rounded-md hover:bg-emerald-50 cursor-pointer"
              title="录入取餐"
            >
              <i className="ri-add-circle-line text-xs" />
            </button>
            <button
              type="button"
              onClick={() => onEdit?.(station)}
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50 cursor-pointer"
              title="编辑"
            >
              <i className="ri-pencil-line text-xs" />
            </button>
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 cursor-pointer"
              title="删除"
            >
              <i className="ri-delete-bin-line text-xs" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="text-center bg-slate-50 rounded-lg py-2">
          <p className="text-sm font-bold text-slate-800">{station.today_pickups}</p>
          <p className="text-xs text-slate-400">取餐次数</p>
        </div>
        <div className="text-center bg-slate-50 rounded-lg py-2">
          <p className="text-sm font-bold text-slate-800">{formatWeight(station.today_weight)}</p>
          <p className="text-xs text-slate-400">总取餐量</p>
        </div>
        {hasHardware && (
          <>
            <div className="text-center bg-slate-50 rounded-lg py-2">
              <p className="text-sm font-bold text-slate-800">{formatWeight(station.hw_last_weight || 0)}</p>
              <p className="text-xs text-slate-400">当前重量</p>
            </div>
            <div className="text-center bg-slate-50 rounded-lg py-2">
              <p className={`text-sm font-bold ${netWeight > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                {formatWeight(Math.max(0, netWeight))}
              </p>
              <p className="text-xs text-slate-400">菜品净重</p>
            </div>
          </>
        )}
      </div>

      {/* Bind dish */}
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
        <span className="text-xs text-slate-400">绑定菜品</span>
        <select
          value={station.product_item_id || ''}
          onChange={(e) => onBindDish(station.id, e.target.value ? Number(e.target.value) : null)}
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-400 bg-white min-w-0"
        >
          <option value="">未绑定</option>
          {dishes.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Hardware & tare info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${station.today_pickups > 0 ? style.dot : 'bg-slate-300'}`} />
          <span className="text-xs text-slate-400">
            {station.recent_pickup_time ? `最近取餐 ${formatTime(station.recent_pickup_time)}` : '今日暂无记录'}
          </span>
        </div>
        {hasHardware && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">皮重 {formatWeight(station.tare_weight || 0)}</span>
            <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${hwOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
              <span className={`w-1 h-1 rounded-full ${hwOnline ? 'bg-emerald-400' : 'bg-slate-300'}`} />
              {hwOnline ? '称重在线' : '称重离线'}
            </span>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {showDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={() => setShowDelete(false)}>
          <div className="bg-white rounded-2xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50">
                <i className="ri-delete-bin-line text-red-500 text-lg" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">确认删除</p>
                <p className="text-xs text-slate-500 mt-0.5">删除「{station.name}」？此操作不可恢复。</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="flex-1 text-sm border border-slate-200 text-slate-600 rounded-lg py-2 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete?.(station);
                  setShowDelete(false);
                }}
                className="flex-1 text-sm bg-red-500 text-white rounded-lg py-2 hover:bg-red-600 cursor-pointer whitespace-nowrap"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}