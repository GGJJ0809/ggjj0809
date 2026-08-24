import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface LibFile { id: number; file_name: string; file_path: string; }

interface Assessment { id: number; title: string; status: string; }

interface ToolFormData {
  avatar: string;
  name: string;
  short_desc: string;
  tags: string[];
  input_type: "form" | "dialog";
  q_library_file: string;
  dialog_questions: string[];
  collection_rules: string;
  c_library_rules: string[];
  k_library_materials: string[];
  output_type: string;
  output_custom_rules: string;
  boundary_constraints: string;
  archive_rules: string;
  model_id: number | null;
  max_tokens: number;
}

const AVATAR_ICONS = ["ri-robot-2-line", "ri-survey-line", "ri-brain-line", "ri-bar-chart-2-line", "ri-file-chart-line", "ri-search-line", "ri-lightbulb-line", "ri-tools-line"];

const OUTPUT_TYPES = [
  { value: "report", label: "报告" },
  { value: "card", label: "卡片" },
  { value: "type_result", label: "类型结果" },
  { value: "recommend_list", label: "推荐列表" },
];

const emptyForm: ToolFormData = {
  avatar: "ri-survey-line", name: "", short_desc: "", tags: [],
  input_type: "form", q_library_file: "", dialog_questions: [""], collection_rules: "",
  c_library_rules: [], k_library_materials: [],
  output_type: "report", output_custom_rules: "", boundary_constraints: "", archive_rules: "",
  model_id: null, max_tokens: 2048,
};

