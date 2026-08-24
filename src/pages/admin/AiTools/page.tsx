import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface AiTool {
  id: number;
  name: string;
  description: string;
  icon: string;
  category: string;
  prompt_template: string;
  is_free: boolean;
  price_per_call: number;
  daily_limit: number;
  sort_order: number;
  status: string;
}

interface CallLog {
  id: number;
  tool_id: number;
  user_id: string;
  input_text: string;
  output_text: string;
  tokens_used: number;
  cost: number;
  created_at: string;
}

const emptyTool = {
  name: "",
  description: "",
  icon: "ri-robot-2-line",
  category: "coach",
  prompt_template: "",
  is_free: true,
  price_per_call: 0,
  daily_limit: 50,
  sort_order: 0,
  status: "draft",
};

const categoryLabels: Record<string, string> = {
  coach: "AI 教练",
  content: "内容创作",
  analysis: "数据分析",
  other: "其他工具",
};

export default function AiToolsAdmin() {
  const [tools, setTools] = useState<AiTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Tool form
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyTool);
  const [saveLoading, setSaveLoading] = useState(false);

  // Call logs
  const [showLogs, setShowLogs] = useState(false);
  const [logsToolId, setLogsToolId] = useState<number | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadTools = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbErr } = await supabase
        .from("ai_tools")
        .select("*")
        .order("sort_order");
      if (dbErr) throw dbErr;
      setTools(data || []);
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTools();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyTool);
    setShowModal(true);
  };

  const openEdit = (tool: AiTool) => {
    setEditingId(tool.id);
    setForm({
      name: tool.name,
      description: tool.description || "",
      icon: tool.icon || "ri-robot-2-line",
      category: tool.category || "coach",
      prompt_template: tool.prompt_template || "",
      is_free: tool.is_free,
      price_per_call: tool.price_per_call || 0,
      daily_limit: tool.daily_limit || 50,
      sort_order: tool.sort_order,
      status: tool.status,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      setSaveLoading(true);
      const payload = { ...form, updated_at: new Date().toISOString() };
      if (editingId) {
        await supabase.from("ai_tools").update(payload).eq("id", editingId);
      } else {
        await supabase.from("ai_tools").insert(payload);
      }
      setShowModal(false);
      await loadTools();
      showToast(editingId ? "AI 工具已更新" : "AI 工具已创建");
    } catch (err: any) {
      showToast("保存失败: " + (err?.message || ""));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleStatus = async (tool: AiTool) => {
    const newStatus = tool.status === "active" ? "draft" : "active";
    await supabase
      .from("ai_tools")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", tool.id);
    await loadTools();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除该 AI 工具吗？")) return;
    await supabase.from("ai_tools").delete().eq("id", id);
    await loadTools();
    showToast("AI 工具已删除");
  };

  const handleDuplicate = async (tool: AiTool) => {
    const { id, created_at, updated_at, deleted_at, ...rest } = tool as any;
    await supabase.from("ai_tools").insert({
      ...rest,
      name: tool.name + "（副本）",
      status: "draft",
      updated_at: new Date().toISOString(),
    });
    await loadTools();
    showToast("已复制");
  };

  const openCallLogs = async (toolId: number) => {
    setLogsToolId(toolId);
    setShowLogs(true);
    setLogsLoading(true);
    const { data } = await supabase
      .from("ai_call_logs")
      .select("*")
      .eq("tool_id", toolId)
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs(data || []);
    setLogsLoading(false);
  };

  const updateField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center h-full">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center py-12">
          <p className="text-sm text-foreground-500 mb-4">{error}</p>
          <button
            onClick={loadTools}
            className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium whitespace-nowrap"
          >
            重试
          </button>
        </div>
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
          <h1 className="text-2xl font-heading font-bold text-foreground-950">AI 智能体管理</h1>
          <p className="mt-1 text-sm text-foreground-500">配置 AI 工具、提示词模板和调用权限</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap"
        >
          <i className="ri-add-line mr-1.5"></i>新建工具
        </button>
      </div>

      {/* Tools Table */}
      <div className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200/70 bg-background-100/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">排序</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">工具名称</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">分类</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">权限</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">每日限额</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((tool) => (
                <tr key={tool.id} className="border-b border-background-200/70 last:border-0 hover:bg-background-50 transition-colors">
                  <td className="px-4 py-3 text-foreground-500 text-xs">{tool.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-background-100 flex items-center justify-center">
                        <i className={`${tool.icon || "ri-robot-2-line"} text-foreground-600 text-sm`}></i>
                      </div>
                      <div>
                        <p className="font-medium text-foreground-900 text-sm">{tool.name}</p>
                        <p className="text-[11px] text-foreground-400 line-clamp-1">
                          {tool.prompt_template ? tool.prompt_template.slice(0, 40) + "..." : "未配置提示词"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-background-100 text-xs text-foreground-600">
                      {categoryLabels[tool.category] || tool.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {tool.is_free ? (
                      <span className="text-primary-500 font-medium text-xs">免费</span>
                    ) : (
                      <span className="text-xs text-foreground-700">¥{tool.price_per_call}/次</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground-500 text-sm">{tool.daily_limit || "-"} 次/天</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleStatus(tool)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        tool.status === "active"
                          ? "bg-primary-100 text-primary-700 hover:bg-primary-200"
                          : "bg-background-200 text-foreground-500 hover:bg-background-300"
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${tool.status === "active" ? "bg-primary-500" : "bg-foreground-300"}`}></div>
                      {tool.status === "active" ? "已发布" : "草稿"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openCallLogs(tool.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-background-100 transition-all"
                        title="调用记录"
                      >
                        <i className="ri-history-line"></i>
                      </button>
                      <button
                        onClick={() => openEdit(tool)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                      <button
                        onClick={() => handleDuplicate(tool)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
                        title="复制"
                      >
                        <i className="ri-file-copy-line"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(tool.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-red-500 hover:bg-red-50 transition-all"
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

      {/* Tool Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-xl max-h-[85vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between">
              <h2 className="font-heading font-semibold text-foreground-950">
                {editingId ? "编辑 AI 工具" : "新建 AI 工具"}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">工具名称 <span className="text-red-400">*</span></label>
                <input type="text" value={form.name} onChange={(e) => updateField("name", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="影响力五力诊断" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">描述</label>
                <textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none" placeholder="简要描述该工具的功能..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">图标 (Remix Icon)</label>
                  <input type="text" value={form.icon} onChange={(e) => updateField("icon", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" placeholder="ri-robot-2-line" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">分类</label>
                  <select value={form.category} onChange={(e) => updateField("category", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
                    <option value="coach">AI 教练</option>
                    <option value="content">内容创作</option>
                    <option value="analysis">数据分析</option>
                    <option value="other">其他工具</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">提示词模板</label>
                <textarea value={form.prompt_template} onChange={(e) => updateField("prompt_template", e.target.value)} rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm resize-none font-mono" placeholder="你是一个专业的...&#10;请根据用户输入..." />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">是否免费</label>
                  <select value={form.is_free ? "true" : "false"} onChange={(e) => updateField("is_free", e.target.value === "true")}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
                    <option value="true">免费</option>
                    <option value="false">付费</option>
                  </select>
                </div>
                {!form.is_free && (
                  <div>
                    <label className="block text-xs font-medium text-foreground-500 mb-1">单价 (¥)</label>
                    <input type="number" value={form.price_per_call} onChange={(e) => updateField("price_per_call", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" step="0.01" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">每日限额</label>
                  <input type="number" value={form.daily_limit} onChange={(e) => updateField("daily_limit", Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">排序</label>
                  <input type="number" value={form.sort_order} onChange={(e) => updateField("sort_order", Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm" min="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-500 mb-1">状态</label>
                  <select value={form.status} onChange={(e) => updateField("status", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm">
                    <option value="draft">草稿</option>
                    <option value="active">已发布</option>
                    <option value="inactive">已下架</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-background-50 border-t border-background-200/70 px-5 py-4 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all whitespace-nowrap">取消</button>
              <button onClick={handleSave} disabled={saveLoading || !form.name.trim()}
                className="px-5 py-2 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap">
                {saveLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLogs(false)}></div>
          <div className="relative bg-background-50 rounded-xl border border-background-200/70 w-full max-w-2xl max-h-[80vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-background-50 border-b border-background-200/70 px-5 py-4 flex items-center justify-between">
              <h2 className="font-heading font-semibold text-foreground-950">调用记录</h2>
              <button onClick={() => setShowLogs(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all">
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="p-5">
              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <i className="ri-loader-4-line animate-spin text-xl text-foreground-400"></i>
                </div>
              ) : logs.length === 0 ? (
                <p className="text-center text-sm text-foreground-400 py-8">暂无调用记录</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-background-200/70">
                      <th className="text-left py-2 px-2 text-xs text-foreground-500">时间</th>
                      <th className="text-left py-2 px-2 text-xs text-foreground-500">用户</th>
                      <th className="text-left py-2 px-2 text-xs text-foreground-500">输入</th>
                      <th className="text-left py-2 px-2 text-xs text-foreground-500">Tokens</th>
                      <th className="text-left py-2 px-2 text-xs text-foreground-500">费用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-background-100 last:border-0">
                        <td className="py-2 px-2 text-xs text-foreground-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("zh-CN")}
                        </td>
                        <td className="py-2 px-2 text-xs text-foreground-500">{log.user_id || "匿名"}</td>
                        <td className="py-2 px-2 text-xs text-foreground-700 max-w-[200px] truncate">{log.input_text || "-"}</td>
                        <td className="py-2 px-2 text-xs text-foreground-500">{log.tokens_used}</td>
                        <td className="py-2 px-2 text-xs text-foreground-500">¥{log.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}