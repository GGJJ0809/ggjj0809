import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface AiModel {
  id: number;
  name: string;
  model_code: string;
  provider: string;
  api_endpoint: string | null;
  api_key: string | null;
  default_temp: number;
  default_max_tokens: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const PROVIDER_OPTIONS = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "doubao", label: "豆包 (字节)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "qwen", label: "通义千问" },
  { value: "glm", label: "智谱 GLM" },
  { value: "other", label: "其他" },
];

const emptyModel = {
  name: "",
  model_code: "",
  provider: "deepseek",
  api_endpoint: "",
  api_key: "",
  default_temp: 0.7,
  default_max_tokens: 2048,
  is_enabled: true,
};

export default function AiModelsAdmin() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyModel });
  const [saveLoading, setSaveLoading] = useState(false);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbErr } = await supabase
        .from("ai_models")
        .select("*")
        .order("id");
      if (dbErr) throw dbErr;
      setModels(data || []);
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyModel });
    setShowModal(true);
  };

  const openEdit = (m: AiModel) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      model_code: m.model_code,
      provider: m.provider,
      api_endpoint: m.api_endpoint || "",
      api_key: m.api_key || "",
      default_temp: Number(m.default_temp),
      default_max_tokens: m.default_max_tokens,
      is_enabled: m.is_enabled,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.model_code.trim()) return;
    try {
      setSaveLoading(true);
      const payload = {
        ...form,
        default_temp: Number(form.default_temp),
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        await supabase.from("ai_models").update(payload).eq("id", editingId);
      } else {
        await supabase.from("ai_models").insert(payload);
      }
      setShowModal(false);
      await loadModels();
      showToast(editingId ? "模型已更新" : "模型已创建");
    } catch (err: any) {
      showToast("保存失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggle = async (m: AiModel) => {
    try {
      await supabase
        .from("ai_models")
        .update({ is_enabled: !m.is_enabled, updated_at: new Date().toISOString() })
        .eq("id", m.id);
      await loadModels();
      showToast(!m.is_enabled ? "模型已启用" : "模型已禁用");
    } catch (err: any) {
      showToast("操作失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定删除该模型吗？已关联的Agent将无法使用此模型。")) return;
    try {
      await supabase.from("ai_models").delete().eq("id", id);
      await loadModels();
      showToast("模型已删除");
    } catch (err: any) {
      showToast("删除失败: " + (err?.message || ""));
    }
  };

  const updateField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const providerLabel = (p: string) => PROVIDER_OPTIONS.find((o) => o.value === p)?.label || p;

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center h-full">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg bg-primary-500 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground-950">AI 模型管理</h1>
          <p className="mt-1 text-sm text-foreground-500">配置大模型接入参数，供智能体运行时调用</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap"
        >
          <i className="ri-add-line mr-1.5"></i>添加模型
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Models Table */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">模型名称</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">模型代码</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">提供商</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">默认参数</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                        <i className="ri-cpu-line text-primary-500 text-sm"></i>
                      </div>
                      <div>
                        <p className="font-medium text-foreground-900 text-sm">{m.name}</p>
                        <p className="text-[11px] text-foreground-400">
                          {m.api_endpoint ? m.api_endpoint.slice(0, 40) + "..." : "未配置接口地址"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground-700 text-sm font-mono">{m.model_code}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-secondary-100 text-xs text-secondary-700 font-medium">
                      {providerLabel(m.provider)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-500">
                    Temp: {m.default_temp} / Tokens: {m.default_max_tokens}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(m)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        m.is_enabled
                          ? "bg-primary-100 text-primary-700 hover:bg-primary-200"
                          : "bg-background-200 text-foreground-500 hover:bg-background-300"
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${m.is_enabled ? "bg-primary-500" : "bg-foreground-300"}`}></div>
                      {m.is_enabled ? "已启用" : "已禁用"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(m)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                        title="编辑"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="删除"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty state */}
      {models.length === 0 && !loading && (
        <div className="text-center py-16">
          <i className="ri-cpu-line text-4xl text-foreground-300 mb-3 block"></i>
          <p className="text-sm text-foreground-400">暂无配置模型</p>
          <button onClick={openCreate} className="inline-block mt-3 text-primary-500 hover:text-primary-600 text-sm font-medium">
            添加第一个模型 →
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-xl max-h-[85vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10">
              <h2 className="font-heading font-semibold text-foreground-950">
                {editingId ? "编辑模型" : "添加模型"}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">模型名称 <span className="text-red-400">*</span></label>
                <input type="text" value={form.name} onChange={(e) => updateField("name", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="如：DeepSeek-V4" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">模型代码 <span className="text-red-400">*</span></label>
                  <input type="text" value={form.model_code} onChange={(e) => updateField("model_code", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm font-mono" placeholder="deepseek-v4" />
                  <p className="text-[10px] text-foreground-400 mt-0.5">API调用时使用的模型标识</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">提供商 <span className="text-red-400">*</span></label>
                  <select value={form.provider} onChange={(e) => updateField("provider", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
                    {PROVIDER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">API Endpoint</label>
                <input type="text" value={form.api_endpoint} onChange={(e) => updateField("api_endpoint", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm font-mono" placeholder="https://api.provider.com/v1/chat/completions" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">API Key</label>
                <input type="password" value={form.api_key} onChange={(e) => updateField("api_key", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm font-mono" placeholder="sk-xxxxxxxx" />
                <p className="text-[10px] text-foreground-400 mt-0.5">密钥将安全存储在数据库中，仅服务端调用</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">
                    默认温度: {Number(form.default_temp).toFixed(2)}
                  </label>
                  <input type="range" min="0" max="2" step="0.05" value={form.default_temp}
                    onChange={(e) => updateField("default_temp", Number(e.target.value))}
                    className="w-full accent-primary-500" />
                  <div className="flex justify-between text-[10px] text-foreground-400 mt-0.5">
                    <span>精确 0</span>
                    <span>创意 2</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">默认最大 Token 数</label>
                  <input type="number" min="256" max="8192" step="256" value={form.default_max_tokens}
                    onChange={(e) => updateField("default_max_tokens", Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_enabled" checked={form.is_enabled} onChange={(e) => updateField("is_enabled", e.target.checked)}
                  className="accent-primary-500 w-4 h-4" />
                <label htmlFor="is_enabled" className="text-sm text-foreground-700">启用此模型</label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-background-50 border-t border-background-200/70 px-5 py-4 flex justify-end gap-3 z-10">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleSave} disabled={saveLoading || !form.name.trim() || !form.model_code.trim()}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">
                {saveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}