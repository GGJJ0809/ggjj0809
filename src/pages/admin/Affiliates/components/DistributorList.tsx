import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Affiliate {
  id: number;
  name: string;
  phone: string;
  commission_rate: number;
  total_earnings: number;
  status: string;
  level: string;
  referred_count: number;
  created_at: string;
}

interface Earning {
  distributor_id: number;
  amount: number;
  points: number;
  status: string;
}

const statusLabels: Record<string, string> = {
  active: "活跃",
  applying: "待审核",
  inactive: "冻结",
};

const statusColors: Record<string, string> = {
  active: "bg-primary-100 text-primary-700",
  applying: "bg-accent-100 text-accent-900",
  inactive: "bg-background-200 text-foreground-500",
};

const levelLabels: Record<string, string> = {
  general: "普通",
  vip: "VIP",
  partner: "合伙人",
};

const emptyForm = { name: "", phone: "", commission_rate: 10, level: "general" };

export default function DistributorList() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saveLoading, setSaveLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [affRes, earnRes] = await Promise.all([
        supabase.from("affiliates").select("*").order("created_at", { ascending: false }),
        supabase.from("distribution_earnings").select("distributor_id, amount, points, status"),
      ]);
      if (affRes.error) throw affRes.error;
      setAffiliates(affRes.data || []);
      setEarnings(earnRes.data || []);
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

  const totalPointsFor = (id: number) => {
    return earnings
      .filter((e) => e.distributor_id === id)
      .reduce((s, e) => s + (e.points || 0), 0);
  };

  const pendingPoints = (id: number) => {
    return earnings
      .filter((e) => e.distributor_id === id && e.status === "pending")
      .reduce((s, e) => s + (e.points || 0), 0);
  };

  const filtered = affiliates.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (levelFilter !== "all" && a.level !== levelFilter) return false;
    if (search) {
      const kw = search.trim().toLowerCase();
      if (!a.name?.toLowerCase().includes(kw) && !a.phone?.includes(kw)) return false;
    }
    return true;
  });

  const totalPointsEarned = earnings.reduce((s, e) => s + (e.points || 0), 0);
  const applyingCount = affiliates.filter((a) => a.status === "applying").length;
  const totalPendingPoints = earnings.filter((e) => e.status === "pending").reduce((s, e) => s + (e.points || 0), 0);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (a: Affiliate) => {
    setEditingId(a.id);
    setForm({ name: a.name, phone: a.phone || "", commission_rate: a.commission_rate, level: a.level || "general" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      setSaveLoading(true);
      const payload = { ...form, updated_at: new Date().toISOString() };
      if (editingId) {
        await supabase.from("affiliates").update(payload).eq("id", editingId);
      } else {
        await supabase.from("affiliates").insert({ ...payload, status: "active", applied_at: new Date().toISOString(), approved_at: new Date().toISOString() });
      }
      setShowModal(false);
      await loadData();
      showToast(editingId ? "分销员已更新" : "分销员已添加");
    } catch (err: any) {
      showToast("保存失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const approve = async (a: Affiliate) => {
    await supabase.from("affiliates").update({ status: "active", approved_at: new Date().toISOString() }).eq("id", a.id);
    await loadData();
    showToast("已通过审核");
  };

  const reject = async (a: Affiliate) => {
    await supabase.from("affiliates").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", a.id);
    await loadData();
    showToast("已驳回申请");
  };

  const toggleFreeze = async (a: Affiliate) => {
    const newStatus = a.status === "active" ? "inactive" : "active";
    await supabase.from("affiliates").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", a.id);
    await loadData();
    showToast(newStatus === "active" ? "已解冻" : "已冻结");
  };

  const updateField = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

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

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "总分销员", value: affiliates.length, color: "text-foreground-950" },
          { label: "待审核", value: applyingCount, color: "text-accent-600" },
          { label: "总返积分", value: `${totalPointsEarned.toLocaleString()}分`, color: "text-primary-500" },
          { label: "待结算", value: `${totalPendingPoints.toLocaleString()}分`, color: "text-secondary-600" },
        ].map((stat) => (
          <div key={stat.label} className="bg-background-50 rounded-xl p-4 border border-background-200/70">
            <p className="text-xs text-foreground-500">{stat.label}</p>
            <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
          <option value="all">全部状态</option>
          <option value="active">活跃</option>
          <option value="applying">待审核</option>
          <option value="inactive">冻结</option>
        </select>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
          <option value="all">全部等级</option>
          <option value="general">普通</option>
          <option value="vip">VIP</option>
          <option value="partner">合伙人</option>
        </select>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索姓名或手机号" className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" />
        <button onClick={openCreate} className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap">
          <i className="ri-add-line mr-1.5"></i>添加分销员
        </button>
      </div>

      {/* 分销员表格 */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">分销员</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">等级</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">返积分比例</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">推荐人数</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">总返积分</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">待结算</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-background-100 flex items-center justify-center shrink-0">
                        <i className="ri-user-line text-foreground-500 text-sm"></i>
                      </div>
                      <div>
                        <p className="font-medium text-foreground-900 text-sm">{a.name}</p>
                        <p className="text-foreground-400 text-xs">{a.phone || "-"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 text-xs font-medium">{levelLabels[a.level] || "普通"}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground-700 text-sm">{a.commission_rate}%</td>
                  <td className="px-4 py-3 text-foreground-600 text-sm">{a.referred_count || 0}人</td>
                  <td className="px-4 py-3 font-medium text-accent-600 text-sm">{totalPointsFor(a.id).toLocaleString()}分</td>
                  <td className="px-4 py-3 text-secondary-600 text-sm">{pendingPoints(a.id).toLocaleString()}分</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[a.status] || statusColors.inactive}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${a.status === "active" ? "bg-primary-500" : a.status === "applying" ? "bg-accent-500" : "bg-foreground-300"}`}></span>
                      {statusLabels[a.status] || a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {a.status === "applying" ? (
                        <>
                          <button onClick={() => approve(a)} className="px-2.5 py-1 rounded-full bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-all whitespace-nowrap">通过</button>
                          <button onClick={() => reject(a)} className="px-2.5 py-1 rounded-full bg-background-200 text-foreground-600 text-xs font-medium hover:bg-background-300 transition-all whitespace-nowrap">驳回</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => toggleFreeze(a)} className="px-2.5 py-1 rounded-full border border-background-200/70 text-foreground-600 text-xs font-medium hover:bg-background-100 transition-all whitespace-nowrap">
                            {a.status === "active" ? "冻结" : "解冻"}
                          </button>
                          <button onClick={() => openEdit(a)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all" title="编辑">
                            <i className="ri-edit-line"></i>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-foreground-400">没有符合条件的分销员</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 添加/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground-950">{editingId ? "编辑分销员" : "添加分销员"}</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"><i className="ri-close-line"></i></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">姓名 <span className="text-red-400">*</span></label>
                <input type="text" value={form.name} onChange={(e) => updateField("name", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">手机号</label>
                <input type="text" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">返积分比例 (%)</label>
                  <input type="number" value={form.commission_rate} onChange={(e) => updateField("commission_rate", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" max="100" step="0.1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">等级</label>
                  <select value={form.level} onChange={(e) => updateField("level", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
                    <option value="general">普通</option>
                    <option value="vip">VIP</option>
                    <option value="partner">合伙人</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleSave} disabled={saveLoading || !form.name.trim()} className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">{saveLoading ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}