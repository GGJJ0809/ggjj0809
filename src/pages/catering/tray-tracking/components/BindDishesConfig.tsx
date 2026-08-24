import { useState, useEffect, useCallback } from 'react';

interface ProductCategory {
  id: number;
  name: string;
}

interface ProductItem {
  id: number;
  name: string;
  category_id: number | null;
}

interface BindDishesConfigProps {
  deviceId: number;
  initialBindMode?: string;
  initialBindValue?: string;
  dishes: ProductItem[];
  categories: ProductCategory[];
  onSave: (bindMode: string, bindValue: string) => Promise<void>;
}

export default function BindDishesConfig({
  deviceId,
  initialBindMode = 'station',
  initialBindValue = '',
  dishes,
  categories,
  onSave,
}: BindDishesConfigProps) {
  const [bindMode, setBindMode] = useState(initialBindMode);
  const [bindValue, setBindValue] = useState(initialBindValue);
  const [filteredDishes, setFilteredDishes] = useState<ProductItem[]>(dishes);
  const [dishSearch, setDishSearch] = useState('');
  const [selectedDishes, setSelectedDishes] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; type: 'success' | 'error'; msg: string }[]>([]);

  const addToast = useCallback((type: 'success' | 'error', msg: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // Initialize from props
  useEffect(() => {
    // 归一化旧模式（all/category/dishes）到新双模式（station/single）
    const normalizedMode = (initialBindMode === 'all' || initialBindMode === 'category' || initialBindMode === 'dishes')
      ? 'station'
      : (initialBindMode || 'station');
    setBindMode(normalizedMode);
    setBindValue(initialBindValue);
    if (initialBindMode === 'dishes' && initialBindValue) {
      const ids = initialBindValue.split(',').map((s) => Number(s.trim())).filter(Boolean);
      setSelectedDishes(ids);
    } else {
      setSelectedDishes([]);
    }
  }, [initialBindMode, initialBindValue]);

  // Filter dishes by search
  useEffect(() => {
    if (!dishSearch.trim()) {
      setFilteredDishes(dishes);
      return;
    }
    const q = dishSearch.toLowerCase();
    setFilteredDishes(dishes.filter((d) => d.name.toLowerCase().includes(q)));
  }, [dishSearch, dishes]);

  const handleToggleDish = (id: number) => {
    setSelectedDishes((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    let value = '';
    if (bindMode === 'category') {
      value = bindValue;
    } else if (bindMode === 'dishes') {
      value = selectedDishes.join(',');
    }
    setSaving(true);
    try {
      await onSave(bindMode, value);
      addToast('success', '绑定设置已保存');
    } catch (err: any) {
      addToast('error', err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = selectedDishes.length;
  const dishCategoryName = (catId: number | null) => {
    const cat = categories.find((c) => c.id === catId);
    return cat ? cat.name : '未分类';
  };

  return (
    <div className="relative">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm pointer-events-auto transition-all ${
              t.type === 'success'
                ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                : 'bg-red-50 border border-red-100 text-red-600'
            }`}
          >
            <i className={t.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} />
            {t.msg}
          </div>
        ))}
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
        <div className="flex items-center gap-2 mb-4">
          <i className="ri-link text-slate-500 text-sm" />
          <h4 className="text-sm font-semibold text-slate-800">菜品绑定设置</h4>
          <span className="text-xs text-slate-400">1 设备 = 1 托盘 = 1 道菜，单选模式</span>
        </div>

        {/* Bind Mode Selector — only station and single */}
        <div className="flex items-center gap-2 mb-4 bg-white rounded-lg border border-slate-200 p-1">
          {[
            { value: 'station', label: '跟随托盘绑定', icon: 'ri-git-branch-line', hint: '自动显示托盘上绑定的那道菜' },
            { value: 'single', label: '手动指定菜品', icon: 'ri-restaurant-line', hint: '手动选择一道菜品固定显示' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setBindMode(opt.value);
                setBindValue('');
                setSelectedDishes([]);
              }}
              className={`flex-1 flex items-center gap-1.5 text-xs px-3 py-2 rounded-md cursor-pointer whitespace-nowrap transition-all ${
                bindMode === opt.value
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <i className={opt.icon} />
              <div className="text-left">
                <div className="font-medium">{opt.label}</div>
                <div className={`text-[10px] ${bindMode === opt.value ? 'text-slate-300' : 'text-slate-400'}`}>{opt.hint}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Station mode hint */}
        {bindMode === 'station' && (
          <div className="flex items-start gap-2 text-xs text-slate-500 bg-white rounded-lg border border-slate-200 p-3">
            <i className="ri-information-line text-slate-400 mt-0.5" />
            <div>
              <p className="font-medium text-slate-700">跟随托盘菜品绑定</p>
              <p className="mt-0.5">设备会自动显示其绑定托盘上当前关联的菜品。当托盘菜品变更时，设备显示也会自动更新。</p>
            </div>
          </div>
        )}

        {/* Single Mode — pick ONE dish */}
        {bindMode === 'single' && (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
              <input
                type="text"
                value={dishSearch}
                onChange={(e) => setDishSearch(e.target.value)}
                placeholder="搜索菜品名称..."
                className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>

            {/* Selected dish */}
            {bindValue && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                <i className="ri-check-line" />
                已绑定：{dishes.find((d) => String(d.id) === bindValue)?.name || '—'}
                <button
                  type="button"
                  onClick={() => setBindValue('')}
                  className="ml-auto text-xs text-slate-400 hover:text-red-500 cursor-pointer whitespace-nowrap"
                >
                  取消绑定
                </button>
              </div>
            )}

            {!bindValue && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <i className="ri-error-warning-line" />
                请选择一道菜品（只能选一个）
              </p>
            )}

            {/* Dish list — single select */}
            {filteredDishes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">{dishSearch ? '未找到匹配菜品' : '暂无菜品'}</p>
            ) : (
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                  {filteredDishes.map((dish) => {
                    const isSelected = String(dish.id) === bindValue;
                    return (
                      <button
                        key={dish.id}
                        type="button"
                        onClick={() => setBindValue(isSelected ? '' : String(dish.id))}
                        className={`flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg border cursor-pointer transition-all text-left ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                        }`}
                      >
                        <div className={`w-5 h-5 flex items-center justify-center rounded-full border-2 flex-shrink-0 ${
                          isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                        }`}>
                          {isSelected && <i className="ri-check-line text-white text-xs" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate block">{dish.name}</span>
                          <span className="text-xs text-slate-400">{dishCategoryName(dish.category_id)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (bindMode === 'single' && !bindValue)}
            className="flex items-center gap-1.5 text-xs bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-50"
            title={bindMode === 'single' && !bindValue ? '请先选择一道菜品' : ''}
          >
            {saving ? (
              <>
                <i className="ri-loader-4-line animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <i className="ri-save-line" />
                保存绑定设置
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}