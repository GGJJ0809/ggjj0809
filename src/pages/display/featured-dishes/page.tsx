import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';
import { useDisplayConfig } from '@/hooks/useDisplayConfig';
import { updateFeaturedDishes } from '@/lib/displayStore';
import type { FeaturedDish } from '@/lib/displayStore';

interface DishItem {
  id: number;
  name: string;
  category: string;
  calories: number;
}

export default function FeaturedDishesPage() {
  const [allDishes, setAllDishes] = useState<DishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [search, setSearch] = useState('');

  const { config, reload } = useDisplayConfig(false, 'default');

  // Load all dishes from product_items
  const loadDishes = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, cvsRes] = await Promise.all([
        supabase.from('product_items').select('id, name, category_id, media, product_categories(id, name)').eq('status', 'active').order('id'),
        supabase.from('product_custom_values').select('product_id, value').eq('field_id', 1),
      ]);

      const items = (itemsRes.data || []) as any[];
      const cvs = (cvsRes.data || []) as any[];

      const caloriesMap = new Map<number, number>();
      cvs.forEach((cv: any) => {
        caloriesMap.set(cv.product_id, Number(cv.value) || 0);
      });

      const dishes: DishItem[] = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        category: item.product_categories?.name || '其他',
        calories: caloriesMap.get(item.id) || 0,
      }));

      setAllDishes(dishes);
    } catch (e) {
      console.error('[FeaturedDishes] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load dishes on mount
  useEffect(() => {
    loadDishes();
  }, [loadDishes]);

  // Sync selected ID from config when it loads
  useEffect(() => {
    if (config?.settings?.featuredDishes && config.settings.featuredDishes.length > 0) {
      setSelectedId(config.settings.featuredDishes[0].id);
    }
  }, [config?.settings?.featuredDishes]);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  // Select a dish as featured (single selection, replaces previous)
  const selectDish = async (dish: DishItem) => {
    // If clicking the already-selected dish, deselect it
    const nextId = selectedId === dish.id ? null : dish.id;

    setSelectedId(nextId);
    setSaving(true);

    const prevId = selectedId;

    try {
      if (nextId === null) {
        // Deselect: save empty array
        await updateFeaturedDishes([], 'default');
        await reload(true);
      } else {
        const featuredDishes: FeaturedDish[] = [{
          id: dish.id,
          name: dish.name,
          calories: dish.calories,
          category: dish.category,
        }];
        await updateFeaturedDishes(featuredDishes, 'default');
        await reload(true);
      }
      showToast('success', nextId ? `已设置「${dish.name}」为本餐特色` : '已取消本餐特色');
    } catch (e) {
      showToast('error', '保存失败，请重试');
      setSelectedId(prevId); // rollback
    } finally {
      setSaving(false);
    }
  };

  const filtered = allDishes.filter((d) =>
    !search || d.name.includes(search) || d.category.includes(search),
  );

  return (
    <AppLayout title="本餐特色设置" breadcrumb={['大屏展示', '本餐特色设置']}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] pointer-events-none">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm transition-all ${
            toast.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-50 border border-red-100 text-red-600'
          }`}>
            <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {toast.msg}
          </div>
        </div>
      )}

      {/* Header info */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-rose-50 flex-shrink-0">
            <i className="ri-star-fill text-rose-500 text-lg" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">本餐特色菜品</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              从菜品库中选择当日特色菜品，每天仅可选择 <strong>1</strong> 道。所选菜品将在「智慧食堂监控大屏」的「本餐特色」区域展示。
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-slate-400">
              已选 <strong className="text-rose-500">{selectedId ? 1 : 0}</strong> / 1 道
            </span>
            {saving && (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <i className="ri-loader-4-line animate-spin" />保存中
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-100 p-3 mb-4">
        <div className="relative max-w-[320px]">
          <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            placeholder="搜索菜品名称或分类..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
          />
        </div>
      </div>

      {/* Dish grid */}
      <div className="bg-white rounded-xl border border-slate-100 p-5">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <i className="ri-loader-4-line animate-spin text-xl mr-2" />加载菜品中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="ri-inbox-2-line text-3xl mb-2" />
            <p className="text-sm">暂无菜品数据</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map((dish) => {
              const isSelected = selectedId === dish.id;
              return (
                <button
                  key={dish.id}
                  type="button"
                  onClick={() => selectDish(dish)}
                  disabled={saving}
                  className={`relative flex flex-col rounded-xl overflow-hidden border-2 transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'border-rose-400 bg-rose-50/50 shadow-sm'
                      : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-rose-500 text-white">
                      <i className="ri-check-line text-sm" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-2.5 flex-1 flex flex-col">
                    <p className="text-xs font-semibold text-slate-800 truncate">{dish.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                        {dish.category}
                      </span>
                      {dish.calories > 0 && (
                        <span className="text-[10px] text-slate-400">{dish.calories}kcal</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}