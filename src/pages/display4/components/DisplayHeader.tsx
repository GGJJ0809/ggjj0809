import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DisplayHeader() {
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <div className="flex items-center justify-between h-20 px-8 bg-slate-950 border-b border-slate-800 flex-shrink-0">
      {/* Left: Branding */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <span className="text-white text-6xl font-bold">智慧食堂&nbsp; 综合运营大屏</span>
        </div>
        <span className="text-slate-600 text-4xl">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-emerald-400 text-4xl font-medium">实时监控</span>
        </div>
      </div>

      {/* Right: Clock */}
      <div className="flex items-center gap-6 text-right">
        <p className="text-slate-500 text-4xl">{dateStr}</p>
        <p className="text-white text-7xl font-mono font-bold leading-tight">{timeStr}</p>
      </div>
    </div>
  );
}