import { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';
import { localDb } from '@/lib/localDb';
import { nowBeijing } from '@/lib/dateUtils';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}
function getDb() {
  return isElectron() ? localDb : supabase;
}

// ---- Types ----
interface DishItem {
  id: number;
  name: string;
  category: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  img: string;
}

interface NutritionRow {
  id: number;
  dish_name: string;
  category: string;
  calories_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  img: string;
  menu_date: string;
  meal_type: number; // 0=早餐 1=午餐 2=晚餐
}

interface CellData {
  dateStr: string;
  mealType: number;
  dishes: NutritionRow[];
}

const MEAL_LABELS: Record<number, string> = { 0: '早餐', 1: '午餐', 2: '晚餐' };
const MEAL_COLORS: Record<number, string> = {
  0: 'bg-amber-50 text-amber-700 border-amber-200',
  1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  2: 'bg-sky-50 text-sky-700 border-sky-200',
};
const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ---- Helpers ----
function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDates(mondayStr: string): string[] {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(y, m - 1, d + i);
    dates.push(fmtLocalDate(date));
  }
  return dates;
}

function getTodayLocal(): string {
  return fmtLocalDate(new Date());
}

function getThisMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday);
  return fmtLocalDate(monday);
}

function getNextMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const daysUntilMonday = day === 0 ? 1 : (8 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  return fmtLocalDate(monday);
}

