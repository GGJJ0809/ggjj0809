import { useRef, useEffect, memo } from 'react';

interface HeaderProps {
  title: string;
  breadcrumb?: string[];
}

function Header({ title, breadcrumb }: HeaderProps) {
  const timeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const tick = () => {
      if (timeRef.current) {
        timeRef.current.textContent = new Date().toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-6 flex-shrink-0">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {breadcrumb && (
          <div className="flex items-center gap-1 mt-0.5">
            {breadcrumb.map((crumb, i) => (
              <span key={crumb} className="flex items-center gap-1">
                {i > 0 && <i className="ri-arrow-right-s-line text-slate-300 text-xs" />}
                <span className={`text-xs ${i === breadcrumb.length - 1 ? 'text-slate-500' : 'text-slate-400'}`}>
                  {crumb}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <i className="ri-time-line text-slate-400" />
          <span ref={timeRef} className="font-mono" />
        </div>

        <button type="button" className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
          <i className="ri-notification-3-line text-slate-500 text-base" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
        </button>

        <button type="button" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
          <i className="ri-settings-3-line text-slate-500 text-base" />
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-slate-100 cursor-pointer">
          <div className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-100">
            <i className="ri-user-line text-emerald-600 text-sm" />
          </div>
          <span className="text-xs font-medium text-slate-700">管理员</span>
          <i className="ri-arrow-down-s-line text-slate-400 text-sm" />
        </div>
      </div>
    </header>
  );
}

export default memo(Header);