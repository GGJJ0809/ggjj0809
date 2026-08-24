import { useState } from 'react';
import { alarmRecords } from '@/mocks/dashboard';

const levelConfig = {
  high: { label: '高', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  medium: { label: '中', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400' },
  low: { label: '低', bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-400' },
};

export default function AlarmList() {
  const [records, setRecords] = useState(alarmRecords);

  const confirm = (id: number) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'confirmed' } : r))
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">今日报警记录</h3>
          <p className="text-xs text-slate-400 mt-0.5">共 {records.length} 条，{records.filter(r => r.status === 'unconfirmed').length} 条待确认</p>
        </div>
        <button type="button" className="text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer whitespace-nowrap">
          查看全部 <i className="ri-arrow-right-line" />
        </button>
      </div>
      <div className="space-y-2">
        {records.map((record) => {
          const cfg = levelConfig[record.level as keyof typeof levelConfig];
          return (
            <div
              key={record.id}
              className={`flex items-start gap-3 p-3 rounded-lg ${record.status === 'unconfirmed' ? 'bg-red-50/60 border border-red-100' : 'bg-slate-50'}`}
            >
              <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                    {record.type}
                  </span>
                  <span className="text-xs text-slate-400">{record.time}</span>
                  {record.status === 'unconfirmed' && (
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">待确认</span>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{record.message}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  <i className="ri-map-pin-2-line mr-0.5" />{record.location}
                </p>
              </div>
              {record.status === 'unconfirmed' && (
                <button
                  type="button"
                  onClick={() => confirm(record.id)}
                  className="flex-shrink-0 text-xs bg-emerald-500 text-white px-2.5 py-1 rounded-md hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  确认
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}