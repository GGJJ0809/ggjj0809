import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface PointsRule {
  id: number;
  rule_key: string;
  rule_name: string;
  rule_type: string;
  points_value: number;
  is_enabled: boolean;
  scope: string;
  description: string;
  sort_order: number;
}

const formatValue = (rule: PointsRule) => {
  if (rule.rule_type === "exchange") return `${rule.points_value}积分 = 1元`;
  if (rule.rule_type === "expire") return `${rule.points_value}个月`;
  if (["course_reward", "member_reward", "shop_reward"].includes(rule.rule_key)) {
    return `${rule.points_value}:1 比例`;
  }
  return `+${rule.points_value} 积分`;
};

const typeLabels: Record<string, string> = {
  earn: "获取",
  spend: "消耗",
  exchange: "兑换",
  expire: "有效期",
};

export default function RulesPanel() {
  const [rules, setRules] = useState<PointsRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [editRule, setEditRule] = useState<PointsRule | null>(null);
  const [form, setForm] = useState({ points_value: 0, scope: "all", is_enabled: true, description: "" });
  const [saveLoading, setSaveLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbErr } = await supabase
        .from("points_rules")
        .select("*")
        .order("sort_order");
      if (dbErr) throw dbErr;
      setRules(data || []);
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

  const openEdit = (rule: PointsRule) => {
    setEditRule(rule);
    setForm({
      points_value: Number(rule.points_value),
      scope: rule.scope || "all",
      is_enabled: rule.is_enabled,
      description: rule.description || "",
    });
  };

  const handleToggle = async (rule: PointsRule) => {
    await supabase
      .from("points_rules")
      .update({ is_enabled: !rule.is_enabled, updated_at: new Date().toISOString() })
      .eq("id", rule.id);
    await loadData();
    showToast(rule.is_enabled ? "规则已停用" : "规则已启用");
  };

  const handleSave = async () => {
    if (!editRule) return;
    try {
      setSaveLoading(true);
      await supabase
        .from("points_rules")
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq("id", editRule.id);
      setEditRule(null);
      await loadData();
      showToast("规则已更新");
    } catch (err: any) {
      showToast("保存失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
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

      <p className="text-sm text-foreground-500 mb-5">
        共 {rules.length} 条积分规则，可调整各行为的积分值与启用状态
      </p>

      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">规则名称</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">类型</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">积分值</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">生效范围</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">说明</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground-900 text-sm">{rule.rule_name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 text-xs font-medium">
                      {typeLabels[rule.rule_type] || rule.rule_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-primary-500">{formatValue(rule)}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground-600 text-xs">
                    {rule.scope === "all" ? "全部用户" : rule.scope === "member" ? "会员" : "新用户"}
                  </td>
                  <td className="px-4 py-3 text-foreground-500 text-xs max-w-[260px] truncate">{rule.description}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(rule)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        rule.is_enabled ? "bg-primary-100 text-primary-700" : "bg-background-200 text-foreground-500"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${rule.is_enabled ? "bg-primary-500" : "bg-foreground-300"}`}></span>
                      {rule.is_enabled ? "启用" : "停用"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => openEdit(rule)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                        title="编辑"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditRule(null)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground-950">编辑「{editRule.rule_name}」</h3>
              <button
                onClick={() => setEditRule(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">积分值</label>
                <input
                  type="number"
                  value={form.points_value}
                  onChange={(e) => setForm((prev) => ({ ...prev, points_value: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                  min="0"
                  step={editRule.rule_type === "expire" ? "1" : "1"}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">生效范围</label>
                <select
                  value={form.scope}
                  onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm"
                >
                  <option value="all">全部用户</option>
                  <option value="member">会员</option>
                  <option value="new_user">新用户</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">说明</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-foreground-500">启用状态</span>
                <button
                  onClick={() => setForm((prev) => ({ ...prev, is_enabled: !prev.is_enabled }))}
                  className={`relative w-11 h-6 rounded-full transition-all ${form.is_enabled ? "bg-primary-500" : "bg-background-300"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.is_enabled ? "left-5" : "left-0.5"}`}></span>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditRule(null)}
                className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saveLoading}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {saveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}