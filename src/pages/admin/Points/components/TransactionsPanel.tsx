import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Transaction {
  id: number;
  user_id: string;
  amount: number;
  type: string;
  source: string;
  note: string;
  balance_after: number;
  created_at: string;
}

interface UserOption {
  id: string;
  nickname: string;
}

const typeLabels: Record<string, string> = {
  earn: "获取",
  spend: "消耗",
  freeze: "冻结",
  unfreeze: "解冻",
  expire: "过期",
};

const sourceLabels: Record<string, string> = {
  register: "注册",
  purchase: "购买",
  referral: "推荐",
  redeem: "兑换",
  upgrade: "升级",
  manual: "手动调整",
  signin: "签到",
};

export default function TransactionsPanel() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nicknameMap, setNicknameMap] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ userId: "", direction: "add", amount: 100, reason: "" });
  const [saveLoading, setSaveLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [txRes, userRes] = await Promise.all([
        supabase.from("points_transactions").select("*").order("created_at", { ascending: false }).limit(300),
        supabase.from("user_profiles").select("id, nickname").order("created_at", { ascending: false }),
      ]);
      if (txRes.error) throw txRes.error;
      setTransactions(txRes.data || []);

      const map: Record<string, string> = {};
      (userRes.data || []).forEach((u: any) => {
        map[u.id] = u.nickname || "未命名";
      });
      setNicknameMap(map);
      setUsers(userRes.data || []);
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

  const totalEarn = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalSpend = Math.abs(transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const circulating = totalEarn - totalSpend;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEarn = transactions
    .filter((t) => t.amount > 0 && new Date(t.created_at) >= today)
    .reduce((s, t) => s + t.amount, 0);

  const filtered = transactions.filter((t) => {
    if (typeFilter === "earn" && t.amount <= 0) return false;
    if (typeFilter === "spend" && t.amount >= 0) return false;
    if (search) {
      const kw = search.trim().toLowerCase();
      const name = (nicknameMap[t.user_id] || "").toLowerCase();
      if (!name.includes(kw) && !(t.note || "").toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  const openAdjust = () => {
    setAdjustForm({ userId: "", direction: "add", amount: 100, reason: "" });
    setShowAdjust(true);
  };

  const submitAdjust = async () => {
    if (!adjustForm.userId) {
      showToast("请选择用户");
      return;
    }
    if (!adjustForm.reason.trim()) {
      showToast("请填写调整原因");
      return;
    }
    try {
      setSaveLoading(true);
      const amount = Math.abs(Number(adjustForm.amount) || 0);
      const delta = adjustForm.direction === "add" ? amount : -amount;
      const nowIso = new Date().toISOString();

      const { data: upData } = await supabase
        .from("user_points")
        .select("*")
        .eq("user_id", adjustForm.userId)
        .maybeSingle();

      const currentAvailable = upData?.available_points || 0;
      const currentTotal = upData?.total_points || 0;
      const newAvailable = currentAvailable + delta;
      const newTotal = adjustForm.direction === "add" ? currentTotal + amount : currentTotal;

      if (upData) {
        await supabase
          .from("user_points")
          .update({ available_points: newAvailable, total_points: newTotal, updated_at: nowIso })
          .eq("user_id", adjustForm.userId);
      } else {
        await supabase.from("user_points").insert({
          user_id: adjustForm.userId,
          available_points: newAvailable,
          total_points: newTotal,
          lifetime_points: newTotal,
        });
      }

      await supabase.from("points_transactions").insert({
        user_id: adjustForm.userId,
        amount: delta,
        type: adjustForm.direction === "add" ? "earn" : "spend",
        source: "manual",
        note: adjustForm.reason,
        balance_after: newAvailable,
      });

      setShowAdjust(false);
      await loadData();
      showToast("积分已调整");
    } catch (err: any) {
      showToast("操作失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const exportCsv = () => {
    const rows = [["用户", "类型", "变动", "来源", "原因", "时间"]];
    filtered.forEach((t) => {
      rows.push([
        nicknameMap[t.user_id] || "未知",
        typeLabels[t.type] || t.type,
        String(t.amount),
        sourceLabels[t.source] || t.source,
        t.note || "",
        new Date(t.created_at).toLocaleDateString("zh-CN"),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "积分交易明细.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <button onClick={loadData} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap">
          重试
        </button>
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm">
          {toast}
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "总发分", value: totalEarn.toLocaleString(), color: "text-primary-500" },
          { label: "总消耗", value: totalSpend.toLocaleString(), color: "text-foreground-950" },
          { label: "流通中", value: circulating.toLocaleString(), color: "text-accent-600" },
          { label: "今日新增", value: `+${todayEarn.toLocaleString()}`, color: "text-primary-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-background-50 rounded-xl p-4 border border-background-200/70">
            <p className="text-xs text-foreground-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1 px-1 py-1 rounded-full bg-background-100">
          {[
            { key: "all", label: "全部" },
            { key: "earn", label: "获取" },
            { key: "spend", label: "消耗" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setTypeFilter(opt.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                typeFilter === opt.key ? "bg-primary-500 text-white" : "text-foreground-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索用户或原因"
          className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
        />
        <button
          onClick={exportCsv}
          className="px-3 py-2 rounded-lg border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap"
        >
          <i className="ri-download-line mr-1.5"></i>导出
        </button>
        <button
          onClick={openAdjust}
          className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap"
        >
          <i className="ri-add-line mr-1.5"></i>手动调整积分
        </button>
      </div>

      {/* 交易表格 */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">用户</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">类型</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">变动</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">来源</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">原因</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">时间</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作人</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground-900 text-sm">{nicknameMap[t.user_id] || "未知用户"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.amount > 0 ? "bg-primary-100 text-primary-700" : "bg-secondary-100 text-secondary-900"
                    }`}>
                      {typeLabels[t.type] || t.type}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-semibold text-sm ${t.amount > 0 ? "text-primary-500" : "text-foreground-800"}`}>
                    {t.amount > 0 ? "+" : ""}{t.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-foreground-600 text-xs">{sourceLabels[t.source] || t.source || "—"}</td>
                  <td className="px-4 py-3 text-foreground-500 text-xs max-w-[200px] truncate">{t.note || "—"}</td>
                  <td className="px-4 py-3 text-foreground-500 text-xs whitespace-nowrap">{new Date(t.created_at).toLocaleDateString("zh-CN")}</td>
                  <td className="px-4 py-3 text-foreground-500 text-xs">{t.source === "manual" ? "管理员" : "系统"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-foreground-400">
                    没有符合条件的交易记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 手动调整弹窗 */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAdjust(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground-950">手动调整积分</h3>
              <button
                onClick={() => setShowAdjust(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">用户 <span className="text-red-400">*</span></label>
                <select
                  value={adjustForm.userId}
                  onChange={(e) => setAdjustForm((prev) => ({ ...prev, userId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                >
                  <option value="">请选择用户</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.nickname || "未命名"}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">调整方向</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "add", label: "增加积分" },
                    { key: "subtract", label: "扣减积分" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setAdjustForm((prev) => ({ ...prev, direction: opt.key }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
                        adjustForm.direction === opt.key
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-background-200/70 text-foreground-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">积分数量</label>
                <input
                  type="number"
                  value={adjustForm.amount}
                  onChange={(e) => setAdjustForm((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">调整原因 <span className="text-red-400">*</span></label>
                <textarea
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm((prev) => ({ ...prev, reason: e.target.value }))}
                  rows={2}
                  maxLength={500}
                  placeholder="如：活动补偿 / 人工调账"
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAdjust(false)}
                className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap"
              >
                取消
              </button>
              <button
                onClick={submitAdjust}
                disabled={saveLoading}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {saveLoading ? "处理中..." : "确认调整"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}