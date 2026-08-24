import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { loadDisplayConfig } from '@/lib/displayStore';
import { todayBeijing } from '@/lib/dateUtils';

interface Dish {
  name: string;
  category: string;
  img: string;
  orderCount: number;
  likeCount: number;
  description: string;
}

// ─── 浏览器模式检测 & LAN API 工具 ────────────────────────────────────────

function isBrowserMode() {
  return typeof window !== 'undefined' && !(window as any).electronAPI;
}

function getApiBase() {
  try {
    const stored = localStorage.getItem('lan_server_base');
    if (stored) return stored.replace(/\/+$/, '');
  } catch { /* ignore */ }
  return window.location.origin;
}

async function lanGet(path: string) {
  const res = await fetch(getApiBase() + path);
  if (!res.ok) throw new Error(`LAN API ${path} 返回 ${res.status}`);
  const json = await res.json();
  return json.data;
}

// ─── 菜品资源映射 ──────────────────────────────────────────────────────────

const DISH_IMAGE_MAP: Record<string, string> = {
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
  糖醋里脊: 'https://readdy.ai/api/search-image?query=sweet%20and%20sour%20pork%20tenderloin%20chinese%20style%20golden%20crispy%20beautiful%20food%20photography%20white%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-tangcu-2026&orientation=landscape',
  清蒸鲈鱼: 'https://readdy.ai/api/search-image?query=steamed%20sea%20bass%20chinese%20style%20ginger%20scallion%20soy%20sauce%20beautiful%20food%20photography%20white%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-luyu-2026&orientation=landscape',
  蒜蓉西兰花: 'https://readdy.ai/api/search-image?query=garlic%20broccoli%20chinese%20style%20stir%20fried%20green%20vegetable%20beautiful%20food%20photography%20white%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-xilanhua-2026&orientation=landscape',
  可乐鸡翅: 'https://readdy.ai/api/search-image?query=cola%20chicken%20wings%20chinese%20style%20braised%20glossy%20brown%20sauce%20beautiful%20food%20photography%20white%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-jichi-2026&orientation=landscape',
  冬瓜汤: 'https://readdy.ai/api/search-image?query=winter%20melon%20soup%20chinese%20style%20clear%20broth%20shrimp%20beautiful%20food%20photography%20white%20bowl%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-donggua-2026&orientation=landscape',
  酸辣土豆丝: 'https://readdy.ai/api/search-image?query=sour%20and%20spicy%20shredded%20potato%20chinese%20sichuan%20style%20stir%20fry%20golden%20thin%20strips%20beautiful%20food%20photography%20white%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-tudousi-2026&orientation=landscape',
  素炒豆芽: 'https://readdy.ai/api/search-image?query=stir%20fried%20bean%20sprouts%20chinese%20style%20light%20soy%20sauce%20green%20onions%20beautiful%20food%20photography%20white%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-douya-2026&orientation=landscape',
  回锅肉: 'https://readdy.ai/api/search-image?query=twice%20cooked%20pork%20chinese%20sichuan%20style%20boiled%20then%20stir%20fried%20with%20chili%20bean%20paste%20beautiful%20food%20photography%20white%20plate%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-huiguorou-2026&orientation=landscape',
  凉拌黄瓜: 'https://readdy.ai/api/search-image?query=chinese%20smashed%20cucumber%20salad%20with%20garlic%20and%20sesame%20oil%20cold%20appetizer%20beautiful%20food%20photography%20white%20plate%20natural%20lighting%20fresh%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-huanggua-2026&orientation=landscape',
  凉拌海带: 'https://readdy.ai/api/search-image?query=chinese%20seaweed%20salad%20cold%20appetizer%20with%20sesame%20and%20garlic%20beautiful%20food%20photography%20white%20plate%20natural%20lighting%20fresh%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-haidai-2026&orientation=landscape',
  冬瓜排骨汤: 'https://readdy.ai/api/search-image?query=winter%20melon%20and%20pork%20rib%20soup%20chinese%20style%20clear%20broth%20clay%20pot%20beautiful%20food%20photography%20warm%20lighting%20steam%20rising%20appetizing%20presentation%20restaurant%20quality&width=400&height=300&seq=dish-dongguapaigu-2026&orientation=landscape',
  紫菜蛋花汤: 'https://readdy.ai/api/search-image?query=seaweed%20egg%20drop%20soup%20chinese%20style%20clear%20broth%20beautiful%20food%20photography%20white%20bowl%20warm%20lighting%20appetizing%20presentation%20restaurant%20quality&width=400&height=300&seq=dish-zicai-2026&orientation=landscape',
  饺子: 'https://readdy.ai/api/search-image?query=chinese%20dumplings%20jiaozi%20steamed%20with%20soy%20sauce%20dipping%20beautiful%20food%20photography%20bamboo%20steamer%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-jiaozi-2026&orientation=landscape',
  包子: 'https://readdy.ai/api/search-image?query=chinese%20steamed%20buns%20baozi%20fluffy%20white%20with%20meat%20filling%20beautiful%20food%20photography%20bamboo%20steamer%20warm%20lighting%20appetizing%20presentation%20close%20up%20shot%20restaurant%20quality&width=400&height=300&seq=dish-baozi-2026&orientation=landscape',
};

