import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

/* ---- Types ---- */

interface AgentDetail {
  id: number;
  agent_type: string;
  name: string;
  short_desc: string;
  avatar: string;
  tags: string[];
  used_count: number;
  model_id: number | null;
}

interface ConsultantConfig {
  id: number;
  role_definition: string;
  communication_style: string;
  opening_greeting: string;
  address_term: string;
  c_library_files: string[];
  k_library_files: string[];
  q_library_files: string[];
  d_library_file: string;
  workflow_sop: string;
  stage_definition: string;
  follow_up_rules: string;
  boundary_constraints: string;
  escalation_rules: string;
  data_write_rules: string;
  output_format: string;
  reference_scripts: string;
  closing_template: string;
}

interface ToolConfig {
  id: number;
  input_config: any;
  c_library_rules: any;
  k_library_materials: string[];
  output_type: string;
  output_custom_rules: string;
  boundary_constraints: string;
  archive_rules: string;
}

interface QLibraryItem {
  id: number;
  file_name: string;
  q_type: string;
  fields: any[];
}

interface QField {
  id: string;
  type?: string;
  label?: string;
  text?: string;
  required?: boolean;
  options?: any[];
  dimension?: string;
  placeholder?: string;
}

interface ChatMessage {
  role: "agent" | "user";
  text: string;
  timestamp?: number;
}

const COMM_STYLE_LABELS: Record<string, string> = {
  professional: "专业权威",
  friendly: "亲和易懂",
  lively: "活泼有趣",
  concise: "简洁干练",
};

const OUTPUT_TYPE_LABEL: Record<string, string> = {
  report: "诊断报告",
  card: "结果卡片",
  type_result: "类型匹配",
  recommendations: "推荐列表",
};

