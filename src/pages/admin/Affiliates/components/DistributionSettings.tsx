import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Setting {
  id: number;
  key: string;
  value: string;
}

export default function DistributionSettings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  const [form, setForm] = useState({
    distribution_enabled: true,
    default_points_ratio: 5,
    register_reward: 200,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbErr } = await supabase.from("distribution_settings").select("*");
      if (dbErr) throw dbErr;
      setSettings(data || []);

      const map: Record<string, string> = {};
      (data || []).forEach((s: Setting) => {
        map[s.key] = s.value;
      });
      setForm({
        distribution_enabled: map.distribution_enabled !== "false",
        default_points_ratio: Number(map.default_points_ratio ?? 5),
        register_reward: Number(map.register_reward ?? 200),
      });
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

  const handleSave = async () => {
    try {
      setSaveLoading(true);
      const nowIso = new Date().toISOString();
      const payloads = [
        { key: "distribution_enabled", value: String(form.distribution_enabled), updated_at: nowIso },
        { key: "default_points_ratio", value: String(form.default_points_ratio), updated_at: nowIso },
        { key: "register_reward", value: String(form.register_reward), updated_at: nowIso },
      ];
      for (const p of payloads) {
        const existing = settings.find((s) => s.key === p.key);
        if (existing) {
          await supabase.from("distribution_settings").update(p).eq("id", existing.id);
        } else {
          await supabase.from("distribution_settings").insert(p);
        }
      }
      await loadData();
      showToast("分销设置已保存");
    } catch (err: any) {
      showToast("保存失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
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
    <div className="max-w-2xl">
      {toast && <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm">{toast}</div>}

      {/* 分销开关 */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground-950">分销系统总开关</h4>
            <p className="text-xs text-foreground-500 mt-1">关闭后整个分销功能停止，已产生的收益不受影响</p>
          </div>
          <button
            onClick={() => updateField("distribution_enabled", !form.distribution_enabled)}
            className={`relative w-11 h-6 rounded-full transition-all ${form.distribution_enabled ? "bg-primary-500" : "bg-background-300"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.distribution_enabled ? "left-5" : "left-0.5"}`}></span>
          </button>
        </div>
      </div>

      {/* 返积分设置 */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 p-5 mb-4">
        <h4 className="text-sm font-semibold text-foreground-950 mb-4">默认返积分设置</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">默认返积分比例 (%)</label>
            <input type="number" value={form.default_points_ratio} onChange={(e) => updateField("default_points_ratio", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" max="100" step="0.1" />
            <p className="text-xs text-foreground-400 mt-1">订单金额 × 比例 = 分销员返积分</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">推荐注册奖励 (积分)</label>
            <input type="number" value={form.register_reward} onChange={(e) => updateField("register_reward", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
            <p className="text-xs text-foreground-400 mt-1">好友通过分享链接注册后奖励分销员</p>
          </div>
        </div>
      </div>

      {/* 保存 */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saveLoading} className="px-6 py-2.5 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">
          {saveLoading ? "保存中..." : "保存设置"}
        </button>
      </div>
    </div>
  );
}