const DISH_DESCRIPTION_MAP: Record<string, string> = {
  红烧肉: '肥而不腻，入口即化',
  清炒时蔬: '清爽可口，营养丰富',
  鱼香肉丝: '酸甜微辣，下饭神器',
  宫保鸡丁: '麻辣鲜香，花生酥脆',
  麻婆豆腐: '麻辣嫩滑，川味经典',
  蛋炒饭: '粒粒分明，金黄诱人',
  白米饭: '软糯香甜，主食首选',
  馒头: '蓬松柔软，麦香浓郁',
  排骨汤: '汤清味鲜，滋补养颜',
  西红柿鸡蛋: '酸甜开胃，家常味道',
  糖醋里脊: '外酥里嫩，酸甜适口',
  清蒸鲈鱼: '鲜嫩爽滑，原汁原味',
  蒜蓉西兰花: '蒜香浓郁，低脂健康',
  可乐鸡翅: '甜咸适口，色泽红亮',
  冬瓜汤: '清淡解暑，利尿消肿',
  酸辣土豆丝: '酸辣脆爽，开胃下饭',
  素炒豆芽: '清脆爽口，低卡健康',
  回锅肉: '肥而不腻，酱香浓郁',
  凉拌黄瓜: '清脆爽口，蒜香开胃',
  凉拌海带: '酸辣开胃，营养丰富',
  冬瓜排骨汤: '汤鲜味美，滋补养生',
  紫菜蛋花汤: '清淡鲜美，营养好汤',
  饺子: '皮薄馅大，鲜美多汁',
  包子: '松软馅鲜，早餐首选',
};

const FALLBACK_IMG = 'https://readdy.ai/api/search-image?query=delicious%20chinese%20food%20dish%20beautiful%20plating%20professional%20food%20photography%20white%20background%20appetizing%20close%20up%20shot%20restaurant%20quality%20warm%20lighting&width=400&height=300&seq=dish-fallback-2026&orientation=landscape';

