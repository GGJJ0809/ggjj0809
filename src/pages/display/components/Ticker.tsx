import { useEffect, useRef, memo } from 'react';
import type { DisplayConfig } from '@/hooks/useDisplayConfig';

interface TickerProps {
  config?: DisplayConfig | null;
}

function Ticker({ config: propConfig }: TickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  const tickerNotices = propConfig?.settings?.tickerNotices ?? [];
  const fullText = tickerNotices.length > 0 ? tickerNotices.join('　　　　') : '暂无公告';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pos = 0;
    const speed = 0.6;

    const animate = () => {
      pos += speed;
      if (pos >= el.scrollWidth / 2) {
        pos = 0;
      }
      el.style.transform = `translateX(-${pos}px)`;
      requestAnimationFrame(animate);
    };

    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [fullText]);

  return (
    <div className="flex items-center h-9 bg-slate-900 border-t border-slate-800 overflow-hidden flex-shrink-0">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 bg-emerald-600 h-full border-r border-emerald-500">
        <i className="ri-notification-2-fill text-white text-2xl" />
        <span className="text-white text-3xl font-bold whitespace-nowrap">食堂公告</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div ref={ref} className="flex whitespace-nowrap" style={{ willChange: 'transform' }}>
          <span className="text-slate-300 text-2xl px-6">{fullText}</span>
          <span className="text-slate-300 text-2xl px-6">{fullText}</span>
        </div>
      </div>
    </div>
  );
}

export default memo(Ticker);