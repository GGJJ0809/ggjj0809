import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface BenefitConfig {
  course_discount: number;
  ai_monthly_quota: number;
  shop_discount: number;
  exclusive_content: boolean;
  points_multiplier: number;
  commission_rate: number;
  badge_text: string;
}

interface MemberLevel {
  id: number;
  name: string;
  badge: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  benefits: string[];
  sort_order: number;
  is_active: boolean;
  level_type: string;
  annual_price: number;
  points_threshold: number;
  benefit_config: BenefitConfig | null;
}

const emptyBenefitConfig: BenefitConfig = {
  course_discount: 100,
  ai_monthly_quota: 0,
  shop_discount: 100,
  exclusive_content: false,
  points_multiplier: 1,
  commission_rate: 0,
  badge_text: "",
};

const typeLabels: Record<string, string> = {
  paid: "付费会员",
  points: "积分会员",
  both: "双轨会员",
};

const typeColors: Record<string, string> = {
  paid: "bg-primary-100 text-primary-700",
  points: "bg-accent-100 text-accent-900",
  both: "bg-secondary-100 text-secondary-900",
};

export default function LevelManager() {
  const [levels, setLevels] = useState<MemberLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    badge: "",
    description: "",
    level_type: "paid",
    annual_price: 0,
    points_threshold: 0,
    sort_order: 0,
    is_active: true,
    benefits: [] as string[],
    benefit_config: { ...emptyBenefitConfig },
  });
  const [benefitInput, setBenefitInput] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<MemberLevel | null>(null);
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbErr } = await supabase
        .from("member_levels")
        .select("*")
        .order("sort_order");
      if (dbErr) throw dbErr;
      setLevels(data || []);
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

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: "",
      badge: "",
      description: "",
      level_type: "paid",
      annual_price: 0,
      points_threshold: 0,
      sort_order: 0,
      is_active: true,
      benefits: [],
      benefit_config: { ...emptyBenefitConfig },
    });
    setBenefitInput("");
    setShowModal(true);
  };

  const openEdit = (level: MemberLevel) => {
    setEditingId(level.id);
    setForm({
      name: level.name,
      badge: level.badge || "",
      description: level.description || "",
      level_type: level.level_type || "paid",
      annual_price: Number(level.annual_price) || 0,
      points_threshold: level.points_threshold || 0,
      sort_order: level.sort_order || 0,
      is_active: level.is_active,
      benefits: level.benefits || [],
      benefit_config: { ...emptyBenefitConfig, ...(level.benefit_config || {}) },
    });
    setBenefitInput("");
    setShowModal(true);
  };

  const updateField = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateConfig = (key: string, value: any) =>
    setForm((prev) => ({
      ...prev,
      benefit_config: { ...prev.benefit_config, [key]: value },
    }));

  const addBenefit = () => {
    if (!benefitInput.trim()) return;
    setForm((prev) => ({ ...prev, benefits: [...prev.benefits, benefitInput.trim()] }));
    setBenefitInput("");
  };

  const removeBenefit = (idx: number) => {
    setForm((prev) => ({ ...prev, benefits: prev.benefits.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      setSaveLoading(true);
      const payload = {
        name: form.name,
        badge: form.badge,
        description: form.description,
        level_type: form.level_type,
        annual_price: form.annual_price,
        points_threshold: form.points_threshold,
        price_yearly: form.annual_price,
        sort_order: form.sort_order,
        is_active: form.is_active,
        benefits: form.benefits,
        benefit_config: form.benefit_config,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        await supabase.from("member_levels").update(payload).eq("id", editingId);
      } else {
        await supabase.from("member_levels").insert(payload);
      }
      setShowModal(false);
      await loadData();
      showToast(editingId ? "会员等级已更新" : "会员等级已创建");
    } catch (err: any) {
      showToast("保存失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleActive = async (level: MemberLevel) => {
    await supabase
      .from("member_levels")
      .update({ is_active: !level.is_active, updated_at: new Date().toISOString() })
      .eq("id", level.id);
    await loadData();
    showToast(level.is_active ? "已下架该等级" : "已上架该等级");
  };

  const checkDelete = async (level: MemberLevel) => {
    setDeleteTarget(level);
    setDeleteCount(0);
    setDeleteLoading(true);
    const { count } = await supabase
      .from("user_memberships")
      .select("id", { count: "exact", head: true })
      .eq("level_id", level.id)
      .eq("status", "active");
    setDeleteCount(count || 0);
    setDeleteLoading(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("member_levels").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
    showToast("等级已删除");
  };

  const supportsPaid = form.level_type === "paid" || form.level_type === "both";
  const supportsPoints = form.level_type === "points" || form.level_type === "both";

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

      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-foreground-500">
          共 {levels.length} 个会员等级，支持付费年费与积分门槛双轨获取
        </p>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap"
        >
          <i className="ri-add-line mr-1.5"></i>新建等级
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {levels.map((level) => (
          <div key={level.id} className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{level.badge || "👑"}</span>
                  <span className="font-heading font-semibold text-foreground-950">{level.name}</span>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${typeColors[level.level_type] || typeColors.paid}`}>
                  {typeLabels[level.level_type] || typeLabels.paid}
                </span>
              </div>
              <p className="text-xs text-foreground-500 mb-4 min-h-[32px]">{level.description}</p>

              <div className="space-y-2 mb-4">
                {(level.level_type === "paid" || level.level_type === "both") && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground-500">年费价格</span>
                    <span className="font-semibold text-foreground-950">¥{Number(level.annual_price).toLocaleString()}</span>
                  </div>
                )}
                {(level.level_type === "points" || level.level_type === "both") && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground-500">积分门槛</span>
                    <span className="font-semibold text-foreground-950">{Number(level.points_threshold).toLocaleString()} 分</span>
                  </div>
                )}
              </div>

              {level.benefits && level.benefits.length > 0 && (
                <div className="space-y-1.5 pt-3 border-t border-background-200/70">
                  {level.benefits.slice(0, 4).map((b, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <i className="ri-check-line text-primary-500 mt-0.5 shrink-0"></i>
                      <span className="text-foreground-600">{b}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-background-200/70 px-5 py-3 flex items-center justify-between">
              <button
                onClick={() => handleToggleActive(level)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  level.is_active ? "bg-primary-100 text-primary-700" : "bg-background-200 text-foreground-500"
                }`}
              >
                {level.is_active ? "已上架" : "已下架"}
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(level)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                  title="编辑"
                >
                  <i className="ri-edit-line"></i>
                </button>
                <button
                  onClick={() => checkDelete(level)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"
                  title="删除"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 创建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-xl max-h-[88vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10">
              <h2 className="font-heading font-semibold text-foreground-950">{editingId ? "编辑等级" : "新建等级"}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">等级名称 <span className="text-red-400">*</span></label>
                  <input type="text" value={form.name} onChange={(e) => updateField("name", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="高级会员" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">徽章/Emoji</label>
                  <input type="text" value={form.badge} onChange={(e) => updateField("badge", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="👑" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">描述</label>
                <input type="text" value={form.description} onChange={(e) => updateField("description", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="适合进阶成长者" />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-2">会员类型</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "paid", label: "付费会员" },
                    { key: "points", label: "积分会员" },
                    { key: "both", label: "双轨会员" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => updateField("level_type", opt.key)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
                        form.level_type === opt.key
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-background-200/70 text-foreground-600 hover:border-background-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {supportsPaid && (
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">年费价格 (¥)</label>
                    <input type="number" value={form.annual_price} onChange={(e) => updateField("annual_price", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="1" />
                  </div>
                )}
                {supportsPoints && (
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">积分门槛 (分)</label>
                    <input type="number" value={form.points_threshold} onChange={(e) => updateField("points_threshold", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="100" />
                  </div>
                )}
                {!supportsPaid && !supportsPoints && (
                  <div className="col-span-2 text-xs text-foreground-400">请选择会员类型</div>
                )}
              </div>

              {/* 结构化权益配置 */}
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-2">权益配置</label>
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-background-100/60">
                  <div>
                    <label className="block text-xs text-foreground-500 mb-1">课程折扣 (%)</label>
                    <input type="number" value={form.benefit_config.course_discount} onChange={(e) => updateConfig("course_discount", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" max="100" />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-500 mb-1">AI工具次数 (次/月)</label>
                    <input type="number" value={form.benefit_config.ai_monthly_quota} onChange={(e) => updateConfig("ai_monthly_quota", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-500 mb-1">商城折扣 (%)</label>
                    <input type="number" value={form.benefit_config.shop_discount} onChange={(e) => updateConfig("shop_discount", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" max="100" />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-500 mb-1">积分倍率</label>
                    <input type="number" value={form.benefit_config.points_multiplier} onChange={(e) => updateConfig("points_multiplier", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="0.1" />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-500 mb-1">分销佣金比例 (%)</label>
                    <input type="number" value={form.benefit_config.commission_rate} onChange={(e) => updateConfig("commission_rate", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" max="100" />
                  </div>
                  <div>
                    <label className="block text-xs text-foreground-500 mb-1">会员标识</label>
                    <input type="text" value={form.benefit_config.badge_text} onChange={(e) => updateConfig("badge_text", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="高级会员" />
                  </div>
                  <div className="col-span-2 flex items-center gap-3 pt-1">
                    <span className="text-xs text-foreground-500">专属内容</span>
                    <button
                      onClick={() => updateConfig("exclusive_content", !form.benefit_config.exclusive_content)}
                      className={`relative w-11 h-6 rounded-full transition-all ${
                        form.benefit_config.exclusive_content ? "bg-primary-500" : "bg-background-300"
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.benefit_config.exclusive_content ? "left-5" : "left-0.5"}`}></span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 展示权益列表 */}
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-2">展示权益列表（前端显示）</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={benefitInput} onChange={(e) => setBenefitInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBenefit(); } }}
                    className="flex-1 px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="输入权益后按回车添加" />
                  <button onClick={addBenefit} className="px-3 py-2 rounded-lg bg-background-100 text-foreground-600 text-xs font-medium hover:bg-background-200 transition-all whitespace-nowrap">
                    添加
                  </button>
                </div>
                {form.benefits.length > 0 && (
                  <div className="space-y-1.5">
                    {form.benefits.map((b, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-background-100 text-xs text-foreground-700">
                        <span>{b}</span>
                        <button onClick={() => removeBenefit(i)} className="text-foreground-400 hover:text-red-500 transition-colors">
                          <i className="ri-close-line"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">排序</label>
                  <input type="number" value={form.sort_order} onChange={(e) => updateField("sort_order", Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <span className="text-xs text-foreground-500">上架状态</span>
                  <button
                    onClick={() => updateField("is_active", !form.is_active)}
                    className={`relative w-11 h-6 rounded-full transition-all ${form.is_active ? "bg-primary-500" : "bg-background-300"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.is_active ? "left-5" : "left-0.5"}`}></span>
                  </button>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-background-50 border-t border-background-200/70 px-5 py-4 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">
                取消
              </button>
              <button onClick={handleSave} disabled={saveLoading || !form.name.trim()}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">
                {saveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <i className="ri-alert-line text-red-500 text-xl"></i>
              </div>
              <div>
                <h3 className="font-semibold text-foreground-950">删除「{deleteTarget.name}」</h3>
                <p className="text-xs text-foreground-500 mt-0.5">删除后不可恢复</p>
              </div>
            </div>
            {deleteLoading ? (
              <p className="text-sm text-foreground-500 py-4 text-center">正在检查会员关联...</p>
            ) : deleteCount > 0 ? (
              <p className="text-sm text-foreground-700 bg-background-100 rounded-lg p-4">
                该等级下有 <span className="font-bold text-red-500">{deleteCount}</span> 名会员，请先迁移或取消后再删除。
              </p>
            ) : (
              <p className="text-sm text-foreground-500">确认删除该等级吗？</p>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">
                取消
              </button>
              {!deleteLoading && deleteCount === 0 && (
                <button onClick={confirmDelete} className="px-5 py-2 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-all whitespace-nowrap">
                  删除
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}