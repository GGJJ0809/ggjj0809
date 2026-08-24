import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Transaction {
  user_id: string;
  amount: number;
  source: string;
}

interface PointAccount {
  user_id: string;
  available_points: number;
  total_points: number;
}

const sourceLabels: Record<string, string> = {
  register: "注册",
  purchase: "购买",
  referral: "推荐",
  redeem: "兑换",
  upgrade: "升级",
  manual: "手动调整",
};

export default function PointsStats() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<PointAccount[]>([]);
  const [nicknameMap, setNicknameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [txRes, accRes, userRes] = await Promise.all([
          supabase.from("points_transactions").select("user_id, amount, source"),
          supabase.from("user_points").select("user_id, available_points, total_points").order("available_points", { ascending: false }),
          supabase.from("user_profiles").select("id, nickname"),
        ]);
        if (txRes.error) throw txRes.error;
        setTransactions(txRes.data || []);
        setAccounts(accRes.data || []);

        const map: Record<string, string> = {};
        (userRes.data || []).forEach((u: any) => {
          map[u.id] = u.nickname || "未命名";
        });
        setNicknameMap(map);
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

  const totalEarn = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalSpend = Math.abs(transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const circulating = accounts.reduce((s, a) => s + (a.available_points || 0), 0);

  // 发分来源分布
  const earnBySource: Record<string, number> = {};
  transactions.filter((t) => t.amount > 0).forEach((t) => {
    const key = t.source || "other";
    earnBySource[key] = (earnBySource[key] || 0) + t.amount;
  });
  const earnSources = Object.entries(earnBySource).sort((a, b) => b[1] - a[1]);
  const maxEarn = Math.max(...earnSources.map(([, v]) => v), 1);

  // 消耗去向
  const spendBySource: Record<string, number> = {};
  transactions.filter((t) => t.amount < 0).forEach((t) => {
    const key = t.source || "other";
    spendBySource[key] = (spendBySource[key] || 0) + Math.abs(t.amount);
  });
  const spendSources = Object.entries(spendBySource).sort((a, b) => b[1] - a[1]);
  const maxSpend = Math.max(...spendSources.map(([, v]) => v), 1);

  const topUsers = accounts.slice(0, 10);

  return (
    <div>
      {/* 总览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "总发分", value: totalEarn.toLocaleString(), color: "text-primary-500" },
          { label: "总消耗", value: totalSpend.toLocaleString(), color: "text-foreground-950" },
          { label: "当前流通积分", value: circulating.toLocaleString(), color: "text-accent-600" },
          { label: "积分账户数", value: accounts.length, color: "text-foreground-950" },
        ].map((stat) => (
          <div key={stat.label} className="bg-background-50 rounded-xl p-4 border border-background-200/70">
            <p className="text-xs text-foreground-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* 发分来源分布 */}
        <div className="bg-background-50 rounded-xl border border-background-200/70 p-5">
          <h4 className="text-sm font-semibold text-foreground-950 mb-4">发分来源分布</h4>
          {earnSources.length === 0 ? (
            <p className="text-sm text-foreground-400 py-4 text-center">暂无数据</p>
          ) : (
            <div className="space-y-4">
              {earnSources.map(([key, val]) => {
                const pct = totalEarn === 0 ? 0 : Math.round((val / totalEarn) * 100);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-foreground-600">{sourceLabels[key] || key}</span>
                      <span className="font-medium text-foreground-950">{val.toLocaleString()}（{pct}%）</span>
                    </div>
                    <div className="h-2 rounded-full bg-background-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max((val / maxEarn) * 100, 2)}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 消耗去向 */}
        <div className="bg-background-50 rounded-xl border border-background-200/70 p-5">
          <h4 className="text-sm font-semibold text-foreground-950 mb-4">消耗去向分布</h4>
          {spendSources.length === 0 ? (
            <p className="text-sm text-foreground-400 py-4 text-center">暂无数据</p>
          ) : (
            <div className="space-y-4">
              {spendSources.map(([key, val]) => {
                const pct = totalSpend === 0 ? 0 : Math.round((val / totalSpend) * 100);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-foreground-600">{sourceLabels[key] || key}</span>
                      <span className="font-medium text-foreground-950">{val.toLocaleString()}（{pct}%）</span>
                    </div>
                    <div className="h-2 rounded-full bg-background-100 overflow-hidden">
                      <div className="h-full rounded-full bg-secondary-500" style={{ width: `${Math.max((val / maxSpend) * 100, 2)}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 用户积分排行 */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200/70">
          <h4 className="text-sm font-semibold text-foreground-950">用户积分排行 Top 10</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">排名</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">用户</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">可用积分</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">累计积分</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.map((a, i) => (
                <tr key={a.user_id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      i === 0 ? "bg-accent-100 text-accent-900" : i === 1 ? "bg-secondary-100 text-secondary-900" : i === 2 ? "bg-primary-100 text-primary-700" : "bg-background-100 text-foreground-500"
                    }`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground-900 text-sm">{nicknameMap[a.user_id] || "未知用户"}</td>
                  <td className="px-4 py-3 font-semibold text-primary-500">{Number(a.available_points || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-foreground-600">{Number(a.total_points || 0).toLocaleString()}</td>
                </tr>
              ))}
              {topUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-foreground-400">暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}