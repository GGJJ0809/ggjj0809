import { useEffect } from 'react';

interface DishDetail {
  id: number;
  name: string;
  category: string;
  img: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  description: string;
}

interface DishDetailModalProps {
  dish: DishDetail | null;
  onClose: () => void;
}

export default function DishDetailModal({ dish, onClose }: DishDetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!dish) return null;

  const nutritionItems = [
    { label: '热量', value: Math.round(dish.calories), unit: 'kcal', color: 'text-orange-400', icon: 'ri-fire-line', bg: 'bg-orange-500/10' },
    { label: '蛋白质', value: Math.round(dish.protein * 10) / 10, unit: 'g', color: 'text-emerald-400', icon: 'ri-heart-pulse-line', bg: 'bg-emerald-500/10' },
    { label: '脂肪', value: Math.round(dish.fat * 10) / 10, unit: 'g', color: 'text-red-400', icon: 'ri-oil-line', bg: 'bg-red-500/10' },
    { label: '碳水', value: Math.round(dish.carbs * 10) / 10, unit: 'g', color: 'text-amber-400', icon: 'ri-bread-line', bg: 'bg-amber-500/10' },
  ];

  const categoryColors: Record<string, string> = {
    荤菜: 'bg-red-500/20 text-red-400 border-red-500/30',
    素菜: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    家常菜: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    主食: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    汤品: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    凉菜: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  };

  const colorClass = categoryColors[dish.category] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image header */}
        <div className="relative h-52">
          <img src={dish.img} alt={dish.name} className="w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg" />
          </button>

          {/* Title overlay */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${colorClass}`}>
                {dish.category}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white">{dish.name}</h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Nutrition grid */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {nutritionItems.map((item) => (
              <div key={item.label} className={`${item.bg} rounded-xl p-2.5 text-center`}>
                <i className={`${item.icon} ${item.color} text-sm mb-1 block`} />
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-slate-500">{item.unit}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <i className="ri-file-text-line text-emerald-400 text-sm" />
              <span className="text-sm font-medium text-slate-200">菜品介绍</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">{dish.description}</p>
          </div>

          {/* Bottom hint */}
          <div className="flex items-center justify-center gap-1 mt-4 text-slate-500">
            <i className="ri-hand-coin-line text-sm" />
            <span className="text-xs">已为您选择此菜品</span>
          </div>
        </div>
      </div>
    </div>
  );
}