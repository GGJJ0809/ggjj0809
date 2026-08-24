import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useHikvision } from '@/hooks/useHikvision';

interface DisplayHeaderProps {
  screenId?: string;
}

export default function DisplayHeader({ screenId }: DisplayHeaderProps) {
  const [now, setNow] = useState(new Date());
  const { channels, isConfigured } = useHikvision();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const validChannels = channels.filter((c) => c.enabled && c.rtspUrl);
  const onlineCount = validChannels.length;
  const totalCount = validChannels.length;

  const screenLabel = screenId && screenId !== 'default' ? ` · ${screenId}` : '';

  return (
    <div className="flex items-center justify-between h-12 px-4 bg-slate-950 border-b border-slate-800 flex-shrink-0">
      {/* Left: Branding */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-6 h-6 flex items-center justify-center bg-emerald-500 rounded">
            <i className="ri-restaurant-fill text-white text-xl" />
          </div>
          <span className="text-white text-4xl font-bold">智慧食堂监控大屏{screenLabel}</span>
        </div>
        <span className="text-slate-600 text-xl">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-400 text-xl font-medium">LIVE</span>
          <span className="text-slate-500 text-xl">
            · {isConfigured ? `${onlineCount}/${totalCount}路在线` : '摄像头未配置'}
          </span>
        </div>
      </div>

      {/* Center: Camera status pills */}
      <div className="flex items-center gap-2">
        {[
          { label: '在线', count: isConfigured ? onlineCount : 0, color: 'text-emerald-400', dot: 'bg-emerald-400' },
          { label: '预警', count: 0, color: 'text-amber-400', dot: 'bg-amber-400' },
          { label: '离线', count: isConfigured ? Math.max(0, totalCount - onlineCount) : 0, color: 'text-slate-500', dot: 'bg-slate-600' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-full">
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            <span className={`text-xl ${s.color}`}>{s.label} {s.count}</span>
          </div>
        ))}
      </div>

      {/* Right: Clock */}
      <div className="flex items-center gap-4 text-right">
        <p className="text-slate-500 text-xl">{dateStr}</p>
        <p className="text-white text-5xl font-mono font-bold leading-tight">{timeStr}</p>
      </div>
    </div>
  );
}