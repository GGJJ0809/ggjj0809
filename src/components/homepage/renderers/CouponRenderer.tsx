interface CouponConfig {
  coupons?: { title?: string; amount?: string; condition?: string; expireDate?: string }[];
  style?: string;
}

export default function CouponRenderer({ config, isPreview = false }: { config: CouponConfig; isPreview?: boolean }) {
  const coupons = config.coupons || [];
  if (coupons.length === 0) return null;
  const isCard = config.style !== "inline";

  return (
    <section className={isPreview ? "py-4 px-3" : "py-10 px-4 md:px-6 max-w-7xl mx-auto"}>
      <div className={`text-center ${isPreview ? "mb-3" : "mb-6 md:mb-8"}`}><h2 className={`${isPreview ? "text-base" : "text-xl md:text-2xl"} font-heading font-bold text-foreground-950`}>专属优惠券</h2></div>
      {isCard ? (
        <div className={`grid ${isPreview ? "gap-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"}`}>
          {coupons.map((coupon, i) => (
            <div key={i} className={`relative bg-background-50 rounded-2xl border border-background-200/70 overflow-hidden ${isPreview ? "p-3" : "p-5"}`}>
              <div className={`absolute -top-4 -right-4 ${isPreview ? "w-10 h-10" : "w-16 h-16"} rounded-full bg-primary-100/50`}></div>
              <div className="relative z-10">
                <div className="flex items-baseline gap-1"><span className={`${isPreview ? "text-[10px]" : "text-xs"} text-primary-600`}>¥</span><span className={`${isPreview ? "text-xl" : "text-3xl"} font-bold text-primary-600`}>{coupon.amount}</span></div>
                <h4 className={`${isPreview ? "text-xs" : "text-sm"} font-semibold text-foreground-900 mt-1`}>{coupon.title}</h4>
                <p className={`${isPreview ? "text-[10px]" : "text-xs"} text-foreground-400 mt-0.5`}>{coupon.condition}</p>
                <div className={`flex items-center justify-between ${isPreview ? "mt-2 pt-2" : "mt-3 pt-3"} border-t border-dashed border-background-200/70`}>
                  <span className={`${isPreview ? "text-[8px]" : "text-[10px]"} text-foreground-400`}>有效期至 {coupon.expireDate || "—"}</span>
                  <button className={`${isPreview ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"} rounded-full bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors whitespace-nowrap`}>立即领取</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 justify-center">
          {coupons.map((coupon, i) => (
            <div key={i} className={`flex items-center gap-2 ${isPreview ? "px-3 py-1.5" : "px-4 py-2.5"} rounded-full bg-primary-50 border border-primary-200 hover:bg-primary-100 transition-colors cursor-pointer`}>
              <span className={`${isPreview ? "text-xs" : "text-sm"} font-bold text-primary-600`}>¥{coupon.amount}</span>
              <span className={`${isPreview ? "text-[10px]" : "text-xs"} text-foreground-500`}>{coupon.condition}</span>
              <button className={`${isPreview ? "text-[10px]" : "text-xs"} text-primary-600 font-medium whitespace-nowrap`}>领取</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}