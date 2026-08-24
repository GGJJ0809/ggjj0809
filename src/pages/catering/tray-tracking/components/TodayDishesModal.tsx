import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { localDb } from '@/lib/localDb';
import type { Dish, DishCategory } from '@/pages/catering/dishes/hooks/useDishes';
import { todayBeijing, nowBeijing } from '@/lib/dateUtils';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

function getDb() {
  return isElectron() ? localDb : supabase;
}

export interface TodayDish {
  id: number;
  dish_name: string;
  category: string;
  meal_type: number; // 0=早餐 1=午餐 2=晚餐
  calories_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  img: string;
  menu_date: string;
}

const MEAL_LABELS: Record<number, string> = { 0: '早餐', 1: '午餐', 2: '晚餐' };
const MEAL_COLORS: Record<number, string> = {
  0: 'bg-amber-50 text-amber-700 border-amber-200',
  1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  2: 'bg-sky-50 text-sky-700 border-sky-200',
};

// 获取服务器今天（北京时间）
const getServerToday = todayBeijing;

interface Props {
  device: any;
  onClose: () => void;
}

export default function TodayDishesModal({ device, onClose }: Props) {
  const serverToday = getServerToday();
  const [menuDate, setMenuDate] = useState(serverToday);
  const [latestDataDate, setLatestDataDate] = useState<string | null>(null);
  const [userTouchedDate, setUserTouchedDate] = useState(false);
  const [todayDishes, setTodayDishes] = useState<TodayDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [productItems, setProductItems] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<DishCategory[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedMealType, setSelectedMealType] = useState<number>(1);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<{ id: number; type: 'success' | 'error'; msg: string }[]>([]);
  const [copyingToToday, setCopyingToToday] = useState(false);
  // ── 以下推送相关已移除，统一使用「同步到大屏」──
  // const [mqttAvailable] 等已移除

  const addToast = useCallback((type: 'success' | 'error', msg: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // 初始化时找最新有数据的日期
  const initMenuDate = useCallback(async () => {
    try {
      const db = getDb();
      const { data } = await db
        .from('dish_nutrition')
        .select('menu_date')
        .order('menu_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data?.menu_date) {
        setLatestDataDate(data.menu_date);
        // 如果今天没有数据，自动跳转到最近有数据的日期
        const { data: todayData } = await db
          .from('dish_nutrition')
          .select('id')
          .eq('menu_date', serverToday)
          .limit(1)
          .maybeSingle();
        
        if (!todayData && !userTouchedDate) {
          // 今天没有数据，自动定位到最新日期（仅在用户未手动改日期时）
          setMenuDate(data.menu_date);
        } else if (todayData && !userTouchedDate) {
          setMenuDate(serverToday);
        }
      } else {
        setMenuDate(serverToday);
      }
    } catch {
      setMenuDate(serverToday);
    }
  }, [serverToday, userTouchedDate]);

  useEffect(() => {
    initMenuDate();
  }, [initMenuDate]);

  // Load today's dish_nutrition
  const fetchTodayDishes = useCallback(async () => {
    if (!menuDate) return;
    setLoading(true);
    try {
      const db = getDb();
      const { data, error } = await db
        .from('dish_nutrition')
        .select('*')
        .eq('menu_date', menuDate)
        .order('meal_type')
        .order('id');
      if (error) throw error;
      setTodayDishes((data || []) as TodayDish[]);
    } catch (e: any) {
      addToast('error', e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [menuDate, addToast]);

  // Load product_items library
  const fetchProductItems = useCallback(async () => {
    try {
      const db = getDb();
      const [{ data: cats }, { data: items }, { data: fields }, { data: cvs }] = await Promise.all([
        db.from('product_categories').select('*').order('sort_order'),
        db.from('product_items').select('*, product_categories(id, name)').eq('status', 'active').order('id'),
        db.from('product_custom_fields').select('id, name').order('sort_order'),
        db.from('product_custom_values').select('product_id, field_id, value'),
      ]);
      setCategories((cats || []) as DishCategory[]);

      const fieldMap: Record<number, string> = {};
      (fields || []).forEach((f: any) => { fieldMap[f.id] = f.name; });

      const mapped = (items || []).map((item: any) => {
        const cv = (cvs || []).filter((v: any) => v.product_id === item.id);
        const vals: Record<string, string> = {};
        cv.forEach((v: any) => { const fn = fieldMap[v.field_id]; if (fn) vals[fn] = v.value; });
        const media = item.media as Array<{ url: string; type: string }> | null;
        return {
          id: item.id,
          name: item.name,
          category_id: item.category_id,
          category: (item.product_categories as { name: string } | null)?.name || '',
          status: item.status,
          price: Number(item.price) || 0,
          img: media?.[0]?.url || '',
          calories: Number(vals.calories) || 0,
          protein: Number(vals.protein) || 0,
          fat: Number(vals.fat) || 0,
          carbs: Number(vals.carbs) || 0,
          fiber: Number(vals.fiber) || 0,
          method: vals.method || '',
          nutrition: vals.nutrition || '',
          contraindications: vals.contraindications || '',
          station_name: '',
        } as Dish;
      });
      setProductItems(mapped);
    } catch (e: any) {
      console.warn('Failed to load product items:', e.message);
    }
  }, []);

  useEffect(() => {
    fetchTodayDishes();
    fetchProductItems();
  }, [fetchTodayDishes, fetchProductItems]);

  // Add a product_item to today's dish_nutrition
  const handleAddDish = useCallback(async (dish: Dish, mealType: number) => {
    setAddingId(dish.id);
    try {
      const already = todayDishes.find(
        (d) => d.dish_name === dish.name && d.meal_type === mealType && d.menu_date === menuDate
      );
      if (already) {
        addToast('error', `「${dish.name}」已在${MEAL_LABELS[mealType]}中了`);
        return;
      }
      const db = getDb();
      const row = {
        dish_name: dish.name,
        category: dish.category || '',
        calories_per_100g: dish.calories,
        protein_per_100g: dish.protein,
        fat_per_100g: dish.fat,
        carbs_per_100g: dish.carbs,
        unit: '100g',
        img: dish.img || '',
        menu_date: menuDate,
        meal_type: mealType,
        updated_at: nowBeijing(),
      };
      const { error } = await db.from('dish_nutrition').insert(row);
      if (error) throw error;
      addToast('success', `「${dish.name}」已加入${MEAL_LABELS[mealType]}`);
      await fetchTodayDishes();
    } catch (e: any) {
      addToast('error', e.message || '添加失败');
    } finally {
      setAddingId(null);
    }
  }, [todayDishes, menuDate, fetchTodayDishes, addToast]);

  // Remove from today's dish_nutrition
  const handleRemoveDish = useCallback(async (id: number, name: string) => {
    setDeletingId(id);
    try {
      const db = getDb();
      const { error } = await db.from('dish_nutrition').delete().eq('id', id);
      if (error) throw error;
      addToast('success', `「${name}」已从今日菜单移除`);
      await fetchTodayDishes();
    } catch (e: any) {
      addToast('error', e.message || '移除失败');
    } finally {
      setDeletingId(null);
    }
  }, [fetchTodayDishes, addToast]);

  // Copy dishes from current date to today
  const handleCopyToToday = useCallback(async () => {
    if (menuDate === serverToday) return;
    if (todayDishes.length === 0) {
      addToast('error', '当前日期没有菜品可复制');
      return;
    }
    setCopyingToToday(true);
    try {
      const db = getDb();
      // 先删除今天已有的菜品
      await db.from('dish_nutrition').delete().eq('menu_date', serverToday);
      // 逐条插入
      for (const d of todayDishes) {
        await db.from('dish_nutrition').insert({
          dish_name: d.dish_name,
          category: d.category || '',
          calories_per_100g: d.calories_per_100g,
          protein_per_100g: d.protein_per_100g,
          fat_per_100g: d.fat_per_100g,
          carbs_per_100g: d.carbs_per_100g,
          unit: '100g',
          img: d.img || '',
          menu_date: serverToday,
          meal_type: d.meal_type,
          updated_at: nowBeijing(),
        });
      }
      setMenuDate(serverToday);
      setLatestDataDate(serverToday);
      addToast('success', `已将 ${todayDishes.length} 道菜品复制到 ${serverToday}`);
    } catch (e: any) {
      addToast('error', e.message || '复制失败');
    } finally {
      setCopyingToToday(false);
    }
  }, [menuDate, serverToday, todayDishes, addToast]);

  // ── 推送功能已移除，所有设备同步统一走「同步到大屏」──

  const filteredProducts = productItems.filter((p) => {
    if (!searchKeyword.trim()) return true;
    return p.name.toLowerCase().includes(searchKeyword.toLowerCase());
  });

  const groupedDishes = [0, 1, 2].map((mt) => ({
    mealType: mt,
    label: MEAL_LABELS[mt],
    dishes: todayDishes.filter((d) => d.meal_type === mt),
  }));

  const isDateMismatch = menuDate !== serverToday;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm pointer-events-auto ${
              t.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-50 border border-red-100 text-red-600'
            }`}>
            <i className={t.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {t.msg}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              「{device.name}」今日菜品管理
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">周菜谱规划 → dish_nutrition → 设备自动拉取。在此手动增减今日菜单</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={menuDate}
              onChange={(e) => { setUserTouchedDate(true); setMenuDate(e.target.value); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-400"
            />
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <i className="ri-close-line text-xl" />
            </button>
          </div>
        </div>

        {/* Date mismatch warning */}
        {isDateMismatch && (
          <div className="mx-6 mt-3 flex-shrink-0">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <i className="ri-error-warning-line text-amber-500 text-base mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">
                  日期不是今天（服务器今天：{serverToday}）
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  当前查看的是 <strong>{menuDate}</strong> 的菜单。设备可能因 RTC 时钟问题显示历史日期——设备只匹配和自身系统日期相同的菜单，日期不符会显示"无效菜品"。
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  建议：将这 {todayDishes.length} 道菜品复制到今天（{serverToday}），或直接在秤上校正系统时间。
                </p>
              </div>
              {todayDishes.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyToToday}
                  disabled={copyingToToday}
                  className="flex-shrink-0 flex items-center gap-1 text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {copyingToToday ? (
                    <><i className="ri-loader-4-line animate-spin" />复制中...</>
                  ) : (
                    <><i className="ri-file-copy-line" />复制到今天</>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Also show hint when today has no data */}
        {!isDateMismatch && latestDataDate && latestDataDate !== serverToday && todayDishes.length === 0 && !loading && (
          <div className="mx-6 mt-3 flex-shrink-0">
            <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <i className="ri-information-line text-sky-500 flex-shrink-0" />
              <p className="text-xs text-sky-700 flex-1">
                今天 ({serverToday}) 还没有菜品数据。最近有数据的日期是 <strong>{latestDataDate}</strong>。
              </p>
              <button
                type="button"
                onClick={() => setMenuDate(latestDataDate)}
                className="flex-shrink-0 text-xs bg-sky-500 text-white px-3 py-1.5 rounded-lg hover:bg-sky-600 cursor-pointer whitespace-nowrap"
              >
                查看 {latestDataDate}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Today's menu by meal */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              groupedDishes.map(({ mealType, label, dishes }) => (
                <div key={mealType}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${MEAL_COLORS[mealType]}`}>
                      {label}
                    </span>
                    <span className="text-xs text-slate-400">{dishes.length} 道菜</span>
                    <button
                      type="button"
                      onClick={() => { setSelectedMealType(mealType); setShowAddPanel(true); }}
                      className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-add-line" />从菜品库添加
                    </button>
                  </div>
                  {dishes.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
                      还没有{label}菜品，点击「从菜品库添加」
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dishes.map((dish) => (
                        <div key={dish.id} className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                          {dish.img ? (
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                              <img src={dish.img} alt={dish.dish_name} className="w-full h-full object-cover object-top" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                              <i className="ri-restaurant-line text-slate-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{dish.dish_name}</p>
                            <p className="text-xs text-slate-400">
                              {dish.category && <span className="mr-2">{dish.category}</span>}
                              {dish.calories_per_100g > 0 && <span className="text-amber-600">{dish.calories_per_100g}kcal</span>}
                              {dish.protein_per_100g > 0 && <span className="ml-2 text-emerald-600">蛋白{dish.protein_per_100g}g</span>}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveDish(dish.id, dish.dish_name)}
                            disabled={deletingId === dish.id}
                            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 cursor-pointer transition-all disabled:opacity-50"
                          >
                            {deletingId === dish.id ? (
                              <i className="ri-loader-4-line animate-spin text-sm" />
                            ) : (
                              <i className="ri-delete-bin-line text-sm" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Right: Add from product library */}
          {showAddPanel && (
            <div className="w-72 border-l border-slate-100 flex flex-col overflow-hidden bg-slate-50">
              <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-xs text-slate-500">添加到</span>
                  <select
                    value={selectedMealType}
                    onChange={(e) => setSelectedMealType(Number(e.target.value))}
                    className="text-xs border border-slate-200 rounded-md px-2 py-1 focus:outline-none bg-white"
                  >
                    {[0, 1, 2].map((mt) => (
                      <option key={mt} value={mt}>{MEAL_LABELS[mt]}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddPanel(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="px-3 py-2 flex-shrink-0">
                <div className="relative">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="搜索菜品..."
                    className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">
                    {searchKeyword ? '无匹配菜品' : '菜品库为空'}
                  </p>
                ) : filteredProducts.map((dish) => {
                  const isAdded = todayDishes.some(
                    (d) => d.dish_name === dish.name && d.meal_type === selectedMealType && d.menu_date === menuDate
                  );
                  return (
                    <div key={dish.id} className={`flex items-center gap-2 bg-white rounded-lg border px-2.5 py-2 transition-all ${isAdded ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 hover:border-slate-200'}`}>
                      {dish.img ? (
                        <div className="w-8 h-8 rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
                          <img src={dish.img} alt={dish.name} className="w-full h-full object-cover object-top" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 flex items-center justify-center rounded-md bg-slate-100 flex-shrink-0">
                          <i className="ri-restaurant-line text-slate-400 text-xs" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{dish.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {dish.category && <span>{dish.category}</span>}
                          {dish.calories > 0 && <span className="ml-1">{dish.calories}kcal</span>}
                        </p>
                      </div>
                      {isAdded ? (
                        <span className="text-xs text-emerald-600 flex-shrink-0">
                          <i className="ri-check-line" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddDish(dish, selectedMealType)}
                          disabled={addingId === dish.id}
                          className="w-6 h-6 flex items-center justify-center text-white bg-emerald-500 rounded-md hover:bg-emerald-600 cursor-pointer transition-all disabled:opacity-50 flex-shrink-0"
                        >
                          {addingId === dish.id ? (
                            <i className="ri-loader-4-line animate-spin text-xs" />
                          ) : (
                            <i className="ri-add-line text-xs" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50 text-xs text-slate-500">
          <span>
            {menuDate} 共 <span className="font-medium text-slate-700">{todayDishes.length}</span> 道菜品
            （早餐 {todayDishes.filter(d => d.meal_type === 0).length} · 午餐 {todayDishes.filter(d => d.meal_type === 1).length} · 晚餐 {todayDishes.filter(d => d.meal_type === 2).length}）
          </span>
          <span className="text-slate-400">设备「切换菜品」将显示此列表</span>
        </div>
      </div>
    </div>
  );
}