/* ---- Component ---- */

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [consultantCfg, setConsultantCfg] = useState<ConsultantConfig | null>(null);
  const [toolCfg, setToolCfg] = useState<ToolConfig | null>(null);
  const [qLibrary, setQLibrary] = useState<QLibraryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Consultant
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);

  // Tool
  const [toolPhase, setToolPhase] = useState<"intro" | "collecting" | "result">("intro");
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [toolResult, setToolResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  /* ---- Fetch ---- */

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const { data: agentData, error: aErr } = await supabase
        .from("agents")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (aErr) throw aErr;
      if (!agentData) throw new Error("智能体不存在");

      const at = agentData.agent_type || "tool";
      let cc: ConsultantConfig | null = null;
      let tc: ToolConfig | null = null;
      let qLib: QLibraryItem | null = null;

      if (at === "consultant") {
        const { data: cfg } = await supabase
          .from("agent_consultant_configs")
          .select("*")
          .eq("agent_id", id)
          .maybeSingle();
        if (cfg) cc = cfg as ConsultantConfig;
      } else {
        const { data: cfg } = await supabase
          .from("agent_tool_configs")
          .select("*")
          .eq("agent_id", id)
          .maybeSingle();
        if (cfg) tc = cfg as ToolConfig;

        // Load Q library if referenced
        if (tc?.input_config?.q_library_id) {
          const { data: qData } = await supabase
            .from("q_libraries")
            .select("*")
            .eq("id", tc.input_config.q_library_id)
            .maybeSingle();
          if (qData) qLib = qData as QLibraryItem;
        }
      }

      setAgent({
        id: agentData.id,
        agent_type: at,
        name: agentData.name || "",
        short_desc: agentData.short_desc || agentData.description || "",
        avatar: agentData.avatar || "",
        tags: Array.isArray(agentData.tags) ? agentData.tags : [],
        used_count: agentData.used_count || 0,
        model_id: agentData.model_id || null,
      });
      setConsultantCfg(cc);
      setToolCfg(tc);
      setQLibrary(qLib);
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  /* ---- Consultant Handlers ---- */

  const startConsultant = () => {
    if (!consultantCfg) return;
    const greeting =
      consultantCfg.opening_greeting ||
      `你好！我是你的${agent?.name || "AI顾问"}，有什么可以帮你的？`;
    setMessages([{ role: "agent", text: greeting, timestamp: Date.now() }]);
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;
    const newMsgs: ChatMessage[] = [...messages, { role: "user", text, timestamp: Date.now() }];
    setMessages(newMsgs);
    setInputText("");
    setIsTyping(true);

    // Try Edge Function first, fallback to simulation
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const apiMessages = newMsgs.map((m) => ({
        role: m.role === "agent" ? "assistant" as const : "user" as const,
        content: m.text,
      }));

      const resp = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/agent-chat`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ agent_id: agent?.id, messages: apiMessages }),
        }
      );

      if (resp.ok) {
        const json = await resp.json();
        const updated = [...newMsgs, { role: "agent" as const, text: json.reply || "抱歉，我暂时无法回复。", timestamp: Date.now() }];
        setMessages(updated);
        setIsTyping(false);
        if (updated.length >= 16) setChatEnded(true);
        return;
      }
    } catch (_) {
      // Edge Function unavailable, use simulation
    }

    // Simulated fallback
    setTimeout(() => {
      const reply = generateConsultantReply(text, consultantCfg, agent, newMsgs);
      const updated = [...newMsgs, { role: "agent" as const, text: reply, timestamp: Date.now() }];
      setMessages(updated);
      setIsTyping(false);
      if (updated.length >= 16) setChatEnded(true);
    }, 1000 + Math.random() * 1500);
  };

  const endChatAndArchive = async () => {
    setChatEnded(true);
    if (!consultantCfg?.d_library_file) return;
    // Write summary to D-library archive
    try {
      const dLibId = parseInt(consultantCfg.d_library_file, 10);
      if (isNaN(dLibId)) return;
      const summary = buildConsultantSummary(messages);
      await supabase.from("d_archives").insert({
        d_library_id: dLibId,
        agent_id: agent?.id,
        archive_data: { conversation: messages.slice(-6) },
        summary,
      });
    } catch (_) {
      // silent
    }
  };

  /* ---- Tool Handlers ---- */

  const startToolCollection = () => {
    setToolPhase("collecting");
    setCurrentQIdx(0);
    setAnswers({});
    setScores({});
    setToolResult(null);
  };

  const answerQuestion = (qField: QField, value: any) => {
    setAnswers((prev) => ({ ...prev, [qField.id]: value }));
    // Calculate score for questionnaire type
    if (qLibrary?.q_type === "questionnaire" && qField.options) {
      const selected = qField.options.find(
        (o: any) => o.text === value || o.label === value
      );
      if (selected?.score != null) {
        setScores((prev) => ({ ...prev, [qField.id]: selected.score }));
      }
    }
  };

  const goNextQuestion = () => {
    if (qLibrary?.fields && currentQIdx < qLibrary.fields.length - 1) {
      setCurrentQIdx(currentQIdx + 1);
    }
  };

  const goPrevQuestion = () => {
    if (currentQIdx > 0) setCurrentQIdx(currentQIdx - 1);
  };

  const handleToolSubmit = async () => {
    setSubmitting(true);
    try {
      // Build result
      const result = buildToolResult();
      setToolResult(result);
      setToolPhase("result");

      // Write to D-library
      await writeToArchive(result);

      // Update usage count
      await supabase.rpc("increment_agent_used_count", {
        agent_id: agent?.id,
      });
    } catch (_) {
      // result still shown
    } finally {
      setSubmitting(false);
    }
  };

  const buildToolResult = () => {
    const name = agent?.name || "测评";
    if (qLibrary?.q_type === "questionnaire") {
      // Calculate dimension scores
      const dimMap: Record<string, { total: number; count: number }> = {};
      qLibrary.fields.forEach((f: any) => {
        const dim = f.dimension || "综合";
        if (!dimMap[dim]) dimMap[dim] = { total: 0, count: 0 };
        const score = scores[f.id] || 0;
        dimMap[dim].total += score;
        dimMap[dim].count += 1;
      });

      const dimensions = Object.entries(dimMap).map(([label, v]) => ({
        label,
        score: Math.round((v.total / (v.count * 5)) * 100),
      }));
      const avgScore = Math.round(
        dimensions.reduce((s, d) => s + d.score, 0) / Math.max(dimensions.length, 1)
      );
      const level =
        avgScore >= 85 ? "A（优秀）" : avgScore >= 70 ? "B（良好）" : avgScore >= 55 ? "C（一般）" : "D（待提升）";

      const strengths = dimensions.filter((d) => d.score >= 75).map((d) => d.label);
      const improvements = dimensions.filter((d) => d.score < 60).map((d) => d.label);

      return {
        type: "questionnaire",
        title: `${name}结果报告`,
        level,
        summary: `综合得分 ${avgScore} 分，等级 ${level}。${strengths.length > 0 ? "优势维度：" + strengths.join("、") + "。" : ""}${improvements.length > 0 ? "建议提升：" + improvements.join("、") + "。" : ""}`,
        dimensions,
        recommendations: [
          "《异议处理三部曲》课程 - 匹配度92%",
          "《高效成交话术》课程 - 匹配度87%",
          "建议在2周内完成相关课程学习后重新测评",
        ],
      };
    }

    // Form type
    return {
      type: "form",
      title: `${name}提交结果`,
      summary: `已收到你的${qLibrary?.file_name || "信息"}，我们会尽快进行分析并给出建议。`,
      collected: Object.keys(answers).length,
    };
  };

  const writeToArchive = async (result: any) => {
    // Determine D-library from tool config archive_rules or agent mapping
    const dLibId = resolveDLibrary();
    if (!dLibId) return;

    try {
      await supabase.from("d_archives").insert({
        d_library_id: dLibId,
        agent_id: agent?.id,
        archive_data: { answers, scores, result },
        summary: result.summary || "",
      });
    } catch (_) {
      // silent
    }
  };

  const resolveDLibrary = (): number | null => {
    // Map: agent_id → d_library_id based on known assignments
    const map: Record<number, number> = {
      1: 1, // 销售能力测评 → 销售跟进档案
      2: 2, // 领导力诊断 → 高管档案
      4: 1, // 团队效能 → 销售跟进档案
      5: 1, // 客户需求诊断 → 销售跟进档案
    };
    return map[agent?.id || 0] || null;
  };

  /* ---- UI Helpers ---- */

  const renderField = (field: QField) => {
    const fieldType = field.type || "text";
    const val = answers[field.id] || "";

    if (fieldType === "textarea") {
      return (
        <textarea
          value={val}
          onChange={(e) => answerQuestion(field, e.target.value)}
          rows={3}
          placeholder={field.placeholder || `请输入${field.label}`}
          className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all resize-none"
        />
      );
    }
    if (fieldType === "select") {
      return (
        <select
          value={val}
          onChange={(e) => answerQuestion(field, e.target.value)}
          className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all"
        >
          <option value="">-- 请选择 --</option>
          {field.options?.map((o: any) => (
            <option key={typeof o === "string" ? o : o.text || o.label} value={typeof o === "string" ? o : o.text || o.label}>
              {typeof o === "string" ? o : o.text || o.label}
            </option>
          ))}
        </select>
      );
    }
    if (fieldType === "checkbox") {
      return (
        <div className="space-y-1.5">
          {field.options?.map((o: any) => {
            const optVal = typeof o === "string" ? o : o.text || o.label;
            const selected = Array.isArray(val) ? val.includes(optVal) : false;
            return (
              <label key={optVal} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const arr = Array.isArray(answers[field.id]) ? [...answers[field.id]] : [];
                    if (arr.includes(optVal)) {
                      setAnswers((prev) => ({ ...prev, [field.id]: arr.filter((v: string) => v !== optVal) }));
                    } else {
                      setAnswers((prev) => ({ ...prev, [field.id]: [...arr, optVal] }));
                    }
                  }}
                  className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400"
                />
                <span className="text-sm text-foreground-700">{optVal}</span>
              </label>
            );
          })}
        </div>
      );
    }
    if (fieldType === "number") {
      return (
        <input
          type="number"
          value={val}
          onChange={(e) => answerQuestion(field, e.target.value)}
          placeholder={field.placeholder || `请输入${field.label}`}
          className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all"
        />
      );
    }
    // default text
    return (
      <input
        type="text"
        value={val}
        onChange={(e) => answerQuestion(field, e.target.value)}
        placeholder={field.placeholder || `请输入${field.label}`}
        className="w-full px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm focus:outline-none focus:border-primary-300 transition-all"
      />
    );
  };

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-16">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-16 px-4">
        <i className="ri-error-warning-line text-4xl text-foreground-400 mb-3"></i>
        <p className="text-foreground-600 text-sm">{error || "智能体不存在"}</p>
        <Link
          to="/agents"
          className="mt-4 text-primary-500 text-sm font-medium hover:underline"
        >
          &larr; 返回列表
        </Link>
      </div>
    );
  }

  const isConsultant = agent.agent_type === "consultant";
  const typeLabel = isConsultant ? "顾问型" : "工具型";

  return (
    <div className="min-h-screen pt-16 bg-background-50 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-16 z-40 bg-background-50/95 backdrop-blur-md border-b border-background-200/70">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link
            to="/agents"
            className="flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground-700"
          >
            <i className="ri-arrow-left-line"></i>
            <span className="hidden sm:inline">返回</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
              <i className="ri-robot-2-line text-sm text-primary-500"></i>
            </div>
            <span className="text-sm font-semibold text-foreground-950 truncate max-w-[160px] sm:max-w-none">
              {agent.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-background-100 text-foreground-500">
              {typeLabel}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-6 py-6 md:py-10">
        {/* ========== CONSULTANT ========== */}
        {isConsultant && (
          <>
            {messages.length === 0 ? (
              <div className="animate-fade-in-up">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-primary-100 flex items-center justify-center mb-4">
                    <i className="ri-chat-3-line text-3xl text-primary-600"></i>
                  </div>
                  <h1 className="text-xl md:text-2xl font-bold text-foreground-950 mb-2">
                    {agent.name}
                  </h1>
                  <p className="text-sm text-foreground-500 max-w-md mx-auto">
                    {agent.short_desc}
                  </p>
                </div>

                {consultantCfg && (
                  <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 mb-6 space-y-3">
                    {consultantCfg.role_definition && (
                      <div>
                        <span className="text-xs font-semibold text-foreground-700">角色定位</span>
                        <p className="text-xs text-foreground-500 mt-0.5">
                          {consultantCfg.role_definition}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <span className="text-xs font-semibold text-foreground-700">表达风格</span>
                        <span className="text-xs text-foreground-500 ml-1">
                          {COMM_STYLE_LABELS[consultantCfg.communication_style] || consultantCfg.communication_style || "专业亲和"}
                        </span>
                      </div>
                      {consultantCfg.address_term && (
                        <div>
                          <span className="text-xs font-semibold text-foreground-700">称呼方式</span>
                          <span className="text-xs text-foreground-500 ml-1">
                            {consultantCfg.address_term}
                          </span>
                        </div>
                      )}
                    </div>
                    {(consultantCfg.c_library_files?.length > 0 || consultantCfg.k_library_files?.length > 0) && (
                      <div>
                        <span className="text-xs font-semibold text-foreground-700">引用的知识库</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {consultantCfg.c_library_files?.map((f) => (
                            <span key={f} className="px-2 py-0.5 rounded bg-primary-50 text-primary-600 text-[10px] font-medium">
                              {f}
                            </span>
                          ))}
                          {consultantCfg.k_library_files?.map((f) => (
                            <span key={f} className="px-2 py-0.5 rounded bg-background-100 text-foreground-600 text-[10px] font-medium">
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={startConsultant}
                  className="w-full py-3.5 bg-primary-500 text-white rounded-xl text-base font-semibold hover:bg-primary-600 transition-all flex items-center justify-center gap-2"
                >
                  开始对话 <i className="ri-arrow-right-line"></i>
                </button>
              </div>
            ) : (
              /* Chat UI */
              <div className="flex flex-col h-[calc(100vh-140px)]">
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 scrollbar-none">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-primary-500 text-white rounded-br-md"
                            : "bg-background-100 text-foreground-800 rounded-bl-md"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-background-100 rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 rounded-full bg-foreground-300 animate-bounce" style={{ animationDelay: "0ms" }}></div>
                          <div className="w-2 h-2 rounded-full bg-foreground-300 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                          <div className="w-2 h-2 rounded-full bg-foreground-300 animate-bounce" style={{ animationDelay: "300ms" }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {chatEnded ? (
                  <div className="bg-primary-50 border border-primary-200/50 rounded-xl p-4 mb-3">
                    <p className="text-sm text-primary-700 font-medium mb-1">
                      本次对话已结束
                    </p>
                    <p className="text-xs text-foreground-500 mb-3">
                      对话摘要已保存到你的个人档案
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setMessages([]);
                          setChatEnded(false);
                          startConsultant();
                        }}
                        className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg font-medium hover:bg-primary-600 transition-all whitespace-nowrap"
                      >
                        开启新对话
                      </button>
                      <Link
                        to="/agents"
                        className="px-4 py-2 border border-background-200/70 text-foreground-600 text-sm rounded-lg font-medium hover:bg-background-50 transition-all whitespace-nowrap"
                      >
                        返回列表
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.length >= 10 && (
                      <button
                        onClick={endChatAndArchive}
                        className="mb-2 self-center px-4 py-1.5 rounded-full border border-background-200/70 text-xs text-foreground-500 hover:bg-background-100 transition-all whitespace-nowrap"
                      >
                        结束对话并保存摘要
                      </button>
                    )}
                    <div className="shrink-0 flex gap-2">
                      <input
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder="输入你的问题..."
                        disabled={isTyping}
                        className="flex-1 px-4 py-3 bg-background-50 border border-background-200 rounded-xl text-sm focus:outline-none focus:border-primary-300 transition-all disabled:opacity-50"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!inputText.trim() || isTyping}
                        className="w-11 h-11 rounded-xl bg-primary-500 text-white flex items-center justify-center hover:bg-primary-600 transition-all disabled:opacity-40 shrink-0"
                      >
                        <i className="ri-send-plane-fill"></i>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ========== TOOL ========== */}
        {!isConsultant && (
          <>
            {/* Phase: Intro */}
            {toolPhase === "intro" && (
              <div className="animate-fade-in-up">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-primary-100 flex items-center justify-center mb-4">
                    <i className="ri-survey-line text-3xl text-primary-600"></i>
                  </div>
                  <h1 className="text-xl md:text-2xl font-bold text-foreground-950 mb-2">
                    {agent.name}
                  </h1>
                  <p className="text-sm text-foreground-500 max-w-md mx-auto">
                    {agent.short_desc}
                  </p>
                </div>

                {toolCfg && (
                  <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 mb-4 space-y-2">
                    {qLibrary && (
                      <div className="flex items-center gap-2 text-xs text-foreground-600">
                        <i className="ri-file-list-3-line text-primary-500"></i>
                        <span>测评题库: {qLibrary.file_name}</span>
                        <span className="text-primary-500 font-medium">
                          ({qLibrary.q_type === "questionnaire" ? `${qLibrary.fields?.length || 0} 道题目` : "信息采集表"})
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-foreground-600">
                      <i className="ri-file-settings-line text-primary-500"></i>
                      <span>输出形式: {OUTPUT_TYPE_LABEL[toolCfg.output_type] || toolCfg.output_type || "诊断报告"}</span>
                    </div>
                    {toolCfg.boundary_constraints && (
                      <p className="text-[11px] text-foreground-400 italic mt-1">
                        {toolCfg.boundary_constraints}
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={startToolCollection}
                  className="w-full py-3.5 bg-primary-500 text-white rounded-xl text-base font-semibold hover:bg-primary-600 transition-all flex items-center justify-center gap-2"
                >
                  {qLibrary?.q_type === "questionnaire" ? "开始测评" : "开始填写"}
                  <i className="ri-arrow-right-line"></i>
                </button>
              </div>
            )}

            {/* Phase: Collecting */}
            {toolPhase === "collecting" && qLibrary && (
              <div className="animate-fade-in-up">
                {/* Progress bar */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-foreground-500">
                      {qLibrary.q_type === "questionnaire"
                        ? `第 ${currentQIdx + 1} / ${qLibrary.fields.length} 题`
                        : "信息采集表"}
                    </span>
                    {qLibrary.q_type === "questionnaire" && (
                      <span className="text-xs text-foreground-400">
                        {Math.round(((currentQIdx + 1) / qLibrary.fields.length) * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-background-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all duration-300"
                      style={{
                        width: qLibrary.q_type === "questionnaire"
                          ? `${((currentQIdx + 1) / qLibrary.fields.length) * 100}%`
                          : "100%",
                      }}
                    ></div>
                  </div>
                </div>

                {qLibrary.q_type === "questionnaire" ? (
                  /* Step-by-step questionnaire */
                  <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 mb-6">
                    <p className="text-xs text-primary-500 font-medium mb-1">
                      {qLibrary.fields[currentQIdx]?.dimension
                        ? `维度: ${qLibrary.fields[currentQIdx].dimension}`
                        : `题目 ${currentQIdx + 1}`}
                    </p>
                    <h3 className="text-base font-semibold text-foreground-950 mb-4">
                      {qLibrary.fields[currentQIdx]?.text || qLibrary.fields[currentQIdx]?.label}
                    </h3>
                    <div className="space-y-2.5">
                      {(qLibrary.fields[currentQIdx]?.options || []).map((opt: any) => {
                        const optText = typeof opt === "string" ? opt : opt.text;
                        const optLabel = typeof opt === "string" ? opt : opt.label;
                        const selected = answers[qLibrary.fields[currentQIdx].id] === (optText || optLabel);
                        return (
                          <button
                            key={optText || optLabel}
                            onClick={() => answerQuestion(qLibrary.fields[currentQIdx], optText || optLabel)}
                            className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                              selected
                                ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                                : "border-background-200 bg-background-50 text-foreground-700 hover:border-primary-300 hover:bg-primary-50/50"
                            }`}
                          >
                            {optLabel && <span className="text-primary-500 font-bold mr-2">{optLabel}.</span>}
                            {optText}
                          </button>
                        );
                      })}
                    </div>

                    {/* Nav */}
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-background-200/70">
                      <button
                        onClick={goPrevQuestion}
                        disabled={currentQIdx === 0}
                        className="px-4 py-2 rounded-lg border border-background-200/70 text-foreground-600 text-sm font-medium hover:bg-background-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        <i className="ri-arrow-left-line mr-1"></i>上一题
                      </button>
                      {currentQIdx < qLibrary.fields.length - 1 ? (
                        <button
                          onClick={goNextQuestion}
                          className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap"
                        >
                          下一题 <i className="ri-arrow-right-line ml-1"></i>
                        </button>
                      ) : (
                        <button
                          onClick={handleToolSubmit}
                          disabled={submitting}
                          className="px-5 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                          {submitting ? (
                            <><i className="ri-loader-4-line animate-spin mr-1.5"></i>分析中...</>
                          ) : (
                            <>提交查看结果 <i className="ri-check-line ml-1"></i></>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Form mode */
                  <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 md:p-6 mb-6">
                    <div className="space-y-4">
                      {qLibrary.fields.map((field: any) => (
                        <div key={field.id}>
                          <label className="block text-sm font-medium text-foreground-700 mb-1.5">
                            {field.label} {field.required && <span className="text-red-400">*</span>}
                          </label>
                          {renderField(field)}
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 pt-4 border-t border-background-200/70">
                      <button
                        onClick={handleToolSubmit}
                        disabled={submitting}
                        className="w-full py-3 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 transition-all disabled:opacity-50 whitespace-nowrap"
                      >
                        {submitting ? (
                          <><i className="ri-loader-4-line animate-spin mr-1.5"></i>提交中...</>
                        ) : (
                          "提交并查看结果"
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Phase: Result */}
            {toolPhase === "result" && toolResult && (
              <div className="animate-fade-in-up">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto rounded-full bg-primary-100 flex items-center justify-center mb-3">
                    <i className="ri-check-line text-2xl text-primary-600"></i>
                  </div>
                  <h2 className="text-lg font-bold text-foreground-950">{toolResult.title}</h2>
                </div>

                {toolResult.type === "questionnaire" && (
                  <>
                    {/* Score card */}
                    <div className="bg-accent-950 rounded-xl p-6 text-center mb-5">
                      <div className="text-white/60 text-xs mb-1">测评结果</div>
                      <div className="text-4xl font-black text-white mb-1">{toolResult.level}</div>
                      <p className="text-white/70 text-sm max-w-sm mx-auto">{toolResult.summary}</p>
                    </div>

                    {/* Dimension bars */}
                    {toolResult.dimensions && (
                      <div className="bg-background-50 border border-background-200/70 rounded-xl p-5 mb-5 space-y-4">
                        <h3 className="text-sm font-semibold text-foreground-950">维度分析</h3>
                        {toolResult.dimensions.map((d: any, idx: number) => (
                          <div key={idx}>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="text-foreground-700 font-medium">{d.label}</span>
                              <span className="text-foreground-500">{d.score} 分</span>
                            </div>
                            <div className="h-2 rounded-full bg-background-200 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary-500 transition-all duration-700"
                                style={{ width: `${d.score}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Recommendations */}
                    {toolResult.recommendations && (
                      <div className="bg-primary-50 border border-primary-200/50 rounded-xl p-5 mb-5">
                        <h3 className="text-sm font-semibold text-foreground-950 mb-3 flex items-center gap-2">
                          <i className="ri-bookmark-line text-primary-500"></i> 学习建议
                        </h3>
                        <div className="space-y-2">
                          {toolResult.recommendations.map((r: string, idx: number) => (
                            <div key={idx} className="flex items-start gap-2 text-sm text-foreground-600">
                              <i className="ri-arrow-right-s-line text-primary-500 mt-0.5 shrink-0"></i>
                              {r}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Archive notice */}
                    <p className="text-center text-[11px] text-foreground-400 mb-5">
                      <i className="ri-archive-line mr-1"></i>
                      测评结果已保存到你的个人档案
                    </p>
                  </>
                )}

                {toolResult.type === "form" && (
                  <div className="bg-primary-50 border border-primary-200/50 rounded-xl p-6 text-center mb-5">
                    <i className="ri-check-double-line text-3xl text-primary-500 mb-3 block"></i>
                    <p className="text-sm text-foreground-700">{toolResult.summary}</p>
                    <p className="text-xs text-foreground-400 mt-2">
                      已收集 {toolResult.collected} 项信息，分析结果将通过通知发送
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => {
                      setToolPhase("intro");
                      setCurrentQIdx(0);
                      setAnswers({});
                      setScores({});
                      setToolResult(null);
                    }}
                    className="flex-1 py-3 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap"
                  >
                    重新测评
                  </button>
                  <Link
                    to="/agents"
                    className="flex-1 py-3 bg-background-100 border border-background-200 text-foreground-700 rounded-xl text-sm font-medium hover:bg-background-200 transition-all text-center whitespace-nowrap"
                  >
                    返回列表
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="md:hidden h-20 shrink-0"></div>
    </div>
  );
}

/* ---- Helpers ---- */

function generateConsultantReply(
  userText: string,
  cfg: ConsultantConfig | null,
  agent: AgentDetail | null,
  history: ChatMessage[]
): string {
  const address = cfg?.address_term || "";
  const style = cfg?.communication_style || "professional";

  // Use workflow SOP to guide response
  const sopLines = cfg?.workflow_sop?.split("\n").filter(Boolean) || [];
  const stageHint = sopLines.length > 0 ? sopLines[Math.min(history.length, sopLines.length - 1)] : "";

  const responses: Record<string, string[]> = {
    professional: [
      `感谢你的分享。从专业角度来看，${stageHint ? `按照我的工作流程——${stageHint}，` : ""}我建议我们先聚焦在核心问题上。能具体说说你目前最大的挑战是什么吗？`,
      `这是个值得深入探讨的问题。${address ? address + "，" : ""}让我从几个维度帮你分析一下。首先我们需要明确你的具体目标是什么？`,
      `很好，这个方向是对的。${address ? address + "，" : ""}在实际操作中，很多人在这个阶段会遇到类似的困惑。你目前有尝试过哪些方法？`,
      `基于我们目前的交流，我注意到几个关键点。${address ? address + "，" : ""}能不能再详细说说你对这个问题的看法？`,
      `${address ? address + "，" : ""}根据你的情况，我有一些具体的建议。不过在给出方案之前，想确认一下你的优先级是怎么排序的？`,
    ],
    friendly: [
      `嗯嗯，我理解了！${address ? address + "，" : ""}其实很多人都有类似的困惑，这很正常。让我们一步步来梳理～能告诉我你心里最在意的是什么吗？`,
      `好问题！${address ? address + "，" : ""}从我的经验来看，这可能跟几个因素有关。你觉得最影响你的是哪一个呢？`,
      `明白了！${address ? address + "，" : ""}其实你已经走在正确的路上了，只是还需要一些调整。我们来看看具体可以从哪里入手～`,
      `说得好！${address ? address + "，" : ""}很高兴看到你在认真思考这个问题。我想补充一个思路，你听听看适不适合你？`,
    ],
    concise: [
      `理解了。${stageHint ? stageHint + "。" : ""}核心问题是什么？请具体描述。`,
      `${address ? address + "，" : ""}两点建议：第一，明确目标；第二，拆解步骤。你的目标是什么？`,
      `收到。基于你的情况，最有效的方案是从最关键的环节入手。你认为目前哪个环节最重要？`,
    ],
    lively: [
      `哇，这个角度很有意思！${address ? address + "，" : ""}让我想到一个非常棒的思路！不过在展开之前，我想先了解你觉得最酷的部分是什么？`,
      `哈哈，说到这个我可太有经验了！${address ? address + "，" : ""}对了，你有没有试过完全换一个角度来想这个问题？`,
    ],
  };

  const pool = responses[style] || responses.professional;
  // Use conversation length to vary response
  return pool[Math.min(history.length, pool.length - 1)];
}

function buildConsultantSummary(messages: ChatMessage[]): string {
  const userMsgs = messages.filter((m) => m.role === "user").map((m) => m.text);
  const topics = userMsgs.slice(-4).join("; ");
  return `对话涉及主题: ${topics.slice(0, 200)}。共 ${messages.length} 条消息。`;
}