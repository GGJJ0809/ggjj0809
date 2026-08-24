import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Agent {
  id: number;
  name: string;
  short_desc: string;
  avatar: string;
  tags: string[];
  agent_type: string;
  status: string;
  view_count: number;
  used_count: number;
  created_at: string;
  updated_at: string;
  model_id: number | null;
  model_name: string | null;
  c_files?: string[];
  k_files?: string[];
  q_files?: string[];
}

const TYPE_LABELS: Record<string, { text: string; cls: string; icon: string }> = {
  consultant: { text: "顾问型", cls: "bg-blue-100 text-blue-700", icon: "ri-chat-3-line" },
  tool: { text: "工具型", cls: "bg-primary-100 text-primary-800", icon: "ri-survey-line" },
};

export default function AgentsAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [actionMsg, setActionMsg] = useState("");

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: qErr } = await supabase
        .from("agents")
        .select("*, ai_models(id, name, provider), agent_consultant_configs(c_library_files, k_library_files, q_library_files), agent_tool_configs(c_library_rules, k_library_materials)")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (qErr) throw qErr;

      const mapped: Agent[] = (data || []).map((a: any) => {
        const consultantCfg = a.agent_consultant_configs?.[0];
        const toolCfg = a.agent_tool_configs?.[0];
        return {
          id: a.id,
          name: a.name,
          short_desc: a.short_desc || a.description || "",
          avatar: a.avatar || a.icon || "ri-robot-2-line",
          tags: Array.isArray(a.tags) ? a.tags : (a.category ? [a.category] : []),
          agent_type: a.agent_type || "tool",
          status: a.status,
          view_count: a.view_count || 0,
          used_count: a.used_count || 0,
          created_at: a.created_at,
          updated_at: a.updated_at,
          model_id: a.model_id,
          model_name: a.ai_models?.name || null,
          c_files: a.agent_type === "consultant"
            ? consultantCfg?.c_library_files
            : toolCfg?.c_library_rules,
          k_files: a.agent_type === "consultant"
            ? consultantCfg?.k_library_files
            : toolCfg?.k_library_materials,
          q_files: a.agent_type === "consultant" ? consultantCfg?.q_library_files : null,
        };
      });

      setAgents(mapped);
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const filtered = agents.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (typeFilter !== "all" && a.agent_type !== typeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (a.name || "").toLowerCase().includes(s) || (a.short_desc || "").toLowerCase().includes(s);
    }
    return true;
  });

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await supabase.from("agents").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
      setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)));
      setActionMsg(newStatus === "published" ? "已发布" : newStatus === "archived" ? "已下架" : "已更新");
      setTimeout(() => setActionMsg(""), 2000);
    } catch (e: any) { setError(e.message || "操作失败"); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除该智能体吗？")) return;
    try {
      await supabase.from("agents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      setActionMsg("已删除");
      setTimeout(() => setActionMsg(""), 2000);
    } catch (e: any) { setError(e.message || "删除失败"); }
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground-950">智能体管理</h1>
          <p className="text-sm text-foreground-500 mt-1">管理顾问型和工具型智能体的创建、配置与发布</p>
        </div>
        <Link
          to="/admin/agents/create"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-all whitespace-nowrap self-start"
        >
          <i className="ri-add-line text-lg"></i>
          创建智能体
        </Link>
      </div>

      {actionMsg && (
        <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{actionMsg}</div>
      )}
      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
          <input
            type="text" placeholder="搜索智能体名称..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-primary-300 transition-all"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 transition-all">
          <option value="all">全部类型</option>
          <option value="consultant">顾问型</option>
          <option value="tool">工具型</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 transition-all">
          <option value="all">全部状态</option>
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
          <option value="archived">已下架</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-foreground-400">
          <i className="ri-robot-2-line text-4xl mb-3 block"></i>
          <p className="text-sm">暂无智能体</p>
          <Link to="/admin/agents/create" className="inline-block mt-3 text-primary-500 hover:text-primary-600 text-sm font-medium">
            创建第一个智能体 →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((agent) => {
            const st = statusLabel(agent.status);
            const tp = TYPE_LABELS[agent.agent_type] || TYPE_LABELS.tool;
            return (
              <div key={agent.id} className="bg-background-50 border border-background-200/70 rounded-xl p-4 md:p-5 hover:border-primary-200/50 transition-all">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                      <i className={`${agent.avatar || "ri-robot-2-line"} text-xl text-primary-500`}></i>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-foreground-950 truncate">{agent.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tp.cls}`}>
                          <i className={`${tp.icon} mr-0.5`}></i>{tp.text}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.text}</span>
                        {agent.status === "published" && (
                          <span className="text-xs text-foreground-400">已使用: {agent.used_count}次</span>
                        )}
                      </div>
                      {agent.short_desc && <p className="text-xs text-foreground-500 mb-1 line-clamp-1">{agent.short_desc}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-400">
                        {agent.model_name && (
                          <span className="inline-flex items-center gap-1 text-primary-600">
                            <i className="ri-cpu-line"></i>{agent.model_name}
                          </span>
                        )}
                        {agent.c_files && agent.c_files.length > 0 && (
                          <span>C库: {agent.c_files.join(", ")}</span>
                        )}
                        {agent.k_files && agent.k_files.length > 0 && (
                          <span>K库: {agent.k_files.join(", ")}</span>
                        )}
                        {agent.q_files && agent.q_files.length > 0 && (
                          <span>Q库: {agent.q_files.join(", ")}</span>
                        )}
                        <span>创建: {agent.created_at ? new Date(agent.created_at).toLocaleDateString("zh-CN") : "-"}</span>
                        <span>更新: {agent.updated_at ? new Date(agent.updated_at).toLocaleDateString("zh-CN") : "-"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <Link to={`/admin/agents/${agent.id}/edit`}
                      className="px-3 py-1.5 text-xs font-medium text-foreground-600 bg-background-100 hover:bg-background-200 rounded-md transition-colors whitespace-nowrap">编辑</Link>
                    <Link to={`/agents/${agent.id}`} target="_blank"
                      className="px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors whitespace-nowrap">预览</Link>
                    <button onClick={() => handleStatusChange(agent.id, agent.status === "published" ? "archived" : "published")}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${agent.status === "published" ? "text-orange-600 bg-orange-50 hover:bg-orange-100" : "text-green-600 bg-green-50 hover:bg-green-100"}`}>
                      {agent.status === "published" ? "下架" : "发布"}
                    </button>
                    <button onClick={() => handleDelete(agent.id)}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors whitespace-nowrap">删除</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}