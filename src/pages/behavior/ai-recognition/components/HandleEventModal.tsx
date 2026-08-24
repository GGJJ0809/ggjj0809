import { useState } from 'react';
import { AIEvent } from '../hooks/useAIRecognition';
import { TYPE_CONFIG, LEVEL_BADGE, LEVEL_LABEL } from './AIEventList';

interface Props {
  event: AIEvent;
  onClose: () => void;
  onSubmit: (action: 'handled' | 'ignored', note: string) => Promise<void>;
}

export default function HandleEventModal({ event, onClose, onSubmit }: Props) {
  const [action, setAction] = useState<'handled' | 'ignored'>('handled');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const cfg = TYPE_CONFIG[event.event_type] || TYPE_CONFIG['行为异常'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(action, note);
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">处理事件</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        {/* Event info */}
        <div className={`flex items-start gap-3 p-3 rounded-xl border mb-4 ${cfg.border} ${cfg.bg}`}>
          <div className={`w-8 h-8 flex items-center justify-center rounded-lg bg-white`}>
            <i className={`${cfg.icon} ${cfg.color} text-base`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-sm font-medium ${cfg.color}`}>{event.event_type}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${LEVEL_BADGE[event.level]}`}>{LEVEL_LABEL[event.level]}</span>
            </div>
            <p className="text-xs text-slate-500">{event.camera_name} · {event.event_code}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Action choice */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-2 block">处理方式</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAction('handled')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm border transition-all cursor-pointer whitespace-nowrap ${
                  action === 'handled'
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                }`}
              >
                <i className="ri-check-line" />
                标记已处理
              </button>
              <button
                type="button"
                onClick={() => setAction('ignored')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm border transition-all cursor-pointer whitespace-nowrap ${
                  action === 'ignored'
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                <i className="ri-eye-off-line" />
                忽略事件
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">处理备注（选填）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="如：已通知当事人整改、属于误报..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 text-sm py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">
              取消
            </button>
            <button type="submit" disabled={submitting} className="flex-1 bg-slate-900 text-white text-sm py-2.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-50">
              {submitting ? '提交中...' : '确认'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}