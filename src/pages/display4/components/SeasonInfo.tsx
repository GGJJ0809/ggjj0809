import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
// ⚠️ 纯局域网环境：不读云端，直接读本地 SQLite
// supabase 在 Electron 下就是 localDb，读写同一份数据库

interface SolarTerm {
  name: string;
  nextName: string;
  daysUntilNext: number;
  foods: string[];
  healthTip: string;
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

function getCurrentSolarTerm(): Omit<SolarTerm, 'foods' | 'healthTip'> {
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

export default function SeasonInfo() {
  const [term, setTerm] = useState<SolarTerm>(() => {
    const base = getCurrentSolarTerm();
    return { ...base, foods: [], healthTip: '' };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchSeasonConfig = async () => {
    const base = getCurrentSolarTerm();
    try {
      const { data: row, error: localErr } = await supabase
        .from('display_season_config')
        .select('foods, health_tip')
        .eq('term_name', base.name)
        .maybeSingle();
      if (localErr) throw localErr;

      setTerm({
        ...base,
        foods: Array.isArray(row?.foods) ? row.foods : [],
        healthTip: row?.health_tip || '',
      });
      setError(false);
    } catch (e) {
      console.error('[SeasonInfo] fetch config error:', e);
      setTerm({ ...base, foods: [], healthTip: '' });
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeasonConfig();
    const t = setInterval(fetchSeasonConfig, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-emerald-500/10">
          <i className="ri-calendar-todo-line text-emerald-400 text-3xl" />
        </div>
        <span className="text-4xl font-semibold text-slate-200">时令节气</span>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center gap-3 mb-2.5 flex-shrink-0">
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0">
            <span className="text-emerald-400 text-4xl font-bold">{term.name}</span>
          </div>
          <div className="min-w-0">
            <p className="text-4xl text-slate-300 font-medium truncate">
              {term.daysUntilNext > 0 ? `距${term.nextName}还有 ${term.daysUntilNext} 天` : '今日节气更替'}
            </p>
            <p className="text-3xl text-slate-500 mt-0.5 truncate">{term.healthTip || '-'}</p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
          {loading ? (
            <div className="flex items-center gap-1 text-slate-500">
              <i className="ri-loader-4-line animate-spin text-3xl" />
              <span className="text-3xl">加载中...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-slate-500">
              <i className="ri-error-warning-line text-3xl text-amber-400" />
              <span className="text-3xl">加载失败</span>
              <button
                type="button"
                onClick={() => { setLoading(true); fetchSeasonConfig(); }}
                className="text-3xl text-emerald-400 hover:text-emerald-300 cursor-pointer underline whitespace-nowrap"
              >
                重试
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {term.foods.length === 0 ? (
                <span className="text-3xl text-slate-500">暂无推荐食材</span>
              ) : (
                term.foods.map((food) => (
                  <span
                    key={food}
                    className="text-3xl text-emerald-300 bg-emerald-500/10 rounded px-2 py-0.5 border border-emerald-500/20"
                  >
                    {food}
                  </span>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}