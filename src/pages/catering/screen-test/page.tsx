import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

type Orientation = 'landscape' | 'portrait';

interface TrayStation {
  id: number;
  name: string;
  category: string;
  dish_name: string;
  station_code: string;
  tare_weight: number;
  capacity_max: number;
  hw_last_weight: number;
  hw_last_seen: string | null;
  hw_enabled: boolean;
  product_item_id: number | null;
  sort_order: number;
}

interface DishNutrition {
  id: number;
  dish_name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  dietary_fiber_per_100g: number;
  sodium_per_100g: number;
  img: string;
  category: string;
}

interface StationWithNutrition extends TrayStation {
  nutrition: DishNutrition | null;
  net_weight: number;
  dispensed_weight: number;
}

interface AggregatedNutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sodium: number;
}

// 默认每日取餐目标 (克)
const DEFAULT_DAILY_TARGET = 480;

export default function ScreenTestPage() {
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [stations, setStations] = useState<StationWithNutrition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = new URLSearchParams(window.location.search);
  const deviceToken = params.get('token') || '';
  const isDeviceMode = !!deviceToken;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: trayData, error: trayErr } = await supabase
        .from('tray_stations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (trayErr) throw trayErr;

      const trays: TrayStation[] = trayData || [];

      const d = new Date(Date.now() + 8 * 3600 * 1000);
      const todayStr = d.toISOString().slice(0, 10);

      const { data: nutData } = await supabase
        .from('dish_nutrition')
        .select('*')
        .eq('menu_date', todayStr)
        .order('id');

      const nutritionMap: Record<string, DishNutrition> = {};
      (nutData || []).forEach((n) => {
        const key = (n.dish_name || '').trim();
        if (key && !nutritionMap[key]) {
          nutritionMap[key] = n;
        }
      });

      const enriched: StationWithNutrition[] = trays.map((tray) => {
        const dishName = (tray.dish_name || '').trim();
        const nutrition = nutritionMap[dishName] || null;
        const tareWeight = Number(tray.tare_weight) || 0;
        const currentWeight = Number(tray.hw_last_weight) || 0;
        const netWeight = Math.max(0, currentWeight - tareWeight);
        const capacityMax = Number(tray.capacity_max) || 60;
        const dispensedWeight = Math.max(0, capacityMax - netWeight);

        return {
          ...tray,
          nutrition,
          net_weight: netWeight,
          dispensed_weight: dispensedWeight,
        };
      });

      setStations(enriched);
    } catch (err: any) {
      console.error('Failed to fetch screen test data:', err);
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ─── Computed data ───

  const activeStations = useMemo(
    () => stations.filter((s) => s.hw_enabled && s.dish_name),
    [stations],
  );

  const totalDispensed = useMemo(
    () => activeStations.reduce((sum, s) => sum + s.dispensed_weight, 0),
    [activeStations],
  );

  // 模拟托盘皮重 + 已取餐重量
  const TRAY_TARE = 156;
  const trayCurrentWeight = TRAY_TARE + totalDispensed;

  const aggregatedNutrition = useMemo((): AggregatedNutrition => {
    return activeStations.reduce((acc, s) => {
      const n = s.nutrition;
      if (!n) return acc;
      const ratio = s.dispensed_weight / 100;
      return {
        calories: acc.calories + ratio * (Number(n.calories_per_100g) || 0),
        protein: acc.protein + ratio * (Number(n.protein_per_100g) || 0),
        fat: acc.fat + ratio * (Number(n.fat_per_100g) || 0),
        carbs: acc.carbs + ratio * (Number(n.carbs_per_100g) || 0),
        fiber: acc.fiber + ratio * (Number(n.dietary_fiber_per_100g) || 0),
        sodium: acc.sodium + ratio * (Number(n.sodium_per_100g) || 0),
      };
    }, { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sodium: 0 });
  }, [activeStations]);

  const targetPct = Math.min(100, Math.round((totalDispensed / DEFAULT_DAILY_TARGET) * 100));
  const remaining = Math.max(0, DEFAULT_DAILY_TARGET - totalDispensed);

  // 营养均衡度 0-5 星
  const balanceRating = useMemo(() => {
    const { calories, protein, fat, carbs, fiber, sodium } = aggregatedNutrition;
    if (calories === 0) return 0;

    const proteinCal = protein * 4;
    const fatCal = fat * 9;
    const carbCal = carbs * 4;
    const totalCal = proteinCal + fatCal + carbCal;

    if (totalCal === 0) return 0;

    const proteinPct = proteinCal / totalCal;
    const fatPct = fatCal / totalCal;
    const carbPct = carbCal / totalCal;

    let score = 0;
    // 蛋白质占比 12%-30% 得 1 分
    if (proteinPct >= 0.12 && proteinPct <= 0.30) score += 1;
    else if (proteinPct > 0.08) score += 0.5;
    // 脂肪占比 15%-35% 得 1 分
    if (fatPct >= 0.15 && fatPct <= 0.35) score += 1;
    else if (fatPct > 0.08) score += 0.5;
    // 碳水占比 45%-65% 得 1 分
    if (carbPct >= 0.45 && carbPct <= 0.65) score += 1;
    else if (carbPct > 0.35) score += 0.5;
    // 膳食纤维 ≥ 5g 得 1 分
    if (fiber >= 5) score += 1;
    else if (fiber >= 2) score += 0.5;
    // 钠 ≤ 800mg 得 1 分
    if (sodium <= 800) score += 1;
    else if (sodium <= 1500) score += 0.5;

    return Math.round(score);
  }, [aggregatedNutrition]);

  const hasWeightData = activeStations.some((s) => s.hw_last_weight > 0);
  const lastUpdate = stations.reduce((latest, s) => {
    if (s.hw_last_seen && s.hw_last_seen > latest) return s.hw_last_seen;
    return latest;
  }, '');

  // ═══════════════════════════════════════════════
  //  Device mode — Android WebView 实际显示
  // ═══════════════════════════════════════════════
  if (isDeviceMode) {
    return (
      <div className="fixed inset-0 bg-slate-950">
        <DeviceDisplay
          orientation={orientation}
          onToggleOrientation={() => setOrientation((o) => (o === 'landscape' ? 'portrait' : 'landscape'))}
          loading={loading}
          totalDispensed={totalDispensed}
          trayCurrentWeight={trayCurrentWeight}
          remaining={remaining}
          targetPct={targetPct}
          aggregatedNutrition={aggregatedNutrition}
          balanceRating={balanceRating}
          hasWeightData={hasWeightData}
          lastUpdate={lastUpdate}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  //  Management mode — 侧边栏管理端
  // ═══════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-slate-900 rounded-lg">
            <i className="ri-smartphone-line text-white text-sm" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-800">电子屏界面测试</h1>
            <p className="text-xs text-slate-400">营养展示界面预览与调试</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setOrientation('landscape')}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                orientation === 'landscape' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <i className="ri-tablet-line" />
              横屏
            </button>
            <button
              type="button"
              onClick={() => setOrientation('portrait')}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                orientation === 'portrait' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <i className="ri-smartphone-line" />
              竖屏
            </button>
          </div>

          <button
            type="button"
            onClick={fetchData}
            className="flex items-center gap-1 text-xs text-slate-600 border border-slate-200 bg-white px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line" />
            刷新
          </button>
        </div>
      </div>

      <div className="flex gap-4 p-4 max-w-[1400px] mx-auto h-[calc(100vh-57px)]">
        {/* Left: Preview panel — fill entire left side */}
        <div className="flex-1 rounded-xl overflow-hidden border border-slate-200 relative">
          {loading && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-white/90 backdrop-blur rounded-full px-2.5 py-1 border border-slate-200">
              <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] text-slate-500">加载中</span>
            </div>
          )}
          <DeviceDisplay
            orientation={orientation}
            onToggleOrientation={() => {}}
            loading={false}
            totalDispensed={totalDispensed}
            trayCurrentWeight={trayCurrentWeight}
            remaining={remaining}
            targetPct={targetPct}
            aggregatedNutrition={aggregatedNutrition}
            balanceRating={balanceRating}
            hasWeightData={hasWeightData}
            lastUpdate={lastUpdate}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  DeviceDisplay — 设备端完整界面
