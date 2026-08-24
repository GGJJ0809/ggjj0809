import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface DistributionConfig {
  productIds?: number[];
  displayCount?: number;
}

export default function DistributionProductRenderer({ config, isPreview = false }: { config: DistributionConfig; isPreview?: boolean }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        let query = supabase.from("product_items").select("*").eq("status", "active");
        if (config.productIds && config.productIds.length > 0) query = query.in("id", config.productIds);
        query = query.limit(config.displayCount || 4);
        const { data } = await query;
        if (data) setProducts(data);
      } catch { /* silent */ }
      setLoading(false);
    };
    fetchProducts();
  }, [config.productIds, config.displayCount]);

  if (loading) return <section className={isPreview ? "py-4 px-3" : "py-10 px-4 md:px-6 max-w-7xl mx-auto"}><div className="flex items-center justify-center h-20"><i className="ri-loader-4-line animate-spin text-xl text-foreground-300"></i></div></section>;
  if (products.length === 0) return null;

  return (
    <section className={isPreview ? "py-4 px-3" : "py-10 md:py-14 px-4 md:px-6 max-w-7xl mx-auto"}>
      <div className={`text-center ${isPreview ? "mb-4" : "mb-8 md:mb-10"}`}>
        <h2 className={`${isPreview ? "text-base" : "text-2xl md:text-3xl"} font-heading font-bold text-foreground-950`}>分销好物</h2>
        <p className={`mt-1 ${isPreview ? "text-[10px]" : "mt-2 text-sm"} text-foreground-500`}>精选优质商品，分享赚佣金</p>
      </div>
      <div className={`grid grid-cols-2 ${isPreview ? "gap-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5"}`}>
        {products.map((product) => {
          const media = (product.media && typeof product.media === "string" ? JSON.parse(product.media) : product.media) || [];
          const imageUrl = media[0]?.url || "";
          return (
            <Link key={product.id} to={`/shop/${product.id}`} className={`group bg-background-50 rounded-2xl border border-background-200/70 overflow-hidden hover:shadow-sm hover:border-accent-200 transition-all ${isPreview ? "rounded-xl" : ""}`} data-product-shop>
              <div className="aspect-square overflow-hidden">
                {imageUrl ? <img src={imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full bg-background-100 flex items-center justify-center"><i className={`ri-shopping-bag-line ${isPreview ? "text-xl" : "text-3xl"} text-foreground-300`}></i></div>}
              </div>
              <div className={isPreview ? "p-2.5" : "p-4"}>
                <h3 className={`${isPreview ? "text-[11px] leading-tight" : "text-sm"} font-semibold text-foreground-900 line-clamp-2`}>{product.name}</h3>
                <div className={`flex items-center justify-between ${isPreview ? "mt-1.5" : "mt-2"}`}>
                  <div>
                    {product.discount_enabled && product.discount_price ? (
                      <><span className={`${isPreview ? "text-xs" : "text-sm"} font-bold text-accent-600`}>¥{product.discount_price}</span><span className={`${isPreview ? "text-[8px]" : "text-xs"} text-foreground-400 line-through ml-1`}>¥{product.price}</span></>
                    ) : (<span className={`${isPreview ? "text-xs" : "text-sm"} font-bold text-primary-600`}>¥{product.price}</span>)}
                  </div>
                  <span className={`${isPreview ? "text-[7px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"} rounded-full bg-accent-100 text-accent-700 font-medium whitespace-nowrap`}>可分销</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}