import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Profile {
  member_level_id: number;
  member_expire_at: string | null;
  total_points: number;
  created_at: string;
}

interface Membership {
  user_id: string;
  source: string;
  status: string;
}

export default function StatsPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [pRes, mRes, lRes] = await Promise.all([
          supabase.from("user_profiles").select("member_level_id, member_expire_at, total_points, created_at"),
          supabase.from("user_memberships").select("user_id, source, status"),
          supabase.from("member_levels").select("id, name, sort_order").order("sort_order"),
        ]);
        if (pRes.error) throw pRes.error;
        setProfiles(pRes.data || []);
        setMemberships(mRes.data || []);
        setLevels(lRes.data || []);
      } catch (err: any) {
        setError(err?.message || "加载失败");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-16">
        <p className="text-sm text-foreground-500 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap">
          重试
        </button>
      </div>
    );
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const total = profiles.length;
  const paidCount = memberships.filter((m) => m.source === "paid" && m.status === "active").length;
  const pointsCount = memberships.filter((m) => m.source === "points" && m.status === "active").length;
  const monthNew = profiles.filter((p) => new Date(p.created_at) >= monthStart).length;
  const lastMonthNew = profiles.filter((p) => new Date(p.created_at) >= lastMonthStart && new Date(p.created_at) < monthStart).length;
  const monthGrowth = lastMonthNew === 0 ? 100 : Math.round(((monthNew - lastMonthNew) / lastMonthNew) * 100);

  const levelColors = ["bg-secondary-500", "bg-primary-500", "bg-accent-500", "bg-foreground-600"];
  const levelDistribution = levels.map((l, idx) => ({
    level: l.name,
    count: profiles.filter((p) => p.member_level_id === l.id).length,
    color: levelColors[idx % levelColors.length],
  }));

  // 近6个月新增趋势
  const months: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const count = profiles.filter((p) => {
      const c = new Date(p.created_at);
      return c >= d && c < next;
    }).length;
    months.push({ label: `${d.getMonth() + 1}月`, count });
  }
  const maxMonthCount = Math.max(...months.map((m) => m.count), 1);

  const activeCount = profiles.filter((p) => p.member_expire_at && new Date(p.member_expire_at) > now).length;
  const paidRatio = total === 0 ? 0 : Math.round((paidCount / total) * 100);
  const pointsRatio = total === 0 ? 0 : Math.round((pointsCount / total) * 100);

  const totalPoints = profiles.reduce((s, p) => s + (Number(p.total_points) || 0), 0);

  return (
    <div>
      {/* 总览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "总会员数", value: total, sub: "累计注册用户" },
          { label: "有效会员", value: activeCount, sub: "当前权益生效中" },
          { label: "本月新增", value: monthNew, sub: `环比 ${monthGrowth >= 0 ? "+" : ""}${monthGrowth}%` },
          { label: "会员总积分", value: totalPoints.toLocaleString(), sub: "累计发放积分" },
        ].map((stat) => (
          <div key={stat.label} className="bg-background-50 rounded-xl p-4 border border-background-200/70">
            <p className="text-xs text-foreground-500">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground-950 mt-1">{stat.value}</p>
            <p className="text-xs text-foreground-400 mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* 付费 vs 积分占比 */}
        <div className="bg-background-50 rounded-xl border border-background-200/70 p-5">
          <h4 className="text-sm font-semibold text-foreground-950 mb-4">付费 vs 积分会员占比</h4>
          <div className="flex h-4 rounded-full overflow-hidden mb-3">
            <div className="bg-primary-500" style={{ width: `${paidRatio}%` }}></div>
            <div className="bg-accent-500" style={{ width: `${pointsRatio}%` }}></div>
            <div className="bg-background-200 flex-1"></div>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary-500"></span>
              <span className="text-foreground-600">付费会员</span>
              <span className="font-semibold text-foreground-950">{paidCount} 人（{paidRatio}%）</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-accent-500"></span>
              <span className="text-foreground-600">积分会员</span>
              <span className="font-semibold text-foreground-950">{pointsCount} 人（{pointsRatio}%）</span>
            </div>
          </div>
        </div>

        {/* 等级分布 */}
        <div className="bg-background-50 rounded-xl border border-background-200/70 p-5">
          <h4 className="text-sm font-semibold text-foreground-950 mb-4">等级分布</h4>
          <div className="space-y-4">
            {levelDistribution.map((l) => {
              const pct = total === 0 ? 0 : Math.round((l.count / total) * 100);
              return (
                <div key={l.level}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-foreground-600">{l.level}</span>
                    <span className="font-medium text-foreground-950">{l.count} 人（{pct}%）</span>
                  </div>
                  <div className="h-2 rounded-full bg-background-100 overflow-hidden">
                    <div className={`h-full rounded-full ${l.color}`} style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 会员增长趋势 */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 p-5">
        <h4 className="text-sm font-semibold text-foreground-950 mb-4">近 6 个月会员增长趋势</h4>
        <div className="flex items-end justify-between gap-3 h-40">
          {months.map((m) => (
            <div key={m.label} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-medium text-foreground-700">{m.count}</span>
              <div
                className="w-full max-w-[48px] rounded-t-lg bg-primary-500 transition-all"
                style={{ height: `${Math.max((m.count / maxMonthCount) * 120, 4)}px` }}
              ></div>
              <span className="text-xs text-foreground-400">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}