const FALLBACK_DISHES: Dish[] = [
  { name: '红烧肉', category: '荤菜', img: DISH_IMAGE_MAP['红烧肉'] || FALLBACK_IMG, orderCount: 0, likeCount: 26, description: DISH_DESCRIPTION_MAP['红烧肉'] },
  { name: '鱼香肉丝', category: '家常菜', img: DISH_IMAGE_MAP['鱼香肉丝'] || FALLBACK_IMG, orderCount: 0, likeCount: 52, description: DISH_DESCRIPTION_MAP['鱼香肉丝'] },
  { name: '宫保鸡丁', category: '荤菜', img: DISH_IMAGE_MAP['宫保鸡丁'] || FALLBACK_IMG, orderCount: 0, likeCount: 14, description: DISH_DESCRIPTION_MAP['宫保鸡丁'] },
  { name: '酸辣土豆丝', category: '素菜', img: DISH_IMAGE_MAP['酸辣土豆丝'] || FALLBACK_IMG, orderCount: 0, likeCount: 57, description: DISH_DESCRIPTION_MAP['酸辣土豆丝'] },
  { name: '素炒豆芽', category: '素菜', img: DISH_IMAGE_MAP['素炒豆芽'] || FALLBACK_IMG, orderCount: 0, likeCount: 55, description: DISH_DESCRIPTION_MAP['素炒豆芽'] },
  { name: '蛋炒饭', category: '主食', img: DISH_IMAGE_MAP['蛋炒饭'] || FALLBACK_IMG, orderCount: 0, likeCount: 48, description: DISH_DESCRIPTION_MAP['蛋炒饭'] },
  { name: '西红柿鸡蛋', category: '家常菜', img: DISH_IMAGE_MAP['西红柿鸡蛋'] || FALLBACK_IMG, orderCount: 0, likeCount: 48, description: DISH_DESCRIPTION_MAP['西红柿鸡蛋'] },
  { name: '糖醋里脊', category: '荤菜', img: DISH_IMAGE_MAP['糖醋里脊'] || FALLBACK_IMG, orderCount: 0, likeCount: 0, description: DISH_DESCRIPTION_MAP['糖醋里脊'] },
  { name: '清蒸鲈鱼', category: '海鲜', img: DISH_IMAGE_MAP['清蒸鲈鱼'] || FALLBACK_IMG, orderCount: 0, likeCount: 0, description: DISH_DESCRIPTION_MAP['清蒸鲈鱼'] },
  { name: '蒜蓉西兰花', category: '素菜', img: DISH_IMAGE_MAP['蒜蓉西兰花'] || FALLBACK_IMG, orderCount: 0, likeCount: 0, description: DISH_DESCRIPTION_MAP['蒜蓉西兰花'] },
  { name: '可乐鸡翅', category: '荤菜', img: DISH_IMAGE_MAP['可乐鸡翅'] || FALLBACK_IMG, orderCount: 0, likeCount: 0, description: DISH_DESCRIPTION_MAP['可乐鸡翅'] },
  { name: '排骨汤', category: '汤品', img: DISH_IMAGE_MAP['排骨汤'] || FALLBACK_IMG, orderCount: 0, likeCount: 20, description: DISH_DESCRIPTION_MAP['排骨汤'] },
];

