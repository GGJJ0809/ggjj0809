interface ZoneCardProps {
  zone: string;
  pm25: number;
  pm10: number;
  temp: number;
  humidity: number;
  status: string;
  isSelected: boolean;
  onClick: () => void;
}

const statusConfig = {
  good: { label: '优良', color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-400', border: 'border-emerald-200' },
  normal: { label: '正常', color: 'text-teal-600', bg: 'bg-teal-50', dot: 'bg-teal-400', border: 'border-teal-200' },
  warning: { label: '预警', color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-400', border: 'border-amber-200' },
  danger: { label: '超标', color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-400', border: 'border-red-200' },
};

export default function ZoneCard({ zone, pm25, pm10, temp, humidity, status, isSelected, onClick }: ZoneCardProps) {
  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.normal;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer w-full ${
        isSelected ? `${cfg.border} bg-white` : 'border-slate-100 bg-white hover:border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-semibold text-slate-800">{zone}</p>
        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-slate-400">PM2.5</p>
          <p className={`text-lg font-bold ${pm25 > 50 ? 'text-red-500' : 'text-slate-800'}`}>{pm25}<span className="text-xs font-normal text-slate-400 ml-0.5">μg/m³</span></p>
        </div>
        <div>
          <p className="text-xs text-slate-400">PM10</p>
          <p className={`text-lg font-bold ${pm10 > 75 ? 'text-red-500' : 'text-slate-800'}`}>{pm10}<span className="text-xs font-normal text-slate-400 ml-0.5">μg/m³</span></p>
        </div>
        <div>
          <p className="text-xs text-slate-400">温度</p>
          <p className="text-sm font-semibold text-slate-700">{temp}℃</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">湿度</p>
          <p className="text-sm font-semibold text-slate-700">{humidity}%</p>
        </div>
      </div>
    </button>
  );
}