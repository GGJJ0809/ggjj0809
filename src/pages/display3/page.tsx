import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getSupabaseCloud } from '@/lib/supabaseCloud';
import DisplayHeader from './components/DisplayHeader';
import DishCard from './components/DishCard';
import SuggestModal from './components/SuggestModal';

interface Dish {
  id: number;
  name: string;
  category: string;
  img: string;
  calories: number;
  likeCount: number;
}

// ─── 浏览器模式检测 & LAN API 工具 ────────────────────────────────────────

/** 是否在纯浏览器环境（非 Electron） — 局域网场景走 local-server API */
function isBrowserMode() {
  return typeof window !== 'undefined' && !(window as any).electronAPI;
}

/** 浏览器模式下 API 基地址
 *  优先级：localStorage 手动配置 > 当前 host + 固定端口 8081（local-server 默认端口）
 *  DISPLAY3 竖屏通常在局域网其他机器上打开，需要指向管理端 local-server */
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

// ─── 兜底数据 ─────────────────────────────────────────────────────────────

const FALLBACK_IMAGE_MAP: Record<string, string> = {
  红烧肉: 'https://readdy.ai/api/search-image?query=braised%20pork%20belly%20chinese%20style%20red%20braised%20meat%20beautiful%20plating%20food%20photography%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot&width=400&height=300&seq=dish-hongshaorou-2026&orientation=landscape',
  清炒时蔬: 'https://readdy.ai/api/search-image?query=stir%20fried%20broccoli%20chinese%20style%20green%20vegetable%20dish%20garlic%20beautiful%20plating%20food%20photography%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot&width=400&height=300&seq=dish-shishu-2026&orientation=landscape',
  鱼香肉丝: 'https://readdy.ai/api/search-image?query=yu%20xiang%20rou%20si%20spicy%20pork%20shreds%20chinese%20sichuan%20style%20food%20dish%20beautiful%20plating%20food%20photography%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot&width=400&height=300&seq=dish-yuxiang-2026&orientation=landscape',
  宫保鸡丁: 'https://readdy.ai/api/search-image?query=kung%20pao%20chicken%20chinese%20spicy%20dish%20peanuts%20peppers%20beautiful%20plating%20food%20photography%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot&width=400&height=300&seq=dish-gongbao-2026&orientation=landscape',
  麻婆豆腐: 'https://readdy.ai/api/search-image?query=mapo%20tofu%20chinese%20sichuan%20style%20spicy%20dish%20with%20minced%20pork%20chili%20oil%20beautiful%20food%20photography%20white%20ceramic%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-mapo-2026&orientation=landscape',
  蛋炒饭: 'https://readdy.ai/api/search-image?query=egg%20fried%20rice%20chinese%20style%20golden%20color%20scattered%20eggs%20green%20onions%20beautiful%20food%20photography%20white%20ceramic%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-chaofan-2026&orientation=landscape',
  白米饭: 'https://readdy.ai/api/search-image?query=steamed%20white%20rice%20japanese%20style%20bowl%20beautiful%20food%20photography%20soft%20light%20white%20background%20high%20quality%20professional%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-mifan-2026&orientation=landscape',
  馒头: 'https://readdy.ai/api/search-image?query=chinese%20steamed%20buns%20mantou%20white%20fluffy%20traditional%20bread%20beautiful%20food%20photography%20bamboo%20steamer%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality%20traditional%20chinese%20cuisine&width=400&height=300&seq=dish-mantou-2026&orientation=landscape',
  排骨汤: 'https://readdy.ai/api/search-image?query=pork%20rib%20soup%20chinese%20style%20clear%20broth%20white%20radish%20tender%20pork%20ribs%20clay%20pot%20beautiful%20food%20photography%20warm%20lighting%20steam%20rising%20appetizing%20presentation%20traditional%20chinese%20cuisine%20restaurant%20quality&width=400&height=300&seq=dish-paigu-2026&orientation=landscape',
  西红柿鸡蛋: 'https://readdy.ai/api/search-image?query=scrambled%20eggs%20with%20tomatoes%20chinese%20home%20style%20cooking%20beautiful%20food%20photography%20white%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality%20traditional%20chinese%20cuisine&width=400&height=300&seq=dish-xihongshi-2026&orientation=landscape',
};

