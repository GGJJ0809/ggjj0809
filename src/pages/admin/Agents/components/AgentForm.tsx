import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface AiModel {
  id: number;
  name: string;
  model_code: string;
  provider: string;
  default_temp: number;
  default_max_tokens: number;
}

interface AgentFormData {
  name: string;
  alias: string;
  category: string;
  icon: string;
  description: string;
  status: string;
  // configs
  model_id: number | null;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  question_display_mode: string;
  is_required_all: boolean;
  scoring_rule: string;
  archive_timing: string;
  archive_fields: string[];
  // ui configs
  theme_color: string;
  welcome_title: string;
  welcome_desc: string;
  welcome_media: string;
  btn_text: string;
  show_radar: boolean;
  show_score_detail: boolean;
  show_k_recommend: boolean;
  show_suggestions: boolean;
  ending_text: string;
  // pricing
  access_type: string;
  member_level_required: number;
  price_type: string;
  price: string;
  member_price: string;
  free_quota: string;
  // share
  share_title: string;
  share_desc: string;
  share_image: string;
  enable_distribution: boolean;
  commission_rate: string;
}

const ICON_OPTIONS = [
  { value: "ri-robot-2-line", label: "AI机器人" },
  { value: "ri-brain-line", label: "思维" },
  { value: "ri-lightbulb-line", label: "灵感" },
  { value: "ri-store-2-line", label: "销售" },
  { value: "ri-user-search-line", label: "搜索" },
  { value: "ri-team-line", label: "团队" },
  { value: "ri-customer-service-2-line", label: "客服" },
  { value: "ri-chat-3-line", label: "沟通" },
  { value: "ri-bar-chart-2-line", label: "图表" },
  { value: "ri-shake-hands-line", label: "合作" },
];

const CATEGORY_OPTIONS = ["能力评估", "岗位匹配", "领导力", "销售力", "专业测评", "心理测评"];

const ARCHIVE_FIELD_OPTIONS = ["基础信息", "测评得分", "推荐内容", "跟进计划", "发展计划", "面试建议", "推荐岗位"];

const emptyForm: AgentFormData = {
  name: "",
  alias: "",
  category: "",
  icon: "ri-robot-2-line",
  description: "",
  status: "draft",
  model_id: null,
  temperature: 0.7,
  max_tokens: 2048,
  system_prompt: "",
  question_display_mode: "step_by_step",
  is_required_all: true,
  scoring_rule: "",
  archive_timing: "auto",
  archive_fields: ["基础信息", "测评得分"],
  theme_color: "brand",
  welcome_title: "",
  welcome_desc: "",
  welcome_media: "",
  btn_text: "开始测评 →",
  show_radar: true,
  show_score_detail: true,
  show_k_recommend: true,
  show_suggestions: true,
  ending_text: "",
  access_type: "all",
  member_level_required: 0,
  price_type: "free",
  price: "",
  member_price: "",
  free_quota: "0",
  share_title: "",
  share_desc: "",
  share_image: "",
  enable_distribution: false,
  commission_rate: "0",
};

