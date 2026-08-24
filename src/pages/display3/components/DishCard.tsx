interface DishCardProps {
  id: number;
  name: string;
  category: string;
  img: string;
  calories: number;
  likeCount: number;
  isLiked: boolean;
  onOrder: () => void;
}

export default function DishCard({ name, category, img, likeCount, isLiked, onOrder }: DishCardProps) {
  const categoryColors: Record<string, string> = {
    荤菜: 'bg-red-500/20 text-red-400 border-red-500/30',
    素菜: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    家常菜: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    主食: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    汤品: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    凉菜: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  };

  const colorClass = categoryColors[category] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';

  return (
    <div className="group relative flex flex-col rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] bg-slate-900">
      {/* Image area */}
      <div className="relative w-full aspect-[3/2] bg-slate-800 overflow-hidden">
        {img ? (
          <img
            src={img}
            alt={name}
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : null}
        {/* Fallback when image fails */}
        <div className={`absolute inset-0 flex-col items-center justify-center bg-slate-800${img ? ' hidden' : ' flex'}`}>
          <i className="ri-image-line text-slate-600 text-2xl mb-2" />
          <span className="text-slate-400 text-sm font-medium px-2 text-center">{name}</span>
        </div>

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${colorClass}`}>
            {category}
          </span>
        </div>

        {/* Like heart animation */}
        {isLiked && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="animate-ping absolute w-12 h-12 rounded-full bg-red-500/30" />
            <i className="ri-heart-3-fill text-red-400 text-4xl animate-bounce" />
          </div>
        )}
      </div>

      {/* Info bar — 三列 grid：菜名 | 点菜(居中) | 红心 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-3 py-2.5 bg-slate-900">
        {/* 左：菜名 */}
        <span className="text-white text-sm font-bold truncate">{name}</span>

        {/* 中：点菜按钮 — 真正居中 */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOrder();
            }}
            className="flex items-center gap-1 px-4 py-1.5 rounded-full bg-emerald-500 border border-emerald-400 text-white text-sm font-bold hover:bg-emerald-400 active:scale-95 transition-all cursor-pointer whitespace-nowrap shadow-sm shadow-emerald-500/20"
          >
            <i className="ri-add-line text-base" />
            <span>点菜</span>
          </button>
        </div>

        {/* 右：红心 */}
        <div className="flex items-center justify-end gap-1 text-red-400">
          <i className="ri-heart-3-fill text-sm" />
          <span className="text-sm font-semibold">{likeCount}</span>
        </div>
      </div>
    </div>
  );
}