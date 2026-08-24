import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface MemberLevel {
  id: number;
  name: string;
  badge: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  benefits: string[];
}

export default function MemberSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [levels, setLevels] = useState<MemberLevel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-fade-in-up");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = sectionRef.current?.querySelectorAll("[data-animate]");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const fetchLevels = async () => {
      try {
        const { data, error } = await supabase
          .from("member_levels")
          .select("id, name, badge, description, price_monthly, price_yearly, benefits")
          .eq("is_active", true)
          .order("sort_order");

        if (error) throw error;
        setLevels((data || []).map((l) => ({ ...l, benefits: l.benefits || [] })));
      } catch {
        setLevels([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLevels();
  }, []);

  const getBadgeColor = (badge: string) => {
    switch (badge) {
      case "bronze": return "bg-amber-700";
      case "silver": return "bg-slate-400";
      case "gold": return "bg-yellow-500";
      default: return "bg-primary-500";
    }
  };

  const getCardBorder = (badge: string) => {
    switch (badge) {
      case "bronze": return "border-amber-200";
      case "silver": return "border-slate-300";
      case "gold": return "border-yellow-300";
      default: return "border-background-200";
    }
  };

  return (
    <section ref={sectionRef} className="py-16 md:py-24 bg-background-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-12" data-animate>
          <p className="text-xs font-medium tracking-widest text-primary-600 uppercase mb-2">
            Membership
          </p>
          <h2 className="font-heading font-bold text-2xl md:text-3xl text-foreground-950">
            会员权益
          </h2>
          <p className="mt-2 text-sm text-foreground-400 max-w-md mx-auto">
            选择适合你的成长路径，解锁更多专属权益与深度服务
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-3xl p-6 border border-background-200 animate-pulse h-80" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {levels.map((level, index) => (
              <div
                key={level.id}
                data-animate
                className={`relative bg-white rounded-3xl p-6 md:p-8 border-2 ${getCardBorder(level.badge)} hover:shadow-xl transition-all ${
                  index === 1 ? "md:-mt-2 md:mb-2" : ""
                }`}
              >
                {index === 1 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary-500 text-white text-[10px] font-bold tracking-wider">
                    最受欢迎
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${getBadgeColor(level.badge)} flex items-center justify-center`}>
                    <i className="ri-vip-crown-line text-white text-lg"></i>
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-lg text-foreground-950">
                      {level.name}
                    </h3>
                    <p className="text-xs text-foreground-400">{level.description}</p>
                  </div>
                </div>

                <div className="mb-5">
                  {level.price_monthly === 0 ? (
                    <p className="font-heading font-bold text-3xl text-foreground-950">免费</p>
                  ) : (
                    <div>
                      <p className="font-heading font-bold text-3xl text-foreground-950">
                        ¥{level.price_monthly}
                        <span className="text-sm font-normal text-foreground-400">/月</span>
                      </p>
                      <p className="text-xs text-foreground-400 mt-0.5">
                        年付 ¥{level.price_yearly}，相当于 {Math.round((level.price_yearly / (level.price_monthly * 12)) * 100)}%
                      </p>
                    </div>
                  )}
                </div>

                <ul className="space-y-2.5 mb-6">
                  {level.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground-600">
                      <i className="ri-check-line text-green-500 mt-0.5 shrink-0"></i>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/member"
                  className={`block w-full text-center py-3 rounded-full text-sm font-semibold transition-all ${
                    index === 1
                      ? "bg-primary-500 text-white hover:bg-primary-600"
                      : "bg-background-100 text-foreground-700 hover:bg-background-200"
                  }`}
                >
                  {level.price_monthly === 0 ? "立即加入" : "选择此方案"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}