const FALLBACK_DISHES: Dish[] = [
  { id: 1, name: '红烧肉', category: '荤菜', img: FALLBACK_IMAGE_MAP['红烧肉'], calories: 395, likeCount: 32 },
  { id: 2, name: '清炒时蔬', category: '素菜', img: FALLBACK_IMAGE_MAP['清炒时蔬'], calories: 25, likeCount: 28 },
  { id: 3, name: '鱼香肉丝', category: '家常菜', img: FALLBACK_IMAGE_MAP['鱼香肉丝'], calories: 145, likeCount: 45 },
  { id: 4, name: '宫保鸡丁', category: '荤菜', img: FALLBACK_IMAGE_MAP['宫保鸡丁'], calories: 180, likeCount: 38 },
  { id: 5, name: '麻婆豆腐', category: '家常菜', img: FALLBACK_IMAGE_MAP['麻婆豆腐'], calories: 72, likeCount: 41 },
  { id: 6, name: '蛋炒饭', category: '主食', img: FALLBACK_IMAGE_MAP['蛋炒饭'], calories: 183, likeCount: 35 },
  { id: 7, name: '白米饭', category: '主食', img: FALLBACK_IMAGE_MAP['白米饭'], calories: 116, likeCount: 22 },
  { id: 8, name: '馒头', category: '主食', img: FALLBACK_IMAGE_MAP['馒头'], calories: 233, likeCount: 19 },
  { id: 9, name: '排骨汤', category: '汤品', img: FALLBACK_IMAGE_MAP['排骨汤'], calories: 89, likeCount: 27 },
  { id: 10, name: '西红柿鸡蛋', category: '家常菜', img: FALLBACK_IMAGE_MAP['西红柿鸡蛋'], calories: 55, likeCount: 36 },
];

// ─── 页面组件 ─────────────────────────────────────────────────────────────

