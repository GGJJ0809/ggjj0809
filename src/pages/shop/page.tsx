import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Product {
  id: number;
  name: string;
  cover_image: string;
  description: string;
  category: string;
  price: number;
  member_price: number | null;
  points_required: number;
  points_plus_price: number | null;
  stock: number;
  is_virtual: boolean;
  sold_count: number;
}

const CATEGORIES = ["全部", "实体商品", "虚拟商品", "积分专区", "会员卡"];

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return `¥${Number(n).toLocaleString("zh-CN")}`;
}

/* 商品卡片 */
function ProductCard({ p }: { p: Product }) {
  const hasCash = p.price > 0;
  const hasPoints = p.points_required > 0;
  const soldOut = p.stock === 0;

  return (
    <Link
      to={`/shop/${p.id}`}
      className="bg-white rounded-xl border border-background-200/70 overflow-hidden hover:border-primary-300 transition-all duration-300 group flex flex-col"
    >
      {/* 封面 */}
      <div className="relative aspect-square overflow-hidden bg-background-100">
        <img
          src={p.cover_image}
          alt={p.name}
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/40 text-white backdrop-blur-sm">
            {p.category}
          </span>
          {p.is_virtual && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-500 text-white">
              虚拟
            </span>
          )}
        </div>
        {soldOut && (
          <div className="absolute inset-0 bg-foreground-950/50 flex items-center justify-center">
            <span className="text-white text-sm font-semibold">已售罄</span>
          </div>
        )}
      </div>

      {/* 信息 */}
      <div className="p-3 md:p-4 flex flex-col flex-1">
        <h3 className="text-sm font-semibold text-foreground-950 line-clamp-1 group-hover:text-primary-600 transition-colors">
          {p.name}
        </h3>
        <p className="text-xs text-foreground-400 mt-1 line-clamp-2 flex-1">{p.description}</p>

        {/* 价格区 */}
        <div className="mt-3 flex items-end justify-between">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {hasCash && (
              <span className="text-base font-bold text-foreground-950">
                {formatMoney(p.price)}
              </span>
            )}
            {p.member_price != null && p.member_price > 0 && p.member_price < p.price && (
              <span className="text-[11px] font-medium text-accent-600">
                会员 {formatMoney(p.member_price)}
              </span>
            )}
            {hasPoints && (
              <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-accent-600">
                <i className="ri-vip-crown-line text-xs"></i>
                {p.points_required.toLocaleString("zh-CN")}积分
                {p.points_plus_price != null && p.points_plus_price > 0 && (
                  <span className="text-foreground-500 font-normal">
                    +{formatMoney(p.points_plus_price)}
                  </span>
                )}
              </span>
            )}
          </div>
          <span className="text-[10px] text-foreground-400 whitespace-nowrap">
            已售 {p.sold_count}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("全部");
  const [keyword, setKeyword] = useState("");
  const [cartTip, setCartTip] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let query = supabase
        .from("products")
        .select("*")
        .eq("is_published", true)
        .is("deleted_at", null);

      if (category !== "全部") query = query.eq("category", category);
      if (keyword.trim()) query = query.ilike("name", `%${keyword.trim()}%`);

      const { data, error: qErr } = await query.order("sort_order", {
        ascending: true,
      });
      if (qErr) throw qErr;
      setProducts((data || []) as Product[]);
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [category, keyword]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <main className="min-h-screen pt-16 pb-20 md:pb-8 bg-background-50">
      {/* Hero Banner */}
      <section className="relative overflow-hidden h-[260px] md:h-[340px]">
        <img
          src="https://readdy.ai/api/search-image?query=Warm%20abstract%20geometric%20background%20with%20soft%20flowing%20curves%20in%20terracotta%20and%20cream%20tones%2C%20modern%20minimalist%20ecommerce%20banner%20with%20subtle%20golden%20accents%2C%20editorial%20quality%2C%20clean%20elegant%20aesthetic%2C%20no%20text&width=1600&height=900&seq=shop-banner-hero&orientation=landscape"
          alt="引力场商城"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-black/60"></div>
        <div className="relative max-w-7xl mx-auto px-4 md:px-6 h-full flex flex-col justify-end pb-8 md:pb-12">
          <p className="text-xs font-semibold text-primary-300 tracking-[0.2em] uppercase mb-3">
            GRAVITY FIELD STORE
          </p>
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">引力场商城</h1>
          <p className="mt-3 text-white/70 text-sm md:text-base max-w-lg leading-relaxed">
            现金购买 · 积分兑换 · 会员专享，用成长换取更多价值
          </p>
        </div>
      </section>

      {/* 搜索 + 分类 */}
      <section className="sticky top-16 z-30 bg-background-50/95 backdrop-blur-md border-b border-background-200/70">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 space-y-3">
          {/* 搜索框 */}
          <div className="relative max-w-sm">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-400">
              <i className="ri-search-line text-sm"></i>
            </div>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索商品名称"
              className="w-full h-9 pl-9 pr-9 rounded-full bg-white border border-background-200/70 text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
            {keyword && (
              <button
                onClick={() => setKeyword("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-foreground-400 hover:text-foreground-600"
              >
                <i className="ri-close-circle-line text-sm"></i>
              </button>
            )}
          </div>

          {/* 分类标签 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  category === c
                    ? "bg-primary-500 text-white"
                    : "text-foreground-600 hover:text-foreground-950 hover:bg-background-100"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 商品列表 */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-foreground-400">
            <i className="ri-loader-4-line animate-spin text-2xl"></i>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24">
            <i className="ri-error-warning-line text-3xl text-foreground-400 mb-2"></i>
            <p className="text-sm text-foreground-600">{error}</p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 bg-primary-500 text-white text-sm rounded-lg"
            >
              重试
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-store-2-line text-2xl text-foreground-300"></i>
            </div>
            <p className="text-sm text-foreground-500">暂无相关商品</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      {/* 购物车浮动入口 */}
      <button
        onClick={() => {
          setCartTip(true);
          setTimeout(() => setCartTip(false), 2000);
        }}
        className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-40 w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-lg hover:bg-primary-600 transition-all"
      >
        <i className="ri-shopping-cart-2-line text-xl"></i>
      </button>
      {cartTip && (
        <div className="fixed bottom-36 md:bottom-24 right-4 md:right-8 z-40 px-4 py-2 rounded-lg bg-foreground-950 text-white text-xs">
          购物车即将上线，敬请期待
        </div>
      )}
    </main>
  );
}