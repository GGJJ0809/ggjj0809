import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface PromotionConfig {
  title?: string;
  endTime?: string;
  products?: number[];
  backgroundColor?: string;
  showCountdown?: boolean;
}

export default function PromotionRenderer({ config, isPreview = false }: { config: PromotionConfig; isPreview?: boolean }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!config.showCountdown || !config.endTime) return;
    const calc = () => {
      const diff = new Date(config.endTime!).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("已结束"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${d}天 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [config.endTime, config.showCountdown]);

  useEffect(() => {
    if (!config.products || config.products.length === 0) return;
    supabase.from("product_items").select("*").in("id", config.products).limit(4).then(({ data }) => { if (data) setProducts(data); });
  }, [config.products]);

  return (
    <section className={isPreview ? "py-4 px-3" : "py-10 px-4 md:px-6 max-w-7xl mx-auto"}>
      <div style={{ backgroundColor: config.backgroundColor || "#ff6b35" }} className={`rounded-2xl ${isPreview ? "p-4" : "p-6 md:p-10"} text-white relative overflow-hidden`}>
        <div className={`absolute top-0 right-0 ${isPreview ? "w-20 h-20" : "w-40 h-40"} rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2`}></div>
        <div className={`absolute bottom-0 left-0 ${isPreview ? "w-12 h-12" : "w-24 h-24"} rounded-full bg-white/10 translate-y-1/2 -translate-x-1/2`}></div>
        <div className="relative z-10">
          <div className={`flex ${isPreview ? "flex-col items-start" : "flex-col md:flex-row items-start md:items-center"} justify-between ${isPreview ? "gap-3 mb-4" : "gap-4 mb-6"}`}>
            <div>
              <p className={`${isPreview ? "text-xs" : "text-sm"} font-semibold text-white/80 uppercase tracking-wider`}>限时特惠</p>
              <h2 className={`${isPreview ? "text-base" : "text-2xl md:text-3xl"} font-heading font-bold mt-1`}>{config.title || "限时特惠"}</h2>
            </div>
            {config.showCountdown && timeLeft && (
              <div className={`flex items-center gap-2 ${isPreview ? "px-3 py-1" : "px-4 py-2"} rounded-full bg-white/20 backdrop-blur-sm`}>
                <i className={`ri-timer-line ${isPreview ? "text-xs" : ""}`}></i><span className={`${isPreview ? "text-xs" : "text-sm"} font-mono font-bold`}>{timeLeft}</span>
              </div>
            )}
          </div>
          {products.length > 0 && (
            <div className={`grid grid-cols-2 ${isPreview ? "gap-2" : "md:grid-cols-4 gap-3"}`}>
              {products.map((product) => {
                const media = (product.media && typeof product.media === "string" ? JSON.parse(product.media) : product.media) || [];
                const imgUrl = media[0]?.url || "";
                return (
                  <Link key={product.id} to={`/shop/${product.id}`} className={`bg-white/15 backdrop-blur-sm rounded-xl ${isPreview ? "p-2" : "p-3"} hover:bg-white/25 transition-colors`} data-product-shop>
                    <div className={`aspect-square rounded-lg overflow-hidden bg-white/10 ${isPreview ? "mb-1.5" : "mb-2"}`}>
                      {imgUrl ? <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><i className={`ri-shopping-bag-line ${isPreview ? "text-lg" : "text-2xl"} text-white/40`}></i></div>}
                    </div>
                    <h4 className={`${isPreview ? "text-[10px]" : "text-xs"} font-medium line-clamp-1`}>{product.name}</h4>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`${isPreview ? "text-xs" : "text-sm"} font-bold`}>¥{product.discount_enabled && product.discount_price ? product.discount_price : product.price}</span>
                      {product.discount_enabled && product.discount_price && <span className={`${isPreview ? "text-[8px]" : "text-[10px]"} line-through text-white/50`}>¥{product.price}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <div className={`${isPreview ? "mt-4" : "mt-6"} text-center`}>
            <Link to="/shop" className={`inline-flex items-center gap-1 ${isPreview ? "px-4 py-1.5 text-xs" : "px-6 py-2.5 text-sm"} rounded-full bg-white text-foreground-900 font-semibold hover:bg-white/90 transition-colors whitespace-nowrap`}>
              查看更多 <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}