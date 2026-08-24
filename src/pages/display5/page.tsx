import { useEffect, useState, useCallback } from 'react';
import { todayBeijing } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';
import { loadDisplayConfig } from '@/lib/displayStore';
import StaffPanel from './components/StaffPanel';
import DishCard5 from './components/DishCard5';

interface StaffMember {
  name: string;
  title: string;
  photoUrl: string;
}

interface RatingCounts {
  good: number;
  average: number;
  bad: number;
}

interface Dish {
  id: number;
  name: string;
  category: string;
  img: string;
  calories: number;
  ratings: RatingCounts;
}

// ─── 浏览器模式 & LAN API 工具 ────────────────────────────────────────────

function isBrowserMode() {
  return typeof window !== 'undefined' && !(window as any).electronAPI;
}

function getApiBase() {
  try {
    const stored = localStorage.getItem('lan_server_base');
    if (stored) return stored.replace(/\/+$/, '');
  } catch { /* ignore */ }
  // 仅在本地/局域网地址时使用默认端口，线上预览环境无可用 LAN 服务器
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^192\.168\./.test(hostname) || /^10\./.test(hostname)) {
    return `${window.location.protocol}//${hostname}:8081`;
  }
  return '';
}

async function lanGet(path: string) {
  const base = getApiBase();
  if (!base) throw new Error('LAN server not available in this environment');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(base + path, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`LAN API ${path} 返回 ${res.status}`);
    const json = await res.json();
    return json.data;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function lanPost(path: string, body: Record<string, unknown>) {
  const base = getApiBase();
  if (!base) throw new Error('LAN server not available in this environment');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`LAN API ${path} 返回 ${res.status}`);
    return res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ─── 图片兜底 ─────────────────────────────────────────────────────────────

const FALLBACK_IMAGE_MAP: Record<string, string> = {
  红烧肉: 'https://readdy.ai/api/search-image?query=braised%20pork%20belly%20chinese%20style%20red%20braised%20meat%20beautiful%20plating%20food%20photography%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot&width=400&height=300&seq=d5-hongshaorou&orientation=landscape',
  清炒时蔬: 'https://readdy.ai/api/search-image?query=stir%20fried%20broccoli%20chinese%20style%20green%20vegetable%20dish%20garlic%20beautiful%20plating%20food%20photography%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot&width=400&height=300&seq=d5-shishu&orientation=landscape',
  鱼香肉丝: 'https://readdy.ai/api/search-image?query=yu%20xiang%20rou%20si%20spicy%20pork%20shreds%20chinese%20sichuan%20style%20food%20dish%20beautiful%20plating%20food%20photography%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot&width=400&height=300&seq=d5-yuxiang&orientation=landscape',
  宫保鸡丁: 'https://readdy.ai/api/search-image?query=kung%20pao%20chicken%20chinese%20spicy%20dish%20peanuts%20peppers%20beautiful%20plating%20food%20photography%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot&width=400&height=300&seq=d5-gongbao&orientation=landscape',
  麻婆豆腐: 'https://readdy.ai/api/search-image?query=mapo%20tofu%20chinese%20sichuan%20style%20spicy%20dish%20with%20minced%20pork%20chili%20oil%20beautiful%20food%20photography%20white%20ceramic%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=d5-mapo&orientation=landscape',
  蛋炒饭: 'https://readdy.ai/api/search-image?query=egg%20fried%20rice%20chinese%20style%20golden%20color%20scattered%20eggs%20green%20onions%20beautiful%20food%20photography%20white%20ceramic%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=d5-chaofan&orientation=landscape',
  白米饭: 'https://readdy.ai/api/search-image?query=steamed%20white%20rice%20japanese%20style%20bowl%20beautiful%20food%20photography%20soft%20light%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=d5-mifan&orientation=landscape',
  馒头: 'https://readdy.ai/api/search-image?query=chinese%20steamed%20buns%20mantou%20white%20fluffy%20traditional%20bread%20beautiful%20food%20photography%20bamboo%20steamer%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality%20traditional%20chinese%20cuisine&width=400&height=300&seq=d5-mantou&orientation=landscape',
  排骨汤: 'https://readdy.ai/api/search-image?query=pork%20rib%20soup%20chinese%20style%20clear%20broth%20white%20radish%20tender%20pork%20ribs%20clay%20pot%20beautiful%20food%20photography%20warm%20lighting%20steam%20rising%20appetizing%20presentation%20traditional%20chinese%20cuisine%20restaurant%20quality&width=400&height=300&seq=d5-paigu&orientation=landscape',
  西红柿鸡蛋: 'https://readdy.ai/api/search-image?query=scrambled%20eggs%20with%20tomatoes%20chinese%20home%20style%20cooking%20beautiful%20food%20photography%20white%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality%20traditional%20chinese%20cuisine&width=400&height=300&seq=d5-xihongshi&orientation=landscape',
};

const defaultStaff: StaffMember[] = [
  { name: '王芳', title: '食堂管理员', photoUrl: '' },
  { name: '李明', title: '厨师长', photoUrl: '' },
  { name: '张敏', title: '面点师', photoUrl: '' },
  { name: '刘洋', title: '热菜厨师', photoUrl: '' },
];

// ─── 页面组件 ─────────────────────────────────────────────────────────────

export default function Display5Page() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [staffList, setStaffList] = useState<StaffMember[]>(defaultStaff);
  const [loading, setLoading] = useState(true);
  const [ratingAnim, setRatingAnim] = useState<Record<number, string | null>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let foundDishes: Dish[] = [];
      let foundCats: string[] = [];
      let foundStaff: StaffMember[] = defaultStaff;
      const ratingsMap = new Map<number, RatingCounts>();
      let productImageMap: Record<string, string> = {};

      if (isBrowserMode()) {
        // ── 浏览器模式：走 LAN API ──
        const today = todayBeijing();
        const [nutritionData, configData, ratingsData, productImagesData] = await Promise.all([
          lanGet('/api/public/dish-nutrition?date=' + today).catch(() => []),
          lanGet('/api/public/display-config?key=display_config').catch(() => null),
          lanGet('/api/public/dish-ratings').catch(() => []),
          lanGet('/api/public/product-items-images').catch(() => ({})),
        ]);

        productImageMap = productImagesData || {};

        // 评价映射
        if (Array.isArray(ratingsData)) {
          ratingsData.forEach((r: any) => {
            const dishId = Number(r.dish_id);
            if (!ratingsMap.has(dishId)) {
              ratingsMap.set(dishId, { good: 0, average: 0, bad: 0 });
            }
            const entry = ratingsMap.get(dishId)!;
            if (r.rating_type === 'good') entry.good = r.count || 0;
            if (r.rating_type === 'average') entry.average = r.count || 0;
            if (r.rating_type === 'bad') entry.bad = r.count || 0;
          });
        }

        // 炊事人员：优先今日值班，否则显示全部
        const settings = configData?.config_data?.settings;
        const dutyStaff = settings?.todayDutyStaff;
        if (Array.isArray(dutyStaff) && dutyStaff.length > 0) {
          foundStaff = dutyStaff.filter((s: any) => s.name?.trim());
        } else if (settings?.staffInfo) {
          foundStaff = settings.staffInfo.filter((s: any) => s.name?.trim());
        }
        if (foundStaff.length === 0) foundStaff = defaultStaff;

        // 菜品：全部菜品（不限日期），同名菜品取最新的一条
        if (Array.isArray(nutritionData) && nutritionData.length > 0) {
          const seen = new Map<string, any>();
          for (const d of nutritionData) {
            const name: string = d.dish_name || '未知菜品';
            // 同名菜品保留 ID 最大的（最新）
            if (!seen.has(name) || d.id > seen.get(name).id) {
              seen.set(name, d);
            }
          }
          foundDishes = Array.from(seen.values()).map((d: any) => {
            const name: string = d.dish_name || '未知菜品';
            const dishId = Number(d.id);
            return {
              id: dishId,
              name,
              category: d.category || '其他',
              img: d.img || productImageMap[name] || FALLBACK_IMAGE_MAP[name] || '',
              calories: Number(d.calories_per_100g) || 0,
              ratings: ratingsMap.get(dishId) || { good: 0, average: 0, bad: 0 },
            };
          });
          // 更新分类去重
          foundCats = Array.from(new Set(foundDishes.map((d) => d.category)));
        }

        // 兜底：display_configs 里的 menu
        if (foundDishes.length === 0) {
          const menu = configData?.config_data?.menu || configData?.menu;
          if (menu) {
            const allMenuItems: any[] = [];
            const pushItems = (items?: any[]) => {
              if (items?.length) allMenuItems.push(...items);
            };
            pushItems(menu.breakfast);
            pushItems(menu.lunch);
            pushItems(menu.dinner);
            if (allMenuItems.length > 0) {
              const seen = new Map<string, any>();
              for (const item of allMenuItems) {
                if (!seen.has(item.name)) seen.set(item.name, item);
              }
              foundDishes = Array.from(seen.values()).map((item, idx) => ({
                id: 9000 + idx,
                name: item.name || '未知菜品',
                category: item.category || '其他',
                img: item.img || productImageMap[item.name] || FALLBACK_IMAGE_MAP[item.name] || '',
                calories: item.calories || 0,
                ratings: { good: 0, average: 0, bad: 0 },
              }));
            }
          }
        }
      } else {
        // ── Electron 模式：走 supabase（IPC → 本地 SQLite）──
        const today = todayBeijing();
        const [dbResult, loadedConfig, productItemsResult] = await Promise.all([
          supabase.from('dish_nutrition').select('*').eq('menu_date', today),
          loadDisplayConfig('default'),
          supabase.from('product_items').select('id, name, media'),
        ]);

        // 构建菜品名 → 图片 URL 映射（从 product_items media）
        (productItemsResult as any)?.data?.forEach((item: any) => {
          if (!productImageMap[item.name]) {
            try {
              const media = typeof item.media === 'string' ? JSON.parse(item.media) : (item.media || []);
              if (media[0]?.url) productImageMap[item.name] = media[0].url;
            } catch { /* ignore */ }
          }
        });

        // 评价数据
        try {
          const { data: ratingsRows } = await supabase.from('dish_ratings').select('*');
          if (ratingsRows) {
            ratingsRows.forEach((r: any) => {
              const dishId = Number(r.dish_id);
              if (!ratingsMap.has(dishId)) {
                ratingsMap.set(dishId, { good: 0, average: 0, bad: 0 });
              }
              const entry = ratingsMap.get(dishId)!;
              if (r.rating_type === 'good') entry.good = r.count || 0;
              if (r.rating_type === 'average') entry.average = r.count || 0;
              if (r.rating_type === 'bad') entry.bad = r.count || 0;
            });
          }
        } catch { /* 表可能还不存在，忽略 */ }

        // 炊事人员：优先今日值班，否则显示全部
        const settings = loadedConfig?.settings;
        const dutyStaff = settings?.todayDutyStaff;
        if (Array.isArray(dutyStaff) && dutyStaff.length > 0) {
          foundStaff = dutyStaff.filter((s: any) => s.name?.trim());
        } else if (settings?.staffInfo) {
          foundStaff = settings.staffInfo.filter((s: any) => s.name?.trim());
        }
        if (foundStaff.length === 0) foundStaff = defaultStaff;

        const dbData = (dbResult as any)?.data;
        if (dbData && dbData.length > 0) {
          const seen = new Map<string, any>();
          for (const d of dbData) {
            const name: string = d.dish_name || '未知菜品';
            if (!seen.has(name) || d.id > seen.get(name).id) {
              seen.set(name, d);
            }
          }
          foundDishes = Array.from(seen.values()).map((d: any) => {
            const name: string = d.dish_name || '未知菜品';
            const dishId = Number(d.id);
            return {
              id: dishId,
              name,
              category: d.category || '其他',
              img: productImageMap[name] || d.img || FALLBACK_IMAGE_MAP[name] || '',
              calories: Number(d.calories_per_100g) || 0,
              ratings: ratingsMap.get(dishId) || { good: 0, average: 0, bad: 0 },
            };
          });
          foundCats = Array.from(new Set(foundDishes.map((d) => d.category)));
        }

        // 历史菜单兜底（沿用全部菜品逻辑不做日期过滤，仅当 db 无数据时）
        if (foundDishes.length === 0 && loadedConfig?.menu) {
          const menu = loadedConfig.menu as any;
          const allMenuItems: any[] = [];
          const pushItems = (items?: any[], _meal?: string) => {
            if (items?.length) allMenuItems.push(...items);
          };
          pushItems(menu.breakfast);
          pushItems(menu.lunch);
          pushItems(menu.dinner);
          if (allMenuItems.length > 0) {
            const seen = new Map<string, any>();
            for (const item of allMenuItems) {
              if (!seen.has(item.name)) seen.set(item.name, item);
            }
            foundDishes = Array.from(seen.values()).map((item, idx) => ({
              id: 9000 + idx,
              name: item.name || '未知菜品',
              category: item.category || '其他',
              img: item.img || productImageMap[item.name] || FALLBACK_IMAGE_MAP[item.name] || '',
              calories: item.calories || 0,
              ratings: { good: 0, average: 0, bad: 0 },
            }));
          }
        }
      }

      if (foundDishes.length > 0) {
        foundCats = Array.from(new Set(foundDishes.map((d) => d.category)));
      }

      if (foundDishes.length === 0) {
        foundDishes = [
          { id: 1, name: '红烧肉', category: '荤菜', img: FALLBACK_IMAGE_MAP['红烧肉'], calories: 395, ratings: { good: 0, average: 0, bad: 0 } },
          { id: 2, name: '清炒时蔬', category: '素菜', img: FALLBACK_IMAGE_MAP['清炒时蔬'], calories: 25, ratings: { good: 0, average: 0, bad: 0 } },
          { id: 3, name: '鱼香肉丝', category: '家常菜', img: FALLBACK_IMAGE_MAP['鱼香肉丝'], calories: 145, ratings: { good: 0, average: 0, bad: 0 } },
          { id: 4, name: '宫保鸡丁', category: '荤菜', img: FALLBACK_IMAGE_MAP['宫保鸡丁'], calories: 180, ratings: { good: 0, average: 0, bad: 0 } },
          { id: 5, name: '麻婆豆腐', category: '家常菜', img: FALLBACK_IMAGE_MAP['麻婆豆腐'], calories: 72, ratings: { good: 0, average: 0, bad: 0 } },
          { id: 6, name: '蛋炒饭', category: '主食', img: FALLBACK_IMAGE_MAP['蛋炒饭'], calories: 183, ratings: { good: 0, average: 0, bad: 0 } },
        ];
        foundCats = ['荤菜', '素菜', '家常菜', '主食', '汤品'];
      }

      setDishes(foundDishes);
      setCategories(foundCats);
      setStaffList(foundStaff);
    } catch (e) {
      console.error('[Display5] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // 每 30 秒自动刷新一次（大屏常开场景下同步值班人员变更等）
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const filteredDishes = activeCategory === '全部'
    ? dishes
    : dishes.filter((d) => d.category === activeCategory);

  const handleRate = async (dish: Dish, ratingType: 'good' | 'average' | 'bad') => {
    // 动画
    setRatingAnim((prev) => ({ ...prev, [dish.id]: ratingType }));
    setTimeout(() => {
      setRatingAnim((prev) => ({ ...prev, [dish.id]: null }));
    }, 1000);

    // 乐观更新本地
    setDishes((prev) =>
      prev.map((d) => {
        if (d.id !== dish.id) return d;
        return {
          ...d,
          ratings: {
            ...d.ratings,
            [ratingType]: d.ratings[ratingType] + 1,
          },
        };
      })
    );

    // 写后端
    if (isBrowserMode()) {
      try {
        await lanPost('/api/public/dish-rating', { dish_id: dish.id, dish_name: dish.name, rating_type: ratingType });
      } catch (e) {
        console.error('[Display5] LAN rating error:', e);
      }
      return;
    }

    try {
      const { data: existing } = await supabase
        .from('dish_ratings')
        .select('count')
        .eq('dish_id', dish.id)
        .eq('rating_type', ratingType)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('dish_ratings')
          .update({ count: (existing.count || 0) + 1, updated_at: new Date().toISOString() })
          .eq('dish_id', dish.id)
          .eq('rating_type', ratingType);
      } else {
        await supabase
          .from('dish_ratings')
          .insert({ dish_id: dish.id, rating_type: ratingType, count: 1 });
      }
    } catch (e) {
      console.error('[Display5] rating error:', e);
    }
  };

  const totalRatings = dishes.reduce((s, d) => s + d.ratings.good + d.ratings.average + d.ratings.bad, 0);
  const goodTotal = dishes.reduce((s, d) => s + d.ratings.good, 0);

  return (
    <div className="flex flex-col overflow-hidden bg-slate-950 w-screen h-screen">
      {/* 炊事人员 */}
      <StaffPanel staffList={staffList} />

      {/* 分类切换 */}
      <div className="px-4 py-2.5 border-b border-slate-800/60">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveCategory('全部')}
            className={`text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
              activeCategory === '全部' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            全部 ({dishes.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors ${
                activeCategory === cat ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              {cat} ({dishes.filter((d) => d.category === cat).length})
            </button>
          ))}
        </div>
      </div>

      {/* 菜品网格 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <i className="ri-loader-4-line animate-spin text-2xl mr-2" />
            <span className="text-sm">加载菜品中...</span>
          </div>
        ) : (
          <div className="p-3">
            {/* 统计行 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <i className="ri-restaurant-2-line text-emerald-400 text-lg" />
                <span className="text-base font-bold text-white">今日菜品</span>
                <span className="text-xs text-slate-500">{filteredDishes.length} 道</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-emerald-400">
                  <i className="ri-emotion-happy-fill text-sm" />
                  <span className="text-xs font-medium">{goodTotal} 好评</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500">
                  <i className="ri-chat-1-line text-sm" />
                  <span className="text-xs">{totalRatings} 评价</span>
                </div>
              </div>
            </div>

            {filteredDishes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <i className="ri-inbox-2-line text-4xl mb-3" />
                <p className="text-sm">该分类暂无菜品</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {filteredDishes.map((dish) => (
                  <DishCard5
                    key={dish.id}
                    id={dish.id}
                    name={dish.name}
                    category={dish.category}
                    img={dish.img}
                    calories={dish.calories}
                    ratings={dish.ratings}
                    onRate={(type) => handleRate(dish, type)}
                    ratingAnim={ratingAnim[dish.id]}
                  />
                ))}
              </div>
            )}

            <div className="h-24" />
          </div>
        )}
      </div>
    </div>
  );
}