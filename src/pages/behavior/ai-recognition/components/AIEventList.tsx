import { AIEvent } from '../hooks/useAIRecognition';

export const TYPE_CONFIG: Record<string, { color: string; bg: string; icon: string; border: string }> = {
  '未佩戴口罩': { color: 'text-red-600', bg: 'bg-red-50', icon: 'ri-surgical-mask-line', border: 'border-red-200' },
  '疑似吸烟':   { color: 'text-orange-600', bg: 'bg-orange-50', icon: 'ri-fire-line', border: 'border-orange-200' },
  '未穿工服':   { color: 'text-amber-600', bg: 'bg-amber-50', icon: 'ri-shirt-line', border: 'border-amber-200' },
  '区域闯入':   { color: 'text-rose-600', bg: 'bg-rose-50', icon: 'ri-forbid-line', border: 'border-rose-200' },
  '行为异常':   { color: 'text-slate-600', bg: 'bg-slate-100', icon: 'ri-alert-line', border: 'border-slate-200' },
  '打架/冲突':  { color: 'text-red-700', bg: 'bg-red-100', icon: 'ri-boxing-line', border: 'border-red-300' },
};

export const LEVEL_BADGE = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-slate-100 text-slate-500',
};
export const LEVEL_LABEL = { high: '高风险', medium: '中风险', low: '低风险' };

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  events: AIEvent[];
  loading: boolean;
  selectedId: number | null;
  unreadCount: number;
  typeFilter: string;
  statusFilter: string;
  eventTypes: string[];
  statusFilters: string[];
  onSelect: (id: number) => void;
  onTypeChange: (v: string) => void;
  onStatusChange: (v: string) => void;
}

export default function AIEventList({
  events, loading, selectedId, unreadCount,
  typeFilter, statusFilter, eventTypes, statusFilters,
  onSelect, onTypeChange, onStatusChange,
}: Props) {
  return (
    <div className="w-72 flex-shrink-0 flex flex-col bg-white rounded-xl border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-800">识别事件</p>
          {unreadCount > 0 && (
            <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">{unreadCount} 未读</span>
          )}
        </div>
        <div className="flex gap-1.5">
          <select
            value={typeFilter}
            onChange={(e) => onTypeChange(e.target.value)}
            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white text-slate-600"
          >
            {eventTypes.map((o) => <option key={o}>{o}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white text-slate-600"
          >
            {statusFilters.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <i className="ri-inbox-2-line text-2xl mb-1" />
            <p className="text-xs">暂无事件</p>
          </div>
        ) : events.map((evt) => {
          const cfg = TYPE_CONFIG[evt.event_type] || TYPE_CONFIG['行为异常'];
          const isSelected = selectedId === evt.id;
          return (
            <button
              key={evt.id}
              type="button"
              onClick={() => onSelect(evt.id)}
              className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                isSelected ? 'bg-slate-50 border-l-2 border-l-emerald-400' : 'hover:bg-slate-50 border-l-2 border-l-transparent'
              }`}
            >
              <div className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg mt-0.5 ${cfg.bg}`}>
                <i className={`${cfg.icon} ${cfg.color} text-sm`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  {evt.status === 'unread' && (
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
                  )}
                  <span className={`text-xs font-medium truncate ${cfg.color}`}>{evt.event_type}</span>
                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${LEVEL_BADGE[evt.level]}`}>
                    {LEVEL_LABEL[evt.level]}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">{evt.camera_name}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-slate-400">{formatTime(evt.event_time)}</span>
                  {evt.status === 'handled' && (
                    <span className="text-xs text-emerald-500">已处理</span>
                  )}
                  {evt.status === 'ignored' && (
                    <span className="text-xs text-slate-400">已忽略</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}