// ═══════════════════════════════════════════════
function DeviceDisplay({
  orientation,
  onToggleOrientation,
  loading,
  totalDispensed,
  trayCurrentWeight,
  remaining,
  targetPct,
  aggregatedNutrition,
  balanceRating,
  hasWeightData,
  lastUpdate,
  compact,
}: {
  orientation: Orientation;
  onToggleOrientation: () => void;
  loading: boolean;
  totalDispensed: number;
  trayCurrentWeight: number;
  remaining: number;
  targetPct: number;
  aggregatedNutrition: AggregatedNutrition;
  balanceRating: number;
  hasWeightData: boolean;
  lastUpdate: string;
  compact?: boolean;
}) {
  const isLandscape = orientation === 'landscape';

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-950 text-white overflow-hidden flex flex-col font-sans">
      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🍽️</span>
          <span className="text-sm font-semibold tracking-wide">智慧餐盘 · 取餐中</span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[10px] text-slate-500">
              {new Date(lastUpdate).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleOrientation}
            className="w-7 h-7 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 transition-colors cursor-pointer flex-shrink-0"
          >
            <i className={`text-xs ${isLandscape ? 'ri-smartphone-line' : 'ri-tablet-line'}`} />
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className={`flex-1 flex ${isLandscape ? 'flex-row' : 'flex-col'} overflow-hidden`}>
        {/* ── Left/Top: Weight section ── */}
        <div className={`${isLandscape ? 'w-[45%]' : 'flex-[1.1]'} flex flex-col justify-center px-5 py-4`}>
          {/* Core: 本次取餐 */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800/80 rounded-2xl border border-slate-700/50 p-5 mb-4">
            <div className="text-xs text-slate-400 mb-1">本次取餐</div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-5xl font-bold text-white tracking-tight">
                {Math.round(totalDispensed)}
              </span>
              <span className="text-lg text-slate-400">克</span>
            </div>

            {/* Progress bar */}
            <div className="mb-2">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-slate-500">目标进度</span>
                <span
                  className={`font-bold ${
                    targetPct >= 80 ? 'text-amber-400' : targetPct >= 40 ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {targetPct}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-700/60 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${targetPct}%`,
                    background: targetPct >= 80
                      ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                      : 'linear-gradient(90deg, #10b981, #34d399)',
                  }}
                />
              </div>
            </div>
            <div className="text-[10px] text-slate-500">
              目标 {DEFAULT_DAILY_TARGET}g
            </div>
          </div>

          {/* Real-time data */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between bg-slate-900/60 rounded-xl px-4 py-2.5 border border-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-xs text-slate-400">托盘当前重量</span>
              </div>
              <span className="text-sm font-bold text-white">{Math.round(trayCurrentWeight)}g</span>
            </div>
            <div className="flex items-center justify-between bg-slate-900/60 rounded-xl px-4 py-2.5 border border-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-slate-400">已取餐</span>
              </div>
              <span className="text-sm font-bold text-emerald-400">{Math.round(totalDispensed)}g</span>
            </div>
            <div className="flex items-center justify-between bg-slate-900/60 rounded-xl px-4 py-2.5 border border-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-xs text-slate-400">剩余可拿</span>
              </div>
              <span className="text-sm font-bold text-amber-400">{Math.round(remaining)}g</span>
            </div>
          </div>
        </div>

        {/* ── Right/Bottom: Nutrition section ── */}
        <div className={`${isLandscape ? 'w-[55%] border-l border-slate-800/60' : 'flex-[1.3] border-t border-slate-800/60'} flex flex-col px-5 py-4`}>
          {!hasWeightData ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <i className="ri-scales-line text-3xl mb-3 opacity-40" />
              <p className="text-xs">等待称重数据...</p>
            </div>
          ) : (
            <>
              {/* Nutrition header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">📊</span>
                <span className="text-xs font-semibold text-slate-300">本次营养成分</span>
              </div>

              {/* 3x2 Nutrition grid */}
              <div className="grid grid-cols-3 gap-2 flex-1">
                <NutritionCell
                  label="蛋白质"
                  value={Math.round(aggregatedNutrition.protein * 10) / 10}
                  unit="g"
                  color="#ef4444"
                  icon="ri-flask-line"
                />
                <NutritionCell
                  label="碳水"
                  value={Math.round(aggregatedNutrition.carbs * 10) / 10}
                  unit="g"
                  color="#3b82f6"
                  icon="ri-restaurant-line"
                />
                <NutritionCell
                  label="脂肪"
                  value={Math.round(aggregatedNutrition.fat * 10) / 10}
                  unit="g"
                  color="#f59e0b"
                  icon="ri-drop-line"
                />
                <NutritionCell
                  label="膳食纤维"
                  value={Math.round(aggregatedNutrition.fiber * 10) / 10}
                  unit="g"
                  color="#22c55e"
                  icon="ri-leaf-line"
                />
                <NutritionCell
                  label="钠"
                  value={Math.round(aggregatedNutrition.sodium)}
                  unit="mg"
                  color="#a855f7"
                  icon="ri-contrast-drop-line"
                />
                <NutritionCell
                  label="热量"
                  value={Math.round(aggregatedNutrition.calories)}
                  unit="kcal"
                  color="#f97316"
                  icon="ri-fire-line"
                  highlight
                />
              </div>

              {/* Balance rating */}
              <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🥗</span>
                  <span className="text-xs text-slate-400">营养均衡度</span>
                </div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={`text-base ${
                        star <= balanceRating ? 'text-amber-400' : 'text-slate-600'
                      }`}
                    >
                      {star <= balanceRating ? '★' : '☆'}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Footer hint ── */}
      <div className="flex-shrink-0 px-4 py-1.5 border-t border-slate-800/60">
        <p className="text-[9px] text-slate-600 text-center">
          {hasWeightData
            ? '数据每 5 秒自动刷新 · 取餐完成后请将托盘放置于结算区'
            : '请将餐盘放置于称重台开始记录'}
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  NutritionCell — 营养指标卡片
// ═══════════════════════════════════════════════
function NutritionCell({
  label,
  value,
  unit,
  color,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 flex flex-col justify-between border transition-colors ${
        highlight
          ? 'bg-orange-950/20 border-orange-800/30'
          : 'bg-slate-900/50 border-slate-800/30'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <i className={icon} style={{ fontSize: '11px', color }} />
        </div>
        <span className="text-[10px] text-slate-400">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-white">{value}</span>
        <span className="text-[10px] text-slate-500">{unit}</span>
      </div>
    </div>
  );
}