// ---- Component ----
export default function WeeklyMenuPage() {
  // Week selection
  const [mondayDate, setMondayDate] = useState(() => getThisMonday());
  const weekDates = useMemo(() => getWeekDates(mondayDate), [mondayDate]);

  // Master data: product_items library
  const [productItems, setProductItems] = useState<DishItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);

  // Week nutrition data
  const [cells, setCells] = useState<Map<string, NutritionRow[]>>(new Map());
  const [loading, setLoading] = useState(true);

  // Dish picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState('');
  const [pickerMealType, setPickerMealType] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Copy from last week
  const [copying, setCopying] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load product_items library
  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const db = getDb();
      const [{ data: items }, { data: fields }, { data: cvs }] = await Promise.all([
        db.from('product_items').select('*, product_categories(id, name)').eq('status', 'active').order('id'),
        db.from('product_custom_fields').select('id, name').order('sort_order'),
        db.from('product_custom_values').select('product_id, field_id, value'),
      ]);

      const fieldMap: Record<number, string> = {};
      (fields || []).forEach((f: any) => { fieldMap[f.id] = f.name; });

      const mapped: DishItem[] = (items || []).map((item: any) => {
        const cv = (cvs || []).filter((v: any) => v.product_id === item.id);
        const vals: Record<string, string> = {};
        cv.forEach((v: any) => { const fn = fieldMap[v.field_id]; if (fn) vals[fn] = v.value; });
        const media = item.media as Array<{ url: string; type: string }> | null;
        return {
          id: item.id,
          name: item.name,
          category: (item.product_categories as { name: string } | null)?.name || '',
          calories: Number(vals.calories) || 0,
          protein: Number(vals.protein) || 0,
          fat: Number(vals.fat) || 0,
          carbs: Number(vals.carbs) || 0,
          img: media?.[0]?.url || '',
        };
      });
      setProductItems(mapped);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  // Load nutrition data for the selected week
  const loadWeekData = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDb();
      const startDate = weekDates[0];
      const endDate = weekDates[6];

      const { data, error } = await db
        .from('dish_nutrition')
        .select('*')
        .gte('menu_date', startDate)
        .lte('menu_date', endDate)
        .order('meal_type')
        .order('id');

      if (error) throw error;

      const map = new Map<string, NutritionRow[]>();
      weekDates.forEach((d) => {
        [0, 1, 2].forEach((mt) => {
          map.set(`${d}_${mt}`, []);
        });
      });

      (data || []).forEach((row: any) => {
        const key = `${row.menu_date}_${row.meal_type}`;
        if (map.has(key)) {
          map.get(key)!.push(row as NutritionRow);
        }
      });

      setCells(map);
    } catch (e: any) {
      showToast('error', `加载失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDates.join(','), showToast]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    loadWeekData();
  }, [loadWeekData]);

  // Get cell dishes
  const getCellDishes = (dateStr: string, mealType: number): NutritionRow[] => {
    return cells.get(`${dateStr}_${mealType}`) || [];
  };

  // Open picker
  const openPicker = (dateStr: string, mealType: number) => {
    setPickerDate(dateStr);
    setPickerMealType(mealType);
    setSearchKeyword('');
    setPickerOpen(true);
  };

  // Add dish to a cell
  const handleAddDish = async (dish: DishItem) => {
    const key = `${pickerDate}_${pickerMealType}`;
    const current = cells.get(key) || [];
    if (current.some((d) => d.dish_name === dish.name)) {
      showToast('error', `「${dish.name}」已在此餐段中`);
      return;
    }

    setAddingIds((prev) => new Set(prev).add(dish.id));
    try {
      const db = getDb();
      const row = {
        dish_name: dish.name,
        category: dish.category,
        calories_per_100g: dish.calories,
        protein_per_100g: dish.protein,
        fat_per_100g: dish.fat,
        carbs_per_100g: dish.carbs,
        unit: '100g',
        img: dish.img,
        menu_date: pickerDate,
        meal_type: pickerMealType,
        updated_at: nowBeijing(),
      };
      const { data, error } = await db.from('dish_nutrition').insert(row).select('id').maybeSingle();
      if (error) throw error;

      // Update local state
      const newDish: NutritionRow = {
        id: (data as any)?.id || Date.now(),
        ...row,
      };
      setCells((prev) => {
        const next = new Map(prev);
        const arr = [...(next.get(key) || []), newDish];
        arr.sort((a, b) => a.id - b.id);
        next.set(key, arr);
        return next;
      });

      showToast('success', `已添加「${dish.name}」`);
    } catch (e: any) {
      showToast('error', `添加失败: ${e.message}`);
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(dish.id);
        return next;
      });
    }
  };

  // Remove dish from a cell
  const handleRemoveDish = async (dateStr: string, mealType: number, row: NutritionRow) => {
    setDeletingIds((prev) => new Set(prev).add(row.id));
    try {
      const db = getDb();
      const { error } = await db.from('dish_nutrition').delete().eq('id', row.id);
      if (error) throw error;

      const key = `${dateStr}_${mealType}`;
      setCells((prev) => {
        const next = new Map(prev);
        const arr = (next.get(key) || []).filter((d) => d.id !== row.id);
        next.set(key, arr);
        return next;
      });

      showToast('success', `已移除「${row.dish_name}」`);
    } catch (e: any) {
      showToast('error', `移除失败: ${e.message}`);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  // Copy from previous week
  const handleCopyFromPrevWeek = async () => {
    setCopying(true);
    try {
      const db = getDb();
      // Get previous week dates
      const [py, pm, pd] = mondayDate.split('-').map(Number);
      const prevMondayDate = new Date(py, pm - 1, pd - 7);
      const prevDates = getWeekDates(fmtLocalDate(prevMondayDate));

      const { data, error } = await db
        .from('dish_nutrition')
        .select('*')
        .gte('menu_date', prevDates[0])
        .lte('menu_date', prevDates[6])
        .order('meal_type')
        .order('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        showToast('error', '上周没有菜品数据可复制');
        return;
      }

      // Delete current week's data
      const { error: delErr } = await db
        .from('dish_nutrition')
        .delete()
        .gte('menu_date', weekDates[0])
        .lte('menu_date', weekDates[6]);

      if (delErr) {
        showToast('error', `清空本周数据失败: ${delErr.message}`);
        return;
      }

      // Map prev dates to current dates
      const dateMap: Record<string, string> = {};
      prevDates.forEach((d, i) => { dateMap[d] = weekDates[i]; });

      // Insert copied rows
      const newRows: NutritionRow[] = [];
      for (const row of data) {
        const newDate = dateMap[row.menu_date];
        if (!newDate) continue;
        const newRow = {
          dish_name: row.dish_name,
          category: row.category || '',
          calories_per_100g: row.calories_per_100g,
          protein_per_100g: row.protein_per_100g,
          fat_per_100g: row.fat_per_100g,
          carbs_per_100g: row.carbs_per_100g,
          unit: row.unit || '100g',
          img: row.img || '',
          menu_date: newDate,
          meal_type: row.meal_type,
          updated_at: nowBeijing(),
        };
        const { data: ins, error: insErr } = await db.from('dish_nutrition').insert(newRow).select('id').maybeSingle();
        if (insErr) {
          console.warn('Insert failed:', insErr.message);
          continue;
        }
        newRows.push({ id: (ins as any)?.id || Date.now(), ...newRow });
      }

      // Rebuild cells map
      const map = new Map<string, NutritionRow[]>();
      weekDates.forEach((d) => {
        [0, 1, 2].forEach((mt) => { map.set(`${d}_${mt}`, []); });
      });
      newRows.forEach((r) => {
        const key = `${r.menu_date}_${r.meal_type}`;
        if (map.has(key)) map.get(key)!.push(r);
      });

      setCells(map);
      showToast('success', `已复制上周 ${newRows.length} 道菜品`);
    } catch (e: any) {
      showToast('error', `复制失败: ${e.message}`);
    } finally {
      setCopying(false);
    }
  };

  // Filter products for picker
  const filteredProducts = useMemo(() => {
    if (!searchKeyword.trim()) return productItems;
    const kw = searchKeyword.toLowerCase();
    return productItems.filter((p) => p.name.toLowerCase().includes(kw));
  }, [productItems, searchKeyword]);

  // Count total dishes in the week
  const totalDishes = useMemo(() => {
    let count = 0;
    cells.forEach((dishes) => { count += dishes.length; });
    return count;
  }, [cells]);

  // Which days have data
  const dayStats = useMemo(() => {
    return weekDates.map((dateStr) => {
      let count = 0;
      [0, 1, 2].forEach((mt) => {
        count += (cells.get(`${dateStr}_${mt}`) || []).length;
      });
      return { dateStr, count };
    });
  }, [weekDates, cells]);

  const todayStr = getTodayLocal();

  return (
    <AppLayout title="周菜单配置" breadcrumb={['餐饮管理', '周菜单配置']}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm pointer-events-none transition-all"
          style={{ background: toast.type === 'success' ? '#ecfdf5' : '#fef2f2', border: `1px solid ${toast.type === 'success' ? '#a7f3d0' : '#fecaca'}`, color: toast.type === 'success' ? '#065f46' : '#dc2626' }}>
          <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-slate-600 font-medium whitespace-nowrap">选择周：</span>
          <input
            type="date"
            value={mondayDate}
            onChange={(e) => setMondayDate(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-400 cursor-pointer"
          />
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {mondayDate} ~ {weekDates[6]}（{totalDishes} 道菜）
          </span>

          <div className="flex-1" />

          {/* Quick nav: this week / next week */}
          <button
            type="button"
            onClick={() => setMondayDate(getThisMonday())}
            className="text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            本周
          </button>
          <button
            type="button"
            onClick={() => setMondayDate(getNextMonday())}
            className="text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            下周
          </button>

          <button
            type="button"
            onClick={handleCopyFromPrevWeek}
            disabled={copying}
            className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            {copying ? <><i className="ri-loader-4-line animate-spin" />复制中...</> : <><i className="ri-file-copy-line" />复制上周</>}
          </button>
        </div>
      </div>

      {/* Week Grid */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <i className="ri-loader-4-line animate-spin text-xl mr-2" />加载中...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 w-20 border-b border-slate-100">
                    餐段
                  </th>
                  {weekDates.map((d, i) => {
                    const isToday = d === todayStr;
                    return (
                      <th key={d} className={`text-center text-xs font-medium px-3 py-3 border-b border-slate-100 ${isToday ? 'bg-emerald-50/50' : ''}`}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-slate-600 font-semibold">{DAY_LABELS[i]}</span>
                          <span className={`text-xs ${isToday ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                            {d.slice(5)}
                            {isToday && <span className="ml-1 text-[10px] bg-emerald-200 text-emerald-700 px-1 py-0.5 rounded">今天</span>}
                          </span>
                          <span className="text-[10px] text-slate-400">{dayStats[i]?.count || 0}道</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((mealType) => (
                  <tr key={mealType} className="border-b border-slate-50">
                    <td className="px-4 py-2 border-r border-slate-50">
                      <span className={`text-xs px-2 py-1 rounded-full border font-medium whitespace-nowrap ${MEAL_COLORS[mealType]}`}>
                        {MEAL_LABELS[mealType]}
                      </span>
                    </td>
                    {weekDates.map((dateStr) => {
                      const dishes = getCellDishes(dateStr, mealType);
                      const isToday = dateStr === todayStr;
                      return (
                        <td key={`${dateStr}_${mealType}`} className={`px-2 py-2 align-top ${isToday ? 'bg-emerald-50/30' : ''}`}>
                          <div
                            onClick={() => openPicker(dateStr, mealType)}
                            className={`min-h-[80px] rounded-lg border-2 border-dashed p-2 cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 ${
                              dishes.length > 0 ? 'border-slate-200 bg-slate-50/50' : 'border-slate-100'
                            }`}
                          >
                            {dishes.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-full text-slate-300 py-4">
                                <i className="ri-add-circle-line text-xl" />
                                <span className="text-xs mt-1">点击添加</span>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {dishes.map((dish) => (
                                  <div key={dish.id} className="flex items-center gap-1.5 bg-white rounded-md px-2 py-1 border border-slate-100 group hover:border-red-200 transition-colors">
                                    {dish.img ? (
                                      <div className="w-6 h-6 rounded overflow-hidden bg-slate-100 flex-shrink-0">
                                        <img src={dish.img} alt={dish.dish_name} className="w-full h-full object-cover object-top" />
                                      </div>
                                    ) : (
                                      <div className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 flex-shrink-0">
                                        <i className="ri-restaurant-line text-slate-400 text-[10px]" />
                                      </div>
                                    )}
                                    <span className="text-xs text-slate-700 truncate flex-1">{dish.dish_name}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveDish(dateStr, mealType, dish); }}
                                      disabled={deletingIds.has(dish.id)}
                                      className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer rounded flex-shrink-0"
                                    >
                                      {deletingIds.has(dish.id) ? (
                                        <i className="ri-loader-4-line animate-spin text-[10px]" />
                                      ) : (
                                        <i className="ri-close-line text-xs" />
                                      )}
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openPicker(dateStr, mealType); }}
                                  className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-1 cursor-pointer"
                                >
                                  <i className="ri-add-line" /> 继续添加
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          共 {totalDishes} 道菜品，覆盖 {dayStats.filter((d) => d.count > 0).length} 天
        </span>
      </div>

      {/* Dish Picker Modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  添加菜品到 {pickerDate} · {MEAL_LABELS[pickerMealType]}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  当前已添加 {getCellDishes(pickerDate, pickerMealType).length} 道
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer rounded-lg hover:bg-slate-100"
              >
                <i className="ri-close-line text-lg" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 flex-shrink-0">
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="搜索菜品..."
                  className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-slate-400"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
              {libraryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <i className="ri-loader-4-line animate-spin text-slate-400" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-12">
                  {searchKeyword ? '无匹配菜品' : '菜品库为空，请先在"菜品信息管理"中添加菜品'}
                </p>
              ) : (
                filteredProducts.map((dish) => {
                  const cellDishes = getCellDishes(pickerDate, pickerMealType);
                  const isAdded = cellDishes.some((d) => d.dish_name === dish.name);
                  const isAdding = addingIds.has(dish.id);
                  return (
                    <div key={dish.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${isAdded ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                      {dish.img ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                          <img src={dish.img} alt={dish.name} className="w-full h-full object-cover object-top" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                          <i className="ri-restaurant-line text-slate-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{dish.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {dish.category && <span>{dish.category}</span>}
                          {dish.calories > 0 && <span className="ml-2 text-amber-600">{dish.calories}kcal</span>}
                        </p>
                      </div>
                      {isAdded ? (
                        <span className="text-xs text-emerald-600 flex-shrink-0 px-2 py-1 rounded-full bg-emerald-50">
                          <i className="ri-check-line mr-0.5" />已添加
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddDish(dish)}
                          disabled={isAdding}
                          className="flex items-center gap-1 text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap disabled:opacity-50 transition-colors"
                        >
                          {isAdding ? (
                            <><i className="ri-loader-4-line animate-spin" />添加中</>
                          ) : (
                            <><i className="ri-add-line" />添加</>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}