import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type LibType = "c" | "k" | "q" | "d";

interface LibConfig {
  type: LibType;
  title: string;
  subtitle: string;
  icon: string;
  tableName: string;
  fields: {
    key: string;
    label: string;
    type: "text" | "textarea" | "select" | "tags" | "json";
    options?: { value: string; label: string }[];
    placeholder?: string;
    rows?: number;
  }[];
  searchPlaceholder: string;
}

const LIB_CONFIGS: Record<LibType, LibConfig> = {
  c: {
    type: "c",
    title: "C库（能力库）",
    subtitle: "管理能力文件和规则文件",
    icon: "ri-file-settings-line",
    tableName: "c_libraries",
    searchPlaceholder: "搜索文件名或描述...",
    fields: [
      { key: "file_name", label: "文件名 *", type: "text", placeholder: "如：顾问式销售.md" },
      { key: "file_path", label: "存储路径 *", type: "text", placeholder: "如：C库/顾问式销售.md" },
      { key: "file_type", label: "文件类型 *", type: "select", options: [{ value: "capability", label: "能力文件" }, { value: "rule", label: "规则文件" }] },
      { key: "capability_type", label: "能力类型", type: "select", options: [{ value: "advisor", label: "顾问型能力" }, { value: "tool", label: "工具型规则" }] },
      { key: "content", label: "文件内容", type: "textarea", rows: 10, placeholder: "Markdown格式的能力逻辑正文..." },
      { key: "description", label: "描述", type: "text", placeholder: "能力文件描述，便于选择" },
      { key: "tags", label: "标签", type: "tags" },
      { key: "version", label: "版本", type: "text", placeholder: "1.0" },
    ],
  },
  k: {
    type: "k",
    title: "K库（知识库）",
    subtitle: "管理产品知识、案例、方案、模板等",
    icon: "ri-book-2-line",
    tableName: "k_libraries",
    searchPlaceholder: "搜索文件名或标签...",
    fields: [
      { key: "file_name", label: "文件名 *", type: "text", placeholder: "如：新媒体平台运营规则.md" },
      { key: "file_path", label: "存储路径 *", type: "text", placeholder: "如：K库/新媒体平台运营规则.md" },
      { key: "k_type", label: "知识类型 *", type: "select", options: [
        { value: "product", label: "产品知识" }, { value: "case", label: "案例" },
        { value: "solution", label: "方案" }, { value: "insight", label: "行业洞察" },
        { value: "template", label: "模板" }, { value: "material", label: "素材" },
      ]},
      { key: "content", label: "内容", type: "textarea", rows: 10, placeholder: "Markdown格式的知识内容..." },
      { key: "tags", label: "标签", type: "tags" },
      { key: "match_keywords", label: "匹配关键词", type: "tags", placeholder: "用于推荐匹配" },
    ],
  },
  q: {
    type: "q",
    title: "Q库（问卷库）",
    subtitle: "管理问卷、表单、调研表",
    icon: "ri-survey-line",
    tableName: "q_libraries",
    searchPlaceholder: "搜索文件名...",
    fields: [
      { key: "file_name", label: "文件名 *", type: "text", placeholder: "如：企业新媒体现状调研表.md" },
      { key: "file_path", label: "存储路径 *", type: "text", placeholder: "如：Q库/企业新媒体现状调研表.md" },
      { key: "q_type", label: "问卷类型 *", type: "select", options: [
        { value: "form", label: "表单" }, { value: "questionnaire", label: "问卷" }, { value: "survey", label: "调研" },
      ]},
      { key: "content", label: "问卷说明", type: "textarea", rows: 3, placeholder: "Markdown格式的问卷说明..." },
      { key: "fields", label: "字段定义 (JSON)", type: "json", placeholder: "[{\"id\":\"name\",\"type\":\"text\",\"label\":\"姓名\"}]" },
    ],
  },
  d: {
    type: "d",
    title: "D库（数据档案库）",
    subtitle: "管理客户档案模板、跟进模板等",
    icon: "ri-folder-user-line",
    tableName: "d_libraries",
    searchPlaceholder: "搜索模板名或描述...",
    fields: [
      { key: "file_name", label: "文件名 *", type: "text", placeholder: "如：销售跟进档案模板.md" },
      { key: "file_path", label: "存储路径 *", type: "text", placeholder: "如：D库/销售跟进档案模板.md" },
      { key: "template_type", label: "模板类型 *", type: "select", options: [
        { value: "client_profile", label: "客户档案" }, { value: "sales_followup", label: "销售跟进" },
        { value: "consulting", label: "咨询" }, { value: "custom", label: "自定义" },
      ]},
      { key: "schema_data", label: "字段结构 (JSON Schema)", type: "json", placeholder: "{\"template_name\":\"...\",\"fields\":{...}}" },
      { key: "description", label: "描述", type: "text", placeholder: "模板描述" },
    ],
  },
};