export default function Display3Page() {
  const [searchParams] = useSearchParams();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [showSuggest, setShowSuggest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());

  // 预览模式：URL 参数 ?preview=1 开启，竖屏比例预览
  const isPreviewMode = searchParams.get('preview') === '1';

  const fetchData = async () => {
    setLoading(true);
    try {
      let foundDishes: Dish[] = [];
      let foundCats: string[] = [];

      // ── 浏览器模式：走 LAN API ──
      if (isBrowserMode()) {
        // ★ 改从 product-items-full API 读取，数据来源 = 菜品信息管理
        const fullData = await lanGet('/api/public/product-items-full').catch(() => []);

        if (Array.isArray(fullData) && fullData.length > 0) {
          foundDishes = fullData.map((d: any) => {
            const name: string = d.name?.trim() || '未知菜品';
            return {
              id: d.id,
              name,
              category: d.category || '其他',
              img: d.img || FALLBACK_IMAGE_MAP[name] || '',
              calories: d.calories || 0,
              likeCount: d.likeCount || 0,
            };
          });
          foundCats = Array.from(new Set(foundDishes.map((d) => d.category).filter(Boolean)));
          if (foundCats.length === 0) foundCats = ['其他'];
        }
      } else {
        // ── Electron 模式：走 supabase（IPC → 本地 SQLite）──
        // ★ 读取 product_items + 分类 + 自定义字段 + 点赞
        const [itemsResult, fieldsResult, likesResult] = await Promise.all([
          supabase.from('product_items').select('*, product_categories(id, name), product_custom_values(field_id, value)').order('id'),
          supabase.from('product_custom_fields').select('id, name'),
          supabase.from('dish_likes').select('*'),
        ]);

        // 构建字段映射
        const fieldMap: Record<number, string> = {};
        (fieldsResult.data || []).forEach((f: any) => { fieldMap[f.id] = f.name; });

        // 点赞映射
        const likesMap = new Map<number, number>();
        (likesResult.data || []).forEach((l: any) => { likesMap.set(l.dish_id, l.like_count || 0); });

        const items = (itemsResult as any)?.data || [];
        foundDishes = items.map((item: any) => {
          const cvs: Record<string, string> = {};
          (item.product_custom_values || []).forEach((cv: any) => {
            const fn = fieldMap[cv.field_id];
            if (fn) cvs[fn] = cv.value;
          });
          let img = '';
          try {
            const media = typeof item.media === 'string' ? JSON.parse(item.media) : (item.media || []);
            img = media[0]?.url || '';
          } catch { /* ignore */ }
          const name: string = item.name?.trim() || '未知菜品';
          return {
            id: item.id,
            name,
            category: item.product_categories?.name || '其他',
            img: img || FALLBACK_IMAGE_MAP[name] || '',
            calories: Number(cvs.calories) || 0,
            likeCount: likesMap.get(item.id) || 0,
          };
        });
        foundCats = Array.from(new Set(foundDishes.map((d) => d.category).filter(Boolean)));
        if (foundCats.length === 0) foundCats = ['其他'];
      }

      // ── 最终兜底 ──
      if (foundDishes.length === 0) {
        foundDishes = FALLBACK_DISHES;
        foundCats = ['荤菜', '素菜', '家常菜', '主食', '汤品'];
      }

      setDishes(foundDishes);
      setCategories(foundCats);
    } catch (e) {
      console.error('[Display3] fetch error:', e);
      setDishes(FALLBACK_DISHES);
      setCategories(['荤菜', '素菜', '家常菜', '主食', '汤品']);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredDishes = activeCategory === '全部'
    ? dishes
    : dishes.filter((d) => d.category === activeCategory);

  const handleDishOrder = async (dish: Dish) => {
    setLikedIds((prev) => new Set(prev).add(dish.id));
    setTimeout(() => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.delete(dish.id);
        return next;
      });
    }, 1000);

    // ── 浏览器模式：走 LAN API ──
    if (isBrowserMode()) {
      try {
        await lanPost('/api/public/dish-like', { dish_id: dish.id, dish_name: dish.name, category: dish.category, device_info: '竖屏点餐大屏' });
      } catch (e) {
        console.error('[Display3] LAN like error:', e);
      }
      setDishes((prev) =>
        prev.map((d) =>
          d.id === dish.id ? { ...d, likeCount: d.likeCount + 1 } : d
        )
      );
      return;
    }

    // ── Electron 模式：走 supabase（IPC → 本地 SQLite）──
    try {
      await Promise.all([
        (async () => {
          const { data: existing } = await supabase
            .from('dish_likes')
            .select('like_count')
            .eq('dish_id', dish.id)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('dish_likes')
              .update({
                like_count: (existing.like_count || 0) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('dish_id', dish.id);
          } else {
            await supabase
              .from('dish_likes')
              .insert({
                dish_id: dish.id,
                dish_name: dish.name,
                like_count: 1,
              });
          }

          const cloud = getSupabaseCloud();
          if (cloud) {
            try {
              const { data: cloudExisting } = await cloud
                .from('dish_likes')
                .select('id, like_count')
                .eq('dish_id', dish.id)
                .maybeSingle();

              if (cloudExisting) {
                await cloud
                  .from('dish_likes')
                  .update({
                    like_count: (cloudExisting.like_count || 0) + 1,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', cloudExisting.id);
              } else {
                await cloud
                  .from('dish_likes')
                  .insert({
                    dish_id: dish.id,
                    dish_name: dish.name,
                    like_count: 1,
                  });
              }
            } catch (_) {
              // 云端不可用，静默忽略
            }
          }
        })(),
        (async () => {
          await supabase.from('dish_order_records').insert({
            dish_id: dish.id,
            dish_name: dish.name,
            category: dish.category,
          });

          const cloud = getSupabaseCloud();
          if (cloud) {
            try {
              await cloud.from('dish_order_records').insert({
                dish_id: dish.id,
                dish_name: dish.name,
                category: dish.category,
              });
            } catch (_) {
              // 云端不可用，静默忽略
            }
          }
        })(),
      ]);

      setDishes((prev) =>
        prev.map((d) =>
          d.id === dish.id ? { ...d, likeCount: d.likeCount + 1 } : d
        )
      );
    } catch (e) {
      console.error('[Display3] order error:', e);
    }
  };

  // ── 竖屏预览模式 wrapper ─────────────────────────────────────────────────
  const content = (
    <div className={`flex flex-col overflow-hidden bg-slate-950 ${isPreviewMode ? 'w-full h-full' : 'w-screen h-screen'}`}>
      <DisplayHeader
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <i className="ri-loader-4-line animate-spin text-2xl mr-2" />
            <span className="text-sm">加载菜品中...</span>
          </div>
        ) : (
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <i className="ri-restaurant-2-line text-emerald-400 text-lg" />
                <span className="text-base font-bold text-white">
                  {activeCategory === '全部' ? '全部菜品' : activeCategory}
                </span>
                <span className="text-xs text-slate-500">{filteredDishes.length} 道</span>
              </div>
              <div className="flex items-center gap-1 text-red-400">
                <i className="ri-heart-3-fill text-sm" />
                <span className="text-xs font-medium">
                  {dishes.reduce((s, d) => s + d.likeCount, 0)} 个好评
                </span>
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
                  <DishCard
                    key={dish.id}
                    id={dish.id}
                    name={dish.name}
                    category={dish.category}
                    img={dish.img}
                    calories={dish.calories}
                    likeCount={dish.likeCount}
                    isLiked={likedIds.has(dish.id)}
                    onOrder={() => handleDishOrder(dish)}
                  />
                ))}
              </div>
            )}

            <div className="h-24" />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowSuggest(true)}
        className="fixed bottom-6 right-6 z-40 w-16 h-16 rounded-full bg-emerald-500/85 backdrop-blur-sm hover:bg-emerald-500 text-white flex flex-col items-center justify-center shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 cursor-pointer active:scale-95"
      >
        <i className="ri-lightbulb-line text-lg" />
        <span className="text-[10px] font-medium leading-tight">其他建议</span>
      </button>

      {showSuggest && (
        <SuggestModal onClose={() => setShowSuggest(false)} />
      )}
    </div>
  );

  // 预览模式：套一个竖屏比例的容器，居中显示
  if (isPreviewMode) {
    return (
      <div className="w-screen h-screen bg-slate-900 flex items-center justify-center overflow-hidden">
        <div className="relative h-[95vh] border-[8px] border-slate-700 rounded-2xl overflow-hidden shadow-2xl shadow-black/50"
          style={{ width: 'min(480px, 35vw, 70vh * 0.5625)', aspectRatio: '9 / 16' }}
        >
          {/* 预览标签 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 px-3 py-1 bg-slate-700 text-slate-300 text-[10px] rounded-b-md font-mono">
            预览 70cm 竖屏
          </div>
          {content}
        </div>
      </div>
    );
  }

  return content;
}