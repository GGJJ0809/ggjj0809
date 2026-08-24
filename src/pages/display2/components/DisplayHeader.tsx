import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface DisplayHeaderProps {
  onlineCount?: number;
  warningCount?: number;
  dangerCount?: number;
}

export default function DisplayHeader({ onlineCount = 0, warningCount = 0, dangerCount = 0 }: DisplayHeaderProps) {
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="flex items-center justify-between h-14 px-6 bg-slate-950 border-b border-slate-800 flex-shrink-0">
      {/* Left: Branding */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-7 h-7 flex items-center justify-center bg-emerald-500 rounded">
            <i className="ri-restaurant-fill text-white text-xs" />
          </div>
          <span className="text-white text-base font-bold">智慧食堂 · 餐品数据大屏</span>
        </div>
        <span className="text-slate-600 text-xs">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-emerald-400 text-xs font-medium">实时监测</span>
        </div>
      </div>

      {/* Center: empty or could add more info */}
      <div className="flex items-center gap-3" />

      {/* Right: Clock */}
      <div className="text-right">
        <p className="text-white text-lg font-mono font-bold leading-tight">{timeStr}</p>
        <p className="text-slate-500 text-xs">{dateStr}</p>
      </div>
    </div>
  );
}