interface LibraryItem {
  id: number;
  file_name: string;
  file_path: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export default function LibraryPage({ type }: { type: LibType }) {
  const cfg = LIB_CONFIGS[type];
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionMsg, setActionMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({ status: "draft" });
  const [tagInput, setTagInput] = useState<Record<string, string>>({});

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: qErr } = await supabase
        .from(cfg.tableName)
        .select("*")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (qErr) throw qErr;
      setItems(data || []);
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [cfg.tableName]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filtered = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const text = JSON.stringify(item).toLowerCase();
      return text.includes(s);
    }
    return true;
  });

  const openCreate = () => {
    setEditingId(null);
    const init: Record<string, any> = { status: "draft" };
    cfg.fields.forEach((f) => {
      if (f.type === "tags" || f.type === "json") init[f.key] = f.type === "json" ? "" : [];
    });
    setFormData(init);
    setTagInput({});
    setShowForm(true);
  };

  const openEdit = (item: LibraryItem) => {
    setEditingId(item.id);
    const d: Record<string, any> = {};
    cfg.fields.forEach((f) => {
      d[f.key] = item[f.key] ?? (f.type === "tags" ? [] : f.type === "json" ? "" : "");
    });
    d.status = item.status;
    setFormData(d);
    setTagInput({});
    setShowForm(true);
  };

  const handleSave = async (newStatus?: string) => {
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, any> = {};
      cfg.fields.forEach((f) => {
        if (f.type === "tags") {
          payload[f.key] = Array.isArray(formData[f.key]) ? formData[f.key] : [];
        } else if (f.type === "json") {
          if (formData[f.key] && typeof formData[f.key] === "string" && formData[f.key].trim()) {
            try {
              payload[f.key] = JSON.parse(formData[f.key]);
            } catch {
              // keep as string
            }
          }
        } else {
          payload[f.key] = formData[f.key];
        }
      });
      if (newStatus) payload.status = newStatus;
      payload.updated_at = new Date().toISOString();

      if (editingId) {
        const { error: uErr } = await supabase.from(cfg.tableName).update(payload).eq("id", editingId);
        if (uErr) throw uErr;
      } else {
        const { error: iErr } = await supabase.from(cfg.tableName).insert(payload);
        if (iErr) throw iErr;
      }

      setShowForm(false);
      setEditingId(null);
      setActionMsg(editingId ? "已更新" : "已创建");
      setTimeout(() => setActionMsg(""), 2000);
      fetchItems();
    } catch (e: any) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除吗？")) return;
    try {
      const { error: dErr } = await supabase
        .from(cfg.tableName)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (dErr) throw dErr;
      setItems((prev) => prev.filter((i) => i.id !== id));
      setActionMsg("已删除");
      setTimeout(() => setActionMsg(""), 2000);
    } catch (e: any) {
      setError(e.message || "删除失败");
    }
  };

  const handleStatusToggle = async (item: LibraryItem) => {
    const ns = item.status === "published" ? "archived" : "published";
    try {
      await supabase.from(cfg.tableName).update({ status: ns, updated_at: new Date().toISOString() }).eq("id", item.id);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: ns } : i)));
      setActionMsg(ns === "published" ? "已发布" : "已下架");
      setTimeout(() => setActionMsg(""), 2000);
    } catch (e: any) {
      setError(e.message || "操作失败");
    }
  };

  const addTag = (fieldKey: string) => {
    const val = (tagInput[fieldKey] || "").trim();
    if (!val) return;
    const current = Array.isArray(formData[fieldKey]) ? formData[fieldKey] : [];
    if (!current.includes(val)) {
      setFormData((prev) => ({ ...prev, [fieldKey]: [...current, val] }));
    }
    setTagInput((prev) => ({ ...prev, [fieldKey]: "" }));
  };

  const removeTag = (fieldKey: string, tag: string) => {
    const current = Array.isArray(formData[fieldKey]) ? formData[fieldKey] : [];
    setFormData((prev) => ({ ...prev, [fieldKey]: current.filter((t: string) => t !== tag) }));
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "published": return { text: "已发布", cls: "bg-green-100 text-green-700" };
      case "draft": return { text: "草稿", cls: "bg-background-200 text-foreground-500" };
      case "archived": return { text: "已下架", cls: "bg-red-100 text-red-600" };
      default: return { text: status, cls: "bg-background-200 text-foreground-500" };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="flex items-center gap-3 text-foreground-400">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground-950 flex items-center gap-2">
            <i className={`${cfg.icon} text-primary-500`}></i>
            {cfg.title}
          </h1>
          <p className="text-sm text-foreground-500 mt-1">{cfg.subtitle}</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap self-start"
        >
          <i className="ri-add-line text-lg"></i>
          新增文件
        </button>
      </div>

      {actionMsg && (
        <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {actionMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
          <input
            type="text"
            placeholder={cfg.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 transition-all"
        >
          <option value="all">全部状态</option>
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
          <option value="archived">已下架</option>
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-foreground-400">
          <i className={`${cfg.icon} text-4xl mb-3 block`}></i>
          <p className="text-sm">暂无数据</p>
          <button onClick={openCreate} className="inline-block mt-3 text-primary-500 hover:text-primary-600 text-sm font-medium">
            创建第一条记录 →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const st = statusLabel(item.status);
            return (
              <div key={item.id} className="bg-background-50 border border-background-200/70 rounded-xl p-4 md:p-5 hover:border-primary-200/50 transition-all">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                      <i className={`${cfg.icon} text-xl text-primary-500`}></i>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-foreground-950 truncate">{item.file_name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.text}</span>
                      </div>
                      <p className="text-xs text-foreground-500 truncate">{item.file_path}</p>
                      {item.description && <p className="text-xs text-foreground-400 mt-0.5 truncate">{item.description}</p>}
                      <div className="flex items-center gap-x-3 gap-y-1 text-xs text-foreground-400 mt-1">
                        <span>创建: {item.created_at ? new Date(item.created_at).toLocaleDateString("zh-CN") : "-"}</span>
                        <span>更新: {item.updated_at ? new Date(item.updated_at).toLocaleDateString("zh-CN") : "-"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <button onClick={() => openEdit(item)} className="px-3 py-1.5 text-xs font-medium text-foreground-600 bg-background-100 hover:bg-background-200 rounded-md transition-colors whitespace-nowrap">
                      编辑
                    </button>
                    <button onClick={() => handleStatusToggle(item)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      item.status === "published" ? "text-orange-600 bg-orange-50 hover:bg-orange-100" : "text-green-600 bg-green-50 hover:bg-green-100"
                    }`}>
                      {item.status === "published" ? "下架" : "发布"}
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors whitespace-nowrap">
                      删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-background-50 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-background-50 border-b border-background-200 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h3 className="text-lg font-semibold text-foreground-950">
                {editingId ? "编辑文件" : "新增文件"}
              </h3>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-background-100 hover:bg-background-200 flex items-center justify-center transition-colors">
                <i className="ri-close-line text-foreground-600"></i>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {cfg.fields.map((f) => {
                if (f.type === "textarea") {
                  return (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-foreground-700 mb-1.5">{f.label}</label>
                      <textarea
                        value={formData[f.key] || ""}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        rows={f.rows || 4}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all resize-none font-mono"
                      />
                    </div>
                  );
                }
                if (f.type === "select") {
                  return (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-foreground-700 mb-1.5">{f.label}</label>
                      <select
                        value={formData[f.key] || ""}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
                      >
                        <option value="">-- 请选择 --</option>
                        {f.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                if (f.type === "tags") {
                  const tags = Array.isArray(formData[f.key]) ? formData[f.key] : [];
                  return (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-foreground-700 mb-1.5">{f.label}</label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {tags.map((t: string) => (
                          <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
                            {t}
                            <button onClick={() => removeTag(f.key, t)} className="hover:text-primary-900">
                              <i className="ri-close-line text-xs"></i>
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={tagInput[f.key] || ""}
                          onChange={(e) => setTagInput((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(f.key); } }}
                          placeholder={f.placeholder || "输入后回车添加"}
                          className="flex-1 px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
                        />
                        <button onClick={() => addTag(f.key)} className="px-3 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-all whitespace-nowrap">添加</button>
                      </div>
                    </div>
                  );
                }
                if (f.type === "json") {
                  return (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-foreground-700 mb-1.5">{f.label}</label>
                      <textarea
                        value={typeof formData[f.key] === "string" ? formData[f.key] : JSON.stringify(formData[f.key], null, 2)}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        rows={6}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all resize-none font-mono"
                      />
                    </div>
                  );
                }
                return (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-foreground-700 mb-1.5">{f.label}</label>
                    <input
                      type="text"
                      value={formData[f.key] || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
                    />
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-0 bg-background-50 border-t border-background-200 px-5 py-4 flex items-center justify-end gap-2 rounded-b-2xl">
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm font-medium text-foreground-600 hover:text-foreground-950 transition-colors whitespace-nowrap">取消</button>
              <button onClick={() => handleSave("draft")} disabled={saving} className="px-5 py-2.5 bg-background-100 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-200 transition-all whitespace-nowrap disabled:opacity-50">保存草稿</button>
              <button onClick={() => handleSave("published")} disabled={saving} className="px-5 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap disabled:opacity-50">{saving ? "保存中..." : "发布"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}