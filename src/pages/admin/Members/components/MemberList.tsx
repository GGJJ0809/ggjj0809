import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  nickname: string;
  phone: string;
  member_level_id: number;
  member_expire_at: string | null;
  total_points: number;
  growth_points: number;
  created_at: string;
}

interface LevelMap {
  [id: number]: { name: string; badge: string };
}

interface LogEntry {
  id: number;
  action: string;
  operator: string;
  reason: string;
  level_id: number;
  created_at: string;
}

const actionLabels: Record<string, string> = {
  open: "开通会员",
  renew: "续费",
  upgrade: "升级",
  cancel: "取消会员",
  expire: "到期",
};

export default function MemberList() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [levelMap, setLevelMap] = useState<LevelMap>({});
  const [levels, setLevels] = useState<any[]>([]);
  const [sourceMap, setSourceMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [actionModal, setActionModal] = useState<{ type: string; user: Profile } | null>(null);
  const [actionForm, setActionForm] = useState({ levelId: 2, source: "paid", expiry: "", reason: "" });
  const [saveLoading, setSaveLoading] = useState(false);

  const [detailUser, setDetailUser] = useState<Profile | null>(null);
  const [detailLogs, setDetailLogs] = useState<LogEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const now = new Date();

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [profilesRes, levelsRes, membershipsRes] = await Promise.all([
        supabase.from("user_profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("member_levels").select("id, name, badge, level_type, points_threshold, sort_order, annual_price").order("sort_order"),
        supabase.from("user_memberships").select("user_id, source, status").eq("status", "active"),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      setProfiles(profilesRes.data || []);

      const map: LevelMap = {};
      (levelsRes.data || []).forEach((l: any) => {
        map[l.id] = { name: l.name, badge: l.badge };
      });
      setLevelMap(map);
      setLevels(levelsRes.data || []);

      const srcMap: Record<string, string> = {};
      (membershipsRes.data || []).forEach((m: any) => {
        if (!srcMap[m.user_id]) srcMap[m.user_id] = m.source;
      });
      setSourceMap(srcMap);
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

  const getStatus = (p: Profile): string => {
    if (!p.member_expire_at) return "basic";
    const expire = new Date(p.member_expire_at);
    return expire > now ? "active" : "expired";
  };

  const getType = (p: Profile): string => {
    return sourceMap[p.id] || "";
  };

  const statusLabel: Record<string, string> = {
    basic: "基础",
    active: "有效",
    expired: "已过期",
  };

  const statusColor: Record<string, string> = {
    basic: "bg-background-200 text-foreground-500",
    active: "bg-primary-100 text-primary-700",
    expired: "bg-secondary-100 text-secondary-700",
  };

  const filtered = profiles.filter((p) => {
    if (levelFilter !== "all" && String(p.member_level_id) !== levelFilter) return false;
    const status = getStatus(p);
    if (statusFilter !== "all" && status !== statusFilter) return false;
    const type = getType(p);
    if (typeFilter === "paid" && type !== "paid") return false;
    if (typeFilter === "points" && type !== "points") return false;
    if (typeFilter === "none" && type !== "") return false;
    if (search) {
      const kw = search.trim().toLowerCase();
      if (!p.nickname?.toLowerCase().includes(kw) && !p.phone?.includes(kw)) return false;
    }
    return true;
  });

  const paidCount = profiles.filter((p) => getType(p) === "paid").length;
  const pointsCount = profiles.filter((p) => getType(p) === "points").length;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthNew = profiles.filter((p) => new Date(p.created_at) >= monthStart).length;

  const toDateInput = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const openAction = (type: string, user: Profile) => {
    const defaultExpiry = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const sortedLevels = [...levels].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const currentIdx = sortedLevels.findIndex((l) => l.id === user.member_level_id);
    const nextLevel = currentIdx >= 0 && currentIdx < sortedLevels.length - 1 ? sortedLevels[currentIdx + 1] : null;
    setActionForm({
      levelId: type === "upgrade" ? (nextLevel?.id || user.member_level_id) : (sortedLevels[1]?.id || 2),
      source: "paid",
      expiry: toDateInput(defaultExpiry),
      reason: "",
    });
    setActionModal({ type, user });
  };

  const submitAction = async () => {
    if (!actionModal) return;
    const { type, user } = actionModal;
    try {
      setSaveLoading(true);
      const operator = "管理员";

      if (type === "cancel") {
        if (!actionForm.reason.trim()) {
          showToast("请填写取消原因");
          setSaveLoading(false);
          return;
        }
        await supabase
          .from("user_profiles")
          .update({ member_expire_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("id", user.id);
        await supabase.from("membership_logs").insert({
          user_id: user.id,
          level_id: user.member_level_id,
          action: "cancel",
          operator,
          reason: actionForm.reason,
        });
      } else if (type === "renew") {
        const expiry = new Date(actionForm.expiry + "T23:59:59");
        await supabase
          .from("user_profiles")
          .update({ member_expire_at: expiry.toISOString(), updated_at: now.toISOString() })
          .eq("id", user.id);
        await supabase.from("user_memberships").insert({
          user_id: user.id,
          level_id: user.member_level_id,
          source: getType(user) || "paid",
          start_at: now.toISOString(),
          end_at: expiry.toISOString(),
          status: "active",
        });
        await supabase.from("membership_logs").insert({
          user_id: user.id,
          level_id: user.member_level_id,
          action: "renew",
          operator,
          reason: actionForm.reason || "后台续费",
        });
      } else if (type === "open" || type === "upgrade") {
        const expiry = new Date(actionForm.expiry + "T23:59:59");
        await supabase
          .from("user_profiles")
          .update({ member_level_id: actionForm.levelId, member_expire_at: expiry.toISOString(), updated_at: now.toISOString() })
          .eq("id", user.id);
        await supabase.from("user_memberships").insert({
          user_id: user.id,
          level_id: actionForm.levelId,
          source: actionForm.source,
          start_at: now.toISOString(),
          end_at: expiry.toISOString(),
          status: "active",
        });
        await supabase.from("membership_logs").insert({
          user_id: user.id,
          level_id: actionForm.levelId,
          action: type,
          operator,
          reason: actionForm.reason || (type === "open" ? "后台手动开通" : "后台手动升级"),
        });
      }

      setActionModal(null);
      await loadData();
      showToast(
        type === "cancel" ? "已取消会员" : type === "renew" ? "已续费" : type === "upgrade" ? "已升级" : "已开通会员"
      );
    } catch (err: any) {
      showToast("操作失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const openDetail = async (user: Profile) => {
    setDetailUser(user);
    setDetailLoading(true);
    setDetailLogs([]);
    const { data } = await supabase
      .from("membership_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setDetailLogs(data || []);
    setDetailLoading(false);
  };

  useEffect(() => {
    if (actionForm.source === "points" && actionModal?.user) {
      const userPoints = actionModal.user.total_points || 0;
      const qualifying = levels
        .filter((l) => l.id > 1 && (l.points_threshold || 0) <= userPoints)
        .sort((a, b) => (b.points_threshold || 0) - (a.points_threshold || 0));
      if (qualifying.length > 0) {
        setActionForm((prev) => ({ ...prev, levelId: qualifying[0].id }));
      }
    }
  }, [actionForm.source, actionModal?.user, levels]);

  const actionTitle: Record<string, string> = {
    open: "开通会员",
    renew: "续费会员",
    upgrade: "升级会员",
    cancel: "取消会员",
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
          { label: "总会员", value: profiles.length, color: "text-foreground-950" },
          { label: "付费会员", value: paidCount, color: "text-primary-500" },
          { label: "积分会员", value: pointsCount, color: "text-accent-600" },
          { label: "本月新增", value: `+${monthNew}`, color: "text-primary-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-background-50 rounded-xl p-4 border border-background-200/70">
            <p className="text-xs text-foreground-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
        >
          <option value="all">全部等级</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.badge} {l.name}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
        >
          <option value="all">全部类型</option>
          <option value="paid">付费会员</option>
          <option value="points">积分会员</option>
          <option value="none">未开通</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
        >
          <option value="all">全部状态</option>
          <option value="active">有效</option>
          <option value="expired">已过期</option>
          <option value="basic">基础</option>
        </select>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名或手机号"
            className="flex-1 px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
          />
          <i className="ri-search-line text-foreground-400"></i>
        </div>
      </div>

      {/* 会员表格 */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">用户</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">等级</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">类型</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">有效期至</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">积分</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const status = getStatus(p);
                const type = getType(p);
                const level = levelMap[p.member_level_id];
                return (
                  <tr key={p.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-background-100 flex items-center justify-center shrink-0">
                          <i className="ri-user-line text-foreground-500 text-sm"></i>
                        </div>
                        <div>
                          <p className="font-medium text-foreground-900 text-sm">{p.nickname || "未命名"}</p>
                          <p className="text-foreground-400 text-xs">{p.phone || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-foreground-800 text-sm">{level ? `${level.badge} ${level.name}` : "基础会员"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {type === "paid" ? (
                        <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">付费</span>
                      ) : type === "points" ? (
                        <span className="px-2 py-0.5 rounded-full bg-accent-100 text-accent-900 text-xs font-medium">积分</span>
                      ) : (
                        <span className="text-foreground-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground-600 text-xs whitespace-nowrap">
                      {p.member_expire_at ? new Date(p.member_expire_at).toLocaleDateString("zh-CN") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColor[status]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-primary-500" : status === "expired" ? "bg-secondary-500" : "bg-foreground-300"}`}></span>
                        {statusLabel[status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground-700 font-medium text-sm">{Number(p.total_points || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openDetail(p)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                          title="详情"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        {status === "basic" && (
                          <button
                            onClick={() => openAction("open", p)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                            title="开通"
                          >
                            <i className="ri-add-circle-line"></i>
                          </button>
                        )}
                        {status !== "basic" && (
                          <>
                            <button
                              onClick={() => openAction("renew", p)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                              title="续费"
                            >
                              <i className="ri-refresh-line"></i>
                            </button>
                            <button
                              onClick={() => openAction("upgrade", p)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                              title="升级"
                            >
                              <i className="ri-arrow-up-circle-line"></i>
                            </button>
                            {status === "active" && (
                              <button
                                onClick={() => openAction("cancel", p)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                title="取消"
                              >
                                <i className="ri-close-circle-line"></i>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-foreground-400">
                    没有符合条件的会员
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 操作弹窗 */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setActionModal(null)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground-950">{actionTitle[actionModal.type]}</h3>
              <button
                onClick={() => setActionModal(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            <div className="flex items-center gap-3 mb-5 p-3 rounded-lg bg-background-100">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <i className="ri-user-line text-primary-600"></i>
              </div>
              <div>
                <p className="font-medium text-foreground-900 text-sm">{actionModal.user.nickname || "未命名"}</p>
                <p className="text-xs text-foreground-500">
                  当前：{levelMap[actionModal.user.member_level_id]?.name || "基础会员"}
                  {actionModal.user.member_expire_at ? ` · 至 ${new Date(actionModal.user.member_expire_at).toLocaleDateString("zh-CN")}` : ""}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {actionForm.source === "points" && actionModal?.user && (
                <div className="p-3 rounded-lg bg-accent-50 border border-accent-100">
                  <p className="text-xs text-accent-800">
                    用户当前积分：<span className="font-semibold">{Number(actionModal.user.total_points || 0).toLocaleString()}</span> 分
                  </p>
                  <p className="text-xs text-accent-600 mt-1">
                    可兑换最高等级：{
                      (() => {
                        const userPoints = actionModal.user.total_points || 0;
                        const qualifying = levels
                          .filter((l) => l.id > 1 && (l.points_threshold || 0) <= userPoints)
                          .sort((a, b) => (b.points_threshold || 0) - (a.points_threshold || 0));
                        return qualifying.length > 0 ? `${qualifying[0].badge} ${qualifying[0].name}` : "无";
                      })()
                    }
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">目标等级</label>
                <select
                  value={actionForm.levelId}
                  onChange={(e) => setActionForm((prev) => ({ ...prev, levelId: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                >
                  {levels
                    .filter((l) => l.id > 1)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.badge} {l.name} {l.points_threshold ? `(≥${Number(l.points_threshold).toLocaleString()}分)` : ""}
                      </option>
                    ))}
                </select>
              </div>

              {(actionModal.type === "open" || actionModal.type === "upgrade") && (
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">获得方式</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "paid", label: "付费" },
                      { key: "points", label: "积分" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setActionForm((prev) => ({ ...prev, source: opt.key }))}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
                          actionForm.source === opt.key
                            ? "border-primary-500 bg-primary-50 text-primary-700"
                            : "border-background-200/70 text-foreground-600"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {actionModal.type !== "cancel" && (
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">有效期至</label>
                  <input
                    type="date"
                    value={actionForm.expiry}
                    onChange={(e) => setActionForm((prev) => ({ ...prev, expiry: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">
                  {actionModal.type === "cancel" ? "取消原因" : "操作原因"} {actionModal.type === "cancel" && <span className="text-red-400">*</span>}
                </label>
                <textarea
                  value={actionForm.reason}
                  onChange={(e) => setActionForm((prev) => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                  maxLength={500}
                  placeholder={actionModal.type === "cancel" ? "请填写取消原因" : "如：补偿用户 / 活动奖励"}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap"
              >
                取消
              </button>
              <button
                onClick={submitAction}
                disabled={saveLoading}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {saveLoading ? "处理中..." : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailUser(null)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10">
              <h3 className="font-semibold text-foreground-950">会员详情</h3>
              <button
                onClick={() => setDetailUser(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                  <i className="ri-user-line text-primary-600 text-2xl"></i>
                </div>
                <div>
                  <p className="font-heading font-semibold text-lg text-foreground-950">{detailUser.nickname || "未命名"}</p>
                  <p className="text-xs text-foreground-500">{detailUser.phone || "无手机号"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3 rounded-lg bg-background-100">
                  <p className="text-xs text-foreground-500">当前等级</p>
                  <p className="font-semibold text-foreground-950 mt-1">
                    {levelMap[detailUser.member_level_id]?.name || "基础会员"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-background-100">
                  <p className="text-xs text-foreground-500">获得方式</p>
                  <p className="font-semibold text-foreground-950 mt-1">
                    {getType(detailUser) === "paid" ? "付费" : getType(detailUser) === "points" ? "积分" : "—"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-background-100">
                  <p className="text-xs text-foreground-500">有效期至</p>
                  <p className="font-semibold text-foreground-950 mt-1">
                    {detailUser.member_expire_at ? new Date(detailUser.member_expire_at).toLocaleDateString("zh-CN") : "—"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-background-100">
                  <p className="text-xs text-foreground-500">总积分</p>
                  <p className="font-semibold text-primary-500 mt-1">{Number(detailUser.total_points || 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="border-t border-background-200/70 pt-4">
                <h4 className="text-sm font-semibold text-foreground-950 mb-3">变更历史</h4>
                {detailLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <i className="ri-loader-4-line animate-spin text-xl text-foreground-400"></i>
                  </div>
                ) : detailLogs.length === 0 ? (
                  <p className="text-sm text-foreground-400 py-4 text-center">暂无变更记录</p>
                ) : (
                  <div className="space-y-3">
                    {detailLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                          <i className="ri-time-line text-primary-600 text-xs"></i>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground-800">{actionLabels[log.action] || log.action}</p>
                            <span className="text-xs text-foreground-400">
                              {new Date(log.created_at).toLocaleDateString("zh-CN")}
                            </span>
                          </div>
                          {log.reason && <p className="text-xs text-foreground-500 mt-0.5">{log.reason}</p>}
                          <p className="text-xs text-foreground-400 mt-0.5">操作人：{log.operator || "系统"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}