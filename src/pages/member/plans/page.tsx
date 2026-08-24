import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface MemberLevel {
  id: number;
  name: string;
  badge: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  benefits: string[];
  sort_order: number;
}

const BADGE_COLORS: Record<string, { bg: string; text: string; border: string; icon: string; label: string }> = {
  bronze: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "ri-medal-line", label: "入门" },
  silver: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: "ri-shield-star-line", label: "进阶" },
  gold: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", icon: "ri-vip-crown-line", label: "尊享" },
};

function formatPrice(p: number): string {
  if (p === 0) return "免费";
  return `¥${p}`;
}

function perMonthLabel(yearly: number): string {
  if (yearly === 0) return "免费";
  return `¥${Math.round(yearly / 12)}/月`;
}

export default function MemberPlansPage() {
  const [levels, setLevels] = useState<MemberLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: qErr } = await supabase
        .from("member_levels")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (qErr) throw qErr;

      const seen = new Set<string>();
      const unique: MemberLevel[] = [];
      (data || []).forEach((l: any) => {
        if (!seen.has(l.name)) {
          seen.add(l.name);
          unique.push(l);
        }
      });
      setLevels(unique);
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center bg-background-50">
        <div className="flex items-center gap-2 text-foreground-400">
          <i className="ri-loader-4-line animate-spin text-xl"></i>
          <span className="text-sm">加载中…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pt-16 flex flex-col items-center justify-center bg-background-50 px-4">
        <i className="ri-error-warning-line text-3xl text-foreground-400 mb-2"></i>
        <p className="text-sm text-foreground-600">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-primary-500 text-white text-sm rounded-lg"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-16 bg-background-50">
      {/* Hero */}
      <section className="relative overflow-hidden h-[280px] md:h-[360px]">
        <img
          src="https://readdy.ai/api/search-image?query=Elegant%20abstract%20gradient%20background%20with%20soft%20organic%20shapes%2C%20warm%20golden%20and%20cream%20tones%2C%20luxurious%20minimalist%20aesthetic%2C%20smooth%20velvety%20texture%2C%20editorial%20quality%2C%20premium%20feel%2C%20soft%20atmospheric%20lighting&width=1600&height=900&seq=member-banner-hero&orientation=landscape"
          alt="会员中心"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60"></div>
        <div className="relative max-w-7xl mx-auto px-4 md:px-6 h-full flex flex-col justify-end pb-8 md:pb-12">
          <p className="text-xs font-semibold text-yellow-300 tracking-[0.2em] uppercase mb-3">
            MEMBERSHIP
          </p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
                会员中心
              </h1>
              <p className="mt-3 text-white/70 text-sm md:text-base max-w-lg leading-relaxed">
                选择适合你的会员方案，解锁更多学习和成长资源，加速你的影响力增长之旅
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm text-white/60">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{levels.length}</p>
                <p className="text-xs mt-0.5">会员等级</p>
              </div>
              <div className="w-px h-10 bg-white/20"></div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {levels.reduce((s, l) => s + (l.benefits || []).length, 0)}
                </p>
                <p className="text-xs mt-0.5">专属权益</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 -mt-12 relative z-10 pb-8 md:pb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {levels.map((level) => {
            const badge = BADGE_COLORS[level.badge] || BADGE_COLORS.bronze;
            const isPopular = level.badge === "silver";
            return (
              <div
                key={level.id}
                className={`relative bg-white rounded-xl border-2 overflow-hidden transition-all duration-300 hover:shadow-lg ${
                  isPopular ? "border-primary-500 md:scale-105" : "border-background-200/70"
                }`}
              >
                {isPopular && (
                  <div className="absolute top-0 left-0 right-0 bg-primary-500 text-white text-center py-1 text-[10px] font-bold uppercase tracking-wider">
                    最受欢迎
                  </div>
                )}
                <div className={`p-5 md:p-6 ${isPopular ? "pt-8" : ""}`}>
                  <div className={`w-10 h-10 rounded-xl ${badge.bg} flex items-center justify-center mb-3`}>
                    <i className={`${badge.icon} text-lg ${badge.text}`}></i>
                  </div>
                  <h3 className="text-lg font-bold text-foreground-950">{level.name}</h3>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium mt-1 ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                  <p className="text-xs text-foreground-500 mt-2 line-clamp-2">{level.description}</p>

                  <div className="mt-4 pt-4 border-t border-background-200/70">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-foreground-950">
                        {formatPrice(level.price_monthly)}
                      </span>
                      {level.price_monthly > 0 && (
                        <span className="text-xs text-foreground-400">/月</span>
                      )}
                    </div>
                    {level.price_yearly > 0 && (
                      <p className="text-[11px] text-foreground-400 mt-0.5">
                        年付 {formatPrice(level.price_yearly)} ({perMonthLabel(level.price_yearly)})
                      </p>
                    )}
                  </div>

                  <ul className="mt-4 space-y-2">
                    {(level.benefits || []).map((b, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-foreground-600">
                        <i className="ri-check-line text-primary-500 mt-0.5 shrink-0"></i>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => {
                      if (level.price_monthly === 0 || !user) {
                        navigate("/auth?mode=register&redirect=/member/plans");
                      }
                    }}
                    className={`w-full mt-5 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                      isPopular
                        ? "bg-primary-500 text-white hover:bg-primary-600"
                        : level.price_monthly === 0
                        ? "bg-background-100 text-foreground-700 border border-background-200 hover:bg-background-200"
                        : "bg-foreground-900 text-white hover:bg-foreground-800"
                    }`}
                  >
                    {level.price_monthly === 0 ? "免费注册" : "立即订阅"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features Comparison */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12 pb-24 md:pb-12">
        <h2 className="text-xl font-bold text-foreground-950 text-center mb-8">
          权益对比
        </h2>

        {levels.length === 0 ? (
          <div className="text-center py-8 text-foreground-400 text-sm">暂无会员方案</div>
        ) : (
          <div className="bg-white rounded-xl border border-background-200/70 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-background-200/70 bg-background-50">
                  <th className="text-left px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs font-semibold text-foreground-500">权益项目</th>
                  {levels.map((l) => {
                    const badge = BADGE_COLORS[l.badge] || BADGE_COLORS.bronze;
                    return (
                      <th key={l.id} className="text-center px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs font-semibold text-foreground-700">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`w-5 h-5 rounded ${badge.bg} flex items-center justify-center`}>
                            <i className={`${badge.icon} text-[10px] ${badge.text}`}></i>
                          </span>
                          {l.name}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "课程学习", benefits: ["基础课程", "全部课程", "全部课程\n+新课程优先"] },
                  { label: "AI 工具", benefits: ["每日3次试用", "无限次使用", "完全开放"] },
                  { label: "成长顾问", benefits: ["基础报告", "专属顾问", "1对1战略咨询"] },
                  { label: "线下活动", benefits: ["无", "优先报名", "私董会+\n闭门会"] },
                  { label: "分销权限", benefits: ["无", "开启", "高级分成"] },
                  { label: "社区权限", benefits: ["基础", "高级社群", "私董会社群"] },
                  { label: "客服支持", benefits: ["在线客服", "专属客服", "优先通道"] },
                ].map((row, idx) => (
                  <tr key={idx} className="border-b border-background-100 last:border-0">
                    <td className="px-2 md:px-4 py-2 md:py-2.5 text-[10px] md:text-xs font-medium text-foreground-700">{row.label}</td>
                    {row.benefits.map((benefit, bIdx) => {
                      const level = levels[bIdx];
                      if (!level) return <td key={bIdx} className="px-2 md:px-4 py-2 md:py-2.5 text-center text-[10px] md:text-xs text-foreground-400">-</td>;
                      const isHighlight = level.badge === "gold";
                      return (
                        <td key={bIdx} className={`px-2 md:px-4 py-2 md:py-2.5 text-center text-[10px] md:text-xs ${
                          isHighlight ? "text-foreground-800 font-medium" : "text-foreground-500"
                        }`}>
                          {benefit === "无" ? (
                            <span className="text-foreground-300">-</span>
                          ) : (
                            <span className="flex items-center justify-center gap-1 leading-snug">
                              <i className="ri-check-line text-primary-500 text-[8px] md:text-[10px] shrink-0"></i>
                              <span className="whitespace-pre-line">{benefit}</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}