export default function DishRanking({ maxItems = 12 }: { maxItems?: number }) {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const browserMode = isBrowserMode();

      // ═══ 第一步：获取今日开品菜品（与 display3 一致：menu 第一优先级）═══
      let todayDishNames = new Set<string>();

      if (browserMode) {
        // ── 浏览器模式：走 LAN API ──
        const [configData, nutritionData] = await Promise.all([
          lanGet('/api/public/display-config?key=display_config').catch(() => null),
          lanGet('/api/public/dish-nutrition?date=' + todayBeijing()).catch(() => []),
        ]);

        // 1a. 优先从 display_configs.menu 获取今日开品
        const menu = configData?.config_data?.menu || configData?.menu;
        if (menu) {
          const pushItems = (items?: any[]) => {
            if (items?.length) {
              items.forEach((item: any) => {
                if (item.name) todayDishNames.add(item.name);
              });
            }
          };
          pushItems(menu.breakfast);
          pushItems(menu.lunch);
          pushItems(menu.dinner);
        }

        // 1b. 兜底：从 dish_nutrition 获取今日菜品
        if (todayDishNames.size === 0) {
          (Array.isArray(nutritionData) ? nutritionData : []).forEach((d: any) => {
            if (d.dish_name) todayDishNames.add(d.dish_name);
          });
        }
      } else {
        // ── Electron 模式：走 supabase（IPC → 本地 SQLite）──
        const today = todayBeijing();

        // 1a. 优先从 display_configs.menu 获取今日开品
        const loadedConfig = await loadDisplayConfig('default');
        if (loadedConfig?.menu) {
          const menu = loadedConfig.menu;
          const pushItems = (items?: any[]) => {
            if (items?.length) {
              items.forEach((item: any) => {
                if (item.name) todayDishNames.add(item.name);
              });
            }
          };
          pushItems(menu.breakfast);
          pushItems(menu.lunch);
          pushItems(menu.dinner);
        }

        // 1b. 兜底：从 dish_nutrition 获取今日菜品
        if (todayDishNames.size === 0) {
          const { data: localNutrition } = await supabase
            .from('dish_nutrition')
            .select('dish_name')
            .eq('menu_date', today);
          (localNutrition || []).forEach((d: any) => {
            if (d.dish_name) todayDishNames.add(d.dish_name);
          });
        }
      }

      // ═══ 第二步：读取全部取餐数据和点赞数据 ═══
      let likesRows: { dish_name: string; like_count: number }[] = [];
      let pickupRows: { dish_name: string; pickup_portions: number; category: string }[] = [];
      let nutritionRows: { dish_name: string; category: string; img: string }[] = [];

      if (browserMode) {
        // ── 浏览器模式：走 LAN API，直接取全部历史数据 ──
        const [likesData, pickupAllData, nutData] = await Promise.all([
          lanGet('/api/public/dish-likes').catch(() => []),
          lanGet('/api/public/tray-pickup-logs').catch(() => []),
          lanGet('/api/public/dish-nutrition?date=all').catch(() => []),
        ]);

        // 点赞映射
        (Array.isArray(likesData) ? likesData : []).forEach((r: any) => {
          const name = r.dish_name || '';
          if (name && todayDishNames.has(name)) {
            likesRows.push({ dish_name: name, like_count: Number(r.like_count) || 0 });
          }
        });

        // 取餐记录：全部历史数据
        (Array.isArray(pickupAllData) ? pickupAllData : []).forEach((r: any) => {
          const name = r.dish_name || '';
          if (name && todayDishNames.has(name)) {
            pickupRows.push({
              dish_name: name,
              pickup_portions: Number(r.pickup_portions) || 1,
              category: r.category || '',
            });
          }
        });

        // 营养表：全部数据
        (Array.isArray(nutData) ? nutData : []).forEach((r: any) => {
          if (r.dish_name) {
            nutritionRows.push({
              dish_name: r.dish_name,
              category: r.category || '其他',
              img: r.img || '',
            });
          }
        });
      } else {
        // ── Electron 模式：走 supabase（IPC → 本地 SQLite），直接取全部历史数据 ──
        const [localLikesRes, pickupAllRes, nutritionRes] = await Promise.all([
          supabase.from('dish_likes').select('dish_name, like_count'),
          supabase.from('tray_pickup_logs').select('dish_name, pickup_portions, category'),
          supabase.from('dish_nutrition').select('dish_name, category, img'),
        ]);

        likesRows = (localLikesRes.data || []) as { dish_name: string; like_count: number }[];
        pickupRows = (pickupAllRes.data || []) as { dish_name: string; pickup_portions: number; category: string }[];
        nutritionRows = (nutritionRes.data || []) as { dish_name: string; category: string; img: string }[];
      }

      // 点赞映射（去重：同名菜品取最大点赞数）
      const likeCountMap = new Map<string, number>();
      likesRows.forEach((r) => {
        if (todayDishNames.has(r.dish_name)) {
          likeCountMap.set(r.dish_name, Math.max(likeCountMap.get(r.dish_name) || 0, r.like_count || 0));
        }
      });

      // 取餐份数映射（累加 pickup_portions）
      const orderCountMap = new Map<string, number>();
      pickupRows.forEach((r) => {
        if (todayDishNames.has(r.dish_name)) {
          orderCountMap.set(r.dish_name, (orderCountMap.get(r.dish_name) || 0) + (r.pickup_portions || 1));
        }
      });

      // 营养表信息
      const nutritionMap = new Map<string, { category: string; img: string }>();
      nutritionRows.forEach((r) => {
        if (!nutritionMap.has(r.dish_name)) {
          nutritionMap.set(r.dish_name, { category: r.category || '其他', img: r.img || '' });
        }
      });

      // 如果今日菜单完全没有菜品，回退兜底
      if (todayDishNames.size === 0) {
        setDishes(FALLBACK_DISHES);
        setError(false);
        return;
      }

      // ═══ 第三步：只基于今日菜单构建排行 ═══
      const list: Dish[] = [];
      todayDishNames.forEach((name) => {
        const orderCount = orderCountMap.get(name) || 0;
        const likeCount = likeCountMap.get(name) || 0;
        const nutrition = nutritionMap.get(name);
        const category = nutrition?.category || '其他';
        const img = nutrition?.img || DISH_IMAGE_MAP[name] || FALLBACK_IMG;

        list.push({
          name,
          category,
          img,
          orderCount,
          likeCount,
          description: DISH_DESCRIPTION_MAP[name] || '经典美味，深受喜爱',
        });
      });

      // 按点餐次数降序，同样点餐次数按点赞数降序
      list.sort((a, b) => {
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        return b.likeCount - a.likeCount;
      });

      // 如果今日菜单有菜品就显示，不再因为无订单就跳到兜底数据
      setDishes(list.length > 0 ? list : FALLBACK_DISHES);
      setError(false);
    } catch (e) {
      console.error('[DishRanking] fetch error:', e);
      setDishes(FALLBACK_DISHES);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 15000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll animation
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    let pos = 0;
    const step = 0.8;
    const interval = setInterval(() => {
      pos += step;
      if (pos >= maxScroll + 20) pos = 0;
      el.scrollTop = pos;
    }, 35);
    return () => clearInterval(interval);
  }, [dishes, loading]);

  const totalOrders = dishes.reduce((s, d) => s + d.orderCount, 0);
  const totalLikes = dishes.reduce((s, d) => s + d.likeCount, 0);

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 flex flex-col h-full w-full">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-emerald-500/10">
            <i className="ri-restaurant-2-line text-emerald-400 text-3xl" />
          </div>
          <span className="text-4xl font-semibold text-slate-200">点餐排行</span>
        </div>
        {(totalOrders > 0 || totalLikes > 0) && (
          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1">
              <i className="ri-heart-3-fill text-rose-400 text-2xl" />
              <span className="text-2xl font-medium">{totalLikes} 赞</span>
            </span>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <i className="ri-loader-4-line animate-spin text-7xl mr-2" />
            <span className="text-4xl">加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2">
            <div className="flex items-center gap-1.5">
              <i className="ri-error-warning-line text-amber-400 text-4xl" />
              <span className="text-3xl">数据加载异常，显示默认排行</span>
            </div>
            <button
              type="button"
              onClick={() => { setLoading(true); setError(false); fetchData(); }}
              className="text-3xl text-emerald-400 hover:text-emerald-300 cursor-pointer underline whitespace-nowrap"
            >
              点击重试
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {dishes.slice(0, maxItems).map((dish, idx) => (
              <div
                key={dish.name}
                className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                {/* Rank */}
                <div className={`w-8 h-8 flex items-center justify-center rounded-full text-3xl font-bold flex-shrink-0 ${idx < 3 ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                  {idx + 1}
                </div>

                {/* Image */}
                <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border border-slate-800">
                  <img
                    src={dish.img}
                    alt={dish.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src !== FALLBACK_IMG) {
                        target.src = FALLBACK_IMG;
                      } else {
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-slate-800"><i class="ri-image-line text-slate-600 text-4xl"></i></div>';
                        }
                      }
                    }}
                  />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-4xl text-slate-300 font-medium truncate">{dish.name}</p>
                    <span className="text-4xl text-slate-500 bg-slate-800 rounded px-1.5 py-0.5 flex-shrink-0">
                      {dish.category}
                    </span>
                  </div>
                  <p className="text-4xl text-slate-500 truncate mt-0.5">{dish.description}</p>
                </div>

                {/* Order & Like counts */}
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0 min-w-[48px]">
                  <div className="flex items-center gap-1 text-emerald-400">
                    <i className="ri-shopping-cart-2-line text-3xl" />
                    <span className="text-3xl font-bold">{dish.orderCount}</span>
                  </div>
                  <div className="flex items-center gap-1 text-rose-400/60">
                    <i className="ri-heart-3-fill text-xl" />
                    <span className="text-xl font-medium">{dish.likeCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}