import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface PickupStat {
  dishName: string;
  category: string;
  pickups: number;
  totalWeight: number;
  remaining: number;
  status: 'enough' | 'low' | 'empty';
}

interface CategorySummary {
  category: string;
  pickups: number;
  totalWeight: number;
  remaining: number;
}

interface MealBreakdown {
  mealType: string;
  count: number;
  weight: number;
}

import { todayBeijing } from '@/lib/dateUtils';

function todayStr() {
  return todayBeijing();
}

function getMealType() {
  const h = new Date().getHours();
  if (h < 9) return '早餐';
  if (h < 14) return '午餐';
  return '晚餐';
}

function CircularProgress({ value, max, color, label, meal, size = 52 }: { value: number; max: number; color: string; label: string; meal?: string; size?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const mealIcons: Record<string, string> = {
    早餐: 'ri-sun-line',
    午餐: 'ri-sun-foggy-line',
    晚餐: 'ri-moon-line',
    其他: 'ri-time-line',
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-slate-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          {meal && (
            <i className={`${mealIcons[meal] || 'ri-time-line'} text-[10px] leading-none`} style={{ color }} />
          )}
          <span className="text-[11px] font-bold font-mono text-slate-200 leading-tight">{Math.round(pct)}%</span>
        </div>
      </div>
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  );
}

export default function CateringStats() {
  const [stats, setStats] = useState<PickupStat[]>([]);
  const [summary, setSummary] = useState<CategorySummary[]>([]);
  const [totalPickups, setTotalPickups] = useState(0);
  const [totalWeight, setTotalWeight] = useState(0);
  const [totalRemaining, setTotalRemaining] = useState(0);
  const [mealBreakdown, setMealBreakdown] = useState<MealBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [mealType] = useState(getMealType);
  const tableRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const today = todayStr();
      const { data: logData } = await supabase
        .from('tray_pickup_logs')
        .select('*')
        .gte('pickup_time', `${today}T00:00:00`)
        .lte('pickup_time', `${today}T23:59:59`)
        .order('pickup_time', { ascending: false });

      const { data: stationData } = await supabase
        .from('tray_stations')
        .select('*')
        .eq('is_active', true);

      const stations = stationData || [];
      const logs = logData || [];

      // 按餐段统计
      const mealMap: Record<string, MealBreakdown> = {};
      logs.forEach((log: any) => {
        const mt = log.meal_type || '其他';
        if (!mealMap[mt]) {
          mealMap[mt] = { mealType: mt, count: 0, weight: 0 };
        }
        mealMap[mt].count += 1;
        mealMap[mt].weight += Number(log.pickup_weight) || 0;
      });
      setMealBreakdown(Object.values(mealMap));

      // 按菜品统计
      const statMap: Record<string, PickupStat> = {};
      logs.forEach((log: any) => {
        const name = log.dish_name || '未知菜品';
        if (!statMap[name]) {
          statMap[name] = {
            dishName: name,
            category: log.category || '其他',
            pickups: 0,
            totalWeight: 0,
            remaining: 0,
            status: 'enough',
          };
        }
        statMap[name].pickups += 1;
        statMap[name].totalWeight += Number(log.pickup_weight) || 0;
      });

      // 计算剩余量
      stations.forEach((s: any) => {
        const name = s.dish_name || s.name || '未知菜品';
        const netWeight = Math.max(0, (Number(s.hw_last_weight) || 0) - (Number(s.tare_weight) || 0));
        if (statMap[name]) {
          statMap[name].remaining = netWeight;
        } else {
          statMap[name] = {
            dishName: name,
            category: s.category || '其他',
            pickups: 0,
            totalWeight: 0,
            remaining: netWeight,
            status: 'enough',
          };
        }
      });

      const list = Object.values(statMap);
      list.forEach((s) => {
        if (s.remaining <= 0) s.status = 'empty';
        else if (s.remaining < 500) s.status = 'low';
        else s.status = 'enough';
      });
      list.sort((a, b) => b.pickups - a.pickups);
      setStats(list);

      // 分类汇总
      const catMap: Record<string, CategorySummary> = {};
      list.forEach((s) => {
        if (!catMap[s.category]) {
          catMap[s.category] = { category: s.category, pickups: 0, totalWeight: 0, remaining: 0 };
        }
        catMap[s.category].pickups += s.pickups;
        catMap[s.category].totalWeight += s.totalWeight;
        catMap[s.category].remaining += s.remaining;
      });
      const catSummary = Object.values(catMap).sort((a, b) => b.pickups - a.pickups);
      setSummary(catSummary);

      setTotalPickups(list.reduce((s, v) => s + v.pickups, 0));
      setTotalWeight(list.reduce((s, v) => s + v.totalWeight, 0));
      setTotalRemaining(list.reduce((s, v) => s + v.remaining, 0));
    } catch (e) {
      console.error('[CateringStats] fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, []);

  // Auto scroll table
  useEffect(() => {
    const el = tableRef.current;
    if (!el || !autoScroll) return;
    const scrollHeight = el.scrollHeight;
    const clientHeight = el.clientHeight;
    if (scrollHeight <= clientHeight) return;

    let scrollTop = 0;
    const timer = setInterval(() => {
      scrollTop += 1;
      if (scrollTop >= scrollHeight - clientHeight) {
        scrollTop = 0;
      }
      el.scrollTop = scrollTop;
    }, 60);
    return () => clearInterval(timer);
  }, [stats, autoScroll]);

  const formatWeight = (g: number) => {
    if (g >= 1000) return `${(g / 1000).toFixed(1)}kg`;
    return `${Math.round(g)}g`;
  };

  const statusConfig: Record<string, { label: string; dot: string; text: string }> = {
    enough: { label: '充足', dot: 'bg-emerald-400', text: 'text-emerald-400' },
    low: { label: '不足', dot: 'bg-amber-400', text: 'text-amber-400' },
    empty: { label: '缺货', dot: 'bg-red-400', text: 'text-red-400' },
  };

  const categoryColors: Record<string, string> = {
    荤菜: '#f87171',
    素菜: '#34d399',
    家常菜: '#fbbf24',
    主食: '#fb923c',
    汤品: '#38bdf8',
    凉菜: '#2dd4bf',
    热菜: '#f43f5e',
    炖煲: '#f59e0b',
    蒸菜: '#22d3ee',
    油炸: '#fbbf24',
    海鲜: '#60a5fa',
    肉食: '#f87171',
    小吃: '#f472b6',
    其他: '#94a3b8',
  };

  const mealColors: Record<string, string> = {
    早餐: '#34d399',
    午餐: '#fbbf24',
    晚餐: '#38bdf8',
    其他: '#94a3b8',
  };

  const maxMeal = Math.max(...mealBreakdown.map((m) => m.count), 1);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header - more compact */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <i className="ri-restaurant-line text-emerald-400" />今日餐饮统计
        </h3>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        {/* Left column */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 overflow-hidden">
          {/* Top cards - compact */}
          <div className="grid grid-cols-3 gap-2 flex-shrink-0">
            {[
              { label: '打餐次数', value: totalPickups, unit: '次', color: 'text-emerald-400', icon: 'ri-swap-box-line', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
              { label: '消耗重量', value: formatWeight(totalWeight), unit: '', color: 'text-amber-400', icon: 'ri-weight-line', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
              { label: '剩余材料', value: formatWeight(totalRemaining), unit: '', color: 'text-sky-400', icon: 'ri-inbox-archive-line', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} rounded-lg border ${s.border} p-2 flex items-center gap-2`}>
                <div className="w-7 h-7 rounded-lg bg-slate-900/50 flex items-center justify-center flex-shrink-0">
                  <i className={`${s.icon} ${s.color} text-sm`} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">{s.label}</p>
                  <p className={`text-sm font-bold font-mono ${s.color}`}>
                    {s.value}<span className="text-[10px] text-slate-600 ml-0.5">{s.unit}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Category summary - compact */}
          {summary.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
              {summary.map((cat) => (
                <div key={cat.category} className="flex items-center gap-1.5 bg-slate-900 rounded-md px-2 py-1 border border-slate-800">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColors[cat.category] || '#94a3b8' }} />
                  <span className="text-[10px] text-slate-400">{cat.category}</span>
                  <span className="text-[10px] font-semibold text-slate-200">{cat.pickups}</span>
                  <span className="text-[10px] text-slate-600">次</span>
                  <span className="text-[10px] text-slate-600">·</span>
                  <span className="text-[10px] text-slate-500 font-mono">{formatWeight(cat.totalWeight)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Table with auto-scroll */}
          <div className="flex-1 min-h-0 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden flex flex-col">
            <div className="flex items-center px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 flex-shrink-0">
              <span className="text-[11px] text-slate-500 flex-1 min-w-0">菜品</span>
              <span className="text-[11px] text-slate-500 w-12 flex-shrink-0 text-center">分类</span>
              <span className="text-[11px] text-slate-500 w-14 flex-shrink-0 text-right">次数</span>
              <span className="text-[11px] text-slate-500 w-20 flex-shrink-0 text-right">消耗</span>
              <span className="text-[11px] text-slate-500 w-20 flex-shrink-0 text-right">剩余</span>
              <span className="text-[11px] text-slate-500 w-14 flex-shrink-0 text-right">状态</span>
            </div>
            <div
              ref={tableRef}
              className="flex-1 overflow-y-auto min-h-0 no-scrollbar"
              onMouseEnter={() => setAutoScroll(false)}
              onMouseLeave={() => setAutoScroll(true)}
            >
              {loading ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <i className="ri-loader-4-line animate-spin text-sm mr-2" />
                  <span className="text-xs">加载中...</span>
                </div>
              ) : stats.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600">
                  <i className="ri-inbox-2-line text-2xl mb-2" />
                  <span className="text-xs">今日暂无打餐记录</span>
                </div>
              ) : (
                <div className="flex flex-col">
                  {stats.map((s, idx) => {
                    const cfg = statusConfig[s.status];
                    return (
                      <div
                        key={s.dishName}
                        className={`flex items-center px-3 py-1.5 ${idx % 2 === 0 ? 'bg-slate-900/30' : 'bg-slate-950/30'} hover:bg-slate-800/50 transition-colors`}
                      >
                        <span className="text-[11px] text-slate-300 flex-1 min-w-0 truncate" title={s.dishName}>
                          {s.dishName}
                        </span>
                        <span className="text-[11px] w-12 flex-shrink-0 text-center">
                          <span className="text-[10px] text-slate-500 bg-slate-800 rounded px-1.5 py-0.5">{s.category}</span>
                        </span>
                        <span className="text-[11px] font-mono text-slate-300 w-14 flex-shrink-0 text-right">{s.pickups}</span>
                        <span className="text-[11px] font-mono text-slate-400 w-20 flex-shrink-0 text-right">{formatWeight(s.totalWeight)}</span>
                        <span className="text-[11px] font-mono text-slate-400 w-20 flex-shrink-0 text-right">{formatWeight(s.remaining)}</span>
                        <span className="text-[11px] w-14 flex-shrink-0 text-right flex items-center justify-end gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                          <span className={cfg.text}>{cfg.label}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: charts - compact */}
        <div className="w-[100px] flex-shrink-0 flex flex-col items-center justify-center gap-4 py-2 overflow-hidden">
          {/* Meal type label */}
          <span className="text-xs text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800 flex-shrink-0">
            {mealType}
          </span>

          {/* Central circular decoration */}
          <div className="relative flex items-center justify-center flex-shrink-0">
            <div className="absolute w-24 h-24 rounded-full border-2 border-dashed border-slate-700 animate-spin" style={{ animationDuration: '20s' }} />
            <div className="absolute w-20 h-20 rounded-full border border-slate-700/50" />
            <div className="absolute w-16 h-16 rounded-full border border-emerald-500/30" />
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/40 flex flex-col items-center justify-center">
              <i className="ri-restaurant-line text-emerald-400 text-[10px] mb-0" />
              <span className="text-[10px] text-emerald-400 font-bold leading-tight">{totalPickups}</span>
              <span className="text-[8px] text-slate-500 leading-tight">总打餐</span>
            </div>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400" />
          </div>

          {/* Circular progress */}
          <div className="flex flex-col items-center gap-4 flex-shrink-0">
            {mealBreakdown.length > 0 ? (
              mealBreakdown.map((m) => (
                <CircularProgress
                  key={m.mealType}
                  value={m.count}
                  max={maxMeal}
                  color={mealColors[m.mealType] || '#94a3b8'}
                  label={`${m.mealType} ${m.count}次`}
                  meal={m.mealType}
                  size={60}
                />
              ))
            ) : (
              <>
                <CircularProgress value={0} max={1} color="#34d399" label="早餐 0次" meal="早餐" size={60} />
                <CircularProgress value={0} max={1} color="#fbbf24" label="午餐 0次" meal="午餐" size={60} />
                <CircularProgress value={0} max={1} color="#38bdf8" label="晚餐 0次" meal="晚餐" size={60} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}