export default function AgentForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<AgentFormData>({ ...emptyForm });
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("basic");

  const fetchModels = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("ai_models")
        .select("*")
        .eq("is_enabled", true)
        .order("id");
      if (data) setModels(data);
    } catch {
      // silent
    }
  }, []);

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: agent, error: aErr } = await supabase
        .from("agents")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (aErr) throw aErr;
      if (!agent) throw new Error("Agent不存在");

      const [{ data: configs }, { data: uiConfigs }, { data: pricing }, { data: shareConfigs }] =
        await Promise.all([
          supabase.from("agent_configs").select("*").eq("agent_id", id).maybeSingle(),
          supabase.from("agent_ui_configs").select("*").eq("agent_id", id).maybeSingle(),
          supabase.from("agent_pricing").select("*").eq("agent_id", id).maybeSingle(),
          supabase.from("agent_share_configs").select("*").eq("agent_id", id).maybeSingle(),
        ]);

      setForm({
        name: agent.name || "",
        alias: agent.alias || "",
        category: agent.category || "",
        icon: agent.icon || "ri-robot-2-line",
        description: agent.description || "",
        status: agent.status || "draft",
        model_id: configs?.model_id ?? null,
        temperature: configs?.temperature ?? 0.7,
        max_tokens: configs?.max_tokens ?? 2048,
        system_prompt: configs?.system_prompt || "",
        question_display_mode: configs?.question_display_mode || "step_by_step",
        is_required_all: configs?.is_required_all ?? true,
        scoring_rule: typeof configs?.scoring_rule === "string" ? configs.scoring_rule : JSON.stringify(configs?.scoring_rule || ""),
        archive_timing: configs?.archive_timing || "auto",
        archive_fields: Array.isArray(configs?.archive_fields) ? configs.archive_fields : ["基础信息", "测评得分"],
        theme_color: uiConfigs?.theme_color || "brand",
        welcome_title: uiConfigs?.welcome_title || "",
        welcome_desc: uiConfigs?.welcome_desc || "",
        welcome_media: uiConfigs?.welcome_media || "",
        btn_text: uiConfigs?.btn_text || "开始测评 →",
        show_radar: uiConfigs?.show_radar ?? true,
        show_score_detail: uiConfigs?.show_score_detail ?? true,
        show_k_recommend: uiConfigs?.show_k_recommend ?? true,
        show_suggestions: uiConfigs?.show_suggestions ?? true,
        ending_text: uiConfigs?.ending_text || "",
        access_type: pricing?.access_type || "all",
        member_level_required: pricing?.member_level_required ?? 0,
        price_type: pricing?.price_type || "free",
        price: pricing?.price ? String(pricing.price) : "",
        member_price: pricing?.member_price ? String(pricing.member_price) : "",
        free_quota: pricing?.free_quota != null ? String(pricing.free_quota) : "0",
        share_title: shareConfigs?.share_title || "",
        share_desc: shareConfigs?.share_desc || "",
        share_image: shareConfigs?.share_image || "",
        enable_distribution: shareConfigs?.enable_distribution ?? false,
        commission_rate: shareConfigs?.commission_rate ? String(shareConfigs.commission_rate) : "0",
      });
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchModels();
    fetchAgent();
  }, [fetchModels, fetchAgent]);

  const update = (patch: Partial<AgentFormData>) => setForm((f) => ({ ...f, ...patch }));

  const toggleArchiveField = (field: string) => {
    const current = form.archive_fields;
    update({
      archive_fields: current.includes(field)
        ? current.filter((f) => f !== field)
        : [...current, field],
    });
  };

  const handleSave = async (status: string) => {
    setSaving(true);
    setError("");
    try {
      // Upsert agent
      const agentPayload = {
        name: form.name,
        alias: form.alias,
        category: form.category,
        icon: form.icon,
        description: form.description,
        status,
        updated_at: new Date().toISOString(),
      };

      let agentId = id ? Number(id) : null;

      if (isEdit) {
        const { error: uErr } = await supabase.from("agents").update(agentPayload).eq("id", agentId);
        if (uErr) throw uErr;
      } else {
        const { data: newAgent, error: iErr } = await supabase
          .from("agents")
          .insert({ ...agentPayload, sort_order: 99 })
          .select("id")
          .single();
        if (iErr) throw iErr;
        agentId = newAgent.id;
      }

      if (!agentId) throw new Error("Agent ID 缺失");

      // Upsert configs
      const configPayload = {
        agent_id: agentId,
        model_id: form.model_id,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        system_prompt: form.system_prompt,
        question_display_mode: form.question_display_mode,
        is_required_all: form.is_required_all,
        scoring_rule: form.scoring_rule ? JSON.parse(form.scoring_rule) : null,
        archive_timing: form.archive_timing,
        archive_fields: form.archive_fields,
        updated_at: new Date().toISOString(),
      };

      const { data: existingConfig } = await supabase
        .from("agent_configs")
        .select("id")
        .eq("agent_id", agentId)
        .maybeSingle();

      if (existingConfig) {
        await supabase.from("agent_configs").update(configPayload).eq("agent_id", agentId);
      } else {
        await supabase.from("agent_configs").insert(configPayload);
      }

      // Upsert ui configs
      const uiPayload = {
        agent_id: agentId,
        theme_color: form.theme_color,
        welcome_title: form.welcome_title,
        welcome_desc: form.welcome_desc,
        welcome_media: form.welcome_media,
        btn_text: form.btn_text,
        show_radar: form.show_radar,
        show_score_detail: form.show_score_detail,
        show_k_recommend: form.show_k_recommend,
        show_suggestions: form.show_suggestions,
        ending_text: form.ending_text,
        updated_at: new Date().toISOString(),
      };

      const { data: existingUi } = await supabase
        .from("agent_ui_configs")
        .select("id")
        .eq("agent_id", agentId)
        .maybeSingle();

      if (existingUi) {
        await supabase.from("agent_ui_configs").update(uiPayload).eq("agent_id", agentId);
      } else {
        await supabase.from("agent_ui_configs").insert(uiPayload);
      }

      // Upsert pricing
      const pricingPayload = {
        agent_id: agentId,
        access_type: form.access_type,
        member_level_required: form.member_level_required,
        price_type: form.price_type,
        price: form.price ? parseFloat(form.price) : 0,
        member_price: form.member_price ? parseFloat(form.member_price) : 0,
        free_quota: form.free_quota ? parseInt(form.free_quota, 10) : 0,
        updated_at: new Date().toISOString(),
      };

      const { data: existingPricing } = await supabase
        .from("agent_pricing")
        .select("id")
        .eq("agent_id", agentId)
        .maybeSingle();

      if (existingPricing) {
        await supabase.from("agent_pricing").update(pricingPayload).eq("agent_id", agentId);
      } else {
        await supabase.from("agent_pricing").insert(pricingPayload);
      }

      // Upsert share configs
      const sharePayload = {
        agent_id: agentId,
        share_title: form.share_title,
        share_desc: form.share_desc,
        share_image: form.share_image,
        enable_distribution: form.enable_distribution,
        commission_rate: form.commission_rate ? parseFloat(form.commission_rate) : 0,
        updated_at: new Date().toISOString(),
      };

      const { data: existingShare } = await supabase
        .from("agent_share_configs")
        .select("id")
        .eq("agent_id", agentId)
        .maybeSingle();

      if (existingShare) {
        await supabase.from("agent_share_configs").update(sharePayload).eq("agent_id", agentId);
      } else {
        await supabase.from("agent_share_configs").insert(sharePayload);
      }

      // Navigate
      navigate("/admin/agents");
    } catch (e: any) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
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

  const tabs = [
    { key: "basic", label: "一、基础信息", icon: "ri-information-line" },
    { key: "core", label: "二、核心配置", icon: "ri-settings-3-line" },
    { key: "ui", label: "三、前端展示", icon: "ri-smartphone-line" },
    { key: "pricing", label: "四、权限定价", icon: "ri-money-dollar-circle-line" },
    { key: "share", label: "五、预热分享", icon: "ri-share-forward-line" },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => navigate("/admin/agents")}
            className="text-sm text-foreground-500 hover:text-foreground-700 mb-1 flex items-center gap-1"
          >
            <i className="ri-arrow-left-line"></i> 返回列表
          </button>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground-950">
            {isEdit ? "编辑Agent" : "创建Agent"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSave("draft")}
            disabled={saving}
            className="px-5 py-2.5 bg-background-100 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-200 transition-all whitespace-nowrap disabled:opacity-50"
          >
            保存草稿
          </button>
          <button
            onClick={() => handleSave("published")}
            disabled={saving}
            className="px-5 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap disabled:opacity-50"
          >
            发布
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 mb-6 border-b border-background-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
              activeTab === tab.key
                ? "border-primary-500 text-primary-500"
                : "border-transparent text-foreground-500 hover:text-foreground-700"
            }`}
          >
            <i className={tab.icon}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Basic Info */}
      {activeTab === "basic" && (
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">
                Agent名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="例如：销售能力测评Agent"
                className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">别名/简称</label>
              <input
                type="text"
                value={form.alias}
                onChange={(e) => update({ alias: e.target.value })}
                placeholder="例如：销售测评"
                className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">分类标签</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => update({ category: form.category === cat ? "" : cat })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    form.category === cat
                      ? "bg-primary-500 text-white"
                      : "bg-background-100 text-foreground-600 hover:bg-background-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">图标</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ icon: opt.value })}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                    form.icon === opt.value
                      ? "bg-primary-500 text-white"
                      : "bg-background-100 text-foreground-500 hover:bg-background-200"
                  }`}
                  title={opt.label}
                >
                  <i className={`${opt.value} text-lg`}></i>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">Agent描述</label>
            <textarea
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={3}
              placeholder="描述这个Agent的功能和价值..."
              maxLength={500}
              className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all resize-none"
            />
            <p className="text-xs text-foreground-400 mt-1">{form.description.length}/500</p>
          </div>
        </div>
      )}

      {/* Tab: Core Config */}
      {activeTab === "core" && (
        <div className="space-y-5">
          {/* AI Model */}
          <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6">
            <h3 className="text-base font-semibold text-foreground-950 mb-4 flex items-center gap-2">
              <i className="ri-robot-2-line text-primary-500"></i> AI模型配置 <span className="text-red-500">*</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">选择模型</label>
                <select
                  value={form.model_id ?? ""}
                  onChange={(e) => update({ model_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
                >
                  <option value="">-- 请选择模型 --</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.provider})
                    </option>
                  ))}
                </select>
              </div>
              <div></div>
              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">
                  温度: {form.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={form.temperature}
                  onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
                  className="w-full accent-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">最大Token</label>
                <input
                  type="number"
                  value={form.max_tokens}
                  onChange={(e) => update({ max_tokens: parseInt(e.target.value, 10) || 2048 })}
                  className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">系统提示词</label>
              <textarea
                value={form.system_prompt}
                onChange={(e) => update({ system_prompt: e.target.value })}
                rows={3}
                placeholder="例如：你是一位专业的企业能力评估顾问..."
                maxLength={500}
                className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all resize-none"
              />
            </div>
          </div>

          {/* C Library */}
          <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6">
            <h3 className="text-base font-semibold text-foreground-950 mb-4 flex items-center gap-2">
              <i className="ri-file-list-3-line text-primary-500"></i> C库（能力包）配置 <span className="text-red-500">*</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">展示方式</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="display_mode"
                      value="step_by_step"
                      checked={form.question_display_mode === "step_by_step"}
                      onChange={() => update({ question_display_mode: "step_by_step" })}
                      className="accent-primary-500"
                    />
                    <span className="text-sm text-foreground-700">逐题展示</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="display_mode"
                      value="all_at_once"
                      checked={form.question_display_mode === "all_at_once"}
                      onChange={() => update({ question_display_mode: "all_at_once" })}
                      className="accent-primary-500"
                    />
                    <span className="text-sm text-foreground-700">一页全部展示</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">每题必答</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="required_all"
                      checked={form.is_required_all}
                      onChange={() => update({ is_required_all: true })}
                      className="accent-primary-500"
                    />
                    <span className="text-sm text-foreground-700">是</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="required_all"
                      checked={!form.is_required_all}
                      onChange={() => update({ is_required_all: false })}
                      className="accent-primary-500"
                    />
                    <span className="text-sm text-foreground-700">否（允许跳过）</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">计分规则 (JSON，可选)</label>
              <textarea
                value={form.scoring_rule}
                onChange={(e) => update({ scoring_rule: e.target.value })}
                rows={2}
                placeholder='例如: {"A": 5, "B": 3, "C": 1, "D": 0}'
                className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all resize-none font-mono"
              />
            </div>
          </div>

          {/* D Library */}
          <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6">
            <h3 className="text-base font-semibold text-foreground-950 mb-4 flex items-center gap-2">
              <i className="ri-folder-line text-primary-500"></i> D库（数据包）配置 <span className="text-red-500">*</span>
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">建档时机</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="archive_timing"
                    value="auto"
                    checked={form.archive_timing === "auto"}
                    onChange={() => update({ archive_timing: "auto" })}
                    className="accent-primary-500"
                  />
                  <span className="text-sm text-foreground-700">测评完成后自动建档</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="archive_timing"
                    value="confirm"
                    checked={form.archive_timing === "confirm"}
                    onChange={() => update({ archive_timing: "confirm" })}
                    className="accent-primary-500"
                  />
                  <span className="text-sm text-foreground-700">用户确认后建档</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">档案字段</label>
              <div className="flex flex-wrap gap-2">
                {ARCHIVE_FIELD_OPTIONS.map((field) => (
                  <button
                    key={field}
                    onClick={() => toggleArchiveField(field)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      form.archive_fields.includes(field)
                        ? "bg-primary-500 text-white"
                        : "bg-background-100 text-foreground-600 hover:bg-background-200"
                    }`}
                  >
                    {field} {form.archive_fields.includes(field) ? "✓" : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: UI Config */}
      {activeTab === "ui" && (
        <div className="space-y-5">
          <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 space-y-5">
            <h3 className="text-base font-semibold text-foreground-950 flex items-center gap-2">
              <i className="ri-palette-line text-primary-500"></i> 欢迎页配置
            </h3>
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">欢迎标题</label>
              <input
                type="text"
                value={form.welcome_title}
                onChange={(e) => update({ welcome_title: e.target.value })}
                placeholder="例如：欢迎来到销售能力测评"
                className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">欢迎描述</label>
              <textarea
                value={form.welcome_desc}
                onChange={(e) => update({ welcome_desc: e.target.value })}
                rows={2}
                placeholder="描述测评的内容和价值..."
                maxLength={500}
                className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">开始按钮文字</label>
              <input
                type="text"
                value={form.btn_text}
                onChange={(e) => update({ btn_text: e.target.value })}
                className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
              />
            </div>
          </div>

          <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 space-y-5">
            <h3 className="text-base font-semibold text-foreground-950 flex items-center gap-2">
              <i className="ri-bar-chart-2-line text-primary-500"></i> 结果页配置
            </h3>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_radar}
                  onChange={(e) => update({ show_radar: e.target.checked })}
                  className="accent-primary-500 rounded"
                />
                <span className="text-sm text-foreground-700">显示雷达图</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_score_detail}
                  onChange={(e) => update({ show_score_detail: e.target.checked })}
                  className="accent-primary-500 rounded"
                />
                <span className="text-sm text-foreground-700">显示得分详情</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_k_recommend}
                  onChange={(e) => update({ show_k_recommend: e.target.checked })}
                  className="accent-primary-500 rounded"
                />
                <span className="text-sm text-foreground-700">显示K库推荐</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_suggestions}
                  onChange={(e) => update({ show_suggestions: e.target.checked })}
                  className="accent-primary-500 rounded"
                />
                <span className="text-sm text-foreground-700">显示行动建议</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">结果页结束语</label>
              <textarea
                value={form.ending_text}
                onChange={(e) => update({ ending_text: e.target.value })}
                rows={2}
                placeholder="例如：感谢您完成测评！您的专属分析报告已生成..."
                maxLength={500}
                className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all resize-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Pricing */}
      {activeTab === "pricing" && (
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">访问权限</label>
            <div className="flex gap-3">
              {[
                { value: "all", label: "全部用户" },
                { value: "member_only", label: "仅会员" },
                { value: "group_only", label: "指定用户组" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="access_type"
                    value={opt.value}
                    checked={form.access_type === opt.value}
                    onChange={() => update({ access_type: opt.value })}
                    className="accent-primary-500"
                  />
                  <span className="text-sm text-foreground-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">会员等级要求</label>
            <div className="flex gap-3">
              {[
                { value: 0, label: "无" },
                { value: 1, label: "会员" },
                { value: 2, label: "黄金会员" },
                { value: 3, label: "VIP会员" },
                { value: 4, label: "SVIP会员" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="member_level"
                    value={opt.value}
                    checked={form.member_level_required === opt.value}
                    onChange={() => update({ member_level_required: opt.value })}
                    className="accent-primary-500"
                  />
                  <span className="text-sm text-foreground-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">定价类型</label>
            <div className="flex gap-3">
              {[
                { value: "free", label: "免费" },
                { value: "paid", label: "付费" },
                { value: "member_exclusive", label: "会员专属" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="price_type"
                    value={opt.value}
                    checked={form.price_type === opt.value}
                    onChange={() => update({ price_type: opt.value })}
                    className="accent-primary-500"
                  />
                  <span className="text-sm text-foreground-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {form.price_type === "paid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">价格 (¥)</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => update({ price: e.target.value })}
                  step="0.01"
                  placeholder="99.00"
                  className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">会员价 (¥)</label>
                <input
                  type="number"
                  value={form.member_price}
                  onChange={(e) => update({ member_price: e.target.value })}
                  step="0.01"
                  placeholder="49.00"
                  className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1.5">免费使用限制</label>
              <div className="flex gap-3 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quota_type"
                    checked={form.free_quota === "0"}
                    onChange={() => update({ free_quota: "0" })}
                    className="accent-primary-500"
                  />
                  <span className="text-sm text-foreground-700">不限次</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quota_type"
                    checked={form.free_quota !== "0"}
                    onChange={() => update({ free_quota: "3" })}
                    className="accent-primary-500"
                  />
                  <span className="text-sm text-foreground-700">限次</span>
                </label>
              </div>
              {form.free_quota !== "0" && (
                <input
                  type="number"
                  value={form.free_quota}
                  onChange={(e) => update({ free_quota: e.target.value })}
                  placeholder="3"
                  className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Share */}
      {activeTab === "share" && (
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">分享标题</label>
            <input
              type="text"
              value={form.share_title}
              onChange={(e) => update({ share_title: e.target.value })}
              placeholder="例如：销售能力测评 - 8维评估你的销售力"
              className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-700 mb-1.5">分享描述</label>
            <textarea
              value={form.share_desc}
              onChange={(e) => update({ share_desc: e.target.value })}
              rows={2}
              maxLength={255}
              placeholder="例如：免费测一测你的销售能力水平，获取专属提升方案"
              className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all resize-none"
            />
            <p className="text-xs text-foreground-400 mt-1">{form.share_desc.length}/255</p>
          </div>

          <div className="border-t border-background-200 pt-5">
            <h4 className="text-sm font-semibold text-foreground-950 mb-4">分销设置</h4>
            <div className="flex items-center gap-3 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enable_distribution}
                  onChange={(e) => update({ enable_distribution: e.target.checked })}
                  className="accent-primary-500 rounded"
                />
                <span className="text-sm text-foreground-700">开启分销</span>
              </label>
            </div>
            {form.enable_distribution && (
              <div>
                <label className="block text-sm font-medium text-foreground-700 mb-1.5">佣金比例 (%)</label>
                <input
                  type="number"
                  value={form.commission_rate}
                  onChange={(e) => update({ commission_rate: e.target.value })}
                  step="0.1"
                  min="0"
                  max="100"
                  className="w-40 px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-background-200">
        <button
          onClick={() => navigate("/admin/agents")}
          className="px-5 py-2.5 text-sm font-medium text-foreground-600 hover:text-foreground-950 transition-colors whitespace-nowrap"
        >
          取消
        </button>
        <button
          onClick={() => handleSave("draft")}
          disabled={saving}
          className="px-6 py-2.5 bg-background-100 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-200 transition-all whitespace-nowrap disabled:opacity-50"
        >
          保存草稿
        </button>
        <button
          onClick={() => handleSave("published")}
          disabled={saving || !form.name || !form.model_id}
          className="px-6 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap disabled:opacity-50"
        >
          {saving ? "保存中..." : "立即发布"}
        </button>
      </div>
    </div>
  );
}