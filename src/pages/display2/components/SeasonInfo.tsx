import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getSupabaseCloud } from '@/lib/supabaseCloud';

interface RemainingItem {
  name: string;
  category: string;
  remaining: number;
}

interface Contraindication {
  dishName: string;
  category: string;
  contraindications: string;
}

interface SolarTerm {
  name: string;
  nextName: string;
  daysUntilNext: number;
}

const solarTermDates: Record<number, Record<number, { name: string; nextName: string }>> = {
  2026: {
    105: { name: '小寒', nextName: '大寒' },
    120: { name: '大寒', nextName: '立春' },
    204: { name: '立春', nextName: '雨水' },
    218: { name: '雨水', nextName: '惊蛰' },
    305: { name: '惊蛰', nextName: '春分' },
    320: { name: '春分', nextName: '清明' },
    405: { name: '清明', nextName: '谷雨' },
    420: { name: '谷雨', nextName: '立夏' },
    505: { name: '立夏', nextName: '小满' },
    521: { name: '小满', nextName: '芒种' },
    605: { name: '芒种', nextName: '夏至' },
    621: { name: '夏至', nextName: '小暑' },
    707: { name: '小暑', nextName: '大暑' },
    722: { name: '大暑', nextName: '立秋' },
    807: { name: '立秋', nextName: '处暑' },
    823: { name: '处暑', nextName: '白露' },
    907: { name: '白露', nextName: '秋分' },
    923: { name: '秋分', nextName: '寒露' },
    1008: { name: '寒露', nextName: '霜降' },
    1023: { name: '霜降', nextName: '立冬' },
    1107: { name: '立冬', nextName: '小雪' },
    1122: { name: '小雪', nextName: '大雪' },
    1207: { name: '大雪', nextName: '冬至' },
    1221: { name: '冬至', nextName: '小寒' },
  },
};

function getCurrentSolarTerm(): SolarTerm {
  const now = new Date();
  const year = now.getFullYear();
  const terms = solarTermDates[year] || solarTermDates[2026];

  const month = now.getMonth() + 1;
  const day = now.getDate();
  const key = month * 100 + day;

  const sortedKeys = Object.keys(terms).map(Number).sort((a, b) => a - b);

  let currentKey = sortedKeys[0];
  let nextKey = sortedKeys[1];
  for (let i = 0; i < sortedKeys.length; i++) {
    if (key >= sortedKeys[i]) {
      currentKey = sortedKeys[i];
      nextKey = sortedKeys[i + 1] || sortedKeys[0];
    }
  }

  const current = terms[currentKey];
  const next = terms[nextKey];
  const nextDate = new Date(year, Math.floor(nextKey / 100) - 1, nextKey % 100);
  const daysUntilNext = Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    name: current.name,
    nextName: next.name,
    daysUntilNext,
  };
}

function WaveBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function SeasonInfo() {
  const [remaining, setRemaining] = useState<RemainingItem[]>([]);
  const [contraindications, setContraindications] = useState<Contraindication[]>([]);
  const [loading, setLoading] = useState(true);
  const remainingRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [seasonFoods, setSeasonFoods] = useState<string[]>([]);

  const term = getCurrentSolarTerm();

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch season config — 优先从云端拉取，失败兜底 localDb
      let seasonData: { foods?: string[] } | null = null;
      const cloud = getSupabaseCloud();
      if (cloud) {
        try {
          const { data: cloudData, error: cloudErr } = await cloud
            .from('display_season_config')
            .select('foods')
            .eq('term_name', term.name)
            .maybeSingle();
          if (!cloudErr && cloudData) {
            seasonData = cloudData as { foods?: string[] };
          }
        } catch {
          // cloud failed, fall through to local
        }
      }
      if (!seasonData) {
        const { data: localData } = await supabase
          .from('display_season_config')
          .select('foods')
          .eq('term_name', term.name)
          .maybeSingle();
        seasonData = (localData as { foods?: string[] } | null);
      }
      setSeasonFoods((seasonData?.foods as string[]) || []);

      const { data: stationData } = await supabase
        .from('tray_stations')
        .select('*')
        .eq('is_active', true);

      const remainingItems: RemainingItem[] = (stationData || []).map((s: any) => {
        const netWeight = Math.max(0, (Number(s.hw_last_weight) || 0) - (Number(s.tare_weight) || 0));
        return {
          name: s.dish_name || s.name || '未知',
          category: s.category || '其他',
          remaining: netWeight,
        };
      }).filter((r) => r.remaining > 0);
      remainingItems.sort((a, b) => b.remaining - a.remaining);
      setRemaining(remainingItems);

      const { data: dishData } = await supabase
        .from('product_items')
        .select('id, name, category_id, product_categories(id, name)')
        .eq('status', 'active');

      const { data: fieldData } = await supabase
        .from('product_custom_fields')
        .select('id, name')
        .eq('name', 'contraindications')
        .maybeSingle();

      const contras: Contraindication[] = [];
      if (fieldData && dishData) {
        const dishIds = (dishData as any[]).map((d) => d.id);
        const { data: cvData } = await supabase
          .from('product_custom_values')
          .select('product_id, value')
          .eq('field_id', fieldData.id)
          .in('product_id', dishIds);

        const cvMap = new Map<number, string>();
        (cvData || []).forEach((cv: any) => {
          if (cv.value && cv.value.trim()) {
            cvMap.set(cv.product_id, cv.value);
          }
        });

        (dishData as any[]).forEach((d) => {
          const val = cvMap.get(d.id);
          if (val) {
            const catName = (d.product_categories as { name: string } | null)?.name || '其他';
            contras.push({
              dishName: d.name,
              category: catName,
              contraindications: val,
            });
          }
        });
      }
      setContraindications(contras.slice(0, 12));
    } catch (e) {
      console.error('[SeasonInfo] fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, []);

  // Auto scroll remaining items
  useEffect(() => {
    const el = remainingRef.current;
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
  }, [remaining, autoScroll]);

  const formatWeight = (g: number) => {
    if (g >= 1000) return `${(g / 1000).toFixed(1)}kg`;
    return `${Math.round(g)}g`;
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

  const remainingMock: RemainingItem[] = [
    { name: '米饭', category: '主食', remaining: 8500 },
    { name: '红烧肉', category: '荤菜', remaining: 3200 },
    { name: '清炒时蔬', category: '素菜', remaining: 2100 },
    { name: '番茄蛋汤', category: '汤品', remaining: 4500 },
    { name: '宫保鸡丁', category: '热菜', remaining: 2800 },
    { name: '凉拌黄瓜', category: '凉菜', remaining: 1200 },
    { name: '蒸蛋羹', category: '蒸菜', remaining: 1800 },
    { name: '糖醋里脊', category: '油炸', remaining: 1500 },
    { name: '白灼虾', category: '海鲜', remaining: 900 },
    { name: '冬瓜排骨汤', category: '炖煲', remaining: 3800 },
    { name: '馒头', category: '主食', remaining: 6500 },
    { name: '韭菜炒蛋', category: '家常菜', remaining: 2400 },
  ];

  const displayRemaining = remaining.length > 0 ? remaining : remainingMock;
  const maxRemaining = displayRemaining.length > 0 ? displayRemaining[0].remaining : 1;
  const totalRemaining = displayRemaining.reduce((s, r) => s + r.remaining, 0);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Top row: 时令节气 + 饮食禁忌 并排 */}
      <div className="flex gap-2 flex-shrink-0">
        {/* 时令节气 - compact */}
        <div className="flex-1 min-w-0 bg-slate-900 rounded-lg border border-slate-800 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-emerald-500/10">
                <i className="ri-calendar-todo-line text-emerald-400 text-[10px]" />
              </div>
              <span className="text-xs font-semibold text-slate-200">时令节气</span>
            </div>
            <span className="text-[10px] text-slate-500">
              {new Date().toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-lg font-bold text-emerald-400">{term.name}</span>
            <span className="text-[10px] text-slate-500">
              {term.daysUntilNext > 0 ? `距${term.nextName} ${term.daysUntilNext} 天` : '今日节气更替'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {seasonFoods.map((food) => (
              <span
                key={food}
                className="text-[10px] text-emerald-300 bg-emerald-500/10 rounded px-1.5 py-0.5 border border-emerald-500/20"
              >
                {food}
              </span>
            ))}
          </div>
        </div>

        {/* 饮食禁忌 - compact */}
        <div className="flex-1 min-w-0 bg-slate-900 rounded-lg border border-slate-800 p-2.5 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 mb-1.5 flex-shrink-0">
            <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-red-500/10">
              <i className="ri-health-book-line text-red-400 text-[10px]" />
            </div>
            <span className="text-xs font-semibold text-slate-200">饮食禁忌</span>
            <span className="text-[10px] text-slate-500 ml-auto">{contraindications.length} 条</span>
          </div>
          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-3 text-slate-500">
                <i className="ri-loader-4-line animate-spin text-xs mr-1" />
                <span className="text-[10px]">加载中...</span>
              </div>
            ) : contraindications.length === 0 ? (
              <div className="text-center py-2 text-slate-600">
                <i className="ri-check-double-line text-lg mb-0.5" />
                <p className="text-[10px]">暂无饮食禁忌数据</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {contraindications.map((c) => (
                  <div key={c.dishName} className="flex items-start gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-300 truncate">{c.dishName}</span>
                        <span className="text-[9px] text-slate-500 bg-slate-800 rounded px-1 flex-shrink-0">
                          {c.category}
                        </span>
                      </div>
                      <p className="text-[10px] text-red-400/80 truncate" title={c.contraindications}>
                        {c.contraindications}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: 剩余材料 — 占满剩余空间 */}
      <div className="flex-1 min-h-0 bg-slate-900 rounded-lg border border-slate-800 p-2.5 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 mb-1.5 flex-shrink-0">
          <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-sky-500/10">
            <i className="ri-archive-line text-sky-400 text-[10px]" />
          </div>
          <span className="text-xs font-semibold text-slate-200">剩余材料</span>
          <span className="text-[10px] text-slate-500 ml-auto">
            {displayRemaining.length} 种 · 共 {formatWeight(totalRemaining)}
          </span>
        </div>
        <div
          ref={remainingRef}
          className="flex-1 overflow-y-auto min-h-0 no-scrollbar"
          onMouseEnter={() => setAutoScroll(false)}
          onMouseLeave={() => setAutoScroll(true)}
        >
          {loading ? (
            <div className="flex items-center justify-center py-3 text-slate-500">
              <i className="ri-loader-4-line animate-spin text-xs mr-1" />
              <span className="text-[10px]">加载中...</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {displayRemaining.map((r) => {
                const color = categoryColors[r.category] || '#94a3b8';
                return (
                  <div key={r.name}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[10px] text-slate-300 truncate flex-1 min-w-0">{r.name}</span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">{r.category}</span>
                      <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap w-14 text-right">
                        {formatWeight(r.remaining)}
                      </span>
                    </div>
                    <WaveBar value={r.remaining} max={maxRemaining} color={color} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}