import { useState } from 'react';

interface RatingCounts {
  good: number;
  average: number;
  bad: number;
}

interface DishCard5Props {
  id: number;
  name: string;
  category: string;
  img: string;
  calories: number;
  ratings: RatingCounts;
  onRate: (type: 'good' | 'average' | 'bad') => void;
  ratingAnim: string | null;
}

const categoryColors: Record<string, string> = {
  荤菜: 'bg-red-500/20 text-red-400 border-red-500/30',
  素菜: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  家常菜: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  主食: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  汤品: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  凉菜: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

export default function DishCard5({ name, category, img, ratings, onRate, ratingAnim }: DishCard5Props) {
  const colorClass = categoryColors[category] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  const total = ratings.good + ratings.average + ratings.bad;

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

        {/* Rating animation overlay */}
        {ratingAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="animate-ping absolute w-12 h-12 rounded-full bg-emerald-500/30" />
            <i className={`text-4xl animate-bounce ${
              ratingAnim === 'good' ? 'ri-emotion-happy-fill text-emerald-400' :
              ratingAnim === 'average' ? 'ri-emotion-normal-fill text-amber-400' :
              'ri-emotion-sad-fill text-red-400'
            }`} />
          </div>
        )}
      </div>

      {/* Info + Rating bar */}
      <div className="px-3 py-2.5 bg-slate-900 space-y-2">
        {/* Row 1: Name */}
        <span className="text-white text-sm font-bold truncate block">{name}</span>

        {/* Row 2: Rating buttons */}
        <div className="flex items-center justify-between gap-1">
          {/* 好评按钮 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRate('good'); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-emotion-happy-line text-sm" />
            <span>好评</span>
            <span className="text-[10px] opacity-70">{ratings.good}</span>
          </button>

          {/* 一般按钮 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRate('average'); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/25 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-emotion-normal-line text-sm" />
            <span>一般</span>
            <span className="text-[10px] opacity-70">{ratings.average}</span>
          </button>

          {/* 差评按钮 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRate('bad'); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/25 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-emotion-sad-line text-sm" />
            <span>差评</span>
            <span className="text-[10px] opacity-70">{ratings.bad}</span>
          </button>
        </div>

        {/* Row 3: Total rating summary */}
        {total > 0 && (
          <div className="flex items-center justify-center gap-2 pt-0.5">
            <div className="flex items-center gap-1">
              <div className="h-1.5 rounded-full bg-emerald-500/40" style={{ width: `${total > 0 ? Math.max(4, (ratings.good / total) * 60) : 0}px` }} />
              <div className="h-1.5 rounded-full bg-amber-500/40" style={{ width: `${total > 0 ? Math.max(4, (ratings.average / total) * 60) : 0}px` }} />
              <div className="h-1.5 rounded-full bg-red-500/40" style={{ width: `${total > 0 ? Math.max(4, (ratings.bad / total) * 60) : 0}px` }} />
            </div>
            <span className="text-[10px] text-slate-500">{total} 评</span>
          </div>
        )}
      </div>
    </div>
  );
}