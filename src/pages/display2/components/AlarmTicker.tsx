import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { loadDisplayConfig } from '@/lib/displayStore';

interface AlarmEvent {
  id: number;
  alarm_code: string;
  alarm_type: string;
  level: string;
  zone: string;
  message: string;
  occurred_at: string;
  status: string;
}

interface TickerItem {
  text: string;
  type: 'alarm' | 'normal' | 'notice';
  level?: string;
}

export default function AlarmTicker() {
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      // 并发读取报警事件 + 滚动公告配置
      const [alarmRes, config] = await Promise.all([
        supabase
          .from('alarm_events')
          .select('*')
          .eq('status', 'unconfirmed')
          .order('occurred_at', { ascending: false })
          .limit(20),
        loadDisplayConfig('default').catch(() => null),
      ]);

      setAlarms((alarmRes.data ?? []) as AlarmEvent[]);

      const tickerNotices = config?.settings?.tickerNotices;
      if (Array.isArray(tickerNotices) && tickerNotices.length > 0) {
        setNotices(tickerNotices.filter((n) => n?.trim()));
      } else {
        setNotices([]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 15000);
    return () => clearInterval(timer);
  }, []);

  const levelConfig: Record<string, { color: string; bg: string; icon: string; label: string }> = {
    high: { color: 'text-red-400', bg: 'bg-red-500/20', icon: 'ri-alarm-warning-fill', label: '紧急' },
    medium: { color: 'text-amber-400', bg: 'bg-amber-500/20', icon: 'ri-error-warning-line', label: '重要' },
    low: { color: 'text-sky-400', bg: 'bg-sky-500/20', icon: 'ri-information-line', label: '一般' },
  };

  // 构建滚动条目：自定义公告 + 报警事件
  const tickerItems: TickerItem[] = [];

  // 先放自定义公告
  notices.forEach((n) => {
    tickerItems.push({ text: n, type: 'notice' });
  });

  // 再放报警事件
  if (alarms.length === 0 && notices.length === 0) {
    tickerItems.push({ text: '当前无未确认报警，系统运行正常', type: 'normal' });
  } else {
    alarms.forEach((a) => {
      const cfg = levelConfig[a.level] || levelConfig.low;
      const time = new Date(a.occurred_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      tickerItems.push({
        text: `[${time}] ${cfg.label} · ${a.zone} · ${a.alarm_type} · ${a.message}`,
        type: 'alarm',
        level: a.level,
      });
    });
  }

  const alarmCount = alarms.length;
  const noticeCount = notices.length;

  return (
    <div className="h-14 bg-slate-950 border-t border-slate-800 flex items-center overflow-hidden flex-shrink-0">
      <div className="flex items-center gap-2 px-4 flex-shrink-0 border-r border-slate-800 h-full">
        {loading ? (
          <>
            <i className="ri-loader-4-line animate-spin text-slate-500" />
            <span className="text-xl font-medium text-slate-500">加载中...</span>
          </>
        ) : alarmCount > 0 ? (
          <>
            <i className="ri-alarm-warning-line text-red-400 animate-pulse" />
            <span className="text-xl font-medium text-red-400">未确认报警 {alarmCount} 条</span>
          </>
        ) : (
          <>
            <i className="ri-notification-3-line text-emerald-400" />
            <span className="text-xl font-medium text-emerald-400">
              {noticeCount > 0 ? `公告 ${noticeCount} 条` : '系统正常'}
            </span>
          </>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-hidden relative">
        <div className="flex items-center gap-8 animate-scroll-left whitespace-nowrap">
          {tickerItems.map((item, idx) => {
            if (item.type === 'alarm') {
              const cfg = levelConfig[item.level || 'low'];
              return (
                <span key={`alarm-${idx}`} className={`text-xl flex items-center gap-1.5 flex-shrink-0 ${cfg?.color}`}>
                  {cfg && (
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full ${cfg.bg}`}>
                      <i className={`${cfg.icon} text-lg`} />
                    </span>
                  )}
                  {item.text}
                </span>
              );
            }

            if (item.type === 'notice') {
              return (
                <span key={`notice-${idx}`} className="text-xl flex items-center gap-1.5 flex-shrink-0 text-amber-300">
                  <span className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-500/20">
                    <i className="ri-notification-3-line text-lg" />
                  </span>
                  {item.text}
                </span>
              );
            }

            return (
              <span key={`normal-${idx}`} className="text-xl flex items-center gap-1.5 flex-shrink-0 text-slate-400">
                <i className="ri-checkbox-circle-line text-emerald-400" />
                {item.text}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}