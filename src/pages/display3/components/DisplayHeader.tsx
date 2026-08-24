import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface DisplayHeaderProps {
  categories: string[];
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
}

export default function DisplayHeader({ categories, activeCategory, onCategoryChange }: DisplayHeaderProps) {
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="flex-shrink-0 bg-slate-950 border-b border-slate-800">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 flex items-center justify-center bg-emerald-500 rounded-lg">
            <i className="ri-restaurant-2-line text-white text-base" />
          </div>
          <span className="text-white text-lg font-bold whitespace-nowrap">智慧食堂 · 点餐系统</span>
        </div>
        <div className="text-right whitespace-nowrap">
          <div>
            <p className="text-white text-xl font-mono font-bold leading-tight">{timeStr}</p>
            <p className="text-slate-500 text-xs">{dateStr}</p>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 px-6 py-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => onCategoryChange('全部')}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
            activeCategory === '全部'
              ? 'bg-emerald-500 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          全部
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onCategoryChange(cat)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeCategory === cat
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
}