export default function ToolAgentForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<ToolFormData>({ ...emptyForm });
  const [cLibs, setCLibs] = useState<LibFile[]>([]);
  const [kLibs, setKLibs] = useState<LibFile[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [models, setModels] = useState<{ id: number; name: string; provider: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [dialogQInput, setDialogQInput] = useState("");

  const fetchLibs = useCallback(async () => {
    const [cRes, kRes, aRes, mRes] = await Promise.all([
      supabase.from("c_libraries").select("id,file_name,file_path").eq("status", "published").eq("file_type", "rule").is("deleted_at", null).order("file_name"),
      supabase.from("k_libraries").select("id,file_name,file_path").eq("status", "published").is("deleted_at", null).order("file_name"),
      supabase.from("assessments").select("id,title,status").eq("status", "active").order("id"),
      supabase.from("ai_models").select("id,name,provider").eq("is_enabled", true).order("id"),
    ]);
    if (cRes.data) setCLibs(cRes.data);
    if (kRes.data) setKLibs(kRes.data);
    if (aRes.data) setAssessments(aRes.data);
    if (mRes.data) setModels(mRes.data);
  }, []);

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: agent, error: aErr } = await supabase.from("agents").select("*").eq("id", id).maybeSingle();
      if (aErr) throw aErr;
      if (!agent) throw new Error("智能体不存在");

      const { data: cfg } = await supabase.from("agent_tool_configs").select("*").eq("agent_id", id).maybeSingle();
      const inputCfg = cfg?.input_config || {};

      setForm({
        avatar: agent.avatar || agent.icon || "ri-survey-line",
        name: agent.name || "",
        short_desc: agent.short_desc || agent.description || "",
        tags: Array.isArray(agent.tags) ? agent.tags : (agent.category ? [agent.category] : []),
        input_type: inputCfg?.input_type || "form",
        q_library_file: inputCfg?.q_library_file || "",
        dialog_questions: inputCfg?.dialog_config?.questions?.length ? inputCfg.dialog_config.questions : [""],
        collection_rules: inputCfg?.dialog_config?.collection_rules || "",
        c_library_rules: Array.isArray(cfg?.c_library_rules) ? cfg.c_library_rules : [],
        k_library_materials: Array.isArray(cfg?.k_library_materials) ? cfg.k_library_materials : [],
        output_type: cfg?.output_type || "report",
        output_custom_rules: cfg?.output_custom_rules || "",
        boundary_constraints: cfg?.boundary_constraints || "",
        archive_rules: cfg?.archive_rules || "",
        model_id: agent.model_id ?? null,
        max_tokens: agent.max_tokens ?? 2048,
      });
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchLibs(); fetchAgent(); }, [fetchLibs, fetchAgent]);

  const update = (patch: Partial<ToolFormData>) => setForm((f) => ({ ...f, ...patch }));

  const toggleLib = (field: "c_library_rules" | "k_library_materials", filePath: string) => {
    const current = form[field];
    update({ [field]: current.includes(filePath) ? current.filter((f) => f !== filePath) : [...current, filePath] });
  };

  const addTag = () => {
    const val = tagInput.trim();
    if (!val || form.tags.includes(val)) return;
    update({ tags: [...form.tags, val] });
    setTagInput("");
  };

  const addDialogQ = () => {
    const val = dialogQInput.trim();
    if (!val) return;
    update({ dialog_questions: [...form.dialog_questions.filter((q) => q.trim()), val] });
    setDialogQInput("");
  };

  const updateDialogQ = (idx: number, val: string) => {
    const qs = [...form.dialog_questions];
    qs[idx] = val;
    if (idx === qs.length - 1 && val.trim()) qs.push("");
    update({ dialog_questions: qs.filter((q, i) => q.trim() || i === qs.length - 1) });
  };

  const handleSave = async (status: string) => {
    setSaving(true); setError("");
    try {
      const agentPayload = {
        agent_type: "tool",
        name: form.name,
        short_desc: form.short_desc,
        avatar: form.avatar,
        tags: form.tags,
        status,
        model_id: form.model_id,
        max_tokens: form.max_tokens,
        updated_at: new Date().toISOString(),
      };

      let agentId = id ? Number(id) : null;
      if (isEdit) {
        await supabase.from("agents").update(agentPayload).eq("id", agentId);
      } else {
        const { data: newAgent, error: iErr } = await supabase.from("agents").insert({ ...agentPayload, sort_order: 99 }).select("id").single();
        if (iErr) throw iErr;
        agentId = newAgent.id;
      }
      if (!agentId) throw new Error("Agent ID 缺失");

      const inputConfig: any = { input_type: form.input_type };
      if (form.input_type === "form") {
        inputConfig.q_library_file = form.q_library_file;
      } else {
        inputConfig.dialog_config = {
          questions: form.dialog_questions.filter((q) => q.trim()),
          collection_rules: form.collection_rules,
        };
      }

      const configPayload = {
        agent_id: agentId,
        input_config: inputConfig,
        c_library_rules: form.c_library_rules,
        k_library_materials: form.k_library_materials,
        output_type: form.output_type,
        output_custom_rules: form.output_custom_rules,
        boundary_constraints: form.boundary_constraints,
        archive_rules: form.archive_rules,
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase.from("agent_tool_configs").select("id").eq("agent_id", agentId).maybeSingle();
      if (existing) {
        await supabase.from("agent_tool_configs").update(configPayload).eq("agent_id", agentId);
      } else {
        await supabase.from("agent_tool_configs").insert(configPayload);
      }

      navigate("/admin/agents");
    } catch (e: any) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { key: "basic", label: "A. 基础信息", icon: "ri-information-line" },
    { key: "input", label: "B. 输入配置", icon: "ri-input-method-line" },
    { key: "process", label: "C. 处理规则", icon: "ri-settings-3-line" },
    { key: "output", label: "D. 输出配置", icon: "ri-file-text-line" },
    { key: "archive", label: "E. 边界归档", icon: "ri-shield-check-line" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1000px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button onClick={() => navigate("/admin/agents")} className="text-sm text-foreground-500 hover:text-foreground-700 mb-1 flex items-center gap-1">
            <i className="ri-arrow-left-line"></i> 返回列表
          </button>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground-950">
            {isEdit ? "编辑工具型智能体" : "创建工具型智能体"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleSave("draft")} disabled={saving}
            className="px-5 py-2.5 bg-background-100 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-200 transition-all whitespace-nowrap disabled:opacity-50">保存草稿</button>
          <button onClick={() => handleSave("published")} disabled={saving || !form.name}
            className="px-5 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap disabled:opacity-50">发布</button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>}

      {/* Step Tabs */}
      <div className="flex items-center gap-0 mb-6 border-b border-background-200 overflow-x-auto">
        {steps.map((step, idx) => (
          <button key={step.key} onClick={() => setActiveStep(idx)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
              activeStep === idx ? "border-primary-500 text-primary-500" : "border-transparent text-foreground-500 hover:text-foreground-700"
            }`}>
            <i className={step.icon}></i> {step.label}
          </button>
        ))}
      </div>

      {/* Step 0: Basic Info */}
      {activeStep === 0 && (
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">头像 *</label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_ICONS.map((icon) => (
                <button key={icon} onClick={() => update({ avatar: icon })}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                    form.avatar === icon ? "bg-primary-500 text-white" : "bg-background-100 text-foreground-500 hover:bg-background-200"
                  }`}>
                  <i className={`${icon} text-lg`}></i>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">名称 *</label>
            <input type="text" value={form.name} onChange={(e) => update({ name: e.target.value })}
              placeholder="如：新媒体能力测评" className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">一句话简介 *</label>
            <input type="text" value={form.short_desc} onChange={(e) => update({ short_desc: e.target.value })}
              placeholder="如：测出你的新媒体运营短板" className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">分类标签 *</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
                  {t}
                  <button onClick={() => update({ tags: form.tags.filter((x) => x !== t) })}><i className="ri-close-line text-xs"></i></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="输入后回车添加" className="flex-1 px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300" />
              <button onClick={addTag} className="px-3 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-all whitespace-nowrap">添加</button>
            </div>
          </div>

          {/* AI Model Config */}
          <div className="border-t border-background-200 pt-5 mt-5">
            <h4 className="text-sm font-semibold text-foreground-950 mb-3 flex items-center gap-2">
              <i className="ri-cpu-line text-primary-500"></i> AI 模型配置
              <span className="text-[10px] text-foreground-400 font-normal">(用于报告生成等AI能力步骤)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">选择模型 *</label>
                {models.length === 0 ? (
                  <div className="text-sm text-foreground-400">
                    <p>暂无可用模型</p>
                    <Link to="/admin/ai-models" className="inline-block mt-1 text-primary-500 hover:text-primary-600 font-medium">
                      去配置模型 →
                    </Link>
                  </div>
                ) : (
                  <select value={form.model_id ?? ""} onChange={(e) => {
                    const mid = e.target.value ? Number(e.target.value) : null;
                    update({ model_id: mid });
                  }}
                    className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all">
                    <option value="">-- 请选择 --</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">最大 Token 数</label>
                <input type="number" min="256" max="8192" step="256" value={form.max_tokens}
                  onChange={(e) => update({ max_tokens: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Input Config */}
      {activeStep === 1 && (
        <div className="space-y-5">
          <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6">
            <label className="block text-sm font-medium text-foreground-700 mb-3">输入形式 *</label>
            <div className="flex gap-3 mb-4">
              <label className="flex items-center gap-2 cursor-pointer" onClick={() => update({ input_type: "form" })}>
                <input type="radio" name="input_type" checked={form.input_type === "form"} onChange={() => {}} className="accent-primary-500" />
                <span className="text-sm text-foreground-700">调Q库表单</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" onClick={() => update({ input_type: "dialog" })}>
                <input type="radio" name="input_type" checked={form.input_type === "dialog"} onChange={() => {}} className="accent-primary-500" />
                <span className="text-sm text-foreground-700">对话框收集</span>
              </label>
            </div>

            {form.input_type === "form" ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-foreground-700">选择Q库表单</label>
                  <Link to="/admin/libraries/q" className="text-xs font-medium text-primary-500 hover:text-primary-600 flex items-center gap-1 transition-colors whitespace-nowrap">
                    <i className="ri-settings-3-line"></i> 管理表单
                  </Link>
                </div>
                {assessments.length === 0 ? (
                  <div className="text-sm text-foreground-400">
                    <p>暂无已发布的测评表单，请先在Q库创建</p>
                    <Link to="/admin/libraries/q" className="inline-block mt-1 text-primary-500 hover:text-primary-600 font-medium">
                      去 Q库 创建测评 →
                    </Link>
                  </div>
                ) : (
                  <select value={form.q_library_file} onChange={(e) => update({ q_library_file: e.target.value })}
                    className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all">
                    <option value="">-- 请选择 --</option>
                    {assessments.map((a) => <option key={a.id} value={String(a.id)}>{a.title}</option>)}
                  </select>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground-700 mb-1.5">提问列表</label>
                  <div className="space-y-2 mb-2">
                    {form.dialog_questions.filter((q) => q.trim()).map((q, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs text-foreground-400 shrink-0">Q{idx + 1}</span>
                        <input value={q} onChange={(e) => updateDialogQ(idx, e.target.value)}
                          className="flex-1 px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300" />
                        <button onClick={() => update({ dialog_questions: form.dialog_questions.filter((_, i) => i !== idx) })}
                          className="w-7 h-7 rounded bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors">
                          <i className="ri-close-line text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={dialogQInput} onChange={(e) => setDialogQInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDialogQ(); } }}
                      placeholder="输入新问题后回车" className="flex-1 px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300" />
                    <button onClick={addDialogQ} className="px-3 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-all whitespace-nowrap">添加</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground-700 mb-1.5">收集规则</label>
                  <input value={form.collection_rules} onChange={(e) => update({ collection_rules: e.target.value })}
                    placeholder="所有必填字段收齐后自动进入处理" className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Processing Rules */}
      {activeStep === 2 && (
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground-950 flex items-center gap-2">
              <i className="ri-file-settings-line text-primary-500"></i> C库（规则文件） * — 可多选
            </h3>
            <Link to="/admin/libraries/c" className="text-xs font-medium text-primary-500 hover:text-primary-600 flex items-center gap-1 transition-colors whitespace-nowrap">
              <i className="ri-settings-3-line"></i> 管理文件
            </Link>
          </div>
          {cLibs.length === 0 ? (
            <div className="text-sm text-foreground-400">
              <p>暂无已发布的规则文件，请先在C库创建规则类文件</p>
              <Link to="/admin/libraries/c" className="inline-block mt-1 text-primary-500 hover:text-primary-600 font-medium">
                去 C库 创建文件 →
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {cLibs.map((f) => (
                <button key={f.id} onClick={() => toggleLib("c_library_rules", f.file_path)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    form.c_library_rules.includes(f.file_path)
                      ? "bg-primary-500 text-white"
                      : "bg-background-100 text-foreground-600 hover:bg-background-200"
                  }`}>
                  {f.file_name} {form.c_library_rules.includes(f.file_path) ? "✓" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Output Config */}
      {activeStep === 3 && (
        <div className="space-y-5">
          <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground-950 flex items-center gap-2">
                <i className="ri-book-2-line text-primary-500"></i> K库（素材/模板） * — 可多选
              </h3>
              <Link to="/admin/libraries/k" className="text-xs font-medium text-primary-500 hover:text-primary-600 flex items-center gap-1 transition-colors whitespace-nowrap">
                <i className="ri-settings-3-line"></i> 管理文件
              </Link>
            </div>
            {kLibs.length === 0 ? (
              <div className="text-sm text-foreground-400">
                <p>暂无已发布的K库文件</p>
                <Link to="/admin/libraries/k" className="inline-block mt-1 text-primary-500 hover:text-primary-600 font-medium">
                  去 K库 创建文件 →
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {kLibs.map((f) => (
                  <button key={f.id} onClick={() => toggleLib("k_library_materials", f.file_path)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      form.k_library_materials.includes(f.file_path)
                        ? "bg-primary-500 text-white"
                        : "bg-background-100 text-foreground-600 hover:bg-background-200"
                    }`}>
                    {f.file_name} {form.k_library_materials.includes(f.file_path) ? "✓" : ""}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">输出形式 *</label>
              <div className="flex flex-wrap gap-2">
                {OUTPUT_TYPES.map((ot) => (
                  <button key={ot.value} onClick={() => update({ output_type: ot.value })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      form.output_type === ot.value ? "bg-primary-500 text-white" : "bg-background-100 text-foreground-600 hover:bg-background-200"
                    }`}>{ot.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">定制输出规则</label>
              <textarea value={form.output_custom_rules} onChange={(e) => update({ output_custom_rules: e.target.value })}
                rows={2} placeholder="如：卡片上的人物名替换为用户输入的名字" maxLength={500}
                className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all resize-none" />
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Boundaries & Archive */}
      {activeStep === 4 && (
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">边界约束 *</label>
            <textarea value={form.boundary_constraints} onChange={(e) => update({ boundary_constraints: e.target.value })}
              rows={3} placeholder="不能做什么、超范围怎么办..." maxLength={500}
              className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all resize-none" />
            <p className="text-xs text-foreground-400 mt-1">{form.boundary_constraints.length}/500</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">归档规则</label>
            <textarea value={form.archive_rules} onChange={(e) => update({ archive_rules: e.target.value })}
              rows={2} placeholder="D库存什么、什么时候写..." maxLength={500}
              className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all resize-none" />
          </div>
        </div>
      )}

      {/* Step Navigation */}
      <div className="mt-8 flex items-center justify-between pt-4 border-t border-background-200">
        <button onClick={() => setActiveStep(Math.max(0, activeStep - 1))} disabled={activeStep === 0}
          className="px-4 py-2 text-sm font-medium text-foreground-600 hover:text-foreground-950 disabled:opacity-30 transition-colors whitespace-nowrap">
          ← 上一步
        </button>
        <div className="flex items-center gap-2">
          {activeStep < 4 ? (
            <button onClick={() => setActiveStep(activeStep + 1)}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap">
              下一步 →
            </button>
          ) : (
            <>
              <button onClick={() => handleSave("draft")} disabled={saving}
                className="px-5 py-2.5 bg-background-100 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-200 transition-all whitespace-nowrap disabled:opacity-50">保存草稿</button>
              <button onClick={() => handleSave("published")} disabled={saving || !form.name}
                className="px-5 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap disabled:opacity-50">{saving ? "保存中..." : "发布"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}