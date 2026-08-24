import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Earning {
  id: number;
  distributor_id: number;
  referred_user_id: string;
  target_type: string;
  amount: number;
  points: number;
  status: string;
  created_at: string;
}

const targetLabels: Record<string, string> = {
  course: "课程",
  product: "商品",
  member: "会员",
  ai_tool: "AI工具",
  column: "专栏",
};

export default function EarningsList() {
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [distributorMap, setDistributorMap] = useState<Record<number, string>>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [earnRes, affRes, userRes] = await Promise.all([
        supabase.from("distribution_earnings").select("*").order("created_at", { ascending: false }),
        supabase.from("affiliates").select("id, name"),
        supabase.from("user_profiles").select("id, nickname"),
      ]);
      if (earnRes.error) throw earnRes.error;
      setEarnings(earnRes.data || []);

      const dMap: Record<number, string> = {};
      (affRes.data || []).forEach((a: any) => {
        dMap[a.id] = a.name;
      });
      setDistributorMap(dMap);

      const uMap: Record<string, string> = {};
      (userRes.data || []).forEach((u: any) => {
        uMap[u.id] = u.nickname || "未命名";
      });
      setUserMap(uMap);
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const settle = async (e: Earning) => {
    await supabase
      .from("distribution_earnings")
      .update({ status: "settled", settled_at: new Date().toISOString() })
      .eq("id", e.id);
    await loadData();
    showToast("已结算");
  };

  const filtered = earnings.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    return true;
  });

  const totalPoints = earnings.reduce((s, e) => s + (e.points || 0), 0);
  const pendingCount = earnings.filter((e) => e.status === "pending").length;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i></div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-16">
        <p className="text-sm text-foreground-500 mb-4">{error}</p>
        <button onClick={loadData} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap">重试</button>
      </div>
    );
  }

  return (
    <div>
      {toast && <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm">{toast}</div>}

      {/* 统计 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "累计返积分", value: `${totalPoints.toLocaleString()}分`, color: "text-accent-600" },
          { label: "待结算笔数", value: pendingCount, color: "text-secondary-600" },
          { label: "收益记录", value: earnings.length, color: "text-foreground-950" },
        ].map((stat) => (
          <div key={stat.label} className="bg-background-50 rounded-xl p-4 border border-background-200/70">
            <p className="text-xs text-foreground-500">{stat.label}</p>
            <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-1 px-1 py-1 rounded-full bg-background-100 mb-5 w-fit">
        {[
          { key: "all", label: "全部" },
          { key: "pending", label: "待结算" },
          { key: "settled", label: "已结算" },
          { key: "cancelled", label: "已取消" },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => setStatusFilter(opt.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              statusFilter === opt.key ? "bg-primary-500 text-white" : "text-foreground-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 收益表格 */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">分销员</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">被推荐用户</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">类型</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">返积分</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">时间</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground-900 text-sm">{distributorMap[e.distributor_id] || `分销员#${e.distributor_id}`}</td>
                  <td className="px-4 py-3 text-foreground-600 text-sm">{userMap[e.referred_user_id] || "未知用户"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 text-xs font-medium">{targetLabels[e.target_type] || e.target_type}</span>
                  </td>
                  <td className="px-4 py-3 text-accent-600 font-semibold">{e.points > 0 ? `${e.points}分` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      e.status === "settled" ? "bg-primary-100 text-primary-700" : e.status === "pending" ? "bg-accent-100 text-accent-900" : "bg-background-200 text-foreground-500"
                    }`}>
                      {e.status === "settled" ? "已结算" : e.status === "pending" ? "待结算" : "已取消"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground-500 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleDateString("zh-CN")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      {e.status === "pending" && (
                        <button onClick={() => settle(e)} className="px-2.5 py-1 rounded-full bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-all whitespace-nowrap">结算</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-foreground-400">暂无收益记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}